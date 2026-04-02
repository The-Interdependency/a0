from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from ..storage import storage

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
                {"key": "drafts", "type": "text", "label": "Drafts"},
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
        {
            "id": "discovery",
            "label": "Discovery Drafts",
            "endpoint": "/api/v1/system/discovery",
            "fields": [
                {"key": "title", "type": "text", "label": "Title"},
                {"key": "relevance_score", "type": "gauge", "label": "Relevance"},
                {"key": "promoted_to_conversation", "type": "badge", "label": "Promoted"},
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
        {"method": "GET", "path": "/api/v1/system/discovery"},
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
async def upsert_toggle(subsystem: str, body: ToggleInput):
    return await storage.upsert_system_toggle(subsystem, body.enabled, body.parameters)


@router.delete("/system/toggles/{subsystem}")
async def delete_toggle(subsystem: str):
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
async def create_deal(body: DealInput):
    data = body.model_dump(exclude_none=True)
    return await storage.create_deal(data)


@router.get("/system/deals/{deal_id}")
async def get_deal(deal_id: int):
    deal = await storage.get_deal(deal_id)
    if not deal:
        raise HTTPException(status_code=404, detail="deal not found")
    return deal


@router.patch("/system/deals/{deal_id}")
async def update_deal(deal_id: int, body: DealUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates")
    return await storage.update_deal(deal_id, updates)


@router.get("/system/discovery")
async def list_discovery(limit: int = 50):
    return await storage.get_discovery_drafts(limit)


@router.post("/system/discovery")
async def create_draft(body: dict):
    return await storage.create_discovery_draft(body)


@router.post("/system/discovery/{draft_id}/promote")
async def promote_draft(draft_id: int, body: dict):
    conv_id = body.get("conversation_id")
    if not conv_id:
        raise HTTPException(status_code=400, detail="conversation_id required")
    await storage.promote_discovery_draft(draft_id, conv_id)
    return {"ok": True}
