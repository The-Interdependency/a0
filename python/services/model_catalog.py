# 166:105 0:0 7:1
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
#   public_surface: resolve_model_id, resolve_routed_model, routed_model_owner, visible_provider_specs, is_provider_enabled, list_models_for_user
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

# === CONTRACTS ===
# id: catalog_routed_model_tier_follows_concrete_owner
#   given: role routing resolves a concrete model that belongs to a different catalog provider than the seed provider
#   then: entitlement and provenance use the concrete model's owning provider, while unknown routed models fail closed when a caller tier is present
#   class: security
#   since: 2026-09-09
#
# id: catalog_legacy_model_aliases_canonicalize
#   given: a persisted or explicitly requested model id is a registry-declared legacy alias
#   then: catalog resolution attributes it to the canonical provider, transport uses that provider's current primary model, and hidden provider aliases are omitted from registry-backed rosters
#   class: correctness
#   since: 2026-09-10
# === END CONTRACTS ===

from typing import Any, Optional

from .energy_registry import (
    BUILTIN_PROVIDERS,
    _PROVIDER_PRESETS,
)

# Tier ordering for min_tier comparisons. Lower index = lower tier.
# Canonical tiers in the billing layer are free / supporter / ws / admin
# (see python/routes/chat.py:_ranks, python/services/stripe_service.py).
_TIER_ORDER = {"free": 0, "supporter": 1, "ws": 2, "admin": 3}


def visible_provider_specs(providers: dict[str, dict]) -> dict[str, dict]:
    """Return provider entries intended for user-facing model rosters."""
    return {pid: spec for pid, spec in providers.items() if not spec.get("hidden")}


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
        spec = BUILTIN_PROVIDERS[model_id]
        canonical_id = str(spec.get("deprecated_alias_for") or "").strip()
        if canonical_id:
            canonical = BUILTIN_PROVIDERS.get(canonical_id)
            if canonical is not None:
                return canonical_id, canonical
        return model_id, spec
    # Every provider's primary model is more authoritative than any optimizer
    # preset reference. This prevents a shared preset model from being
    # attributed to whichever provider happens to appear first in JSON.
    for pid, spec in BUILTIN_PROVIDERS.items():
        if spec.get("model") == model_id:
            return pid, spec
    for pid, spec in BUILTIN_PROVIDERS.items():
        if model_id in (spec.get("model_aliases") or []):
            return pid, spec
    for pid, spec in BUILTIN_PROVIDERS.items():
        presets = _PROVIDER_PRESETS.get(pid, {})
        for role_map in presets.values():
            if isinstance(role_map, dict) and model_id in role_map.values():
                return pid, spec
    return None


def routed_model_owner(
    model_id: str,
    fallback_provider: str,
    user_tier: Optional[str] = None,
) -> str:
    """Return and optionally tier-gate the catalog owner of a concrete model."""
    hit = _resolve_static(model_id)
    if hit is None:
        if user_tier is not None:
            raise PermissionError(
                f"Routed model {model_id!r} has no registered tier policy"
            )
        return fallback_provider
    provider_id, spec = hit
    min_tier = spec.get("min_tier")
    if user_tier is not None and not _tier_ok(user_tier, min_tier):
        raise PermissionError(
            f"Model {model_id!r} requires tier {min_tier!r} or higher; "
            f"caller tier is {user_tier!r}"
        )
    return provider_id


async def resolve_routed_model(
    provider_id: str,
    role: str,
    *,
    pin_requested_provider: bool,
    model_override: Optional[str],
    user_tier: Optional[str],
) -> tuple[str, str]:
    """Resolve one transport model, then bind it to its gated catalog owner."""
    spec = BUILTIN_PROVIDERS.get(provider_id) or {}
    model_id = model_override or str(spec.get("model") or "").strip()
    compatible = spec.get("adapter") == "openai-compatible" or spec.get("vendor") == "openai"
    if not pin_requested_provider and compatible:
        from .providers._resolver import resolve_model_for_role
        model_id = await resolve_model_for_role(provider_id, role)
    if not model_id:
        raise ValueError(f"Provider {provider_id!r} has no routed model")
    owner = routed_model_owner(model_id, provider_id, user_tier)
    owner_spec = BUILTIN_PROVIDERS[owner]
    if model_id in (owner_spec.get("model_aliases") or []):
        model_id = str(owner_spec.get("model") or "").strip()
    return owner, model_id


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
    api_key_env = spec.get("api_key_env")
    if not api_key_env:
        return True
    import os
    return bool(os.environ.get(api_key_env))


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
        if spec.get("hidden"):
            continue
        api_key_env = spec.get("api_key_env")
        import os
        key_present = bool(api_key_env and os.environ.get(api_key_env))
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
                    owner = _resolve_static(mid)
                    if owner and owner[0] != pid and not _tier_ok(user_tier, owner[1].get("min_tier")):
                        continue
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
# 166:105 0:0 7:1
