# 127:16
# DOC module: energy
# DOC label: Energy Providers
# DOC description: Provider seed management — model_assignments, optimizer presets, PCNA core converge, and model discovery for all AI providers.
# DOC tier: admin
# DOC endpoint: GET /api/energy/providers | List all provider seed modules with PCNA stats
# DOC endpoint: GET /api/energy/providers/{provider_id} | Get one provider with full route_config + PCNA stats
# DOC endpoint: PATCH /api/energy/providers/{provider_id}/route_config | Partial-update route_config (merges model_assignments)
# DOC endpoint: POST /api/energy/optimize/{provider_id} | Apply optimizer preset (speed/depth/price/balance/creativity/coding) to model_assignments
# DOC endpoint: POST /api/energy/discover/{provider_id} | Refresh available_models (returns seed list + timestamp)
# DOC endpoint: POST /api/energy/converge/{provider_id} | Merge provider PCNA core into main PCNA (0.8/0.2 blend)
"""
Energy provider management routes.

Endpoints:
  GET  /api/energy/providers                   — list providers with seed info
  GET  /api/energy/providers/{id}/seed         — get provider seed route_config
  PATCH /api/energy/providers/{id}/seed        — update model_assignments in seed
  POST /api/energy/providers/{id}/optimize     — apply optimizer preset
  POST /api/energy/discover/{id}               — trigger model auto-discovery
  POST /api/pcna/converge/{provider_id}        — converge provider PCNA core → primary
"""

import time
import re
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any, Literal
from sqlalchemy import text as sa_text

from ..services.energy_registry import (
    energy_registry,
    _PROVIDER_DEFAULT_ASSIGNMENTS,
    _PROVIDER_PRESETS,
    _PROVIDER_AVAILABLE_MODELS,
    _PROVIDER_PRICING_URLS,
    _PROVIDER_CAPABILITIES,
    _PROVIDER_ENABLED_TOOLS,
    BUILTIN_PROVIDERS,
)
from ..storage import storage

# DOC module: energy
# DOC label: Energy
# DOC description: Energy provider configuration, model assignments, optimizer presets, and per-provider PCNA core management.
# DOC tier: admin
# DOC endpoint: GET /api/energy/providers | List all providers with seed config
# DOC endpoint: GET /api/energy/providers/{id}/seed | Get provider seed route_config
# DOC endpoint: PATCH /api/energy/providers/{id}/seed | Update model_assignments
# DOC endpoint: POST /api/energy/providers/{id}/optimize | Apply optimizer preset
# DOC endpoint: POST /api/energy/discover/{id} | Trigger model discovery refresh
# DOC endpoint: POST /api/pcna/converge/{provider_id} | Converge provider PCNA → primary

UI_META = {
    "tab_id": "energy",
    "label": "Energy",
    "icon": "Zap",
    "order": 3,
    "tier_gate": "admin",
    "sections": [],
}

router = APIRouter(prefix="/api/energy", tags=["energy"])
pcna_router = APIRouter(prefix="/api/pcna", tags=["pcna"])

_ADMIN_EMAIL = __import__("os").environ.get("ADMIN_EMAIL", "")
_ADMIN_USER_ID = __import__("os").environ.get("ADMIN_USER_ID", "")


async def _require_admin(request: Request) -> None:
    """Raise 403 unless the caller is an admin (by user ID, email, or role header)."""
    uid = request.headers.get("x-user-id", "")
    email = (request.headers.get("x-user-email") or "").strip().lower()
    role = request.headers.get("x-user-role", "user")
    if role == "admin":
        return
    if _ADMIN_USER_ID and uid == _ADMIN_USER_ID:
        return
    if _ADMIN_EMAIL and email == _ADMIN_EMAIL.strip().lower():
        return
    # Check admin_emails table
    try:
        from ..database import get_session
        from sqlalchemy import text as _text2
        async with get_session() as sess:
            row = (await sess.execute(
                _text2("SELECT 1 FROM admin_emails WHERE email = :e"), {"e": email}
            )).first()
            if row:
                return
    except Exception:
        pass
    raise HTTPException(status_code=403, detail="Admin only")


# Validation constants — single source of truth for both Pydantic and the
# legacy in-handler checks. Tightening these tightens the admin API surface.
VALID_ROLES = {"record", "practice", "conduct", "perform", "derive"}
VALID_PRESETS = {"speed", "depth", "price", "balance", "creativity", "coding"}
_MODEL_ID_RE = re.compile(r"^[A-Za-z0-9._\-:/]{1,128}$")
_TOOL_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def _validate_role_map(value: dict, field: str) -> dict:
    """Shared validator: dict whose keys are roles and values are
    {derive: <model_id>, ...}-shaped dicts of small string entries."""
    if not isinstance(value, dict):
        raise ValueError(f"{field} must be an object")
    bad_roles = set(value.keys()) - VALID_ROLES
    if bad_roles:
        raise ValueError(
            f"{field}: invalid role(s) {sorted(bad_roles)}; allowed: {sorted(VALID_ROLES)}"
        )
    for role, entry in value.items():
        if not isinstance(entry, dict):
            raise ValueError(f"{field}.{role} must be an object")
        if len(entry) > 16:
            raise ValueError(f"{field}.{role} has too many keys (max 16)")
        for k, v in entry.items():
            if not isinstance(k, str) or not _MODEL_ID_RE.match(k):
                raise ValueError(f"{field}.{role}: bad key '{k}'")
            if v is None:
                continue
            if not isinstance(v, (str, int, float, bool)):
                raise ValueError(f"{field}.{role}.{k} must be scalar (str/int/float/bool)")
            if isinstance(v, str) and len(v) > 256:
                raise ValueError(f"{field}.{role}.{k} string too long (max 256)")
    return value


class PatchSeedBody(BaseModel):
    """Strict admin patch body. Unknown top-level fields are rejected so a
    typo never silently overwrites the wrong slot in route_config."""
    model_config = {"extra": "forbid"}

    model_assignments: Optional[dict] = None
    available_models: Optional[list] = Field(default=None, max_length=200)
    enabled_tools: Optional[list[str]] = Field(default=None, max_length=64)
    context_addendum: Optional[str] = Field(default=None, max_length=50_000)
    capabilities: Optional[dict] = None
    presets: Optional[dict] = None

    @field_validator("model_assignments")
    @classmethod
    def _check_assignments(cls, v):
        return _validate_role_map(v, "model_assignments") if v is not None else v

    @field_validator("available_models")
    @classmethod
    def _check_available_models(cls, v):
        if v is None:
            return v
        for i, m in enumerate(v):
            if not isinstance(m, dict):
                raise ValueError(f"available_models[{i}] must be an object")
            mid = m.get("id")
            if not isinstance(mid, str) or not _MODEL_ID_RE.match(mid):
                raise ValueError(f"available_models[{i}].id missing or malformed")
            if len(m) > 32:
                raise ValueError(f"available_models[{i}] has too many keys (max 32)")
        return v

    @field_validator("enabled_tools")
    @classmethod
    def _check_tools(cls, v):
        if v is None:
            return v
        for i, t in enumerate(v):
            if not isinstance(t, str) or not _TOOL_NAME_RE.match(t):
                raise ValueError(f"enabled_tools[{i}]='{t}' not a valid tool slug")
        if len(set(v)) != len(v):
            raise ValueError("enabled_tools contains duplicates")
        return v

    @field_validator("capabilities")
    @classmethod
    def _check_capabilities(cls, v):
        if v is None:
            return v
        if len(v) > 64:
            raise ValueError("capabilities has too many keys (max 64)")
        for k, val in v.items():
            if not isinstance(k, str) or len(k) > 64:
                raise ValueError(f"capabilities key '{k}' invalid")
            if not isinstance(val, (bool, str, int, float)) and val is not None:
                raise ValueError(f"capabilities.{k} must be scalar")
        return v

    @field_validator("presets")
    @classmethod
    def _check_presets(cls, v):
        if v is None:
            return v
        bad = set(v.keys()) - VALID_PRESETS
        if bad:
            raise ValueError(
                f"presets: invalid preset(s) {sorted(bad)}; allowed: {sorted(VALID_PRESETS)}"
            )
        for name, assignments in v.items():
            _validate_role_map(assignments, f"presets.{name}")
        return v


class OptimizeBody(BaseModel):
    preset: Literal["speed", "depth", "price", "balance", "creativity", "coding"]


async def _get_seed_module(provider_id: str) -> dict | None:
    """Return the WS module row for the given provider seed."""
    try:
        from ..database import get_session
        async with get_session() as session:
            result = await session.execute(
                sa_text("SELECT id, slug, name, route_config, status, updated_at FROM ws_modules WHERE slug = :slug"),
                {"slug": f"provider::{provider_id}"}
            )
            row = result.mappings().first()
            if row:
                return dict(row)
    except Exception:
        pass
    return None


async def _update_seed_route_config(provider_id: str, updates: dict) -> dict:
    """Merge updates into the seed's route_config and persist."""
    from ..database import get_session
    slug = f"provider::{provider_id}"
    async with get_session() as session:
        result = await session.execute(
            sa_text("SELECT id, route_config FROM ws_modules WHERE slug = :slug"),
            {"slug": slug}
        )
        row = result.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail=f"Provider seed '{provider_id}' not found")
        existing = dict(row["route_config"] or {})
        existing.update(updates)
        import json as _json
        await session.execute(
            sa_text("UPDATE ws_modules SET route_config = CAST(:cfg AS jsonb), updated_at = NOW() WHERE id = :id"),
            {"cfg": _json.dumps(existing), "id": row["id"]}
        )
    energy_registry.invalidate_seed_cache(provider_id)
    return existing


@router.get("/providers")
async def list_providers():
    """List all providers with their seed config and availability."""
    providers_out = []
    for pid, info in BUILTIN_PROVIDERS.items():
        available = bool(__import__("os").environ.get(info.get("env_key", ""))) or not info.get("env_key")
        seed = await _get_seed_module(pid)
        route_config = seed["route_config"] if seed else {}
        providers_out.append({
            "id": pid,
            "label": info["label"],
            "vendor": info["vendor"],
            "available": available,
            "active": pid == energy_registry.get_active_provider(),
            "route_config": route_config,
            "seed_updated_at": str(seed["updated_at"]) if seed and seed.get("updated_at") else None,
        })
    return providers_out


@router.get("/providers/{provider_id}/seed")
async def get_provider_seed(provider_id: str):
    """Get the full seed record for a provider."""
    seed = await _get_seed_module(provider_id)
    if not seed:
        raise HTTPException(status_code=404, detail="Provider seed not found")
    return seed


@router.patch("/providers/{provider_id}/seed")
async def patch_provider_seed(provider_id: str, body: PatchSeedBody, request: Request):
    """Update model_assignments and other seed fields. Admin only."""
    await _require_admin(request)
    updates: dict = {}
    if body.model_assignments is not None:
        # Validate roles
        valid_roles = {"record", "practice", "conduct", "perform", "derive"}
        for role in body.model_assignments:
            if role not in valid_roles:
                raise HTTPException(status_code=400, detail=f"Invalid role: {role}")
        updates["model_assignments"] = body.model_assignments
    if body.available_models is not None:
        updates["available_models"] = body.available_models
    if body.enabled_tools is not None:
        updates["enabled_tools"] = body.enabled_tools
    if body.context_addendum is not None:
        updates["context_addendum"] = body.context_addendum
    if body.capabilities is not None:
        updates["capabilities"] = body.capabilities
    if body.presets is not None:
        updates["presets"] = body.presets

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    new_config = await _update_seed_route_config(provider_id, updates)
    return {"provider_id": provider_id, "route_config": new_config}


@router.post("/providers/{provider_id}/optimize")
async def optimize_provider(provider_id: str, body: OptimizeBody, request: Request):
    """Apply an optimizer preset to the provider's model_assignments. Admin only."""
    await _require_admin(request)
    valid_presets = {"speed", "depth", "price", "balance", "creativity", "coding"}
    if body.preset not in valid_presets:
        raise HTTPException(status_code=400, detail=f"Invalid preset. Choose from: {', '.join(sorted(valid_presets))}")

    # Seed custom presets take priority over the built-in registry fallback
    seed = await _get_seed_module(provider_id)
    if seed:
        custom_presets = (seed.get("route_config") or {}).get("presets", {})
        if body.preset in custom_presets:
            assignments = custom_presets[body.preset]
        else:
            provider_presets = _PROVIDER_PRESETS.get(provider_id, {})
            assignments = provider_presets.get(body.preset, {})
    else:
        provider_presets = _PROVIDER_PRESETS.get(provider_id, {})
        assignments = provider_presets.get(body.preset, {})

    if not assignments:
        raise HTTPException(status_code=400, detail=f"No preset '{body.preset}' found for provider '{provider_id}'")

    new_config = await _update_seed_route_config(provider_id, {"model_assignments": assignments, "active_preset": body.preset})
    return {"provider_id": provider_id, "preset_applied": body.preset, "model_assignments": assignments, "route_config": new_config}


async def run_discover_models(provider_id: str) -> dict:
    """
    Business logic for model auto-discovery. Called by both the HTTP endpoint
    and the daily heartbeat scheduler.
    Fetches live model list, fetches pricing page, merges with static catalog,
    marks missing models as stale, persists updated available_models to seed.
    """
    import os
    import re
    import httpx as _httpx

    if provider_id not in BUILTIN_PROVIDERS:
        return {"error": f"Unknown provider: {provider_id}"}

    info = BUILTIN_PROVIDERS[provider_id]
    api_key = os.environ.get(info.get("env_key", ""), "")

    static_catalog = {m["id"]: m for m in _PROVIDER_AVAILABLE_MODELS.get(provider_id, [])}
    live_ids: set[str] = set()
    errors: list[str] = []
    discovered_at = time.time()

    # Live model listing: OpenAI / Grok
    if api_key and provider_id in ("openai", "grok"):
        try:
            base_url = "https://api.x.ai/v1" if provider_id == "grok" else "https://api.openai.com/v1"
            headers = {"Authorization": f"Bearer {api_key}"}
            async with _httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(f"{base_url}/models", headers=headers)
                if resp.status_code == 200:
                    for m in resp.json().get("data", []):
                        mid = m.get("id", "")
                        if mid:
                            live_ids.add(mid)
                else:
                    errors.append(f"models listing returned {resp.status_code}")
        except Exception as exc:
            errors.append(f"live discovery failed: {exc}")

    # Live model listing: Gemini
    if api_key and provider_id == "gemini":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            async with _httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url)
                if resp.status_code == 200:
                    for m in resp.json().get("models", []):
                        mid = (m.get("name") or "").split("/")[-1]
                        if mid:
                            live_ids.add(mid)
                else:
                    errors.append(f"gemini models listing returned {resp.status_code}")
        except Exception as exc:
            errors.append(f"gemini discovery failed: {exc}")

    # Live model listing: Claude
    if api_key and provider_id == "claude":
        try:
            hdrs = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
            async with _httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get("https://api.anthropic.com/v1/models", headers=hdrs)
                if resp.status_code == 200:
                    for m in resp.json().get("data", []):
                        mid = m.get("id", "")
                        if mid:
                            live_ids.add(mid)
                else:
                    errors.append(f"claude models listing returned {resp.status_code}")
        except Exception as exc:
            errors.append(f"claude discovery failed: {exc}")

    # Pricing page fetch + basic extraction
    pricing_snapshot: dict = {}
    pricing_url = _PROVIDER_PRICING_URLS.get(provider_id, "")
    if pricing_url:
        try:
            async with _httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                resp = await client.get(
                    pricing_url,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; a0p-discovery/1.0)"},
                )
                if resp.status_code == 200:
                    text_content = resp.text
                    # Extract price patterns: $N.NN or N.NN per M tokens
                    matches = re.findall(r"\$?([\d]+\.[\d]+)\s*(?:/|per)\s*(1M|1K|million|thousand)\s*(?:input|output|tokens)?", text_content, re.IGNORECASE)
                    pricing_snapshot["raw_matches"] = matches[:20]
                    pricing_snapshot["page_length"] = len(text_content)
                else:
                    errors.append(f"pricing fetch returned {resp.status_code}")
        except Exception as exc:
            errors.append(f"pricing fetch failed: {exc}")

    # Merge live + static, mark stale
    merged: list[dict] = []
    all_ids = live_ids | set(static_catalog.keys())
    for mid in sorted(all_ids):
        base = dict(static_catalog.get(mid, {
            "id": mid, "context_window": 8192,
            "pricing": {"input_per_1m": 0, "output_per_1m": 0}, "capabilities": {},
        }))
        base["last_seen_at"] = discovered_at if mid in live_ids else base.get("last_seen_at", 0)
        base["stale"] = (len(live_ids) > 0 and mid not in live_ids)
        merged.append(base)

    try:
        await _update_seed_route_config(provider_id, {
            "available_models": merged,
            "prices_updated_at": discovered_at,
            "pricing_url": pricing_url,
            "pricing_snapshot": pricing_snapshot,
        })
    except Exception as exc:
        errors.append(f"seed update failed: {exc}")

    return {
        "provider_id": provider_id,
        "discovered": len(live_ids),
        "total_models": len(merged),
        "stale_count": sum(1 for m in merged if m.get("stale")),
        "prices_updated_at": discovered_at,
        "pricing_snapshot": pricing_snapshot,
        "errors": errors,
        "models": merged,
    }


@router.post("/discover/{provider_id}")
async def discover_models(provider_id: str, request: Request):
    """
    Trigger model auto-discovery for a provider. Admin only.
    Fetches live model list, pricing page, marks stale models, persists to seed.
    """
    await _require_admin(request)
    if provider_id not in BUILTIN_PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider_id}")
    return await run_discover_models(provider_id)


# PCNA converge endpoint
@pcna_router.post("/converge/{provider_id}")
async def converge_provider_pcna(provider_id: str, request: Request):
    """Converge a provider's PCNA core back toward the primary. Admin only."""
    await _require_admin(request)
    from ..main import get_pcna, get_provider_pcna_cores
    provider_cores = get_provider_pcna_cores()
    if provider_id not in provider_cores:
        raise HTTPException(status_code=404, detail=f"No PCNA core found for provider '{provider_id}'")
    from ..engine import InstanceMerge
    primary = get_pcna()
    provider_core = provider_cores[provider_id]
    result = InstanceMerge.converge(primary, provider_core, alpha=0.3)
    await primary.save_checkpoint()
    provider_core._checkpoint_key = f"pcna_provider_{provider_id}"
    await provider_core.save_checkpoint()
    return {"provider_id": provider_id, "converge_result": result}
# 0:0
