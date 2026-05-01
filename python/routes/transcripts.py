# 231:75
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
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Request, UploadFile
from sqlalchemy import text as _sa_text

from ..database import engine
from ..services.transcript_ingest import (
    MAX_UPLOAD_BYTES, SUPPORTED_EXTS, SYNC_BYTE_LIMIT, ingest_upload,
)
from ..storage import storage

FREE_MONTHLY_UPLOAD_LIMIT = 1
# Task #110: 'supporter' is retired; only the operator tiers (ws, admin)
# get unlimited transcript uploads. Legacy supporters are kept here so
# in-flight subscribers don't lose access mid-month — when their Stripe
# subscription is canceled the webhook drops them back to 'free'.
UNLIMITED_TIERS = {"supporter", "ws", "admin"}

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


async def _quota_state(uid: str) -> dict:
    """Compute the caller's current upload quota state.

    Returns a dict shaped like:
      {
        "unlimited": bool,
        "reason": "tier" | "donation" | "free",
        "tier": str,
        "used_this_month": int,
        "limit": int | None,   # None when unlimited
      }
    """
    async with engine.connect() as conn:
        row = await conn.execute(
            _sa_text(
                "SELECT subscription_tier, transcripts_unlocked "
                "FROM users WHERE id = :id"
            ),
            {"id": uid},
        )
        rec = row.mappings().first()

    tier = (rec["subscription_tier"] if rec else "free") or "free"
    unlocked = bool(rec["transcripts_unlocked"]) if rec else False

    if tier in UNLIMITED_TIERS:
        return {
            "unlimited": True, "reason": "tier", "tier": tier,
            "used_this_month": 0, "limit": None,
        }
    if unlocked:
        return {
            "unlimited": True, "reason": "donation", "tier": tier,
            "used_this_month": 0, "limit": None,
        }

    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)
    used = await storage.count_user_uploads_since(uid, month_start)
    return {
        "unlimited": False, "reason": "free", "tier": tier,
        "used_this_month": used, "limit": FREE_MONTHLY_UPLOAD_LIMIT,
    }


@asynccontextmanager
async def _user_upload_lock(uid: str):
    """Per-user Postgres advisory lock — serializes the quota-check + upload
    insert so two concurrent free-tier uploads can't both pass the gate.

    Uses a session-level (not transactional) lock held for the duration of the
    `async with` block; explicit unlock in finally guarantees release even on
    exception. Lock key is hashtext('transcripts:<uid>') so the keyspace is
    namespaced and never collides with other features that may also use
    advisory locks.
    """
    key_param = f"transcripts:{uid}"
    async with engine.connect() as conn:
        await conn.execute(
            _sa_text("SELECT pg_advisory_lock(hashtext(:k))"),
            {"k": key_param},
        )
        try:
            yield conn
        finally:
            await conn.execute(
                _sa_text("SELECT pg_advisory_unlock(hashtext(:k))"),
                {"k": key_param},
            )


def _quota_blocked_payload(state: dict) -> dict:
    """Shape the JSON body returned with a 402 when the user is over quota.

    Task #110: a0p is donations-funded, not paywalled. Donations no
    longer unlock uploads. Free tier means free tier; the limit resets
    at the next month boundary.
    """
    return {
        "error": "quota_exceeded",
        "detail": (
            f"Free tier limit reached: {state['used_this_month']} of "
            f"{state['limit']} upload(s) this month. Quota resets at the "
            "start of next month."
        ),
        "quota": state,
    }


@router.get("/quota")
async def get_quota(request: Request):
    """Current caller's transcript-upload quota state."""
    uid = _require_uid(request)
    return await _quota_state(uid)


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

    # Check quota and reserve an upload row atomically per-user.
    # The advisory lock serializes concurrent uploads from the same caller so
    # two parallel requests on a free account can't both pass the gate.
    async with _user_upload_lock(uid):
        quota = await _quota_state(uid)
        if not quota["unlimited"] and quota["used_this_month"] >= (quota["limit"] or 0):
            raise HTTPException(status_code=402, detail=_quota_blocked_payload(quota))

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


# --- EDCMbone explainer ---

@router.get("/explainer/credits")
async def get_explainer_credits(request: Request):
    """Return the caller's explainer credit balance (free + paid + lifetime).

    Seeds the row with 3 free on first read — this is also where the trial
    grant becomes visible to the UI before the user ever clicks Explain.
    """
    uid = _require_uid(request)
    row = await storage.get_or_seed_explanation_credits(uid)
    return {
        "free_remaining": int(row.get("free_remaining", 0)),
        "paid_remaining": int(row.get("paid_remaining", 0)),
        "lifetime_purchased": int(row.get("lifetime_purchased", 0)),
        "total_remaining": int(row.get("free_remaining", 0)) + int(row.get("paid_remaining", 0)),
        "pack_price_cents": 5000,
        "pack_size": 3,
    }


@router.get("/reports/{report_id}/explanation")
async def get_report_explanation(request: Request, report_id: int):
    """Owner-only fetch of the cached explanation, if any. Returns 404
    when no explanation has been generated yet — distinct from the 200
    + cached:true response from POST /explain so the UI can render an
    empty-state without first paying a credit."""
    uid = _require_uid(request)
    # Confirm ownership of the report first so a non-owner can't probe
    # for the existence of someone else's explanation.
    parent = await storage.get_transcript_report(report_id, user_id=uid)
    if not parent:
        raise HTTPException(status_code=404, detail="report not found")
    row = await storage.get_transcript_explanation(report_id, user_id=uid)
    if not row:
        raise HTTPException(status_code=404, detail="no explanation yet")
    return row


@router.post("/reports/{report_id}/explain")
async def explain_report_endpoint(request: Request, report_id: int):
    """Generate (or fetch the cached) EDCMbone explanation.

    Owner-only. Decrements one credit (free first, then paid) on first
    generation; subsequent calls are cached and free. 402 when no credits
    remain — the response body carries a checkout-link payload so the UI
    can open the embedded Stripe checkout for the $50 pack.
    """
    uid = _require_uid(request)
    # Ownership check before billing.
    parent = await storage.get_transcript_report(report_id, user_id=uid)
    if not parent:
        raise HTTPException(status_code=404, detail="report not found")

    from ..services.edcmbone_explainer import (
        explain_report, InsufficientCredits, PromptTooLarge,
    )
    try:
        return await explain_report(report_id=report_id, user_id=uid)
    except InsufficientCredits as exc:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "no_explainer_credits",
                "message": (
                    "You're out of explanation credits. A $50 pack adds 3 "
                    "explanations (~1 minute of Erin's time per shot)."
                ),
                "credits": exc.credits,
                "checkout_url": "/api/v1/billing/explainer-checkout",
                "pack_price_cents": 5000,
                "pack_size": 3,
            },
        )
    except PromptTooLarge as exc:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "prompt_too_large",
                "message": str(exc),
            },
        )
    except PermissionError:
        # Defense-in-depth — should be unreachable since we owner-checked above.
        raise HTTPException(status_code=404, detail="report not found")
    except Exception as exc:
        # Real failure — credit already refunded inside explain_report.
        # Surface the error class+message so the UI shows something useful.
        raise HTTPException(
            status_code=502,
            detail=f"explainer failed: {type(exc).__name__}: {exc}",
        )
# 231:75
