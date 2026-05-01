# 113:37
"""
ZFAE API — Zeta Function Alpha Echo routes.

GET  /api/v1/zfae/echo                  — rolling 50-event echo buffer
GET  /api/v1/zfae/state                 — ZetaEngine state (includes resolution config)
GET  /api/v1/zfae/review-history        — last 10 conversation review runs
GET  /api/v1/zfae/resolution            — current resolution config
PUT  /api/v1/zfae/resolution            — set global resolution level (ws tier)
PUT  /api/v1/zfae/resolution/directory  — set per-directory resolution (ws tier)
DELETE /api/v1/zfae/resolution/directory — remove per-directory override (ws tier)
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ._admin_gate import require_admin

# DOC module: zfae
# DOC label: ZFAE
# DOC description: Zeta Function Alpha Echo subsystem. Maintains a rolling event echo buffer and exposes the ZetaEngine state and review history. Supports per-directory and global resolution levels (1–5) to control observation depth; comment lines are free of the 400-line budget.
# DOC tier: ws
# DOC endpoint: GET /api/v1/zfae/echo | Get the rolling 50-event echo buffer
# DOC endpoint: GET /api/v1/zfae/state | Get ZetaEngine state including resolution config
# DOC endpoint: GET /api/v1/zfae/review-history | Get recent review history entries
# DOC endpoint: GET /api/v1/zfae/resolution | Get the full resolution config
# DOC endpoint: PUT /api/v1/zfae/resolution | Set the global resolution level (body: {level})
# DOC endpoint: PUT /api/v1/zfae/resolution/directory | Set resolution for a directory path (body: {path, level})
# DOC endpoint: DELETE /api/v1/zfae/resolution/directory | Remove a per-directory override (body: {path})
# DOC notes: Resolution levels run 1–5. Level 1 = minimal observation, level 5 = maximum depth. The most specific matching directory prefix wins; global is the fallback.

UI_META = {
    "tab_id": "zfae",
    "label": "ZFAE",
    "icon": "Zap",
    "order": 10,
    "sections": [
        {
            "id": "echo",
            "label": "Echo Feed",
            "endpoint": "/api/v1/zfae/echo",
            "fields": [
                {"key": "provider", "type": "badge", "label": "Provider"},
                {"key": "coherence", "type": "gauge", "label": "Coherence"},
                {"key": "resolution", "type": "text", "label": "Resolution"},
                {"key": "cm", "type": "text", "label": "CM"},
                {"key": "da", "type": "text", "label": "DA"},
                {"key": "drift", "type": "text", "label": "Drift"},
            ],
        },
        {
            "id": "review_history",
            "label": "Review History",
            "endpoint": "/api/v1/zfae/review-history",
            "fields": [
                {"key": "ts", "type": "text", "label": "Timestamp"},
                {"key": "messages_reviewed", "type": "text", "label": "Messages"},
                {"key": "seeds_written", "type": "text", "label": "Seeds Updated"},
                {"key": "provider", "type": "badge", "label": "Provider"},
            ],
        },
    ],
}

_WS_TIERS = {"ws", "pro", "admin"}

router = APIRouter(prefix="/api/v1/zfae", tags=["zfae"])


def _get_zeta():
    from ..engine.zeta import _zeta_engine
    return _zeta_engine


async def _require_ws(request: Request) -> str:
    """Resolve user_id after admin gate (Task #110: admin-only writes).

    The function name is preserved for backwards compatibility, but the
    actual policy is admin-only. Resolution config is global and so any
    write to it requires the admin role.
    """
    await require_admin(request)
    uid = request.headers.get("x-user-id", "").strip()
    return uid or "admin"


async def _persist_resolution(config: dict) -> None:
    from ..storage import storage
    await storage.upsert_system_toggle("zfae:resolution", True, config)


# ------------------------------------------------------------------
# Read endpoints (no tier check — InternalAuthMiddleware handles access)
# ------------------------------------------------------------------

@router.get("/echo")
async def zfae_echo():
    zeta = _get_zeta()
    return {
        "agent": zeta.AGENT_NAME,
        "eval_count": zeta.eval_count,
        "echo_history": list(zeta.echo_buffer),
    }


@router.get("/state")
async def zfae_state():
    return _get_zeta().state()


@router.get("/review-history")
async def review_history():
    from ..storage import storage
    events = await storage.get_events_by_type("conversation_review", limit=10)
    results = []
    for ev in events:
        payload = ev.get("payload") or {}
        results.append({
            "ts": payload.get("ts"),
            "messages_reviewed": payload.get("messages_reviewed", 0),
            "seeds_written": payload.get("seeds_written", []),
            "provider": payload.get("provider", ""),
            "conclusions": payload.get("conclusions", {}),
            "created_at": ev.get("created_at"),
        })
    return {"reviews": results, "count": len(results)}


@router.get("/resolution")
async def get_resolution():
    """Return the full resolution config (global level + per-directory overrides)."""
    return _get_zeta().resolution_config


# ------------------------------------------------------------------
# Write endpoints (ws tier required)
# ------------------------------------------------------------------

class SetGlobalResolutionBody(BaseModel):
    level: int


class SetDirectoryResolutionBody(BaseModel):
    path: str
    level: int


class RemoveDirectoryResolutionBody(BaseModel):
    path: str


@router.put("/resolution")
async def set_global_resolution(body: SetGlobalResolutionBody, request: Request):
    """Set the global (fallback) resolution level. Admin-only — global config."""
    await require_admin(request)
    await _require_ws(request)
    if not (1 <= body.level <= 5):
        raise HTTPException(status_code=400, detail="Level must be between 1 and 5")
    config = _get_zeta().set_global_resolution(body.level)
    await _persist_resolution(config)
    return config


@router.put("/resolution/directory")
async def set_directory_resolution(body: SetDirectoryResolutionBody, request: Request):
    """Set resolution for a specific directory path. Admin-only — global config."""
    await require_admin(request)
    await _require_ws(request)
    if not body.path.startswith("/"):
        raise HTTPException(status_code=400, detail="Path must be absolute (start with /)")
    if not (1 <= body.level <= 5):
        raise HTTPException(status_code=400, detail="Level must be between 1 and 5")
    if len(_get_zeta().resolution_config.get("directories", {})) >= 100:
        raise HTTPException(status_code=400, detail="Directory resolution limit reached (100 max)")
    config = _get_zeta().set_directory_resolution(body.path, body.level)
    await _persist_resolution(config)
    return config


@router.delete("/resolution/directory")
async def remove_directory_resolution(body: RemoveDirectoryResolutionBody, request: Request):
    """Remove a per-directory resolution override. Admin-only — global config."""
    await require_admin(request)
    await _require_ws(request)
    config = _get_zeta().remove_directory_resolution(body.path)
    await _persist_resolution(config)
    return config
# 113:37
