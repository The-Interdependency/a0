# 127:16
# DOC module: energy
# DOC label: Energy Providers
# DOC description: Provider seed management — model_assignments, optimizer presets, PCNA core converge, and model discovery for all AI providers.
# DOC tier: admin
# DOC endpoint: GET /api/energy/providers | List all provider seed modules with PCNA stats
# DOC endpoint: GET /api/energy/providers/{provider_id} | Get one provider with full route_config + PCNA stats
# DOC endpoint: PATCH /api/energy/providers/{provider_id}/route_config | Partial-update route_config (merges model_assignments)
# DOC endpoint: POST /api/energy/optimize/{provider_id} | Apply optimizer preset to model_assignments
# DOC endpoint: POST /api/energy/discover/{provider_id} | Refresh available_models (returns seed list + timestamp)
# DOC endpoint: POST /api/energy/converge/{provider_id} | Merge provider PCNA core into main PCNA (0.8/0.2 blend)
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api/energy", tags=["energy"])

ROLES = ["conduct", "perform", "practice", "record", "derive"]


def _require_admin(request: Request) -> None:
    role = request.headers.get("x-user-role", "user")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _get_storage():
    from ..storage import storage
    return storage


def _provider_pcna_core(provider_id: str):
    from ..main import get_provider_pcna
    return get_provider_pcna(provider_id)


def _main_pcna_core():
    from ..main import get_pcna
    return get_pcna()


async def _get_provider_module(provider_id: str) -> dict:
    slug = f"provider::{provider_id}"
    mod = await _get_storage().get_ws_module_by_slug(slug)
    if not mod:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
    return mod


def _enrich_with_pcna(provider_id: str, mod: dict) -> dict:
    out = dict(mod)
    try:
        core = _provider_pcna_core(provider_id)
        out["pcna"] = {
            "infer_count": core.infer_count,
            "last_coherence": round(core.last_coherence, 4),
            "last_winner": core.last_winner,
        }
    except Exception:
        out["pcna"] = None
    out["provider_id"] = provider_id
    return out


@router.get("/providers")
async def list_providers() -> list[dict]:
    """List all provider seed WS modules (slug prefix provider::)."""
    all_mods = await _get_storage().list_ws_modules()
    result = []
    for mod in all_mods:
        slug = mod.get("slug", "")
        if not slug.startswith("provider::"):
            continue
        provider_id = slug.removeprefix("provider::")
        result.append(_enrich_with_pcna(provider_id, mod))
    return result


@router.get("/providers/{provider_id}")
async def get_provider(provider_id: str) -> dict:
    """Get one provider's full config including PCNA core stats."""
    mod = await _get_provider_module(provider_id)
    return _enrich_with_pcna(provider_id, mod)


class RouteConfigPatch(BaseModel):
    patch: dict[str, Any]


@router.patch("/providers/{provider_id}/route_config")
async def patch_route_config(provider_id: str, body: RouteConfigPatch, request: Request) -> dict:
    """Partial-update route_config. model_assignments are merged, not replaced."""
    _require_admin(request)
    mod = await _get_provider_module(provider_id)
    existing_rc: dict = dict(mod.get("route_config") or {})

    patch = dict(body.patch)
    if "model_assignments" in patch:
        existing_ma = dict(existing_rc.get("model_assignments") or {})
        existing_ma.update(patch["model_assignments"])
        patch["model_assignments"] = existing_ma

    merged = {**existing_rc, **patch}
    updated = await _get_storage().update_ws_module(mod["id"], {"route_config": merged})
    return _enrich_with_pcna(provider_id, updated or mod)


class OptimizeBody(BaseModel):
    preset: str


@router.post("/optimize/{provider_id}")
async def apply_optimizer_preset(provider_id: str, body: OptimizeBody, request: Request) -> dict:
    """Apply a named optimizer preset (speed/depth/price/balance/creativity) to model_assignments."""
    _require_admin(request)
    mod = await _get_provider_module(provider_id)
    rc: dict = dict(mod.get("route_config") or {})
    presets: dict = rc.get("presets") or {}

    if body.preset not in presets:
        raise HTTPException(
            status_code=422,
            detail=f"Preset '{body.preset}' not defined for provider '{provider_id}'. Available: {list(presets.keys())}",
        )

    new_assignments: dict = presets[body.preset]
    merged_rc = {**rc, "model_assignments": new_assignments}
    await _get_storage().update_ws_module(mod["id"], {"route_config": merged_rc})
    return {
        "provider_id": provider_id,
        "preset_applied": body.preset,
        "model_assignments": new_assignments,
    }


@router.post("/discover/{provider_id}")
async def discover_models(provider_id: str, request: Request) -> dict:
    """Return available_models from the provider seed (live pricing fetch is a future enhancement)."""
    _require_admin(request)
    mod = await _get_provider_module(provider_id)
    rc: dict = dict(mod.get("route_config") or {})
    available = rc.get("available_models") or []
    return {
        "provider_id": provider_id,
        "available_models": available,
        "last_checked": time.time(),
        "source": "seed",
    }


@router.post("/converge/{provider_id}")
async def converge_provider_pcna(provider_id: str, request: Request) -> dict:
    """Merge the provider PCNA core into main PCNA via weighted blend (80% main / 20% provider)."""
    _require_admin(request)
    import numpy as np

    provider_core = _provider_pcna_core(provider_id)
    main_core = _main_pcna_core()

    ring_names = ["phi", "psi", "omega", "memory_l", "memory_s"]
    merged_rings: list[str] = []
    for name in ring_names:
        p_ring = getattr(provider_core, name, None)
        m_ring = getattr(main_core, name, None)
        if p_ring is None or m_ring is None:
            continue
        if p_ring.tensor.shape == m_ring.tensor.shape:
            m_ring.tensor = 0.8 * m_ring.tensor + 0.2 * p_ring.tensor
            if hasattr(m_ring, "_recompute_coherence"):
                m_ring._recompute_coherence()
            elif hasattr(m_ring, "_recompute_hub_avg"):
                m_ring._recompute_hub_avg()
            merged_rings.append(name)

    await main_core.save_checkpoint()
    return {
        "provider_id": provider_id,
        "merged_rings": merged_rings,
        "main_coherence": round(main_core.last_coherence, 4),
    }
# 127:16
