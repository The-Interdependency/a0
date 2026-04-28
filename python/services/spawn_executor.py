# 248:14
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

State machine (only state field on agent_runs is touched here):

    running   — written by sub_agent_spawn, awaiting executor
    executing — claimed by executor, inference in progress
    completed — inference finished, result + usage logged
    failed    — inference raised; error logged on the row
    merged    — sub_agent_merge called by parent (terminal — owned by merge)

Concurrency: rows are claimed via UPDATE … WHERE id IN (SELECT … FOR
UPDATE SKIP LOCKED LIMIT 1) RETURNING. Same shape as the stripe webhook
idempotency claim — a row can only be claimed once even across restarts
or competing poller instances.

Honest single-concern:
  * This module ONLY executes pending spawn rows. Orchestration modes
    (fan_out, council, daisy_chain, etc.) get a NotImplementedError
    until their own modules land — no silent fallback to single-mode.
  * Provider resolution honors the row's `providers` list. "active"
    resolves to energy_registry.get_active_provider(). Anything else is
    used as the model_id directly (resolve_model_id handles legacy
    provider-id matching). Failure to resolve raises and the row is
    marked failed — not silently rerouted.

# === CONTRACTS ===
# id: spawn_executor_claim_atomic
#   given: a single 'running' agent_runs row exists
#   then:  two concurrent _claim_one_pending() calls succeed once and
#          return None once; the row's status is 'executing' afterwards
#   class: idempotency
#   call:  python.tests.contracts.spawn_executor.test_claim_atomic
#
# id: spawn_executor_skips_non_running
#   given: an agent_runs row with status='completed' (or 'failed', 'merged')
#   then:  _claim_one_pending() does not return it
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_skips_non_running
#
# id: spawn_executor_marks_failed_on_exception
#   given: a claimed row whose providers list resolves to an unknown id
#   then:  _execute_one raises no exception, the row's final status is
#          'failed', and an 'error' event was logged for the run_id
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_marks_failed_on_exception
# === END CONTRACTS ===
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from sqlalchemy import text as _sa_text

from .agent_instance import AgentInstance
from .energy_registry import energy_registry
from .run_context import bind_run, reset_run
from .run_logger import get_run_logger

_log = logging.getLogger("a0p.spawn_executor")

# Poll interval when no pending rows. Latency vs DB load tradeoff —
# 1s is fine for current spawn rates; lower via LISTEN/NOTIFY later if
# needed.
POLL_INTERVAL_S = 1.0

# Cap on how many sub-agent executions we'll have in-flight at once.
# A safety belt above and beyond spawn_caps (which bounds depth+fanout
# per parent). This bounds total concurrent model calls from ALL roots.
MAX_INFLIGHT = 16
_inflight: set[asyncio.Task] = set()


# Modes the executor is willing to drive end-to-end. Anything else
# raises NotImplementedError per the no-silent-fallback doctrine.
_SUPPORTED_MODES = frozenset({"single"})


async def _claim_one_pending() -> Optional[dict[str, Any]]:
    """Atomically claim one running spawn row. Returns row dict or None.

    SKIP LOCKED so multiple poller instances coexist; the WHERE clause
    is constrained to spawned_by_tool='sub_agent_spawn' so root-agent
    runs (which are written by other code paths) are not picked up.
    """
    from ..database import get_session
    sql = _sa_text(
        "UPDATE agent_runs "
        "SET status = 'executing' "
        "WHERE id = ("
        "  SELECT id FROM agent_runs "
        "  WHERE status = 'running' "
        "    AND spawned_by_tool = 'sub_agent_spawn' "
        "  ORDER BY started_at ASC "
        "  FOR UPDATE SKIP LOCKED LIMIT 1"
        ") "
        "RETURNING id, parent_run_id, root_run_id, depth, "
        "          orchestration_mode, providers, task_summary"
    )
    async with get_session() as s:
        row = (await s.execute(sql)).mappings().first()
        if row is None:
            return None
        return dict(row)


async def _mark_terminal(run_id: str, status: str, usage: dict | None = None) -> None:
    from ..database import get_session
    tokens = int((usage or {}).get("total_tokens", 0) or 0)
    cost = float((usage or {}).get("total_cost_usd", 0.0) or 0.0)
    async with get_session() as s:
        await s.execute(
            _sa_text(
                "UPDATE agent_runs "
                "SET status = :st, ended_at = CURRENT_TIMESTAMP, "
                "    total_tokens = :tok, total_cost_usd = :cost "
                "WHERE id = :id"
            ),
            {"st": status, "tok": tokens, "cost": cost, "id": run_id},
        )


def _resolve_provider(providers: Any) -> str:
    """Pick the provider id this row should bind to.

    `providers` may arrive as a JSON-encoded string (older inserts) or
    a list (newer). First entry wins for single-mode. 'active' resolves
    to the system's currently active provider. Empty / malformed input
    raises ValueError — the executor will mark the row failed.
    """
    if isinstance(providers, str):
        try:
            providers = json.loads(providers)
        except json.JSONDecodeError as exc:
            raise ValueError(f"providers field not valid JSON: {exc}") from exc
    if not isinstance(providers, list) or not providers:
        raise ValueError("providers list is empty or wrong shape")
    pid = str(providers[0]).strip()
    if not pid:
        raise ValueError("first provider entry is empty")
    if pid == "active":
        active = energy_registry.get_active_provider()
        if not active:
            raise ValueError("no active provider configured for 'active' binding")
        return active
    return pid


async def _execute_one(row: dict[str, Any]) -> None:
    """Run one claimed spawn row to terminal status. Never raises.

    Exceptions during execution are converted to status='failed' plus
    an 'error' event on the run's log stream. The poller never sees
    them (so a single bad row cannot wedge the loop).
    """
    run_id = row["id"]
    mode = row.get("orchestration_mode") or "single"
    tokens = bind_run(
        run_id=run_id,
        depth=int(row.get("depth") or 0),
        root_run_id=row.get("root_run_id") or run_id,
        parent_run_id=row.get("parent_run_id"),
    )
    logger = get_run_logger()
    try:
        if mode not in _SUPPORTED_MODES:
            raise NotImplementedError(
                f"orchestration_mode={mode!r} not implemented by spawn_executor; "
                f"supported: {sorted(_SUPPORTED_MODES)}"
            )
        provider_id = _resolve_provider(row.get("providers"))
        instance = AgentInstance.from_model(
            model_id=provider_id,
            user_id=None,
            use_tools=True,
            enforce_tier=False,
            enforce_enabled=True,
        )
        messages = [{"role": "user", "content": row.get("task_summary") or ""}]
        content, usage = await instance.run(messages)
        logger.emit(
            "spawn_complete",
            {
                "provider": provider_id,
                "content_preview": (content or "")[:500],
                "usage": usage,
                "mode": mode,
            },
        )
        await _mark_terminal(run_id, "completed", usage)
    except Exception as exc:
        logger.emit(
            "error",
            {
                "stage": "spawn_executor.execute",
                "error_type": type(exc).__name__,
                "error": str(exc)[:500],
            },
            level="ERROR",
        )
        try:
            await _mark_terminal(run_id, "failed")
        except Exception as inner:
            _log.error(
                "[spawn_executor] failed to mark run %s as failed: %s",
                run_id, inner,
            )
    finally:
        reset_run(tokens)
        try:
            from .run_logger import flush as _flush
            await _flush()
        except Exception:
            pass


def _on_inflight_done(task: asyncio.Task) -> None:
    _inflight.discard(task)


async def _poll_loop() -> None:
    """Forever-loop. Claims and dispatches; sleeps when idle.

    Backpressure: when MAX_INFLIGHT is reached we stop claiming new
    rows and wait for any in-flight to finish before claiming again.
    The poller itself never raises; per-iteration exceptions log and
    sleep one cycle.
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
    """Test / introspection helper."""
    return len(_inflight)
# N:M
# 248:14
