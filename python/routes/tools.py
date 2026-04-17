# 87:9
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from typing import Optional, Any

from ..storage import storage

# DOC module: tools
# DOC label: Tools
# DOC description: Registry for custom agent tools. Tools define callable capabilities the agent can invoke during conversations, with typed parameters and descriptions.
# DOC tier: free
# DOC endpoint: GET /api/v1/tools | List all registered tools
# DOC endpoint: POST /api/v1/tools | Register a new tool
# DOC endpoint: GET /api/v1/tools/{id} | Get a specific tool
# DOC endpoint: PATCH /api/v1/tools/{id} | Update a tool definition
# DOC endpoint: DELETE /api/v1/tools/{id} | Remove a tool

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

# Whitelist of handler types that may be assigned to a custom tool via the API.
# `handler_code` from API callers is treated as descriptive metadata only — it is
# never executed. Real tool dispatch goes through the internal registry.
_ALLOWED_HANDLER_TYPES = {"internal"}


class CreateTool(BaseModel):
    # Reject any unknown field — most importantly `user_id`, which callers must
    # not be able to supply. Ownership is set from the authenticated session.
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    handler_type: str
    handler_code: Optional[str] = None
    parameters_schema: Optional[Any] = None
    target_models: Optional[list[str]] = None
    enabled: bool = True
    is_generated: bool = False


class UpdateTool(BaseModel):
    # Reject any unknown field, including `user_id`, so updates can never
    # silently reassign ownership.
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    description: Optional[str] = None
    handler_type: Optional[str] = None
    handler_code: Optional[str] = None
    parameters_schema: Optional[Any] = None
    target_models: Optional[list[str]] = None
    enabled: Optional[bool] = None


def _require_uid(request: Request) -> str:
    uid = request.headers.get("x-user-id", "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


def _is_admin(request: Request) -> bool:
    return (request.headers.get("x-user-role") or "").strip().lower() == "admin"


def _check_handler_type(handler_type: str) -> None:
    if handler_type not in _ALLOWED_HANDLER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"handler_type must be one of: {sorted(_ALLOWED_HANDLER_TYPES)}",
        )


async def _require_owner_or_admin(request: Request, tool: dict) -> None:
    uid = _require_uid(request)
    if _is_admin(request):
        return
    if tool.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Not allowed to modify this tool")


@router.get("/tools")
async def list_tools(user_id: Optional[str] = None):
    return await storage.get_custom_tools(user_id)


@router.post("/tools")
async def create_tool(body: CreateTool, request: Request):
    uid = _require_uid(request)
    _check_handler_type(body.handler_type)
    data = body.model_dump()
    # Owner is always the authenticated caller — never trust body-supplied user_id.
    data["user_id"] = uid
    # handler_code is metadata only; the tool dispatcher uses the internal registry.
    # Persist an empty string when omitted to satisfy the NOT NULL column.
    if data.get("handler_code") is None:
        data["handler_code"] = ""
    return await storage.create_custom_tool(data)


@router.get("/tools/{tool_id}")
async def get_tool(tool_id: int):
    tool = await storage.get_custom_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="tool not found")
    return tool


@router.patch("/tools/{tool_id}")
async def update_tool(tool_id: int, body: UpdateTool, request: Request):
    tool = await storage.get_custom_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="tool not found")
    await _require_owner_or_admin(request, tool)
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates")
    if "handler_type" in updates:
        _check_handler_type(updates["handler_type"])
    # Never let an update reassign ownership via the API.
    updates.pop("user_id", None)
    await storage.update_custom_tool(tool_id, updates)
    return {"ok": True}


@router.delete("/tools/{tool_id}")
async def delete_tool(tool_id: int, request: Request):
    tool = await storage.get_custom_tool(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="tool not found")
    await _require_owner_or_admin(request, tool)
    await storage.delete_custom_tool(tool_id)
    return {"ok": True}


from ..services.editable_registry import editable_registry, EditableField
editable_registry.register(EditableField(
    key="tool_enabled",
    label="Tool Enabled",
    description="Enable or disable a registered agent tool. Disabled tools are not offered to the LLM.",
    control_type="toggle",
    module="tools",
    get_endpoint="/api/v1/tools",
    patch_endpoint="/api/v1/tools/{id}",
    query_key="/api/v1/tools",
))
# 87:9
