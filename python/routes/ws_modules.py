# 265:62
"""WS Module registry API.

Provides CRUD for user-defined and system-shadow console modules.
All write operations require a write token obtained from the token endpoint.

Status semantics:
  system   — shadow record for a hardcoded route; visible, immutable via API
  active   — user module live (mounted in the runtime router)
  inactive — user module stored but not mounted
  locked   — write-protected by owner; only owner or admin can unlock
  error    — failed compilation or mount; error_log contains details

Authorization layers (server-side, not just UI):
  1. Must be authenticated (x-user-id header)
  2. Must hold ws, pro, or admin subscription tier for any write
  3. system modules are blocked at the storage call — no write at all
  4. locked modules block all edits except lock-toggle by owner/admin
  5. Every create/patch/delete/swap requires a valid, unexpired write token
     issued specifically for that (module_id, user_id) pair
"""

import hashlib
import json
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional

from ..storage import storage
from ..services.module_write_token import issue_token, consume_token
from ..engine.module_registry import get_registry

# DOC module: ws_modules
# DOC label: Modules
# DOC description: WS-tier module registry. Users can register, configure, lock, and manage custom console modules. System shadow records mirror hardcoded tabs and are read-only via the API.
# DOC tier: ws
# DOC endpoint: GET /api/v1/ws/modules | List all modules including system shadows
# DOC endpoint: GET /api/v1/ws/modules/{id} | Get a single module
# DOC endpoint: GET /api/v1/ws/modules/{id}/write-token | Issue a single-use write token (120s TTL)
# DOC endpoint: POST /api/v1/ws/modules | Create a new user module
# DOC endpoint: PATCH /api/v1/ws/modules/{id} | Update a module's metadata
# DOC endpoint: PATCH /api/v1/ws/modules/{id}/lock | Toggle a module's lock status
# DOC endpoint: DELETE /api/v1/ws/modules/{id} | Delete a user module
# DOC endpoint: POST /api/v1/ws/modules/{id}/swap | Hot-swap handler code and activate module (compiles + mounts routes live)
# DOC endpoint: POST /api/v1/ws/modules/{id}/deactivate | Unmount a module's routes without deleting it
# DOC notes: Write tokens are required for all create/patch/delete/swap/deactivate operations. Lock toggle is a separate protected action that does not require a write token.

UI_META = {
    "tab_id": "ws_modules",
    "label": "Modules",
    "icon": "Blocks",
    "order": 90,
    "tier_gate": "ws",
    "sections": [],
}

router = APIRouter(prefix="/api/v1/ws", tags=["ws-modules"])

_WS_TIERS = {"ws", "pro", "admin"}


def _require_uid(request: Request) -> str:
    uid = request.headers.get("x-user-id", "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


async def _get_user_tier(user_id: str) -> tuple[str, bool]:
    """Return (subscription_tier, is_admin) for the given user_id."""
    from ..database import engine as _engine
    from sqlalchemy import text as _sa_text
    async with _engine.connect() as conn:
        row = await conn.execute(
            _sa_text("SELECT subscription_tier, role FROM users WHERE id = :id"),
            {"id": user_id},
        )
        rec = row.mappings().first()
    if not rec:
        return "free", False
    tier = rec["subscription_tier"] or "free"
    is_admin = rec["role"] == "admin"
    return tier, is_admin


async def _resolve_user_context(request: Request) -> tuple[str, str, bool]:
    """Resolve (user_id, tier, is_admin) once per request and cache on request.state.

    Subsequent calls within the same request reuse the cached tuple instead of
    re-querying the users table on every protected write path.
    """
    cached = getattr(request.state, "user_ctx", None)
    if cached is not None:
        return cached
    uid = _require_uid(request)
    tier, is_admin = await _get_user_tier(uid)
    ctx = (uid, tier, is_admin)
    request.state.user_ctx = ctx
    return ctx


async def _require_ws(request: Request) -> tuple[str, str, bool]:
    """Require ws/pro/admin tier. Returns (user_id, tier, is_admin)."""
    uid, tier, is_admin = await _resolve_user_context(request)
    if tier not in _WS_TIERS and not is_admin:
        raise HTTPException(status_code=403, detail="ws, pro, or admin tier required")
    return uid, tier, is_admin


def _can_write_module(mod: dict, user_id: str, is_admin: bool) -> None:
    """Raise 403/404 if this user cannot mutate the given module."""
    if mod["status"] == "system":
        raise HTTPException(
            status_code=403,
            detail="System modules are immutable via the API. They can only be changed in code.",
        )
    if mod["status"] == "locked":
        if not is_admin and mod["owner_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Module is locked. Only the owner or an admin can unlock it.",
            )


def _content_hash(handler_code: Optional[str], ui_meta: dict) -> str:
    raw = json.dumps({"handler_code": handler_code or "", "ui_meta": ui_meta}, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


class CreateModuleBody(BaseModel):
    slug: str
    name: str
    description: str = ""
    handler_code: Optional[str] = None
    ui_meta: dict = {}
    route_config: dict = {}
    write_token: str


class PatchModuleBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    handler_code: Optional[str] = None
    ui_meta: Optional[dict] = None
    route_config: Optional[dict] = None
    write_token: str


class SwapBody(BaseModel):
    write_token: str
    handler_code: Optional[str] = None


class LockToggleBody(BaseModel):
    locked: bool


class DeactivateBody(BaseModel):
    write_token: str


class DeleteBody(BaseModel):
    write_token: str


@router.get("/modules")
async def list_modules(request: Request):
    """List all modules (including system shadows). Requires ws tier."""
    await _require_ws(request)
    return await storage.list_ws_modules()


@router.get("/modules/{module_id}")
async def get_module(module_id: int, request: Request):
    """Get a single module by ID. Requires ws tier."""
    await _require_ws(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    return mod


@router.get("/modules/{module_id}/write-token")
async def get_write_token(module_id: str, request: Request):
    """Issue a single-use write token for mutating a module.

    module_id can be an integer ID for existing modules, or the string "new"
    for creation tokens. Token expires in 120 seconds and is single-use.
    """
    uid, tier, is_admin = await _require_ws(request)

    if module_id != "new":
        mid = int(module_id)
        mod = await storage.get_ws_module(mid)
        if not mod:
            raise HTTPException(status_code=404, detail="Module not found")
        if mod["status"] == "system":
            raise HTTPException(
                status_code=403,
                detail="System modules cannot be mutated; no write token issued.",
            )
        if mod["status"] == "locked" and not is_admin and mod["owner_id"] != uid:
            raise HTTPException(
                status_code=403,
                detail="Module is locked. Unlock it first before requesting a write token.",
            )

    token = issue_token(module_id, uid)
    return {"token": token, "expires_in_seconds": 120, "module_id": module_id}


@router.post("/modules")
async def create_module(body: CreateModuleBody, request: Request):
    """Create a new user module. Requires ws tier + valid creation write token."""
    uid, tier, is_admin = await _require_ws(request)

    if not consume_token(body.write_token, "new", uid):
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired write token. Request a new one and retry.",
        )

    if not body.slug or "/" in body.slug or body.slug.startswith("system::"):
        raise HTTPException(status_code=400, detail="Invalid slug. Must not contain '/' or start with 'system::'.")

    existing = await storage.get_ws_module_by_slug(body.slug)
    if existing:
        raise HTTPException(status_code=409, detail=f"Slug '{body.slug}' already exists.")

    mod = await storage.create_ws_module({
        "slug": body.slug,
        "name": body.name,
        "description": body.description,
        "owner_id": uid,
        "status": "inactive",
        "handler_code": body.handler_code,
        "ui_meta": body.ui_meta,
        "route_config": body.route_config,
    })
    return mod


@router.patch("/modules/{module_id}")
async def patch_module(module_id: int, body: PatchModuleBody, request: Request):
    """Edit a module's metadata. Requires ws tier + valid write token + ownership."""
    uid, tier, is_admin = await _require_ws(request)

    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")

    _can_write_module(mod, uid, is_admin)

    if not consume_token(body.write_token, str(module_id), uid):
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired write token. Request a new one and retry.",
        )

    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.description is not None:
        updates["description"] = body.description
    if body.handler_code is not None:
        updates["handler_code"] = body.handler_code
    if body.ui_meta is not None:
        updates["ui_meta"] = body.ui_meta
    if body.route_config is not None:
        updates["route_config"] = body.route_config
    if not updates:
        return mod

    updates["version"] = (mod.get("version") or 1) + 1
    updated = await storage.update_ws_module(module_id, updates)
    return updated


@router.patch("/modules/{module_id}/lock")
async def toggle_lock(module_id: int, body: LockToggleBody, request: Request):
    """Lock or unlock a module. Owner can toggle their own; admin can toggle any.

    Locking stores a content hash to detect tampering. Locking does NOT require
    a write token — the lock toggle is its own protected action.
    """
    uid, tier, is_admin = await _require_ws(request)

    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")

    if mod["status"] == "system":
        raise HTTPException(status_code=403, detail="System modules cannot be locked or unlocked.")

    if not is_admin and mod["owner_id"] != uid:
        raise HTTPException(status_code=403, detail="Only the module owner or an admin can change the lock.")

    current_status = mod["status"]
    if body.locked:
        if current_status == "locked":
            return mod
        new_status = "locked"
        chash = _content_hash(mod.get("handler_code"), mod.get("ui_meta") or {})
        updates = {"status": new_status, "content_hash": chash}
    else:
        if current_status not in ("locked",):
            return mod
        new_status = "inactive"
        updates = {"status": new_status, "content_hash": None}

    updated = await storage.update_ws_module(module_id, updates)
    return updated


@router.delete("/modules/{module_id}")
async def delete_module(module_id: int, body: DeleteBody, request: Request):
    """Delete a user module. Requires ownership (or admin) + valid write token.

    System modules cannot be deleted — they exist as long as their backing code does.
    """
    uid, tier, is_admin = await _require_ws(request)

    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")

    _can_write_module(mod, uid, is_admin)

    if not consume_token(body.write_token, str(module_id), uid):
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired write token. Request a new one and retry.",
        )

    ok = await storage.delete_ws_module(module_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Module not found")
    await get_registry().unmount_safe(module_id)
    return {"ok": True, "deleted": module_id}


@router.post("/modules/{module_id}/swap")
async def swap_module(module_id: int, body: SwapBody, request: Request):
    """Hot-swap a module's handler code and activate it live.

    Compiles the handler code, mounts its routes on the running app, and sets
    status='active'. If compilation fails, status is set to 'error' and the
    error_log field is populated; existing routes (if any) are left in place.
    A write token is required, obtained from GET /modules/{id}/write-token.
    """
    uid, tier, is_admin = await _require_ws(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    _can_write_module(mod, uid, is_admin)
    if not consume_token(body.write_token, str(module_id), uid):
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired write token. Request a new one and retry.",
        )
    handler_code = body.handler_code or mod.get("handler_code") or ""
    if not handler_code.strip():
        raise HTTPException(
            status_code=400,
            detail="No handler_code provided and none stored for this module.",
        )
    try:
        await get_registry().swap(module_id, mod["slug"], handler_code)
    except Exception as exc:
        await storage.update_ws_module(module_id, {
            "status": "error",
            "error_log": str(exc),
            "handler_code": handler_code if body.handler_code else mod.get("handler_code"),
        })
        raise HTTPException(status_code=422, detail=f"Compilation failed: {exc}") from exc

    from datetime import datetime as _dt
    updated = await storage.update_ws_module(module_id, {
        "status": "active",
        "handler_code": handler_code,
        "error_log": None,
        "version": (mod.get("version") or 1) + 1,
        "last_swapped_at": _dt.utcnow(),
    })
    return updated


@router.post("/modules/{module_id}/deactivate")
async def deactivate_module(module_id: int, body: DeactivateBody, request: Request):
    """Unmount a module's routes from the live app without deleting the record.

    Sets status='inactive'. Requires ownership (or admin) + write token.
    """
    uid, tier, is_admin = await _require_ws(request)
    mod = await storage.get_ws_module(module_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Module not found")
    _can_write_module(mod, uid, is_admin)
    if not consume_token(body.write_token, str(module_id), uid):
        raise HTTPException(
            status_code=403,
            detail="Invalid or expired write token. Request a new one and retry.",
        )
    await get_registry().unmount_safe(module_id)
    updated = await storage.update_ws_module(module_id, {"status": "inactive"})
    return updated
# 265:62
