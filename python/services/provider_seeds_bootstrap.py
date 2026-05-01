# 219:81
"""provider_seeds_bootstrap — eager idempotent bootstrap of provider seed
records into ws_modules on every lifespan start.

Also performs a one-shot migration from the legacy double-colon slug
convention (`provider::<id>`) to the canonical single-underscore form
(`provider_<id>`) that model_catalog reads. The legacy form was created
lazily by routes/energy.py's first-PATCH path; it accumulated real
admin-edited state (model_assignments, active_preset, status='active',
disabled_models, sub_agent_model, etc.). The migration transfers that
state into the modern row, transfers the active-status flag, and
deletes the legacy row. Idempotent — once no legacy rows remain it is
a no-op.

Before this module: provider seeds were created lazily on the first PATCH to
``/api/energy/providers/<id>/route_config`` via energy.py
``_update_seed_route_config``. Result: a fresh DB had zero provider rows,
the model_catalog query ``SELECT slug, route_config FROM ws_modules WHERE
slug LIKE 'provider_%'`` returned nothing, and surfaces relying on
``available_models`` / ``presets`` had to fall back to in-memory dict
literals.

After this module: every BUILTIN_PROVIDERS entry has a corresponding
``provider_<id>`` row in ws_modules with a fully-shaped ``route_config``
on first boot. Subsequent boots upsert idempotently — if a value already
differs from defaults (admin edits) we PRESERVE it; if a key is missing we
ADD it. Never overwrites admin choices.

route_config shape on first seed:
  - model_assignments     : preset['balance'] for that provider
  - active_preset         : "balance"
  - available_models      : [primary model id]  (Phase 5 hydrates the rest)
  - enabled_tools         : []                  (Phase 3 wires per-provider)
  - capabilities          : copied from spec (supports_streaming etc.)
  - presets               : full preset map for the provider
  - pricing_url           : from providers.json
  - context_addendum      : ""
  - enabled               : true
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text as sa_text

from ..database import get_session
from .energy_registry import (
    BUILTIN_PROVIDERS,
    _PROVIDER_PRESETS,
    _PROVIDER_PRICING_URLS,
    get_pricing_models,
)

_CAPABILITY_KEYS = (
    "supports_streaming",
    "supports_prompt_caching",
    "supports_thinking",
    "supports_reasoning_effort",
    "max_tokens",
    "api_family",
    "min_tier",
)


def _default_route_config(provider_id: str) -> dict[str, Any]:
    """Build the canonical seed route_config for a fresh provider row.

    available_models is hydrated from pricing.json (full per-model dicts:
    id, context_window, input_per_1m, output_per_1m, cached_input_per_1m,
    capability flags). If pricing.json has no entry for this provider the
    list falls back to a single-entry list with just the flagship slug —
    surfaces are expected to handle both shapes (dict-with-id or bare-string).
    """
    spec = BUILTIN_PROVIDERS.get(provider_id, {})
    presets = _PROVIDER_PRESETS.get(provider_id, {})
    primary_model = spec.get("model", "")
    balance = presets.get("balance") or {}
    capabilities = {k: spec[k] for k in _CAPABILITY_KEYS if k in spec}
    pricing_models = get_pricing_models(provider_id)
    if pricing_models:
        available_models: list = list(pricing_models)
    elif primary_model:
        available_models = [primary_model]
    else:
        available_models = []
    return {
        "model_assignments": dict(balance),
        "active_preset": "balance",
        "available_models": available_models,
        "enabled_tools": [],
        "capabilities": capabilities,
        "presets": presets,
        "pricing_url": _PROVIDER_PRICING_URLS.get(provider_id, ""),
        "context_addendum": "",
        "enabled": True,
    }


def _merge_preserve_admin(existing: dict, defaults: dict) -> dict:
    """Add any missing top-level keys from defaults; never overwrite existing
    admin-set values. Nested dicts are merged at one level (preset map etc.)
    so adding a NEW preset to providers.json shows up in seeds without
    clobbering an admin-edited assignment."""
    merged = dict(existing or {})
    for key, default_val in defaults.items():
        if key not in merged:
            merged[key] = default_val
            continue
        if isinstance(default_val, dict) and isinstance(merged[key], dict):
            for sub_k, sub_v in default_val.items():
                if sub_k not in merged[key]:
                    merged[key][sub_k] = sub_v
    return merged


# Keys that providers.json owns canonically. On migration we OVERWRITE these
# from the bootstrap defaults instead of inheriting the legacy row's stale
# copy, so a doctrine change in providers.json takes effect on next boot.
_CANONICAL_FROM_JSON = ("presets", "pricing_url", "capabilities")


async def _migrate_legacy_double_colon_seeds() -> int:
    """One-shot migration: `provider::<id>` → `provider_<id>`.

    For each legacy row, copies its admin-edited route_config into the
    modern row (legacy wins on overlap, except _CANONICAL_FROM_JSON keys
    which always come from providers.json). Transfers status='active' to
    the modern row. Deletes the legacy row. Idempotent — once no legacy
    rows remain it is a no-op.

    Returns: number of legacy rows migrated this call.
    """
    migrated = 0
    async with get_session() as session:
        legacy_rows = (
            await session.execute(
                sa_text(
                    "SELECT id, slug, name, route_config, status "
                    "FROM ws_modules WHERE slug LIKE 'provider::%'"
                )
            )
        ).mappings().all()
        if not legacy_rows:
            return 0
        for legacy in legacy_rows:
            provider_id = legacy["slug"].removeprefix("provider::")
            if provider_id not in BUILTIN_PROVIDERS:
                # Stale row for a provider we no longer ship — drop quietly.
                await session.execute(
                    sa_text("DELETE FROM ws_modules WHERE id = :id"),
                    {"id": legacy["id"]},
                )
                continue
            modern_slug = f"provider_{provider_id}"
            defaults = _default_route_config(provider_id)
            legacy_cfg = legacy["route_config"] if isinstance(legacy["route_config"], dict) else {}
            # Start from legacy (admin state wins), then force canonical keys
            # from providers.json so doctrine changes propagate.
            merged = dict(legacy_cfg)
            for k in _CANONICAL_FROM_JSON:
                merged[k] = defaults[k]
            # Fill in any keys legacy didn't have (e.g. enabled_tools=[])
            for k, v in defaults.items():
                if k not in merged:
                    merged[k] = v
            new_status = "active" if legacy["status"] == "active" else "system"
            modern = (
                await session.execute(
                    sa_text("SELECT id FROM ws_modules WHERE slug = :slug"),
                    {"slug": modern_slug},
                )
            ).mappings().first()
            if modern is None:
                await session.execute(
                    sa_text(
                        "INSERT INTO ws_modules (slug, name, owner_id, "
                        "route_config, status) VALUES (:slug, :name, 'system', "
                        "CAST(:cfg AS jsonb), :status)"
                    ),
                    {
                        "slug": modern_slug,
                        "name": legacy["name"] or BUILTIN_PROVIDERS[provider_id].get("label", provider_id),
                        "cfg": json.dumps(merged),
                        "status": new_status,
                    },
                )
            else:
                await session.execute(
                    sa_text(
                        "UPDATE ws_modules SET route_config = CAST(:cfg AS jsonb), "
                        "status = :status, updated_at = NOW() WHERE id = :id"
                    ),
                    {"id": modern["id"], "cfg": json.dumps(merged), "status": new_status},
                )
            # If this row was 'active', demote any other modern provider row
            # so we don't end up with two actives (mirrors the active-promote
            # contract in routes/energy.py).
            if new_status == "active":
                await session.execute(
                    sa_text(
                        "UPDATE ws_modules SET status = 'system', updated_at = NOW() "
                        "WHERE slug LIKE 'provider\\_%' ESCAPE '\\' "
                        "AND slug != :slug AND status = 'active'"
                    ),
                    {"slug": modern_slug},
                )
            await session.execute(
                sa_text("DELETE FROM ws_modules WHERE id = :id"),
                {"id": legacy["id"]},
            )
            migrated += 1
        await session.commit()
    return migrated


def _build_provider_description(provider_id: str, cfg: dict) -> str:
    """Build a unique, informative description for a provider seed row.

    Uses model slug, vendor, pricing tier, capabilities, and the human-readable
    note from providers.json so every provider reads distinctly rather than
    sharing a generic template body.
    """
    label = cfg.get("label", provider_id)
    model = cfg.get("model", "")
    vendor_map = {
        "openai": "OpenAI",
        "google": "Google AI",
        "anthropic": "Anthropic",
        "xai": "xAI",
    }
    vendor = vendor_map.get(cfg.get("vendor", ""), cfg.get("vendor", "").capitalize())
    api_family = cfg.get("api_family", "chat")
    label_lower = label.lower()
    parts: list[str] = [f"{label} ({vendor}"]
    if api_family == "responses" and "responses api" not in label_lower:
        parts[0] += ", Responses API"
    parts[0] += f"). Model: {model}." if model else ")."

    caps: list[str] = []
    if cfg.get("supports_streaming"):
        caps.append("streaming")
    if cfg.get("supports_prompt_caching"):
        caps.append("prompt caching")
    if cfg.get("supports_thinking"):
        caps.append("extended thinking")
    if cfg.get("supports_reasoning_effort"):
        caps.append("reasoning effort control")
    if cfg.get("supports_vision"):
        caps.append("vision")
    if caps:
        parts.append("Capabilities: " + ", ".join(caps) + ".")

    min_tier = cfg.get("min_tier", "")
    if min_tier:
        parts.append(f"Minimum tier: {min_tier}.")

    note = cfg.get("note", "")
    if note:
        parts.append(note if note.endswith(".") else note + ".")

    parts.append("route_config: model_assignments (per-role picks), presets, pricing_url, enabled_tools.")
    return " ".join(parts)


async def seed_provider_modules() -> int:
    """Idempotently upsert one ws_modules row per BUILTIN_PROVIDERS entry.

    Returns: count of provider seeds upserted (created or modified) this call.

    Behavior:
      - Row missing → INSERT with full default route_config, status='system'
      - Row present → MERGE only-missing keys into route_config (preserves
        admin edits to model_assignments, active_preset, enabled_tools, etc.);
        does not bump updated_at unless something actually changed
    """
    written = 0
    # Migrate legacy double-colon rows first so the upsert below sees the
    # admin-edited state and doesn't re-add bootstrap defaults on top of it.
    legacy_migrated = await _migrate_legacy_double_colon_seeds()
    if legacy_migrated:
        print(f"[providers] migrated {legacy_migrated} legacy provider:: row(s) to provider_<id>")
    async with get_session() as session:
        for provider_id in BUILTIN_PROVIDERS.keys():
            slug = f"provider_{provider_id}"
            cfg_entry = BUILTIN_PROVIDERS[provider_id]
            label = cfg_entry.get("label", provider_id)
            description = _build_provider_description(provider_id, cfg_entry)
            defaults = _default_route_config(provider_id)
            row = (
                await session.execute(
                    sa_text(
                        "SELECT id, route_config, description FROM ws_modules WHERE slug = :slug"
                    ),
                    {"slug": slug},
                )
            ).mappings().first()
            if row is None:
                await session.execute(
                    sa_text(
                        "INSERT INTO ws_modules (slug, name, description, owner_id, "
                        "route_config, status) VALUES (:slug, :name, :desc, 'system', "
                        "CAST(:cfg AS jsonb), 'system')"
                    ),
                    {
                        "slug": slug,
                        "name": label,
                        "desc": description,
                        "cfg": json.dumps(defaults),
                    },
                )
                written += 1
                continue
            existing = row["route_config"] if isinstance(row["route_config"], dict) else {}
            merged = _merge_preserve_admin(existing, defaults)
            # Refresh description if it matches the old generic template or differs
            # from the current per-provider description (keeps descriptions current
            # as providers.json notes/models evolve without manual DB edits).
            existing_desc = row["description"] or ""
            desc_stale = existing_desc != description
            if merged != existing or desc_stale:
                await session.execute(
                    sa_text(
                        "UPDATE ws_modules SET route_config = CAST(:cfg AS jsonb), "
                        "description = :desc, updated_at = NOW() WHERE id = :id"
                    ),
                    {"id": row["id"], "cfg": json.dumps(merged), "desc": description},
                )
                written += 1
        await session.commit()
    return written
# 219:81
