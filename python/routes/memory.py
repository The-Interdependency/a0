import math
import random
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Any, List

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
        {"method": "PATCH", "path": "/api/v1/memory/seeds/{index}"},
        {"method": "POST", "path": "/api/v1/memory/seeds/{index}/clear"},
        {"method": "POST", "path": "/api/v1/memory/seeds/{index}/import"},
        {"method": "GET", "path": "/api/v1/memory/projection"},
        {"method": "GET", "path": "/api/v1/memory/snapshots"},
        {"method": "POST", "path": "/api/v1/memory/snapshots"},
        {"method": "GET", "path": "/api/v1/memory/state"},
        {"method": "GET", "path": "/api/v1/memory/drift"},
        {"method": "GET", "path": "/api/v1/memory/history"},
        {"method": "GET", "path": "/api/v1/memory/export"},
        {"method": "POST", "path": "/api/v1/memory/import"},
        {"method": "GET", "path": "/api/v1/subcore/state"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["memory"])

S17_PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59]
S17_DEPTH = 7
DRIFT_THRESHOLD = 0.4


def _seed_to_camel(seed: dict) -> dict:
    ptca = seed.get("ptca_values") or []
    if not isinstance(ptca, list):
        ptca = []
    return {
        "seedIndex": seed.get("seed_index", 0),
        "label": seed.get("label", ""),
        "summary": seed.get("summary", ""),
        "pinned": bool(seed.get("pinned", False)),
        "enabled": bool(seed.get("enabled", True)),
        "weight": float(seed.get("weight", 1.0)),
        "ptcaValues": [float(v) for v in ptca] if ptca else [],
        "sentinelPassCount": seed.get("sentinel_pass_count", 0) or 0,
        "sentinelFailCount": seed.get("sentinel_fail_count", 0) or 0,
        "lastSentinelStatus": seed.get("last_sentinel_status"),
    }


def _compute_drift_score(seed: dict) -> float:
    summary = seed.get("summary") or ""
    original = seed.get("original_summary") or ""
    weight = float(seed.get("weight", 1.0))
    weight_drift = abs(weight - 1.0) / 2.0
    if not original and not summary:
        return weight_drift
    if not original and summary:
        return min(0.5 + weight_drift, 1.0)
    shared = set(summary.lower().split()) & set(original.lower().split())
    total = len(set(original.lower().split())) or 1
    text_drift = 1.0 - (len(shared) / total)
    return min((text_drift * 0.7 + weight_drift * 0.3), 1.0)


def _build_s17_visual_pattern(seeds: list) -> list:
    pattern = []
    for i in range(17):
        seed = next((s for s in seeds if s.get("seed_index") == i), None)
        if seed:
            weight = float(seed.get("weight", 1.0))
            enabled = bool(seed.get("enabled", True))
            ptca = seed.get("ptca_values") or []
            base = [float(v) for v in ptca[:S17_DEPTH]] if ptca else []
            while len(base) < S17_DEPTH:
                base.append(weight * 0.1 if enabled else 0.0)
        else:
            base = [0.0] * S17_DEPTH
        pattern.extend(base)
    return pattern


def _build_s17_auditory_deltas(seeds: list) -> list:
    deltas = []
    for i in range(17):
        seed = next((s for s in seeds if s.get("seed_index") == i), None)
        drift = _compute_drift_score(seed) if seed else 0.0
        row = [drift * (0.5 + 0.5 * math.sin(i + j)) for j in range(S17_DEPTH)]
        deltas.append(row)
    return deltas


class UpsertSeed(BaseModel):
    label: str
    summary: str = ""
    original_summary: str = ""
    pinned: bool = False
    enabled: bool = True
    weight: float = 1.0
    ptca_values: Optional[Any] = None
    pcna_weights: Optional[Any] = None


class PatchSeed(BaseModel):
    label: Optional[str] = None
    summary: Optional[str] = None
    pinned: Optional[bool] = None
    enabled: Optional[bool] = None
    weight: Optional[float] = None
    ptca_values: Optional[Any] = None
    pcna_weights: Optional[Any] = None


class ImportSeedText(BaseModel):
    text: str


class ImportMemory(BaseModel):
    seeds: List[Any]
    projection: Optional[Any] = None


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


@router.patch("/memory/seeds/{seed_index}")
async def patch_seed(seed_index: int, body: PatchSeed):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await storage.update_memory_seed(seed_index, updates)
    seed = await storage.get_memory_seed(seed_index)
    if not seed:
        raise HTTPException(status_code=404, detail="seed not found")
    return seed


@router.post("/memory/seeds/{seed_index}/clear")
async def clear_seed(seed_index: int):
    seed = await storage.get_memory_seed(seed_index)
    if not seed:
        raise HTTPException(status_code=404, detail="seed not found")
    await storage.update_memory_seed(seed_index, {
        "summary": "",
        "ptca_values": None,
        "pcna_weights": None,
        "sentinel_pass_count": 0,
        "sentinel_fail_count": 0,
        "last_sentinel_status": None,
        "weight": 1.0,
    })
    return {"ok": True, "seed_index": seed_index}


@router.post("/memory/seeds/{seed_index}/import")
async def import_seed_text(seed_index: int, body: ImportSeedText):
    seed = await storage.get_memory_seed(seed_index)
    if not seed:
        raise HTTPException(status_code=404, detail="seed not found")
    text = body.text.strip()[:2000]
    original = seed.get("original_summary") or text
    await storage.update_memory_seed(seed_index, {
        "summary": text,
        "original_summary": original,
        "last_sentinel_status": "imported",
    })
    return {"ok": True, "seed_index": seed_index}


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


@router.get("/memory/state")
async def get_memory_state():
    seeds = await storage.get_memory_seeds()
    proj = await storage.get_memory_projection()
    return {
        "seeds": [_seed_to_camel(s) for s in seeds],
        "projectionIn": proj.get("projection_in") if proj else None,
        "projectionOut": proj.get("projection_out") if proj else None,
        "requestCount": proj.get("request_count", 0) if proj else 0,
    }


@router.get("/memory/drift")
async def get_memory_drift():
    seeds = await storage.get_memory_seeds()
    results = []
    for seed in seeds:
        score = _compute_drift_score(seed)
        results.append({
            "seedIndex": seed.get("seed_index"),
            "label": seed.get("label", ""),
            "driftScore": round(score, 4),
        })
    return results


@router.get("/memory/history")
async def get_memory_history(limit: int = 20):
    snaps = await storage.get_memory_tensor_snapshots(limit)
    return [
        {
            "id": s.get("id"),
            "requestCount": s.get("request_count", 0),
            "createdAt": str(s.get("created_at", "")),
        }
        for s in snaps
    ]


@router.get("/memory/export")
async def export_memory():
    seeds = await storage.get_memory_seeds()
    proj = await storage.get_memory_projection()
    return {
        "version": "1.0",
        "seeds": seeds,
        "projection": proj,
    }


@router.post("/memory/import")
async def import_memory(body: ImportMemory):
    imported = 0
    for seed_data in body.seeds:
        idx = seed_data.get("seed_index")
        if idx is None:
            continue
        await storage.upsert_memory_seed({**seed_data, "seed_index": idx})
        imported += 1
    if body.projection:
        await storage.upsert_memory_projection(body.projection)
    return {"ok": True, "imported": imported}


@router.get("/subcore/state")
async def get_subcore_state():
    seeds = await storage.get_memory_seeds()
    proj = await storage.get_memory_projection()
    request_count = proj.get("request_count", 0) if proj else 0

    enabled_seeds = [s for s in seeds if s.get("enabled")]
    nonempty_seeds = [s for s in enabled_seeds if s.get("summary")]
    visual_coherence = len(nonempty_seeds) / 17 if seeds else 0.0

    total_checks = sum((s.get("sentinel_pass_count", 0) or 0) + (s.get("sentinel_fail_count", 0) or 0) for s in seeds)
    total_passes = sum(s.get("sentinel_pass_count", 0) or 0 for s in seeds)
    auditory_coherence = (total_passes / total_checks) if total_checks > 0 else 0.85

    pattern = _build_s17_visual_pattern(seeds)
    deltas = _build_s17_auditory_deltas(seeds)

    anomalies = []
    for seed in seeds:
        score = _compute_drift_score(seed)
        if score > DRIFT_THRESHOLD:
            anomalies.append({"seedIndex": seed.get("seed_index"), "driftScore": round(score, 4)})

    return {
        "heartbeat": request_count,
        "visual": {
            "coherence": round(visual_coherence, 4),
            "pattern": pattern,
        },
        "auditory": {
            "coherence": round(auditory_coherence, 4),
            "deltas": deltas,
            "anomalies": anomalies,
        },
    }
