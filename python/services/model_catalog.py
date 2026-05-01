# 133:76
"""model_catalog — single source of truth for "what models can this user use".

Today three surfaces answer this question independently:
  - Forge model dropdown (one model per provider, ignores discovery + presets)
  - Chat composer provider chips (provider-level, not model-level)
  - Subagent spawn (defaults to active provider)

This module unifies them. One function returns every model the user can
actually invoke, with provenance (which provider, which roles it's pinned
to, which preset surfaces it, whether it was auto-discovered) and tier
gating. Callers pick what they need from the same shape.

Honest semantics: a model is "available" only if all of these hold:
  - the provider's API key env var is set
  - the provider is not user-disabled in route_config.enabled
  - the model_id is non-empty
  - user_tier ≥ provider's min_tier (free < supporter < ws < admin)

A model is "tier_blocked" if the key+enabled checks pass but the user's
tier is too low — surfaced so the UI can show it greyed-out with a CTA.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import text as sa_text

from ..database import get_session
from . import energy_registry as _er_mod
from .energy_registry import (
    BUILTIN_PROVIDERS,
    _PROVIDER_PRESETS,
    energy_registry,
)

# Tier ordering for min_tier comparisons. Lower index = lower tier.
# Canonical tiers in the billing layer are free / supporter / ws / admin
# (see python/routes/chat.py:_ranks, python/services/stripe_service.py).
_TIER_ORDER = {"free": 0, "supporter": 1, "ws": 2, "admin": 3}


def _tier_ok(user_tier: str, min_tier: Optional[str]) -> bool:
    if not min_tier:
        return True
    return _TIER_ORDER.get(user_tier, 0) >= _TIER_ORDER.get(min_tier, 0)


def _resolve_static(model_id: str) -> Optional[tuple[str, dict]]:
    """Static resolution against BUILTIN_PROVIDERS + _PROVIDER_PRESETS.

    Synchronous, no DB. Used as the fast path; the async resolver falls
    back to persisted route_config when this misses.
    """
    if model_id in BUILTIN_PROVIDERS:
        return model_id, BUILTIN_PROVIDERS[model_id]
    for pid, spec in BUILTIN_PROVIDERS.items():
        if spec.get("model") == model_id:
            return pid, spec
        presets = _PROVIDER_PRESETS.get(pid, {})
        for role_map in presets.values():
            if isinstance(role_map, dict) and model_id in role_map.values():
                return pid, spec
    return None


async def resolve_model_id(model_id: str) -> tuple[str, dict]:
    """Resolve a model_id (or legacy provider_id) to (provider_id, spec).

    Search order:
      1. Exact provider_id match (legacy callers that picked from
         /api/v1/forge/models which returned one row per provider)
      2. Match against each provider's primary `model` field
      3. Match against any model surfaced by the provider's optimizer
         presets (_PROVIDER_PRESETS role maps)
      4. Match against any model persisted in route_config —
         model_assignments (the active assignments) or available_models
         (auto-discovered from the provider's list-models endpoint)

    Raises ValueError on no match — no silent fallback to a default
    provider, since silently routing "claude-foo" to gpt would burn
    user trust harder than failing loudly.
    """
    hit = _resolve_static(model_id)
    if hit:
        return hit
    # Fall back to persisted route_config so any model surfaced by
    # /api/v1/models is callable.
    async with get_session() as session:
        # ESCAPE '\' so the literal underscore in 'provider_' is not treated
        # as a SQL single-char wildcard (which would also match the legacy
        # 'provider::<id>' rows during the migration window).
        rows = (await session.execute(sa_text(
            r"SELECT slug, route_config FROM ws_modules WHERE slug LIKE 'provider\_%' ESCAPE '\'"
        ))).mappings().all()
    for row in rows:
        pid = row["slug"].removeprefix("provider_")
        if pid not in BUILTIN_PROVIDERS:
            continue
        cfg = row["route_config"] if isinstance(row["route_config"], dict) else {}
        assignments = cfg.get("model_assignments") or {}
        if model_id in assignments.values():
            return pid, BUILTIN_PROVIDERS[pid]
        for m in cfg.get("available_models") or []:
            if isinstance(m, dict) and m.get("id") == model_id:
                return pid, BUILTIN_PROVIDERS[pid]
    raise ValueError(f"Unknown model_id: {model_id!r}")


async def is_provider_enabled(provider_id: str) -> bool:
    """Honor the user-facing kill switch in route_config.enabled.

    Defaults to True when no row exists yet (provider seeds may not have
    been written). Mirrors the chat.py enforcement.
    """
    async with get_session() as session:
        row = (await session.execute(sa_text(
            "SELECT route_config FROM ws_modules WHERE slug = :slug"
        ), {"slug": f"provider_{provider_id}"})).mappings().first()
    if not row:
        return True
    cfg = row["route_config"] if isinstance(row["route_config"], dict) else {}
    return cfg.get("enabled", True)


async def _user_tier(user_id: Optional[str]) -> str:
    if not user_id:
        return "free"
    async with get_session() as session:
        row = (await session.execute(sa_text(
            "SELECT subscription_tier FROM users WHERE id = :id"
        ), {"id": user_id})).mappings().first()
        return row["subscription_tier"] if row else "free"


async def list_models_for_user(user_id: Optional[str]) -> dict[str, Any]:
    """Return every model the caller can use, with full provenance.

    Shape:
      {
        "user_tier": "free",
        "providers": [
          {
            "provider_id": "openai", "label": "...", "vendor": "openai",
            "active": True, "enabled": True, "key_present": True,
            "min_tier": null, "tier_blocked": False,
            "models": [
              {
                "model_id": "<model_id>",
                "is_primary": True,
                "in_assignments": ["conduct","perform"],
                "in_presets": ["balance","speed","coding"],
                "discovered": True
              },
              ...
            ]
          },
          ...
        ]
      }
    """
    await energy_registry.load_from_db()
    user_tier = await _user_tier(user_id)
    active = energy_registry.get_active_provider()
    out_providers: list[dict[str, Any]] = []

    # Pull each provider's persisted route_config so we honor enabled flag,
    # disabled_models, model_assignments, and discovered available_models.
    cfgs: dict[str, dict] = {}
    async with get_session() as session:
        rows = (await session.execute(sa_text(
            r"SELECT slug, route_config FROM ws_modules WHERE slug LIKE 'provider\_%' ESCAPE '\'"
        ))).mappings().all()
        for row in rows:
            pid = row["slug"].removeprefix("provider_")
            cfgs[pid] = (row["route_config"] or {}) if isinstance(row["route_config"], dict) else {}

    for pid, spec in BUILTIN_PROVIDERS.items():
        env_key = spec.get("env_key")
        import os
        key_present = bool(env_key and os.environ.get(env_key))
        cfg = cfgs.get(pid, {})
        enabled = cfg.get("enabled", True)
        min_tier = spec.get("min_tier")
        tier_ok = _tier_ok(user_tier, min_tier)

        # Aggregate every model_id this provider exposes, with provenance.
        primary = spec.get("model")
        assignments: dict = cfg.get("model_assignments") or {}
        available: list = cfg.get("available_models") or []
        presets: dict = _PROVIDER_PRESETS.get(pid, {})
        disabled_models = set(cfg.get("disabled_models") or [])

        # Build {model_id: {provenance fields}}
        bag: dict[str, dict[str, Any]] = {}

        def _touch(mid: str) -> dict:
            if not mid:
                return {}
            entry = bag.setdefault(mid, {
                "model_id": mid,
                "is_primary": False,
                "in_assignments": [],
                "in_presets": [],
                "discovered": False,
                "disabled": mid in disabled_models,
            })
            return entry

        if primary:
            _touch(primary)["is_primary"] = True
        for role, mid in assignments.items():
            if isinstance(mid, str) and mid:
                _touch(mid)["in_assignments"].append(role)
        for preset_name, role_map in presets.items():
            if not isinstance(role_map, dict):
                continue
            for mid in role_map.values():
                if isinstance(mid, str) and mid:
                    e = _touch(mid)
                    if preset_name not in e["in_presets"]:
                        e["in_presets"].append(preset_name)
        for m in available:
            if isinstance(m, dict) and isinstance(m.get("id"), str):
                _touch(m["id"])["discovered"] = True

        out_providers.append({
            "provider_id": pid,
            "label": spec.get("label", pid),
            "vendor": spec.get("vendor"),
            "active": pid == active,
            "enabled": enabled,
            "key_present": key_present,
            "min_tier": min_tier,
            "tier_blocked": not tier_ok,
            # Models sorted: primary first, then by model_id.
            "models": sorted(
                bag.values(),
                key=lambda m: (not m["is_primary"], m["model_id"]),
            ),
        })

    return {"user_tier": user_tier, "providers": out_providers}
# 133:76
