# 159:48 0:0 2:2
"""spawn_db — raw database operations for the spawn executor.

Owns: claim, heartbeat, persist-provider, mark-terminal, retry scheduling,
and the transient-exception classifier that drives retry policy.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_spawn_db
#   module_name: spawn_db
#   module_kind: service
#   summary: Raw database operations for the spawn executor — atomic claim, heartbeat loop, provider persistence, terminal marking, and retry scheduling with a transient-exception classifier.
#   owner: Erin Spencer
#   public_surface: none
#   internal_surface: _is_transient_exception, _claim_one_pending, _heartbeat_loop, _persist_resolved_provider, _mark_terminal, _maybe_schedule_retry
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: internal
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; spawn-row DB operations revert to prior claim/retry behavior.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import asyncio
import datetime as _dt
import json
import logging
import os
import uuid
from typing import Any, Optional

from sqlalchemy import text as _sa_text

from .run_logger import get_run_logger

_log = logging.getLogger("a0p.spawn_executor")

# Heartbeat advances every HEARTBEAT_INTERVAL_S while a row is executing.
# Stale sweep marks rows whose heartbeat is older than 2× as failed/worker_lost.
# WORKER_ID is per-process so multi-process deployments can attribute claims.
HEARTBEAT_INTERVAL_S = float(os.environ.get("A0P_HEARTBEAT_INTERVAL_S", "15"))
STALE_SWEEP_INTERVAL_S = float(os.environ.get("A0P_STALE_SWEEP_INTERVAL_S", "60"))
WORKER_ID = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"

# Transient classifier for retry_policy='once_on_transient'. Explicit and narrow —
# anything that isn't obviously a network/provider blip is a hard failure.
_TRANSIENT_EXC_NAMES = frozenset({
    "timeouterror", "asynciotimeouterror",
    "connectionerror", "connectionreseterror", "connectionrefusederror",
    "remotedisconnected", "incompleteread",
})
_TRANSIENT_KEYWORDS = (
    "timeout", "timed out",
    "rate limit", "rate_limit", "ratelimit",
    "too many requests", "429",
    "500", "502", "503", "504",
    "internal server error", "bad gateway",
    "connection reset", "temporarily unavailable",
    "service unavailable",
)


def _is_transient_exception(exc: BaseException) -> bool:
    """True if `exc` looks like a network/provider blip we can retry once."""
    name = type(exc).__name__.lower()
    if name in _TRANSIENT_EXC_NAMES:
        return True
    msg = str(exc).lower()
    return any(kw in msg for kw in _TRANSIENT_KEYWORDS)


async def _claim_one_pending() -> Optional[dict[str, Any]]:
    """Atomically claim one running spawn row. Returns row dict or None.

    SKIP LOCKED so multiple poller instances coexist. Stamps worker_id and
    seeds last_heartbeat_at so the stale-sweep has a baseline even before
    the first heartbeat tick.
    """
    from ..database import get_session
    sql = _sa_text(
        "UPDATE agent_runs "
        "SET status = 'executing', "
        "    worker_id = :wid, "
        "    last_heartbeat_at = CURRENT_TIMESTAMP "
        "WHERE id = ("
        "  SELECT id FROM agent_runs "
        "  WHERE status = 'running' "
        "    AND spawned_by_tool = 'sub_agent_spawn' "
        "  ORDER BY started_at ASC "
        "  FOR UPDATE SKIP LOCKED LIMIT 1"
        ") "
        "RETURNING id, parent_run_id, root_run_id, depth, "
        "          orchestration_mode, providers, task_summary, "
        "          retry_policy, retry_count"
    )
    async with get_session() as s:
        row = (await s.execute(sql, {"wid": WORKER_ID})).mappings().first()
        return dict(row) if row is not None else None


async def _heartbeat_loop(run_id: str, interval_s: float = HEARTBEAT_INTERVAL_S) -> None:
    """Advance agent_runs.last_heartbeat_at every interval_s.

    Cancelled by _execute_one's finally block. Errors are swallowed so a
    flaky DB tick never propagates into the worker.
    """
    from ..database import get_session
    try:
        while True:
            await asyncio.sleep(interval_s)
            try:
                async with get_session() as s:
                    await s.execute(
                        _sa_text(
                            "UPDATE agent_runs "
                            "SET last_heartbeat_at = CURRENT_TIMESTAMP "
                            "WHERE id = :id AND status = 'executing'"
                        ),
                        {"id": run_id},
                    )
            except Exception as exc:
                _log.warning("[spawn_executor] heartbeat failed for %s: %s", run_id, exc)
    except asyncio.CancelledError:
        return


async def _persist_resolved_provider(run_id: str, provider_id: str) -> None:
    """Write the resolved provider back onto the agent_runs row. Best-effort."""
    try:
        from ..database import get_session
        async with get_session() as s:
            await s.execute(
                _sa_text("UPDATE agent_runs SET providers = CAST(:p AS jsonb) WHERE id = :id"),
                {"p": json.dumps([provider_id]), "id": run_id},
            )
    except Exception as exc:
        _log.warning("[spawn_executor] could not persist provider on %s: %s", run_id, exc)


async def _mark_terminal(
    run_id: str,
    status: str,
    usage: dict | None = None,
    *,
    failure_reason: str | None = None,
) -> None:
    """Write the final state on a row.

    failure_reason is only written when provided so success paths leave it NULL.
    Operators can grep for non-null failure_reason to find every reaped row.
    """
    from ..database import get_session
    tokens = int((usage or {}).get("total_tokens", 0) or 0)
    cost = float((usage or {}).get("total_cost_usd", 0.0) or 0.0)
    async with get_session() as s:
        if failure_reason is not None:
            await s.execute(
                _sa_text(
                    "UPDATE agent_runs "
                    "SET status = :st, ended_at = CURRENT_TIMESTAMP, "
                    "    total_tokens = :tok, total_cost_usd = :cost, "
                    "    failure_reason = :reason "
                    "WHERE id = :id"
                ),
                {"st": status, "tok": tokens, "cost": cost,
                 "reason": failure_reason[:120], "id": run_id},
            )
        else:
            await s.execute(
                _sa_text(
                    "UPDATE agent_runs "
                    "SET status = :st, ended_at = CURRENT_TIMESTAMP, "
                    "    total_tokens = :tok, total_cost_usd = :cost "
                    "WHERE id = :id"
                ),
                {"st": status, "tok": tokens, "cost": cost, "id": run_id},
            )


async def _maybe_schedule_retry(
    run_id: str,
    retry_policy: str,
    retry_count: int,
    exc: BaseException,
) -> bool:
    """Re-mark row 'running' if policy permits and exc is transient.

    Returns True iff retry was scheduled (caller skips _mark_terminal).
    Capped at one retry — never loops.
    """
    if retry_policy != "once_on_transient":
        return False
    if int(retry_count or 0) != 0:
        return False
    if not _is_transient_exception(exc):
        return False
    try:
        from ..database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "UPDATE agent_runs "
                    "SET status = 'running', retry_count = retry_count + 1, "
                    "    worker_id = NULL, last_heartbeat_at = CURRENT_TIMESTAMP "
                    "WHERE id = :id AND retry_count = 0 "
                    "  AND status IN ('executing', 'running') "
                    "RETURNING id"
                ),
                {"id": run_id},
            )
            scheduled = r.first() is not None
    except Exception as inner:
        _log.error("[spawn_executor] retry-schedule UPDATE failed for %s: %s", run_id, inner)
        return False
    if not scheduled:
        return False
    try:
        get_run_logger().emit(
            "retry_scheduled",
            {"run_id": run_id, "policy": retry_policy,
             "error_type": type(exc).__name__, "error": str(exc)[:200]},
            level="WARN",
        )
    except Exception:
        pass
    return True
# 159:48 0:0 2:2
