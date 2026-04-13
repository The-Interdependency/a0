# 82:9
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..storage import storage

# DOC module: heartbeat
# DOC label: Heartbeat
# DOC description: Scheduled task runner and activity log. Heartbeat tasks fire on configurable intervals and their execution history is stored in the log.
# DOC tier: free
# DOC endpoint: GET /api/v1/heartbeat/tasks | List all scheduled tasks
# DOC endpoint: POST /api/v1/heartbeat/tasks | Create a new scheduled task
# DOC endpoint: PATCH /api/v1/heartbeat/tasks/{id} | Update a task schedule or payload
# DOC endpoint: DELETE /api/v1/heartbeat/tasks/{id} | Remove a scheduled task
# DOC endpoint: GET /api/v1/heartbeat/logs | List recent heartbeat execution logs

UI_META = {
    "tab_id": "heartbeat",
    "label": "Heartbeat",
    "icon": "HeartPulse",
    "order": 8,
    "sections": [
        {
            "id": "tasks",
            "label": "Scheduled Tasks",
            "endpoint": "/api/v1/heartbeat/tasks",
            "fields": [
                {"key": "name", "type": "text", "label": "Name"},
                {"key": "task_type", "type": "badge", "label": "Type"},
                {"key": "enabled", "type": "badge", "label": "Enabled"},
                {"key": "interval_seconds", "type": "text", "label": "Interval (s)"},
                {"key": "run_count", "type": "text", "label": "Runs"},
                {"key": "last_run", "type": "text", "label": "Last Run"},
                {"key": "last_result", "type": "text", "label": "Last Result"},
            ],
        },
        {
            "id": "logs",
            "label": "Heartbeat Logs",
            "endpoint": "/api/v1/heartbeat/logs",
            "fields": [
                {"key": "status", "type": "badge", "label": "Status"},
                {"key": "hash_chain_valid", "type": "badge", "label": "Hash Chain"},
                {"key": "details", "type": "json", "label": "Details"},
                {"key": "created_at", "type": "text", "label": "Time"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/heartbeat/tasks"},
        {"method": "POST", "path": "/api/v1/heartbeat/tasks"},
        {"method": "PATCH", "path": "/api/v1/heartbeat/tasks/{id}"},
        {"method": "DELETE", "path": "/api/v1/heartbeat/tasks/{id}"},
        {"method": "GET", "path": "/api/v1/heartbeat/logs"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["heartbeat"])


class CreateTask(BaseModel):
    name: str
    description: Optional[str] = None
    task_type: str
    enabled: bool = True
    weight: float = 1.0
    interval_seconds: int = 300
    handler_code: Optional[str] = None
    one_shot: bool = False


class UpdateTask(BaseModel):
    description: Optional[str] = None
    enabled: Optional[bool] = None
    weight: Optional[float] = None
    interval_seconds: Optional[int] = None
    handler_code: Optional[str] = None


@router.get("/heartbeat/tasks")
async def list_tasks():
    return await storage.get_heartbeat_tasks()


@router.post("/heartbeat/tasks")
async def create_task(body: CreateTask):
    return await storage.upsert_heartbeat_task(body.model_dump())


@router.patch("/heartbeat/tasks/{task_id}")
async def update_task(task_id: int, body: UpdateTask):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="no updates")
    await storage.update_heartbeat_task(task_id, updates)
    return {"ok": True}


@router.delete("/heartbeat/tasks/{task_id}")
async def delete_task(task_id: int):
    await storage.delete_heartbeat_task(task_id)
    return {"ok": True}


@router.get("/heartbeat/logs")
async def list_logs(limit: int = 24):
    return await storage.get_heartbeats(limit)
# 82:9
