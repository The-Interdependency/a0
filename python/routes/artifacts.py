# 104:16
"""HTTP API for the unified artifacts archive."""
from typing import Any, Optional
import datetime as _dt

from fastapi import APIRouter, HTTPException, Request, Query
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel, ConfigDict

from ..services import artifacts as _A

# DOC module: artifacts
# DOC label: Archive
# DOC description: Unified archive of every file a0 produces (images, reports, evidence). Backed by Replit Object Storage with sha256 dedupe and full provenance.
# DOC tier: free
# DOC endpoint: GET /api/v1/artifacts | List artifacts with filters (kind, tool, since)
# DOC endpoint: GET /api/v1/artifacts/{id} | Fetch a single artifact + provenance
# DOC endpoint: GET /api/v1/artifacts/{id}/download | Stream the artifact bytes
# DOC endpoint: PATCH /api/v1/artifacts/{id} | Admin-only: flip the public flag
# DOC endpoint: GET /api/v1/artifacts/_meta/tools | Distinct tool_name values for filter UI

UI_META = {
    "tab_id": "artifacts",
    "label": "Archive",
    "icon": "Archive",
    "order": 12,
    "sections": [],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/artifacts"},
        {"method": "GET", "path": "/api/v1/artifacts/{id}"},
        {"method": "GET", "path": "/api/v1/artifacts/{id}/download"},
        {"method": "PATCH", "path": "/api/v1/artifacts/{id}"},
    ],
}

router = APIRouter(prefix="/api/v1/artifacts", tags=["artifacts"])

_RANGE_MAP = {"24h": 1, "7d": 7, "30d": 30}


def _is_admin(req: Request) -> bool:
    return (req.headers.get("x-user-role") or "").strip().lower() == "admin"


def _require_uid(req: Request) -> str:
    uid = (req.headers.get("x-user-id") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


def _serialize(row: dict) -> dict:
    out = dict(row)
    ca = out.get("created_at")
    if isinstance(ca, _dt.datetime):
        out["created_at"] = ca.isoformat()
    out["id"] = str(out["id"])
    return out


@router.get("")
async def list_artifacts(
    req: Request,
    kind: Optional[str] = None,
    tool: Optional[str] = None,
    range_: Optional[str] = Query(None, alias="range"),
    public: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
):
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    since: _dt.datetime | None = None
    if range_ and range_ in _RANGE_MAP:
        since = _dt.datetime.utcnow() - _dt.timedelta(days=_RANGE_MAP[range_])

    # Auth gate: unauthenticated callers can only browse the public gallery.
    # Force `public=True` for them regardless of what they passed in the
    # query string. Authenticated callers can request public=true/false/None.
    # Owner-scoping is a separate concern tracked as a follow-up.
    uid = (req.headers.get("x-user-id") or "").strip()
    if not uid:
        public = True

    rows = await _A.list_artifacts(
        kind=kind, tool_name=tool, since=since, public=public,
        limit=limit, offset=offset,
    )
    return {"items": [_serialize(r) for r in rows], "limit": limit, "offset": offset}


@router.get("/_meta/tools")
async def list_tools():
    return {"tools": await _A.distinct_tool_names()}


@router.get("/{artifact_id}")
async def get_artifact(artifact_id: str):
    row = await _A._fetch_row(artifact_id)
    if not row:
        raise HTTPException(status_code=404, detail="artifact not found")
    return _serialize(row)


@router.get("/{artifact_id}/download")
async def download_artifact(artifact_id: str, request: Request):
    row = await _A._fetch_row(artifact_id)
    if not row:
        raise HTTPException(status_code=404, detail="artifact not found")
    if row.get("public"):
        try:
            url = await _A.get_artifact_signed_url(artifact_id, ttl_seconds=900)
            return RedirectResponse(url=url, status_code=302)
        except Exception:
            # Fall through to streaming proxy below — public + signed-url
            # failure is recoverable; we still know the bytes are public.
            pass
    else:
        _require_uid(request)
    data = await _A.get_artifact_bytes(artifact_id)
    return Response(
        content=data,
        media_type=row["mime"] or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{row["filename"]}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


class PatchArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid")
    public: Optional[bool] = None


@router.patch("/{artifact_id}")
async def patch_artifact(artifact_id: str, body: PatchArtifact, request: Request):
    if not _is_admin(request):
        raise HTTPException(status_code=403, detail="admin only")
    if body.public is None:
        raise HTTPException(status_code=400, detail="no fields to update")
    row = await _A.set_public(artifact_id, body.public)
    if not row:
        raise HTTPException(status_code=404, detail="artifact not found")
    return _serialize(row)
# 104:16
