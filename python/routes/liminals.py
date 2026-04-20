# 101:9
from fastapi import APIRouter, HTTPException, Request

from ..storage import storage

# DOC module: liminals
# DOC label: Liminals
# DOC description: Aggregated view of in-between system states — running sub-agents, unpromoted discovery drafts, archived conversations, and inactive ws modules. Read-only convenience surface; each item links back to its native tab.
# DOC tier: free
# DOC endpoint: GET /api/v1/liminals | Aggregated liminal items grouped by category

UI_META = {
    "tab_id": "liminals",
    "label": "Liminals",
    "icon": "Hourglass",
    "order": 8,
}

router = APIRouter(prefix="/api/v1", tags=["liminals"])


def _require_uid(request: Request) -> str:
    uid = request.headers.get("x-user-id", "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


@router.get("/liminals")
async def get_liminals(request: Request):
    uid = _require_uid(request)

    # 1) Pending sub-agents (conversations with subagent_status='running')
    try:
        all_convs = await storage.list_conversations(uid)
    except Exception:
        all_convs = []
    pending_subagents = [
        {
            "id": c.get("id"),
            "title": c.get("title") or f"Conversation {c.get('id')}",
            "parent_conv_id": c.get("parent_conv_id"),
            "started_at": c.get("created_at") or c.get("updated_at"),
        }
        for c in all_convs
        if (c.get("subagent_status") or "").lower() == "running"
    ]

    # 2) Archived conversations (most recent 25)
    archived = [
        {
            "id": c.get("id"),
            "title": c.get("title") or f"Conversation {c.get('id')}",
            "updated_at": c.get("updated_at"),
        }
        for c in all_convs
        if c.get("archived")
    ][:25]

    # 3) Unpromoted discovery drafts
    try:
        drafts_raw = await storage.get_discovery_drafts(limit=50)
    except Exception:
        drafts_raw = []
    drafts = [
        {
            "id": d.get("id"),
            "summary": d.get("summary") or d.get("content") or "(no summary)",
            "created_at": d.get("created_at"),
        }
        for d in drafts_raw
        if not d.get("promoted_to_conversation")
    ]

    # 4) Inactive / errored ws_modules
    try:
        ws_mods = await storage.list_ws_modules()
    except Exception:
        ws_mods = []
    inactive_modules = [
        {
            "id": m.get("id"),
            "name": m.get("name") or m.get("module_id") or f"Module {m.get('id')}",
            "status": m.get("status"),
            "updated_at": m.get("updated_at"),
        }
        for m in ws_mods
        if (m.get("status") or "").lower() in ("inactive", "error", "errored", "disabled")
    ]

    categories = [
        {
            "id": "pending_subagents",
            "label": "Running sub-agents",
            "description": "Sub-agent conversations whose work has not yet completed.",
            "items": pending_subagents,
            "count": len(pending_subagents),
        },
        {
            "id": "discovery_drafts",
            "label": "Unpromoted drafts",
            "description": "Discovery drafts that have not been promoted to a real conversation.",
            "items": drafts,
            "count": len(drafts),
        },
        {
            "id": "archived_conversations",
            "label": "Archived conversations",
            "description": "Conversations you have archived but not deleted.",
            "items": archived,
            "count": len(archived),
        },
        {
            "id": "inactive_ws_modules",
            "label": "Inactive ws modules",
            "description": "Authored ws modules that are not currently mounted into the live router.",
            "items": inactive_modules,
            "count": len(inactive_modules),
        },
    ]

    return {
        "categories": categories,
        "total": sum(c["count"] for c in categories),
    }
# 101:9
