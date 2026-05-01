# 123:17
# N:M
"""Per-run buffered structured logger backed by the agent_logs table.

Design:
  * Each emit() call appends to an in-memory queue (cheap).
  * A single background flusher coroutine drains the queue every second OR
    whenever the queue exceeds 100 entries OR when explicitly flushed.
  * `dump_run_jsonl(run_id)` returns the full ordered log stream as JSONL
    bytes — used by sub_agent_merge to archive the run before the rows
    age out.

NO silent fallback: if the DB write fails the failure is re-raised so
upstream sees the breakage. The buffer is preserved on failure so the
next flush retries the unwritten rows.
"""
import asyncio
import json
import time
import uuid
from typing import Any, Optional

from sqlalchemy import text as _sa_text

from .run_context import (
    get_current_run_id, get_current_depth,
    get_current_parent_run_id,
)


_QUEUE: list[dict] = []
_LOCK = asyncio.Lock()
_FLUSH_EVERY_SECS = 1.0
_FLUSH_BATCH_SIZE = 100
_FLUSHER_TASK: Optional[asyncio.Task] = None


_VALID_EVENTS = {
    "spawn_start", "spawn_complete", "tool_call", "tool_result",
    "merge", "cap_hit", "provider_response", "error", "custom",
    "explainer_call",
}


class RunLogger:
    """Tiny adapter that snapshots ContextVars at emit time."""

    def emit(self, event: str, payload: dict | None = None,
             level: str = "INFO", run_id: str | None = None) -> None:
        ev = event if event in _VALID_EVENTS else "custom"
        rid = run_id or get_current_run_id()
        if rid is None:
            rid = "_orphan"
        row = {
            "id": str(uuid.uuid4()),
            "run_id": rid,
            "parent_run_id": get_current_parent_run_id(),
            "depth": get_current_depth(),
            "level": level,
            "event": ev,
            "payload": payload or {},
            "ts_epoch": time.time(),
        }
        _QUEUE.append(row)
        try:
            from ..routes.runs import publish_log as _pub
            _pub(rid, row)
        except Exception:
            pass
        if len(_QUEUE) >= _FLUSH_BATCH_SIZE:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(flush())
            except RuntimeError:
                pass


def get_run_logger() -> RunLogger:
    return RunLogger()


async def flush() -> int:
    """Drain the queue into agent_logs. Returns number of rows written."""
    async with _LOCK:
        if not _QUEUE:
            return 0
        batch = list(_QUEUE)
        _QUEUE.clear()
    try:
        from ..database import get_session
        async with get_session() as s:
            for r in batch:
                await s.execute(
                    _sa_text(
                        "INSERT INTO agent_logs "
                        "(id, run_id, parent_run_id, depth, level, event, payload) "
                        "VALUES (:id, :run_id, :parent_run_id, :depth, :level, :event, "
                        "CAST(:payload AS jsonb))"
                    ),
                    {
                        "id": r["id"], "run_id": r["run_id"],
                        "parent_run_id": r["parent_run_id"], "depth": r["depth"],
                        "level": r["level"], "event": r["event"],
                        "payload": json.dumps(r["payload"], default=str),
                    },
                )
        return len(batch)
    except Exception:
        async with _LOCK:
            _QUEUE[:0] = batch
        raise


async def _periodic_flush_loop() -> None:
    while True:
        try:
            await asyncio.sleep(_FLUSH_EVERY_SECS)
            if _QUEUE:
                try:
                    await flush()
                except Exception as exc:
                    print(f"[run_logger] flush failed: {exc}")
        except asyncio.CancelledError:
            break


def start_flusher() -> None:
    global _FLUSHER_TASK
    if _FLUSHER_TASK is not None and not _FLUSHER_TASK.done():
        return
    try:
        loop = asyncio.get_running_loop()
        _FLUSHER_TASK = loop.create_task(_periodic_flush_loop())
    except RuntimeError:
        pass


async def dump_run_jsonl(run_id: str) -> bytes:
    """Read every agent_logs row for run_id and return as JSONL bytes."""
    await flush()
    from ..database import get_session
    rows: list[dict] = []
    async with get_session() as s:
        r = await s.execute(
            _sa_text(
                "SELECT id, run_id, parent_run_id, depth, level, event, "
                "payload, ts FROM agent_logs WHERE run_id = :rid ORDER BY ts ASC"
            ),
            {"rid": run_id},
        )
        for row in r.mappings().all():
            rows.append({
                "id": str(row["id"]), "run_id": str(row["run_id"]),
                "parent_run_id": row["parent_run_id"],
                "depth": row["depth"], "level": row["level"],
                "event": row["event"], "payload": row["payload"],
                "ts": row["ts"].isoformat() if row["ts"] else None,
            })
    return ("\n".join(json.dumps(r, default=str) for r in rows)).encode("utf-8")


def queued_count() -> int:
    return len(_QUEUE)
# N:M
# 123:17
