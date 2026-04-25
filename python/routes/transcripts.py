# 100:23
# DOC module: transcripts
# DOC label: Transcripts
# DOC endpoint: POST /api/v1/transcripts/upload | Upload a transcript file (txt/md/html/json/pdf/zip) for EDCMBONE scoring
# DOC endpoint: GET /api/v1/transcripts/uploads | List the caller's recent uploads with status
# DOC endpoint: GET /api/v1/transcripts/uploads/{id} | Get one upload's status (poll target for async)
# DOC endpoint: GET /api/v1/transcripts/reports | List reports owned by the caller
# DOC endpoint: GET /api/v1/transcripts/reports/{id} | Get one report's full rollup
# DOC endpoint: GET /api/v1/transcripts/reports/{id}/messages | Paginated per-round drill-in
# DOC notes: Hybrid sync/async — files ≤256KB ingest inline; larger files queue and the response carries upload_id only.

import asyncio
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile

from ..services.transcript_ingest import (
    MAX_UPLOAD_BYTES, SUPPORTED_EXTS, SYNC_BYTE_LIMIT, ingest_upload,
)
from ..storage import storage

router = APIRouter(prefix="/api/v1/transcripts", tags=["transcripts"])

UI_META = {"label": "Transcripts", "module": "transcripts", "order": 25, "path": "/transcripts"}


def _caller_uid(request: Request) -> Optional[str]:
    return request.headers.get("x-user-id") or None


def _require_uid(request: Request) -> str:
    """Require an authenticated caller. Returns the uid or raises 401.

    Without this guard, passing uid=None to storage list methods would fall
    through to the unscoped 'admin' path and leak every user's reports.
    """
    uid = _caller_uid(request)
    if not uid:
        raise HTTPException(status_code=401, detail="sign-in required")
    return uid


@router.post("/upload")
async def upload_transcript(
    request: Request,
    file: UploadFile = File(...),
    background: BackgroundTasks = None,
):
    """Upload a transcript file for EDCMBONE analysis.

    Hybrid: small files run synchronously and return the full report in the
    response. Large files queue and return an upload_id; poll
    GET /uploads/{id} for status, then fetch /reports/{report_id}.
    """
    uid = _require_uid(request)
    if not file.filename:
        raise HTTPException(status_code=400, detail="filename required")
    ext = "." + file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in SUPPORTED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"unsupported extension {ext}. allowed: {sorted(SUPPORTED_EXTS)}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"file too large: {len(data)} bytes (max {MAX_UPLOAD_BYTES})",
        )

    upload = await storage.create_transcript_upload({
        "user_id": uid,
        "filename": file.filename,
        "mime": file.content_type,
        "byte_size": len(data),
        "status": "queued",
    })

    # Hybrid path: small files inline, large files background.
    if len(data) <= SYNC_BYTE_LIMIT:
        try:
            await storage.update_transcript_upload(upload["id"], status="processing")
            report = await ingest_upload(upload["id"], file.filename, data)
            return {
                "mode": "sync",
                "upload_id": upload["id"],
                "report_id": report["id"],
                "report": report,
            }
        except Exception as e:
            # ingest_upload already wrote status='error' on the row.
            raise HTTPException(status_code=422, detail=f"ingest failed: {type(e).__name__}: {e}")

    # Async path
    if background is None:
        background = BackgroundTasks()
    await storage.update_transcript_upload(upload["id"], status="processing")
    background.add_task(_run_async_ingest, upload["id"], file.filename, data)
    return {"mode": "async", "upload_id": upload["id"], "status": "processing"}


async def _run_async_ingest(upload_id: int, filename: str, data: bytes) -> None:
    """Background ingest wrapper — swallows exceptions (ingest_upload records them)."""
    try:
        await ingest_upload(upload_id, filename, data)
    except Exception:
        pass  # ingest_upload already updated the upload row with the error


@router.get("/uploads")
async def list_uploads(request: Request, limit: int = 50):
    uid = _require_uid(request)
    rows = await storage.list_transcript_uploads(uid, limit=limit)
    return {"items": rows}


@router.get("/uploads/{upload_id}")
async def get_upload(request: Request, upload_id: int):
    uid = _require_uid(request)
    row = await storage.get_transcript_upload(upload_id, user_id=uid)
    if not row:
        raise HTTPException(status_code=404, detail="upload not found")
    return row


@router.get("/reports")
async def list_reports(request: Request, limit: int = 50):
    uid = _require_uid(request)
    rows = await storage.list_transcript_reports(uid, limit=limit)
    return {"items": rows}


@router.get("/reports/{report_id}")
async def get_report(request: Request, report_id: int):
    uid = _require_uid(request)
    row = await storage.get_transcript_report(report_id, user_id=uid)
    if not row:
        raise HTTPException(status_code=404, detail="report not found")
    return row


@router.get("/reports/{report_id}/messages")
async def get_report_messages(request: Request, report_id: int, limit: int = 200, offset: int = 0):
    uid = _require_uid(request)
    # Verify ownership of the parent report first so non-owners get 404 (matches /reports/{id}).
    parent = await storage.get_transcript_report(report_id, user_id=uid)
    if not parent:
        raise HTTPException(status_code=404, detail="report not found")
    msgs = await storage.get_transcript_messages(report_id, user_id=uid, limit=limit, offset=offset)
    return {"items": msgs, "report_id": report_id, "limit": limit, "offset": offset}
# 100:23
