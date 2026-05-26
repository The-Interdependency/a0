# 62:7 0:2 1:2
from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

from ..logger import append_openai_hmmm, read_openai_hmmm
from ._admin_gate import require_admin

# DOC module: openai
# DOC label: OpenAI
# DOC description: OpenAI integration log and observation buffer. Stores and retrieves open questions (hmmm entries) captured during agent interactions with OpenAI models.
# DOC tier: ws
# DOC role: api
# DOC endpoint: GET /api/v1/openai/hmmm | Retrieve the rolling open-question buffer
# DOC endpoint: POST /api/v1/openai/hmmm | Append a new open-question entry

UI_META = {
    "tab_id": "openai",
    "label": "OpenAI",
    "icon": "BrainCircuit",
    "order": 12,
    "sections": [
        {
            "id": "hmmm",
            "label": "Open Questions (hmmm)",
            "endpoint": "/api/v1/openai/hmmm",
            "fields": [
                {"key": "data.id", "type": "text", "label": "ID"},
                {"key": "data.status", "type": "badge", "label": "Status"},
                {"key": "data.unresolved_constraint", "type": "text", "label": "Unresolved Constraint"},
                {"key": "data.honest_incompletion", "type": "text", "label": "Honest Incompletion"},
                {"key": "data.continuation_marker", "type": "text", "label": "Continuation Marker"},
                {"key": "data.owner", "type": "text", "label": "Owner"},
                {"key": "timestamp", "type": "text", "label": "Logged"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/openai/hmmm"},
        {"method": "POST", "path": "/api/v1/openai/hmmm"},
    ],
}

router = APIRouter(prefix="/api/v1/openai", tags=["openai"])


class HmmmItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Optional[str] = None
    status: str = "open"
    unresolved_constraint: str = Field(..., min_length=1)
    honest_incompletion: str = Field(..., min_length=1)
    continuation_marker: str = Field(..., min_length=1)
    owner: Optional[str] = None


@router.get("/hmmm")
async def list_hmmm():
    items = await read_openai_hmmm()
    return {"items": items, "count": len(items)}


@router.post("/hmmm")
async def add_hmmm(request: Request, body: HmmmItem):
    await require_admin(request)
    import uuid
    from datetime import datetime
    item = {
        "id": body.id or f"hmmm-{uuid.uuid4().hex[:8]}",
        "status": body.status,
        "unresolved_constraint": body.unresolved_constraint,
        "honest_incompletion": body.honest_incompletion,
        "continuation_marker": body.continuation_marker,
        "owner": body.owner or "user",
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    await append_openai_hmmm(item)
    return {"ok": True, "item": item}
# 62:7 0:2 1:2
