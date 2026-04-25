# 202:28
# N:M
"""Fleet view API — agent_runs tree, per-run summary, paginated logs, SSE tail.

The fleet surfaces every active sub-agent. Reads only — no writes here. The
spawn/merge tools (sub_agent_spawn, sub_agent_merge) own all mutations.
"""
import asyncio
import json
import datetime as _dt
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import text as _sa_text

from ..database import get_session

# DOC module: runs
# DOC label: Fleet
# DOC description: Live tree of agent_runs with per-recursion-level structured logs and SSE tail.
# DOC tier: free
# DOC endpoint: GET /api/v1/runs/tree | Full subtree of agent_runs from optional root.
# DOC endpoint: GET /api/v1/runs/{run_id} | Single run summary + recent log events.
# DOC endpoint: GET /api/v1/runs/{run_id}/logs | Paginated log entries (limit+before cursor).
# DOC endpoint: GET /api/v1/runs/{run_id}/logs/stream | SSE live tail; closes when status != running.
# DOC notes: Read-only. spawn/merge tools own all mutation paths.

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])

UI_META = {
    "tab_id": "runs",
    "label": "Fleet",
    "icon": "Network",
    "order": 25,
    "sections": [
        {
            "id": "fleet_tree",
            "label": "Active Runs",
            "endpoint": "/api/v1/runs/tree",
            "fields": [
                {"key": "id", "type": "text", "label": "Run"},
                {"key": "status", "type": "badge", "label": "Status"},
                {"key": "depth", "type": "text", "label": "Depth"},
                {"key": "total_cost_usd", "type": "text", "label": "Cost"},
            ],
        },
    ],
}

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/runs/tree"},
        {"method": "GET", "path": "/api/v1/runs/{run_id}"},
        {"method": "GET", "path": "/api/v1/runs/{run_id}/logs"},
        {"method": "GET", "path": "/api/v1/runs/{run_id}/logs/stream"},
    ]
}


def _row_to_run(row: dict) -> dict:
    """Normalize a DB row into the JSON shape consumed by the Fleet UI."""
    started = row.get("started_at")
    ended = row.get("ended_at")
    duration_ms: Optional[int] = None
    if started:
        end_ts = ended or _dt.datetime.utcnow()
        duration_ms = int((end_ts - started).total_seconds() * 1000)
    return {
        "id": row["id"],
        "parent_run_id": row.get("parent_run_id"),
        "root_run_id": row.get("root_run_id"),
        "depth": row.get("depth", 0),
        "status": row.get("status", "running"),
        "orchestration_mode": row.get("orchestration_mode", "single"),
        "cut_mode": row.get("cut_mode", "soft"),
        "providers": row.get("providers") or [],
        "spawned_by_tool": row.get("spawned_by_tool"),
        "task_summary": row.get("task_summary") or "",
        "started_at": started.isoformat() if started else None,
        "ended_at": ended.isoformat() if ended else None,
        "duration_ms": duration_ms,
        "total_tokens": row.get("total_tokens", 0),
        "total_cost_usd": float(row.get("total_cost_usd") or 0),
        "children": [],
    }


@router.get("/tree")
async def runs_tree(root: Optional[str] = Query(None, description="Optional root_run_id filter")):
    """Return all runs as a nested tree. With ?root= returns just that subtree."""
    async with get_session() as s:
        if root:
            r = await s.execute(_sa_text(
                "SELECT * FROM agent_runs WHERE root_run_id = :r OR id = :r ORDER BY depth, started_at"
            ), {"r": root})
        else:
            r = await s.execute(_sa_text(
                "SELECT * FROM agent_runs ORDER BY depth, started_at DESC LIMIT 500"
            ))
        rows = [dict(m) for m in r.mappings().all()]

    by_id: dict = {row["id"]: _row_to_run(row) for row in rows}
    roots: list = []
    for run in by_id.values():
        pid = run["parent_run_id"]
        if pid and pid in by_id:
            by_id[pid]["children"].append(run)
        else:
            roots.append(run)

    # Top-bar stats so the UI can avoid a second roundtrip
    total_active = sum(1 for r in by_id.values() if r["status"] == "running")
    total_cost = sum(r["total_cost_usd"] for r in by_id.values())
    depth_hist: dict = {}
    for r in by_id.values():
        depth_hist[r["depth"]] = depth_hist.get(r["depth"], 0) + 1

    return {
        "roots": roots,
        "stats": {
            "total_runs": len(by_id),
            "active_count": total_active,
            "cost_today_usd": round(total_cost, 6),
            "depth_histogram": depth_hist,
        },
    }


@router.get("/{run_id}")
async def get_run(run_id: str):
    """Single run + last 25 log events for the right pane header."""
    async with get_session() as s:
        r = await s.execute(_sa_text("SELECT * FROM agent_runs WHERE id = :i"), {"i": run_id})
        row = r.mappings().first()
        if not row:
            return {"error": "not_found", "run_id": run_id}
        run = _row_to_run(dict(row))
        lr = await s.execute(_sa_text(
            "SELECT id, run_id, depth, level, event, payload, ts FROM agent_logs "
            "WHERE run_id = :i ORDER BY ts DESC LIMIT 25"
        ), {"i": run_id})
        run["recent_logs"] = [_log_row(dict(m)) for m in lr.mappings().all()]
    return run


def _log_row(row: dict) -> dict:
    ts = row.get("ts")
    return {
        "id": row["id"],
        "run_id": row.get("run_id"),
        "depth": row.get("depth", 0),
        "level": row.get("level", "INFO"),
        "event": row.get("event", ""),
        "payload": row.get("payload") or {},
        "ts": ts.isoformat() if ts else None,
    }


@router.get("/{run_id}/logs")
async def list_logs(
    run_id: str,
    level: Optional[str] = Query(None),
    event: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    before: Optional[str] = Query(None, description="ISO ts cursor for pagination"),
):
    """Paginated log entries; cursor descends in time. before=<iso> for next page."""
    clauses = ["run_id = :i"]
    params: dict = {"i": run_id, "lim": limit}
    if level:
        clauses.append("level = :level")
        params["level"] = level
    if event:
        clauses.append("event = :event")
        params["event"] = event
    if before:
        try:
            params["before"] = _dt.datetime.fromisoformat(before.replace("Z", ""))
            clauses.append("ts < :before")
        except ValueError:
            pass
    sql = (
        "SELECT id, run_id, depth, level, event, payload, ts FROM agent_logs "
        "WHERE " + " AND ".join(clauses) + " ORDER BY ts DESC LIMIT :lim"
    )
    async with get_session() as s:
        r = await s.execute(_sa_text(sql), params)
        rows = [_log_row(dict(m)) for m in r.mappings().all()]
    next_cursor = rows[-1]["ts"] if rows and len(rows) == limit else None
    return {"logs": rows, "next_cursor": next_cursor}


# ---- SSE live tail ----
# Pluggable broadcast bus: run_logger.emit() pushes payloads onto each
# subscribed queue. Subscribers register in /logs/stream and unsubscribe on
# disconnect. Polling fallback is also installed for safety so the stream
# stays accurate even if a producer forgets to publish.

_SSE_QUEUES: dict[str, list[asyncio.Queue]] = {}


def publish_log(run_id: str, payload: dict) -> None:
    """Called from run_logger.emit() to fan out to live SSE subscribers."""
    q_list = _SSE_QUEUES.get(run_id)
    if not q_list:
        return
    for q in list(q_list):
        try:
            q.put_nowait(payload)
        except Exception:
            pass


async def _poll_run_status(run_id: str) -> str:
    async with get_session() as s:
        r = await s.execute(_sa_text(
            "SELECT status FROM agent_runs WHERE id = :i"
        ), {"i": run_id})
        row = r.mappings().first()
        return (row or {}).get("status", "missing")


@router.get("/{run_id}/logs/stream")
async def stream_logs(run_id: str, request: Request):
    """SSE live tail. Closes when run reaches a terminal state."""
    q: asyncio.Queue = asyncio.Queue(maxsize=512)
    _SSE_QUEUES.setdefault(run_id, []).append(q)

    async def gen():
        try:
            yield f": connected to {run_id}\n\n"
            # Backfill last 25 events so the client has immediate context
            async with get_session() as s:
                r = await s.execute(_sa_text(
                    "SELECT id, run_id, depth, level, event, payload, ts FROM agent_logs "
                    "WHERE run_id = :i ORDER BY ts DESC LIMIT 25"
                ), {"i": run_id})
                backfill = list(reversed([_log_row(dict(m)) for m in r.mappings().all()]))
            for ev in backfill:
                yield f"event: log\ndata: {json.dumps(ev)}\n\n"

            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=10.0)
                    yield f"event: log\ndata: {json.dumps(payload, default=str)}\n\n"
                except asyncio.TimeoutError:
                    status = await _poll_run_status(run_id)
                    yield f"event: heartbeat\ndata: {json.dumps({'status': status})}\n\n"
                    if status in ("merged", "failed", "missing", "cap_hit"):
                        break
        finally:
            try:
                _SSE_QUEUES.get(run_id, []).remove(q)
            except ValueError:
                pass
            if not _SSE_QUEUES.get(run_id):
                _SSE_QUEUES.pop(run_id, None)

    return StreamingResponse(gen(), media_type="text/event-stream")
# N:M
# 202:28
