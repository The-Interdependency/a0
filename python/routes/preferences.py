# 56:14
# N:M
"""User preferences — small key/value store backed by the settings table.

Used by the chat UI to remember the user's last orchestration_mode and
cut_mode selections so they don't have to re-pick on every page load.
"""
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text as _sa_text

from ..database import get_session

# DOC module: preferences
# DOC label: User Preferences
# DOC description: Per-user key/value preferences (orchestration_mode, cut_mode, etc.) backed by the settings table.
# DOC tier: free
# DOC endpoint: GET /api/v1/users/me/preferences | Return all preferences for the caller.
# DOC endpoint: PATCH /api/v1/users/me/preferences | Upsert one or more preferences.
# DOC notes: Anonymous callers get an empty dict and PATCH 401s.

router = APIRouter(prefix="/api/v1/users/me", tags=["preferences"])


_DEFAULTS = {
    "orchestration_mode": "single",
    "cut_mode": "soft",
}


def _caller_uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


class PrefPatch(BaseModel):
    """Free-form key/value upsert. Unknown keys are persisted as-is."""
    orchestration_mode: Optional[str] = None
    cut_mode: Optional[str] = None
    extras: Optional[dict[str, Any]] = None


@router.get("/preferences")
async def get_preferences(request: Request):
    uid = _caller_uid(request)
    out = dict(_DEFAULTS)
    if not uid:
        return out
    async with get_session() as s:
        r = await s.execute(_sa_text(
            "SELECT key, value FROM settings WHERE user_id = :u"
        ), {"u": uid})
        for row in r.mappings().all():
            v = row["value"]
            if isinstance(v, dict) and ("v" in v or "value" in v):
                v = v.get("v") or v.get("value")
            out[row["key"]] = v
    return out


@router.patch("/preferences")
async def patch_preferences(body: PrefPatch, request: Request):
    uid = _caller_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="authentication required")
    updates: dict[str, Any] = {}
    if body.orchestration_mode is not None:
        updates["orchestration_mode"] = body.orchestration_mode
    if body.cut_mode is not None:
        updates["cut_mode"] = body.cut_mode
    if body.extras:
        for k, v in body.extras.items():
            updates[k] = v
    if not updates:
        return {"ok": True, "updated": 0}
    async with get_session() as s:
        for k, v in updates.items():
            await s.execute(_sa_text(
                "INSERT INTO settings (user_id, key, value) "
                "VALUES (:u, :k, CAST(:v AS jsonb)) "
                "ON CONFLICT (user_id, key) DO UPDATE "
                "SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP"
            ), {"u": uid, "k": k, "v": __import__("json").dumps({"v": v})})
    return {"ok": True, "updated": len(updates), "values": updates}
# N:M
# 56:14
