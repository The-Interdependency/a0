# 113:86 0:0 7:1
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

# === MODULE_BUILD ===
# id: a0_service_model_catalog
#   module_name: model_catalog
#   module_kind: service
#   summary: Single source of truth for "what models can this user invoke" — unifies Forge dropdown, chat chips, and subagent spawn into one tier-gated, provenance-annotated model list plus model_id resolution.
#   owner: Erin Spencer
#   public_surface: resolve_model_id, is_provider_enabled, list_models_for_user
#   internal_surface: _tier_ok, _resolve_static, _user_tier
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; model availability resolution reverts to prior per-surface logic.
#   requires: a0_service_energy_registry
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

from typing import Any, Optional

from .energy_registry import (
    BUILTIN_PROVIDERS,
    _PROVIDER_PRESETS,
    resolve_provider_id,
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
    canonical = resolve_provider_id(model_id)
    if canonical:
        return canonical, BUILTIN_PROVIDERS[canonical]
    if model_id in BUILTIN_PROVIDERS:
        return model_id, BUILTIN_PROVIDERS[model_id]
    for pid, spec in BUILTIN_PROVIDERS.items():
        if spec.get("model") == model_id:
            return pid, spec
    for pid, spec in BUILTIN_PROVIDERS.items():
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
    raise ValueError(f"Unknown model_id: {model_id!r}")


async def is_provider_enabled(provider_id: str) -> bool:
    """Providers are enabled when their API key env var is present."""
    spec = BUILTIN_PROVIDERS.get(provider_id, {})
    env_key = spec.get("env_key")
    if not env_key:
        return True
    import os
    return bool(os.environ.get(env_key))


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
    user_tier = await _user_tier(user_id)
    try:
        from .energy_registry import active_provider as _ap
        active = await _ap()
    except RuntimeError:
        active = None
    out_providers: list[dict[str, Any]] = []

    cfgs: dict[str, dict] = {}

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
# 113:86 0:0 7:1
