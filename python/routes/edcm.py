# 81:8
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Any

from ..storage import storage

# DOC module: edcm
# DOC label: EDCM
# DOC description: Emotional-Dimensional Calibration Module. Tracks affective metrics and stores periodic snapshots of the agent's internal state dimensions.
# DOC tier: free
# DOC endpoint: GET /api/v1/edcm/metrics | Get current EDCM metric values
# DOC endpoint: POST /api/v1/edcm/metrics | Update EDCM metrics
# DOC endpoint: GET /api/v1/edcm/snapshots | List historical EDCM snapshots
# DOC endpoint: POST /api/v1/edcm/snapshots | Record a new EDCM snapshot

UI_META = {
    "tab_id": "edcm",
    "label": "EDCM",
    "icon": "Activity",
    "order": 4,
    "sections": [
        {
            "id": "metrics",
            "label": "EDCM Metrics",
            "endpoint": "/api/v1/edcm/metrics",
            "fields": [
                {"key": "source", "type": "text", "label": "Source"},
                {"key": "cm", "type": "gauge", "label": "CM"},
                {"key": "da", "type": "gauge", "label": "DA"},
                {"key": "drift", "type": "gauge", "label": "Drift"},
                {"key": "dvg", "type": "gauge", "label": "DVG"},
                {"key": "int_val", "type": "gauge", "label": "INT"},
                {"key": "tbf", "type": "gauge", "label": "TBF"},
                {"key": "created_at", "type": "text", "label": "Time"},
            ],
        },
        {
            "id": "snapshots",
            "label": "EDCM Snapshots",
            "endpoint": "/api/v1/edcm/snapshots",
            "fields": [
                {"key": "decision", "type": "text", "label": "Decision"},
                {"key": "delta_bone", "type": "gauge", "label": "ΔBone"},
                {"key": "delta_align_grok", "type": "gauge", "label": "ΔGrok"},
                {"key": "delta_align_gemini", "type": "gauge", "label": "ΔGemini"},
                {"key": "created_at", "type": "text", "label": "Time"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/edcm/metrics"},
        {"method": "POST", "path": "/api/v1/edcm/metrics"},
        {"method": "GET", "path": "/api/v1/edcm/snapshots"},
        {"method": "POST", "path": "/api/v1/edcm/snapshots"},
    ],
}

router = APIRouter(prefix="/api/v1", tags=["edcm"])


class EdcmMetricInput(BaseModel):
    source: str
    cm: float = 0
    da: float = 0
    drift: float = 0
    dvg: float = 0
    int_val: float = 0
    tbf: float = 0
    conversation_id: Optional[int] = None
    directives_fired: Optional[list[str]] = None
    context_snippet: Optional[str] = None


class EdcmSnapshotInput(BaseModel):
    task_id: Optional[str] = None
    operator_grok: Optional[Any] = None
    operator_gemini: Optional[Any] = None
    operator_user: Optional[Any] = None
    delta_bone: Optional[float] = None
    delta_align_grok: Optional[float] = None
    delta_align_gemini: Optional[float] = None
    decision: Optional[str] = None
    ptca_state: Optional[Any] = None


@router.get("/edcm/metrics")
async def list_metrics(limit: int = 50):
    return await storage.get_edcm_metric_snapshots(limit)


@router.post("/edcm/metrics")
async def add_metric(body: EdcmMetricInput):
    return await storage.add_edcm_metric_snapshot(body.model_dump())


@router.get("/edcm/snapshots")
async def list_snapshots(limit: int = 50):
    return await storage.get_edcm_snapshots(limit)


@router.post("/edcm/snapshots")
async def add_snapshot(body: EdcmSnapshotInput):
    return await storage.add_edcm_snapshot(body.model_dump(exclude_none=True))
# 81:8
