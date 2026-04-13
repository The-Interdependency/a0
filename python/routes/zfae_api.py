# 70:13
"""
ZFAE API — Zeta Function Alpha Echo routes.

GET /api/v1/zfae/echo          — rolling 50-event echo buffer
GET /api/v1/zfae/state         — ZetaEngine state
GET /api/v1/zfae/review-history — last 10 conversation review runs
"""

from fastapi import APIRouter

# DOC module: zfae
# DOC label: ZFAE
# DOC description: Zeta Function Alpha Echo subsystem. Maintains a rolling event echo buffer and exposes the ZetaEngine state and review history for ws-tier introspection.
# DOC tier: ws
# DOC endpoint: GET /api/v1/zfae/echo | Get the rolling 50-event echo buffer
# DOC endpoint: GET /api/v1/zfae/state | Get current ZetaEngine state
# DOC endpoint: GET /api/v1/zfae/review-history | Get recent review history entries

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

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/zfae/echo"},
        {"method": "GET", "path": "/api/v1/zfae/state"},
        {"method": "GET", "path": "/api/v1/zfae/review-history"},
    ],
}

router = APIRouter(prefix="/api/v1/zfae", tags=["zfae"])


def _get_zeta():
    from ..engine.zeta import _zeta_engine
    return _zeta_engine


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
# 70:13
