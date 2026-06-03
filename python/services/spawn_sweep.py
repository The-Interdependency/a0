# 113:50 0:0 1:5
"""spawn_sweep — stale-claim reaper and no-orphan invariant check.

Owns: _reap_stale_claims (single sweep pass), _emit_worker_lost_event,
_stale_sweep_loop (forever timer), and check_no_orphan_invariant
(read-only DB↔registry reconciliation).
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_spawn_sweep
#   module_name: spawn_sweep
#   module_kind: service
#   summary: Stale-claim reaper and no-orphan invariant checker for the spawn executor — sweeps timed-out claims, emits worker-lost events, and reconciles in-memory registry against agent_runs rows.
#   owner: Erin Spencer
#   public_surface: check_no_orphan_invariant
#   internal_surface: _reap_stale_claims, _emit_worker_lost_event, _stale_sweep_loop
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; stale-claim reaping stops but spawn rows remain consistent on restart.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import asyncio
import datetime as _dt
import logging
from typing import Any

from sqlalchemy import text as _sa_text

from .run_context import bind_run, reset_run
from .run_logger import get_run_logger
from .spawn_db import HEARTBEAT_INTERVAL_S, STALE_SWEEP_INTERVAL_S, WORKER_ID

_log = logging.getLogger("a0p.spawn_executor")


async def _reap_stale_claims(
    heartbeat_interval_s: float = HEARTBEAT_INTERVAL_S,
) -> list[dict]:
    """Single sweep pass — mark stale 'executing' rows as failed/worker_lost.

    A row is stale when last_heartbeat_at is older than max(2×interval, 30s).
    Returns the list of reaped rows (may be empty). Public so the contract
    test can drive it deterministically.
    """
    stale_secs = max(2.0 * float(heartbeat_interval_s), 30.0)
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(seconds=stale_secs)
    from ..database import get_session
    async with get_session() as s:
        r = await s.execute(
            _sa_text(
                "UPDATE agent_runs "
                "SET status = 'failed', failure_reason = 'worker_lost', "
                "    ended_at = CURRENT_TIMESTAMP "
                "WHERE status = 'executing' "
                "  AND last_heartbeat_at IS NOT NULL "
                "  AND last_heartbeat_at < :cutoff "
                "RETURNING id, worker_id, last_heartbeat_at, "
                "          parent_run_id, root_run_id, depth"
            ),
            {"cutoff": cutoff},
        )
        return [dict(m) for m in r.mappings().all()]


async def _emit_worker_lost_event(row: dict) -> None:
    """Emit a 'worker_lost_reaped' event on the reaped run's own log stream.

    Best-effort — never raises. Lets the SSE tail and /runs/{id} surface
    why the row went terminal.
    """
    try:
        rid = row["id"]
        tokens = bind_run(
            run_id=rid,
            depth=int(row.get("depth") or 0),
            root_run_id=row.get("root_run_id") or rid,
            parent_run_id=row.get("parent_run_id"),
        )
        try:
            get_run_logger().emit(
                "worker_lost_reaped",
                {
                    "worker_id": row.get("worker_id"),
                    "last_heartbeat_at": str(row.get("last_heartbeat_at")),
                    "stale_threshold_s": 2 * HEARTBEAT_INTERVAL_S,
                },
                level="WARN",
            )
            from .run_logger import flush as _flush
            await _flush()
        finally:
            reset_run(tokens)
    except Exception as exc:
        _log.warning(
            "[spawn_executor] worker_lost_reaped emit failed for %s: %s",
            row.get("id"), exc,
        )


async def _stale_sweep_loop(
    sweep_interval_s: float = STALE_SWEEP_INTERVAL_S,
    heartbeat_interval_s: float = HEARTBEAT_INTERVAL_S,
) -> None:
    """Forever-loop. Reaps stale 'executing' rows on a timer.

    Never raises — per-iteration exceptions log and sleep one cycle.
    Owned by main.py lifespan.
    """
    while True:
        try:
            await asyncio.sleep(sweep_interval_s)
            reaped = await _reap_stale_claims(heartbeat_interval_s)
            for row in reaped:
                _log.warning(
                    "[spawn_executor] worker_lost_reaped run=%s worker=%s last_heartbeat_at=%s",
                    row["id"], row.get("worker_id"), row.get("last_heartbeat_at"),
                )
                await _emit_worker_lost_event(row)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.exception("[spawn_executor] stale-sweep iteration failed: %s", exc)


async def check_no_orphan_invariant() -> dict:
    """Reconcile the in-memory _sub_agents registry with agent_runs DB rows.

    Returns:
      registry_orphans  — registry entries whose run_id has no live DB row
      worker_orphans    — DB executing rows owned by THIS WORKER_ID with no
                          matching registry entry
      registry_count, db_executing_count — for sanity / dashboards
      ok                — True iff both orphan lists are empty
      worker_id         — this process's WORKER_ID

    Read-only — does not mutate either side.
    """
    from ..database import get_session
    from .agent_lifecycle import registry_snapshot
    snap = registry_snapshot()
    snap_run_ids = {entry["run_id"] for entry in snap if entry.get("run_id")}
    async with get_session() as s:
        r = await s.execute(
            _sa_text(
                "SELECT id, status, worker_id FROM agent_runs "
                "WHERE status IN ('running', 'executing')"
            )
        )
        live_rows = [dict(m) for m in r.mappings().all()]
    live_by_id = {row["id"]: row for row in live_rows}

    # registry → DB: every registry entry with a run_id must have a live row.
    registry_orphans = [
        {"name": e["name"], "run_id": e["run_id"],
         "parent_run_id": e.get("parent_run_id"), "reason": "no_matching_agent_runs_row"}
        for e in snap
        if e.get("run_id") and live_by_id.get(e["run_id"]) is None
    ]

    # DB → registry: every executing row owned by THIS WORKER_ID must have a registry entry.
    worker_orphans = [
        {"id": row["id"], "worker_id": row.get("worker_id"),
         "reason": "no_registry_entry_on_this_worker"}
        for row in live_rows
        if row.get("status") == "executing"
        and row.get("worker_id") == WORKER_ID
        and row["id"] not in snap_run_ids
    ]

    return {
        "registry_count": len(snap),
        "db_executing_count": sum(1 for r in live_rows if r.get("status") == "executing"),
        "registry_orphans": registry_orphans,
        "worker_orphans": worker_orphans,
        "ok": not registry_orphans and not worker_orphans,
        "worker_id": WORKER_ID,
    }
# 113:50 0:0 1:5
