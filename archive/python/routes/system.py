# 226:13 0:6 2:4
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, Any

from ..storage import storage
from ._admin_gate import require_admin

# DOC module: system
# DOC label: System
# DOC description: Controls platform-level subsystem toggles, cost tracking, and event logs. Restricted to admin users.
# DOC tier: admin
# DOC role: route
# DOC endpoint: GET /api/v1/system/toggles | List all subsystem toggles
# DOC endpoint: PUT /api/v1/system/toggles/{subsystem} | Enable or configure a subsystem toggle
# DOC endpoint: DELETE /api/v1/system/toggles/{subsystem} | Remove a subsystem toggle
# DOC endpoint: GET /api/v1/system/costs | List recorded cost entries
# DOC endpoint: GET /api/v1/system/costs/summary | Get cost totals by provider
# DOC endpoint: GET /api/v1/system/events | Stream recent system events

UI_META = {
    "tab_id": "system",
    "label": "System",
    "icon": "Settings",
    "order": 6,
    "sections": [
        {
            "id": "toggles",
            "label": "System Toggles",
            "endpoint": "/api/v1/system/toggles",
            "fields": [
                {"key": "subsystem", "type": "text", "label": "Subsystem"},
                {"key": "enabled", "type": "badge", "label": "Enabled"},
                {"key": "parameters", "type": "json", "label": "Parameters"},
                {"key": "updated_at", "type": "text", "label": "Updated"},
            ],
        },
        {
            "id": "costs",
            "label": "Cost Metrics",
            "endpoint": "/api/v1/system/costs/summary",
            "fields": [
                {"key": "totalCost", "type": "text", "label": "Total Cost"},
                {"key": "costThisMonth", "type": "text", "label": "This Month"},
                {"key": "costToday", "type": "text", "label": "Today"},
                {"key": "byModel", "type": "json", "label": "By Model"},
            ],
        },
        {
            "id": "events",
            "label": "Events",
            "endpoint": "/api/v1/system/events",
            "fields": [
                {"key": "task_id", "type": "text", "label": "Task"},
                {"key": "event_type", "type": "badge", "label": "Type"},
                {"key": "created_at", "type": "text", "label": "Time"},
            ],
        },
        {
            "id": "activity",
            "label": "Activity Stats",
            "endpoint": "/api/v1/system/activity",
            "fields": [
                {"key": "heartbeatRuns", "type": "text", "label": "Heartbeat Runs"},
                {"key": "conversations", "type": "text", "label": "Conversations"},
                {"key": "events", "type": "text", "label": "Events"},
            ],
        },
        {
            "id": "deals",
            "label": "Deals",
            "endpoint": "/api/v1/system/deals",
            "fields": [
                {"key": "title", "type": "text", "label": "Title"},
                {"key": "status", "type": "badge", "label": "Status"},
                {"key": "ceiling", "type": "text", "label": "Ceiling"},
                {"key": "created_at", "type": "text", "label": "Created"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/system/toggles"},
        {"method": "PUT", "path": "/api/v1/system/toggles/{subsystem}"},
        {"method": "DELETE", "path": "/api/v1/system/toggles/{subsystem}"},
        {"method": "GET", "path": "/api/v1/system/costs"},
        {"method": "GET", "path": "/api/v1/system/costs/summary"},
        {"method": "GET", "path": "/api/v1/system/events"},
        {"method": "GET", "path": "/api/v1/system/activity"},
        {"method": "GET", "path": "/api/v1/system/deals"},
        {"method": "POST", "path": "/api/v1/system/deals"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["system"])


class ToggleInput(BaseModel):
    enabled: bool
    parameters: Optional[Any] = None


class DealInput(BaseModel):
    user_id: str
    title: str
    status: str = "active"
    ceiling: Optional[float] = None
    walk_away: Optional[float] = None
    my_goals: Optional[list[str]] = None
    current_terms: Optional[dict] = None


class DealUpdate(BaseModel):
    status: Optional[str] = None
    ceiling: Optional[float] = None
    walk_away: Optional[float] = None
    my_goals: Optional[list[str]] = None
    current_terms: Optional[dict] = None
    outcome: Optional[str] = None
    final_terms: Optional[dict] = None


@router.get("/system/toggles")
async def list_toggles():
    return await storage.get_system_toggles()


@router.put("/system/toggles/{subsystem}")
async def upsert_toggle(subsystem: str, request: Request, body: ToggleInput):
    await require_admin(request)
    return await storage.upsert_system_toggle(subsystem, body.enabled, body.parameters)


@router.delete("/system/toggles/{subsystem}")
async def delete_toggle(subsystem: str, request: Request):
    await require_admin(request)
    await storage.delete_system_toggle(subsystem)
    return {"ok": True}


@router.get("/system/costs")
async def list_costs(user_id: Optional[str] = None):
    return await storage.get_cost_metrics(user_id)


@router.get("/system/costs/summary")
async def cost_summary():
    return await storage.get_cost_summary()


@router.get("/system/events")
async def list_events(limit: int = 100):
    return await storage.get_recent_events(limit)


@router.get("/system/activity")
async def activity_stats():
    return await storage.get_activity_stats()


@router.get("/system/deals")
async def list_deals(user_id: str = "default"):
    return await storage.list_deals(user_id)


@router.post("/system/deals")
async def create_deal(request: Request, body: DealInput):
    await require_admin(request)
    data = body.model_dump(exclude_none=True)
    return await storage.create_deal(data)


@router.get("/system/deals/{deal_id}")
async def get_deal(deal_id: int):
    deal = await storage.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    return deal


@router.patch("/system/deals/{deal_id}")
async def update_deal(deal_id: int, request: Request, body: DealUpdate):
    await require_admin(request)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates")
    return await storage.update_deal(deal_id, updates)



import subprocess as _subprocess
import time as _time

_BOOT_AT: float = _time.time()


@router.get("/system/build-info")
async def build_info(request: Request):
    """Git commit + server boot time. Visible to ws/admin only."""
    uid = request.headers.get("x-user-id")
    role = request.headers.get("x-user-role", "")
    if role not in ("admin", "ws"):
        db_role = None
        if uid:
            from sqlalchemy import text as _sa_text
            from ..database import get_session
            async with get_session() as _sess:
                _r = await _sess.execute(
                    _sa_text("SELECT role FROM users WHERE id = :uid LIMIT 1"),
                    {"uid": uid},
                )
                _row = _r.first()
                db_role = _row[0] if _row else None
        if db_role not in ("admin", "ws"):
            raise HTTPException(status_code=403, detail="ws/admin only")
    try:
        raw = _subprocess.check_output(
            ["git", "log", "-1", "--format=%H|%s|%cI"],
            stderr=_subprocess.DEVNULL,
            timeout=3,
        ).decode().strip()
        parts = raw.split("|", 2)
        commit_hash = parts[0][:8] if len(parts) > 0 else "unknown"
        commit_subject = parts[1] if len(parts) > 1 else ""
        committed_at = parts[2] if len(parts) > 2 else ""
    except Exception:
        commit_hash, commit_subject, committed_at = "unknown", "", ""
    return {
        "commit_hash": commit_hash,
        "commit_subject": commit_subject,
        "committed_at": committed_at,
        "boot_at": _BOOT_AT,
    }


from pathlib import Path as _Path

_DOCS_ROOT = _Path(__file__).resolve().parents[2]
_ALLOWED_DOCS: dict[str, str] = {
    "replit.md": "replit.md",
    "CLAUDE.md": "CLAUDE.md",
    "copilot.md": "copilot.md",
    "README.md": "README.md",
}


@router.get("/system/docs")
async def get_doc_file(file: str, request: Request):
    """Return one of the four root-level Markdown docs. ws/admin only."""
    uid = request.headers.get("x-user-id")
    role = request.headers.get("x-user-role", "")
    if role not in ("admin", "ws"):
        db_role = None
        if uid:
            from sqlalchemy import text as _sa_text
            from ..database import get_session
            async with get_session() as _sess:
                _r = await _sess.execute(
                    _sa_text("SELECT role FROM users WHERE id = :uid LIMIT 1"),
                    {"uid": uid},
                )
                _row = _r.first()
                db_role = _row[0] if _row else None
        if db_role not in ("admin", "ws"):
            raise HTTPException(status_code=403, detail="ws/admin only")
    if file not in _ALLOWED_DOCS:
        raise HTTPException(status_code=400, detail=f"Unknown file. Allowed: {list(_ALLOWED_DOCS)}")
    path = _DOCS_ROOT / _ALLOWED_DOCS[file]
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{file} not found")
    return {"file": file, "content": path.read_text(encoding="utf-8")}


from ..services.editable_registry import editable_registry, EditableField
editable_registry.register(EditableField(
    key="system_toggle",
    label="System Toggle",
    description="Enable or disable a named platform subsystem. Changes apply immediately.",
    control_type="toggle",
    module="system",
    get_endpoint="/api/v1/system/toggles",
    patch_endpoint="/api/v1/system/toggles/{subsystem}",
    query_key="/api/v1/system/toggles",
))
# 226:13 0:6 2:4
