# 88:10
# DOC module: sigma
# DOC label: Σ Sigma Core
# DOC description: Filesystem substrate companion tensor core. Maps the workspace as a prime-node ring. Resolution 1-5 controls scan depth. Content-watch pins specific files and emits events on hash change.
# DOC tier: ws
# DOC endpoint: GET /api/v1/sigma/state | Get Sigma core state
# DOC endpoint: PATCH /api/v1/sigma/resolution | Set scan resolution (1-5)
# DOC endpoint: POST /api/v1/sigma/rescan | Trigger an immediate rescan
# DOC endpoint: POST /api/v1/sigma/content-watch | Add a file to the content-watch list
# DOC endpoint: DELETE /api/v1/sigma/content-watch | Remove a file from the content-watch list
# DOC endpoint: PATCH /api/v1/sigma/intervals | Update structural/content poll intervals

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from ._admin_gate import require_admin

router = APIRouter(prefix="/api/v1", tags=["sigma"])

UI_META = {
    "tab_id": "sigma",
    "label": "Σ Sigma",
    "icon": "Layers",
    "order": 12,
    "sections": [
        {
            "id": "state",
            "label": "Substrate State",
            "endpoint": "/api/v1/sigma/state",
            "fields": [
                {"key": "resolution", "type": "text", "label": "Resolution"},
                {"key": "n", "type": "text", "label": "Ring Size (N)"},
                {"key": "entry_count", "type": "text", "label": "FS Entries"},
                {"key": "ring_coherence", "type": "gauge", "label": "Coherence"},
                {"key": "tensor_mean", "type": "gauge", "label": "Tensor Mean"},
                {"key": "last_scan_iso", "type": "text", "label": "Last Scan"},
                {"key": "structural_interval", "type": "text", "label": "Structural Interval (s)"},
                {"key": "content_interval", "type": "text", "label": "Content Interval (s)"},
            ],
        },
        {
            "id": "watches",
            "label": "Content Watches",
            "endpoint": "/api/v1/sigma/state",
            "fields": [
                {"key": "content_watches", "type": "list", "label": "Watched Files"},
            ],
        },
    ],
}


def _sigma():
    from ..engine.sigma import get_sigma
    return get_sigma()


class ResolutionRequest(BaseModel):
    resolution: int


class WatchRequest(BaseModel):
    path: str


class IntervalsRequest(BaseModel):
    structural_interval: float | None = None
    content_interval: float | None = None


@router.get("/sigma/state")
async def sigma_state():
    return _sigma().state()


@router.patch("/sigma/resolution")
async def sigma_resolution(req: ResolutionRequest, request: Request):
    await require_admin(request)
    if req.resolution < 1 or req.resolution > 5:
        raise HTTPException(status_code=400, detail="resolution must be 1–5")
    _sigma().set_resolution(req.resolution)
    return _sigma().state()


@router.post("/sigma/rescan")
async def sigma_rescan(request: Request):
    await require_admin(request)
    _sigma().rescan()
    return _sigma().state()


@router.post("/sigma/content-watch")
async def sigma_add_watch(req: WatchRequest, request: Request):
    await require_admin(request)
    if not req.path.strip():
        raise HTTPException(status_code=400, detail="path is required")
    _sigma().add_content_watch(req.path.strip())
    return {"ok": True, "watches": _sigma().list_content_watches()}


@router.delete("/sigma/content-watch")
async def sigma_remove_watch(req: WatchRequest, request: Request):
    await require_admin(request)
    if not req.path.strip():
        raise HTTPException(status_code=400, detail="path is required")
    _sigma().remove_content_watch(req.path.strip())
    return {"ok": True, "watches": _sigma().list_content_watches()}


@router.patch("/sigma/intervals")
async def sigma_intervals(req: IntervalsRequest, request: Request):
    await require_admin(request)
    sig = _sigma()
    if req.structural_interval is not None:
        if req.structural_interval < 1:
            raise HTTPException(status_code=400, detail="structural_interval must be >= 1")
        sig.structural_interval = req.structural_interval
    if req.content_interval is not None:
        if req.content_interval < 1:
            raise HTTPException(status_code=400, detail="content_interval must be >= 1")
        sig.content_interval = req.content_interval
    sig.save_checkpoint()
    return {"ok": True, "structural_interval": sig.structural_interval, "content_interval": sig.content_interval}
# 88:10
