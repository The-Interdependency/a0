# 175:139 0:0 2:7
# N:M
"""spawn_executor — execute the rows that sub_agent_spawn writes.

Closes the gap between `sub_agent_spawn` (which inserts an agent_runs
row but calls no model) and the inference layer (which has no awareness
of pending rows). The poller claims rows atomically, binds run-scoped
ContextVars, constructs an AgentInstance against the row's declared
provider, runs one inference turn with the row's task_summary as the
user message, and writes the result back via run_logger.emit so it
flows into the existing agent_logs stream and the merge tool's
JSONL artifact archival pipeline.

State machine (only status field on agent_runs is touched here):

    running   — written by sub_agent_spawn, awaiting executor
    executing — claimed by executor, inference in progress
    completed — inference finished, result + usage logged
    failed    — inference raised; error logged on the row
    merged    — sub_agent_merge called by parent (terminal — owned by merge)

Concurrency: rows are claimed via UPDATE … WHERE id IN (SELECT … FOR
UPDATE SKIP LOCKED LIMIT 1) RETURNING. A row can only be claimed once
even across restarts or competing poller instances.

Sub-module layout (add behaviour there, not here):
  spawn_db.py    — DB ops: claim, heartbeat, mark_terminal, retry
  spawn_pcna.py  — provider resolution, PCNA snapshot/fork/retire
  spawn_sweep.py — stale-claim reaper, no-orphan invariant

# === CONTRACTS ===
# id: spawn_executor_claim_atomic
#   given: a single 'running' agent_runs row exists
#   then:  two concurrent _claim_one_pending() calls succeed once and
#          return None once; the row's status is 'executing' afterwards
#   class: idempotency
#
# id: spawn_executor_skips_non_running
#   given: an agent_runs row with status='completed' (or 'failed', 'merged')
#   then:  _claim_one_pending() does not return it
#   class: correctness
#
# id: spawn_executor_marks_failed_on_exception
#   given: a claimed row whose providers list resolves to an unknown id
#   then:  _execute_one raises no exception, the row's final status is
#          'failed', and an 'error' event was logged for the run_id
#   class: correctness
#
# id: spawn_executor_resolve_provider_rejects_empty
#   given: an empty list or malformed providers value
#   then:  _resolve_provider raises ValueError (no silent default-to-active)
#   class: correctness
#
# id: spawn_executor_snapshot_pcna_shape
#   given: a primary-shaped PCNAEngine instance
#   then:  _snapshot_pcna returns the four delta-tracked floats/ints
#          (phi, psi, omega, theta_circles); types and ordering are
#          stable so log consumers can subtract before/after dicts
#   class: correctness
#
# id: spawn_executor_merge_helpers_tolerate_no_pcna
#   given: a missing primary PCNA (cold-start or test bootstrap)
#   then:  _try_get_primary_pcna returns None and _retire_fork_quietly
#          returns without raising
#   class: correctness
#
# id: spawn_executor_heartbeat_advances
#   given: an 'executing' agent_runs row and the _heartbeat_loop running
#   then:  last_heartbeat_at strictly advances after a few interval ticks
#   class: correctness
#
# id: spawn_executor_stale_sweep_marks_worker_lost
#   given: an 'executing' row with last_heartbeat_at older than 2× the
#          heartbeat interval, plus a fresh row with a current heartbeat
#   then:  _reap_stale_claims marks ONLY the stale row; fresh row untouched
#   class: correctness
#
# id: spawn_executor_retry_once_on_transient
#   given: a row with retry_policy='once_on_transient', retry_count=0,
#          failing with a TimeoutError (transient)
#   then:  _maybe_schedule_retry returns True, row goes back to 'running'
#          with retry_count=1; a second failure does NOT retry (one-shot cap)
#   class: correctness
#
# id: spawn_executor_retry_default_none
#   given: retry_policy='none' OR a non-transient exception under
#          retry_policy='once_on_transient'
#   then:  _maybe_schedule_retry returns False
#   class: correctness
#
# id: spawn_executor_concurrent_live_cap
#   given: 20 live registry entries under a single parent_run_id
#   then:  check_can_spawn raises SpawnCapExceeded with cap='concurrent_live'
#   class: security
#
# id: spawn_executor_no_orphan_invariant
#   given: a registry entry whose run_id has no DB row, AND a DB
#          'executing' row owned by THIS WORKER_ID with no registry entry
#   then:  check_no_orphan_invariant flags both as orphans and reports ok=False
#   class: correctness
# === END CONTRACTS ===
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_spawn_executor
#   module_name: spawn_executor
#   module_kind: service
#   summary: Executes the agent_runs rows sub_agent_spawn writes — atomically claims rows, binds run-scoped ContextVars, runs one AgentInstance inference turn, and writes results back through run_logger into the agent_logs stream.
#   owner: Erin Spencer
#   public_surface: inflight_count
#   internal_surface: _execute_one, _on_inflight_done, _poll_loop
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: python/tests/contracts/spawn_executor.py
#   rollout: default_enabled
#   rollback: Revert this file; pending spawn rows remain unclaimed until executor is restored.
#   requires: a0_service_spawn_db, a0_service_spawn_pcna, a0_service_spawn_sweep, a0_service_agent_instance, a0_service_run_logger, a0_service_run_context
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import asyncio
import logging
from typing import Any, Optional

# ── re-exports (callers import from here) ─────────────────────────────────────
# spawn_db
from .spawn_db import (  # noqa: F401
    HEARTBEAT_INTERVAL_S, STALE_SWEEP_INTERVAL_S, WORKER_ID,
    _claim_one_pending, _heartbeat_loop, _persist_resolved_provider,
    _mark_terminal, _maybe_schedule_retry, _is_transient_exception,
)
# spawn_pcna
from .spawn_pcna import (  # noqa: F401
    _resolve_provider, _snapshot_pcna, _try_get_primary_pcna, _retire_fork_quietly,
)
# spawn_sweep
from .spawn_sweep import (  # noqa: F401
    _reap_stale_claims, _emit_worker_lost_event, _stale_sweep_loop,
    check_no_orphan_invariant,
)

from .agent_instance import AgentInstance
from .run_context import bind_run, reset_run
from .run_logger import get_run_logger

_log = logging.getLogger("a0p.spawn_executor")

POLL_INTERVAL_S = 1.0
MAX_INFLIGHT = 16
_inflight: set[asyncio.Task] = set()

# Modes this executor drives end-to-end. Anything else raises NotImplementedError.
_SUPPORTED_MODES = frozenset({"single"})


async def _execute_one(row: dict[str, Any]) -> None:
    """Run one claimed spawn row to terminal status. Never raises.

    Lifecycle (single mode):
      1. Bind run-scoped ContextVars from the row.
      2. Fork a child PCNA from the primary (if reachable).
      3. Construct an AgentInstance and run one inference turn.
      4. Feed task + response into child.infer() so child PCNA accumulates.
      5. Snapshot parent, absorb child, log the merge delta.
      6. Mark the row terminal (completed | failed).
    Exceptions are converted to status='failed' — the poller never sees them.
    """
    run_id = row["id"]
    mode = row.get("orchestration_mode") or "single"
    parent_run_id = row.get("parent_run_id")
    tokens = bind_run(
        run_id=run_id,
        depth=int(row.get("depth") or 0),
        root_run_id=row.get("root_run_id") or run_id,
        parent_run_id=parent_run_id,
    )
    logger = get_run_logger()
    sub_name: Optional[str] = None
    parent_pcna = None
    merge_payload: Optional[dict] = None
    heartbeat_task = asyncio.create_task(
        _heartbeat_loop(run_id),
        name=f"spawn_hb_{run_id[:8]}",
    )
    try:
        if mode not in _SUPPORTED_MODES:
            raise NotImplementedError(
                f"orchestration_mode={mode!r} not implemented; "
                f"supported: {sorted(_SUPPORTED_MODES)}"
            )

        # ── (2) fork child PCNA ────────────────────────────────────────────
        parent_pcna, pcna_err = _try_get_primary_pcna()
        provider_id = await _resolve_provider(row.get("providers"), parent_pcna=parent_pcna)
        await _persist_resolved_provider(run_id, provider_id)
        if parent_pcna is not None:
            try:
                from .agent_lifecycle import spawn_sub_agent
                fork_info = spawn_sub_agent(
                    parent_pcna, provider=provider_id,
                    parent_run_id=parent_run_id, run_id=run_id,
                )
                sub_name = fork_info.get("sub_agent_name")
                logger.emit("custom", {"phase": "pcna_fork", **fork_info})
            except Exception as exc:
                logger.emit("error", {"stage": "pcna_fork", "error": str(exc)[:300]})
                sub_name = None
        else:
            logger.emit("error", {
                "stage": "pcna_fork_skipped",
                "reason": pcna_err or "primary_pcna_unreachable",
            })

        # ── (3) inference ──────────────────────────────────────────────────
        instance = AgentInstance.from_model(
            model_id=provider_id, user_id=None,
            use_tools=True, enforce_tier=False, enforce_enabled=True,
        )
        messages = [{"role": "user", "content": row.get("task_summary") or ""}]
        content, usage = await instance.run(messages)

        # ── (4) feed observations to child PCNA ────────────────────────────
        if sub_name:
            try:
                from .agent_lifecycle import get_sub_agent_engine
                child = get_sub_agent_engine(sub_name)
                if child is not None:
                    if row.get("task_summary"):
                        child.infer(row["task_summary"])
                    if content:
                        child.infer(content[:2000])
            except Exception as exc:
                logger.emit("error", {"stage": "child_infer", "error": str(exc)[:300]})

        # ── (5) absorb child back into parent ─────────────────────────────
        if sub_name and parent_pcna is not None:
            try:
                from .agent_lifecycle import merge_sub_agent as _merge_now
                before = _snapshot_pcna(parent_pcna)
                absorb_result = _merge_now(parent_pcna, sub_name)
                after = _snapshot_pcna(parent_pcna)
                delta = {
                    "phi_delta": round(after["phi"] - before["phi"], 6),
                    "psi_delta": round(after["psi"] - before["psi"], 6),
                    "omega_delta": round(after["omega"] - before["omega"], 6),
                    "theta_circles_delta": after["theta_circles"] - before["theta_circles"],
                }
                merge_payload = {
                    "sub_agent_name": sub_name, "provider": provider_id,
                    "before": before, "after": after, "delta": delta,
                    **absorb_result,
                }
                sub_name = None  # ownership transferred — fork retired by absorb
                logger.emit("merge", merge_payload)
            except Exception as exc:
                logger.emit("error", {"stage": "pcna_merge", "error": str(exc)[:300]})

        logger.emit("spawn_complete", {
            "provider": provider_id,
            "content_preview": (content or "")[:500],
            "usage": usage, "mode": mode, "merge": merge_payload,
        })
        await _mark_terminal(run_id, "completed", usage)

    except Exception as exc:
        logger.emit("error", {
            "stage": "spawn_executor.execute",
            "error_type": type(exc).__name__,
            "error": str(exc)[:500],
        }, level="ERROR")
        retried = False
        try:
            retried = await _maybe_schedule_retry(
                run_id,
                str(row.get("retry_policy") or "none"),
                int(row.get("retry_count") or 0),
                exc,
            )
        except Exception as inner:
            _log.error("[spawn_executor] retry scheduler raised for %s: %s", run_id, inner)
        if not retried:
            try:
                await _mark_terminal(
                    run_id, "failed",
                    failure_reason=f"executor:{type(exc).__name__}",
                )
            except Exception as inner:
                _log.error("[spawn_executor] failed to mark %s as failed: %s", run_id, inner)
    finally:
        if not heartbeat_task.done():
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except (asyncio.CancelledError, Exception):
                pass
        _retire_fork_quietly(parent_pcna, sub_name or "")
        reset_run(tokens)
        try:
            from .run_logger import flush as _flush
            await _flush()
        except Exception:
            pass


def _on_inflight_done(task: asyncio.Task) -> None:
    _inflight.discard(task)


async def _poll_loop() -> None:
    """Forever-loop. Claims and dispatches spawn rows; sleeps when idle.

    Backpressure: stops claiming when MAX_INFLIGHT is reached.
    Never raises — per-iteration exceptions log and sleep one cycle.
    """
    while True:
        try:
            if len(_inflight) >= MAX_INFLIGHT:
                await asyncio.sleep(POLL_INTERVAL_S)
                continue
            row = await _claim_one_pending()
            if row is None:
                await asyncio.sleep(POLL_INTERVAL_S)
                continue
            task = asyncio.create_task(
                _execute_one(row),
                name=f"spawn_exec_{row['id'][:8]}",
            )
            _inflight.add(task)
            task.add_done_callback(_on_inflight_done)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.exception("[spawn_executor] poll iteration failed: %s", exc)
            await asyncio.sleep(POLL_INTERVAL_S)


def inflight_count() -> int:
    """Introspection helper — returns the number of in-flight execution tasks."""
    return len(_inflight)
# 175:139 0:0 2:7
