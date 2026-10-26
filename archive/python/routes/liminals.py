# 60:8 1:1 1:1
from fastapi import APIRouter, HTTPException, Request

from ..storage import storage

# DOC module: liminals
# DOC label: Liminals
# DOC description: Aggregated view of in-between system states — running sub-agents and archived conversations. Read-only convenience surface; each item links back to its native tab.
# DOC tier: free
# DOC role: route
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

    categories = [
        {
            "id": "pending_subagents",
            "label": "Running sub-agents",
            "description": "Sub-agent conversations whose work has not yet completed.",
            "items": pending_subagents,
            "count": len(pending_subagents),
        },
        {
            "id": "archived_conversations",
            "label": "Archived conversations",
            "description": "Conversations you have archived but not deleted.",
            "items": archived,
            "count": len(archived),
        },
    ]

    return {
        "categories": categories,
        "total": sum(c["count"] for c in categories),
    }
# 60:8 1:1 1:1
