from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any

from ..storage import storage

UI_META = {
    "tab_id": "memory",
    "label": "Memory",
    "icon": "Brain",
    "order": 3,
    "sections": [
        {
            "id": "seeds",
            "label": "Memory Seeds",
            "endpoint": "/api/v1/memory/seeds",
            "fields": [
                {"key": "seed_index", "type": "text", "label": "Index"},
                {"key": "label", "type": "text", "label": "Label"},
                {"key": "summary", "type": "text", "label": "Summary"},
                {"key": "weight", "type": "gauge", "label": "Weight"},
                {"key": "enabled", "type": "badge", "label": "Enabled"},
                {"key": "pinned", "type": "badge", "label": "Pinned"},
                {"key": "last_sentinel_status", "type": "badge", "label": "Sentinel"},
            ],
        },
        {
            "id": "projection",
            "label": "Memory Projection",
            "endpoint": "/api/v1/memory/projection",
            "fields": [
                {"key": "projection_in", "type": "json", "label": "Projection In"},
                {"key": "projection_out", "type": "json", "label": "Projection Out"},
                {"key": "request_count", "type": "text", "label": "Requests"},
            ],
        },
        {
            "id": "snapshots",
            "label": "Tensor Snapshots",
            "endpoint": "/api/v1/memory/snapshots",
            "fields": [
                {"key": "seeds_state", "type": "json", "label": "Seeds State"},
                {"key": "request_count", "type": "text", "label": "Requests"},
                {"key": "created_at", "type": "text", "label": "Created"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/memory/seeds"},
        {"method": "GET", "path": "/api/v1/memory/seeds/{index}"},
        {"method": "PUT", "path": "/api/v1/memory/seeds/{index}"},
        {"method": "GET", "path": "/api/v1/memory/projection"},
        {"method": "GET", "path": "/api/v1/memory/snapshots"},
        {"method": "POST", "path": "/api/v1/memory/snapshots"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["memory"])


class UpsertSeed(BaseModel):
    label: str
    summary: str = ""
    original_summary: str = ""
    pinned: bool = False
    enabled: bool = True
    weight: float = 1.0
    ptca_values: Optional[Any] = None
    pcna_weights: Optional[Any] = None


@router.get("/memory/seeds")
async def list_seeds():
    return await storage.get_memory_seeds()


@router.get("/memory/seeds/{seed_index}")
async def get_seed(seed_index: int):
    seed = await storage.get_memory_seed(seed_index)
    if not seed:
        raise HTTPException(status_code=404, detail="seed not found")
    return seed


@router.put("/memory/seeds/{seed_index}")
async def upsert_seed(seed_index: int, body: UpsertSeed):
    data = body.model_dump()
    data["seed_index"] = seed_index
    return await storage.upsert_memory_seed(data)


@router.get("/memory/projection")
async def get_projection():
    proj = await storage.get_memory_projection()
    return proj or {"projection_in": None, "projection_out": None, "request_count": 0}


@router.get("/memory/snapshots")
async def list_snapshots(limit: int = 20):
    return await storage.get_memory_tensor_snapshots(limit)


@router.post("/memory/snapshots")
async def create_snapshot():
    seeds = await storage.get_memory_seeds()
    proj = await storage.get_memory_projection()
    snap = {
        "seeds_state": seeds,
        "projection_in": proj.get("projection_in") if proj else None,
        "projection_out": proj.get("projection_out") if proj else None,
        "request_count": proj.get("request_count", 0) if proj else 0,
    }
    return await storage.add_memory_tensor_snapshot(snap)
