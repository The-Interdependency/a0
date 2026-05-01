# 59:21
"""Module Config API — dedicated read/patch surface for per-module route_config JSON.

Config-only edits: no handler_code diffing, no hot-swap, no route reload.
Just read/write of the route_config JSON column in ws_modules.

Read:  admin (GET)
Write: admin + write token (PATCH) — same token mechanism as ws_modules.py.
System modules are unconditionally read-only.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Any

from ..storage import storage
from ..services.module_write_token import issue_token, consume_token
from ._admin_gate import require_admin

# DOC module: module_config
# DOC label: Module Config
# DOC description: Read and patch per-module route_config JSON without touching handler code or triggering a hot-swap. Admin-only. System modules are read-only.
# DOC tier: admin
# DOC endpoint: GET /api/v1/modules/config | List all modules — id, slug, name, status, route_config
# DOC endpoint: GET /api/v1/modules/config/{module_id} | Get route_config for one module
# DOC endpoint: GET /api/v1/modules/config/{module_id}/write-token | Issue a 120 s write token for config patching
# DOC endpoint: PATCH /api/v1/modules/config/{module_id} | Replace route_config for one module (admin + write token)
# DOC notes: System modules (status=system) return 403 on PATCH.
# DOC notes: Locked modules block config edits — unlock first via the Modules tab.

UI_META = {
    "tab_id": "module_config",
    "label": "Module Config",
    "icon": "Settings2",
    "order": 12,
    "tier_gate": "admin",
    "sections": [],
}

router = APIRouter(prefix="/api/v1/modules/config")


class ConfigPatch(BaseModel):
    route_config: dict[str, Any]
    write_token: str


def _row(m: dict) -> dict:
    return {
        "id": m["id"],
        "slug": m["slug"],
        "name": m["name"],
        "status": m["status"],
        "route_config": m.get("route_config") or {},
    }


@router.get("")
async def list_module_configs(request: Request):
    """Return all modules with id, slug, name, status, route_config."""
    await require_admin(request)
    return [_row(m) for m in await storage.list_ws_modules()]


@router.get("/{module_id}/write-token")
async def get_config_write_token(module_id: int, request: Request):
    """Issue a 120 s single-use write token for config editing."""
    await require_admin(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    uid = (request.headers.get("x-user-id") or "").strip()
    return {"token": await issue_token(module_id, uid), "ttl_seconds": 120}


@router.get("/{module_id}")
async def get_module_config(module_id: int, request: Request):
    """Return route_config for a single module."""
    await require_admin(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    return _row(mod)


@router.patch("/{module_id}")
async def patch_module_config(module_id: int, body: ConfigPatch, request: Request):
    """Replace route_config for one module. Admin + write token required."""
    await require_admin(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    if mod["status"] == "system":
        raise HTTPException(status_code=403, detail="System module config is read-only")
    if mod["status"] == "locked":
        raise HTTPException(status_code=403, detail="Module is locked — unlock first")
    uid = (request.headers.get("x-user-id") or "").strip()
    await consume_token(module_id, uid, body.write_token)
    await storage.update_ws_module(module_id, {"route_config": body.route_config})
    return {"ok": True, "module_id": module_id, "slug": mod["slug"]}
# 59:21
