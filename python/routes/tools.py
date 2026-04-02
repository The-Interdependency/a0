from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from ..storage import storage

UI_META = {
    "tab_id": "tools",
    "label": "Tools",
    "icon": "Wrench",
    "order": 7,
    "sections": [
        {
            "id": "custom_tools",
            "label": "Custom Tools",
            "endpoint": "/api/v1/tools",
            "fields": [
                {"key": "name", "type": "text", "label": "Name"},
                {"key": "description", "type": "text", "label": "Description"},
                {"key": "handler_type", "type": "badge", "label": "Handler"},
                {"key": "enabled", "type": "badge", "label": "Enabled"},
                {"key": "is_generated", "type": "badge", "label": "Generated"},
                {"key": "created_at", "type": "text", "label": "Created"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/tools"},
        {"method": "POST", "path": "/api/v1/tools"},
        {"method": "GET", "path": "/api/v1/tools/{id}"},
        {"method": "PATCH", "path": "/api/v1/tools/{id}"},
        {"method": "DELETE", "path": "/api/v1/tools/{id}"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["tools"])


class CreateTool(BaseModel):
    user_id: str = "default"
    name: str
    description: str
    handler_type: str
    handler_code: str
    parameters_schema: Optional[Any] = None
    target_models: Optional[list[str]] = None
    enabled: bool = True
    is_generated: bool = False


class UpdateTool(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    handler_type: Optional[str] = None
    handler_code: Optional[str] = None
    parameters_schema: Optional[Any] = None
    target_models: Optional[list[str]] = None
    enabled: Optional[bool] = None


@router.get("/tools")
async def list_tools(user_id: Optional[str] = None):
    return await storage.get_custom_tools(user_id)


@router.post("/tools")
async def create_tool(body: CreateTool):
    return await storage.create_custom_tool(body.model_dump())


@router.get("/tools/{tool_id}")
async def get_tool(tool_id: int):
    tool = await storage.get_custom_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="tool not found")
    return tool


@router.patch("/tools/{tool_id}")
async def update_tool(tool_id: int, body: UpdateTool):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates")
    await storage.update_custom_tool(tool_id, updates)
    return {"ok": True}


@router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: int):
    await storage.delete_custom_tool(tool_id)
    return {"ok": True}
