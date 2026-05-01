# 694:328
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
#
# id: spawn_executor_resolve_provider_rejects_empty
#   given: an empty list or malformed providers value
#   then:  _resolve_provider raises ValueError (no silent default-to-active)
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty
#
# id: spawn_executor_snapshot_pcna_shape
#   given: a primary-shaped PCNAEngine instance
#   then:  _snapshot_pcna returns the four delta-tracked floats/ints
#          (phi, psi, omega, theta_circles); types and ordering are
#          stable so log consumers can subtract before/after dicts
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_snapshot_pcna_shape
#
# id: spawn_executor_merge_helpers_tolerate_no_pcna
#   given: a missing primary PCNA (cold-start or test bootstrap)
#   then:  _try_get_primary_pcna returns None and _retire_fork_quietly
#          returns without raising — degraded mode never crashes the
#          executor, satisfying the no-silent-fallback rule by routing
#          the absence into a 'pcna_fork_skipped' log event instead of
#          masking it as success
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna
#
# id: spawn_executor_bandit_round_trip
#   given: a parent PCNA with empty bandit_state and the 'bandit' sentinel
#   then:  _resolve_provider picks an auto-selectable arm onto
#          parent.bandit_state['provider'], and _record_bandit_reward
#          increments pulls + shifts avg_reward — no bandit_arms touch
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_bandit_round_trip
#
# id: spawn_executor_bandit_skips_human_only
#   given: a candidate pool containing only a human-only provider id
#   then:  _resolve_provider raises ValueError — the cost gate prevents
#          UCB1's first-pass exploration from hitting the expensive tier
#   class: security
#   call:  python.tests.contracts.spawn_executor.test_bandit_skips_human_only
#
# id: spawn_executor_bandit_state_round_trips_through_checkpoint
#   given: a bandit arm with a datetime last_pulled field
#   then:  _arm_to_json / _arm_from_json round-trip cleanly so PCNA's
#          save_checkpoint / load_checkpoint can persist bandit_state
#          across restarts; missing fields default safely
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_bandit_state_round_trips_through_checkpoint
#
# id: spawn_executor_heartbeat_advances
#   given: an 'executing' agent_runs row and the _heartbeat_loop running
#   then:  last_heartbeat_at strictly advances after a few interval ticks;
#          this is what lets the stale-sweep distinguish slow from dead
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_heartbeat_advances
#
# id: spawn_executor_stale_sweep_marks_worker_lost
#   given: an 'executing' row with last_heartbeat_at older than 2× the
#          heartbeat interval, plus a fresh row with a current heartbeat
#   then:  _reap_stale_claims marks ONLY the stale row failed/worker_lost;
#          the fresh row is untouched (no false positives)
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost
#
# id: spawn_executor_retry_once_on_transient
#   given: a row with retry_policy='once_on_transient', retry_count=0,
#          failing with a TimeoutError (transient)
#   then:  _maybe_schedule_retry returns True, the row goes back to
#          'running' with retry_count=1; a second failure on the same
#          row does NOT retry again (one-shot cap, never loops)
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_retry_once_on_transient
#
# id: spawn_executor_retry_default_none
#   given: retry_policy='none' OR a non-transient exception under
#          retry_policy='once_on_transient'
#   then:  _maybe_schedule_retry returns False — the failure remains
#          terminal and is mark_terminal'd as 'failed' by the caller
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_retry_default_none
#
# id: spawn_executor_concurrent_live_cap
#   given: 20 live registry entries under a single parent_run_id (admin
#          tier max_concurrent_live=20)
#   then:  check_can_spawn raises SpawnCapExceeded with cap='concurrent_live'
#          (not depth or fanout) — the third dimension catches
#          spawn-merge-spawn loops that depth/fanout would not see
#   class: security
#   call:  python.tests.contracts.spawn_executor.test_concurrent_live_cap
#
# id: spawn_executor_no_orphan_invariant
#   given: a registry entry whose run_id has no DB row, AND a DB
#          'executing' row owned by THIS WORKER_ID with no registry entry
#   then:  check_no_orphan_invariant flags both as orphans and reports
#          ok=False; the worker_id field is set to this process's id
#   class: correctness
#   call:  python.tests.contracts.spawn_executor.test_no_orphan_invariant
# === END CONTRACTS ===
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import json
import logging
import os
import uuid
from typing import Any, Optional

from sqlalchemy import text as _sa_text

from . import bandit as _bandit
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

# Task #122 — supervision constants. Heartbeat advances every
# HEARTBEAT_INTERVAL_S seconds while a row is executing. The stale-
# claim sweep marks rows whose heartbeat is older than 2 ×
# HEARTBEAT_INTERVAL_S as failed/worker_lost. WORKER_ID is per-process
# so multi-process deployments (a future task) can attribute claims
# unambiguously; today only one process touches the queue.
HEARTBEAT_INTERVAL_S = float(os.environ.get("A0P_HEARTBEAT_INTERVAL_S", "15"))
STALE_SWEEP_INTERVAL_S = float(os.environ.get("A0P_STALE_SWEEP_INTERVAL_S", "60"))
WORKER_ID = f"{os.getpid()}-{uuid.uuid4().hex[:8]}"

# Transient classifier for retry_policy='once_on_transient'. Kept small
# and explicit — anything that isn't obviously a network/provider blip
# stays a hard failure (no silent infinite-retry loops).
_TRANSIENT_EXC_NAMES = frozenset({
    "timeouterror",
    "asynciotimeouterror",
    "connectionerror",
    "connectionreseterror",
    "connectionrefusederror",
    "remotedisconnected",
    "incompleteread",
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
    for kw in _TRANSIENT_KEYWORDS:
        if kw in msg:
            return True
    return False


# Modes the executor is willing to drive end-to-end. Anything else
# raises NotImplementedError per the no-silent-fallback doctrine.
_SUPPORTED_MODES = frozenset({"single"})


async def _claim_one_pending() -> Optional[dict[str, Any]]:
    """Atomically claim one running spawn row. Returns row dict or None.

    SKIP LOCKED so multiple poller instances coexist; the WHERE clause
    is constrained to spawned_by_tool='sub_agent_spawn' so root-agent
    runs (which are written by other code paths) are not picked up.

    Task #122: the claim also stamps `worker_id` and seeds
    `last_heartbeat_at` so the stale-sweep loop has a baseline timer
    even if the heartbeat task hasn't yet ticked. retry_policy /
    retry_count are returned so the failure path can decide whether to
    re-mark the row 'running' instead of 'failed'.
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
        if row is None:
            return None
        return dict(row)


async def _heartbeat_loop(run_id: str, interval_s: float = HEARTBEAT_INTERVAL_S) -> None:
    """Update agent_runs.last_heartbeat_at for `run_id` every interval_s.

    Cancelled by `_execute_one`'s finally block on completion / failure.
    Single-row UPDATE is logged-and-swallowed if it raises so a flaky
    DB never propagates into the worker. The first tick happens AFTER
    interval_s elapses — the claim already seeds last_heartbeat_at, so
    a too-short-lived run still has an accurate timestamp.
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
                _log.warning(
                    "[spawn_executor] heartbeat update failed for %s: %s",
                    run_id, exc,
                )
    except asyncio.CancelledError:
        return


async def _persist_resolved_provider(
    run_id: str,
    provider_id: str,
    *,
    bandit_pull: Optional[dict] = None,
) -> None:
    """Persist the resolved provider AND, when present, the bandit pull
    metadata onto the agent_runs row. A crash between fork and merge
    leaves an unambiguous record of what arm was pulled, on which
    domain, with what UCB score and pulls_before — so a recovery job
    can reattribute the reward without guessing.
    """
    try:
        from ..database import get_session
        async with get_session() as s:
            await s.execute(
                _sa_text(
                    "UPDATE agent_runs "
                    "SET providers = CAST(:p AS jsonb), "
                    "    bandit_pull = CAST(:bp AS jsonb) "
                    "WHERE id = :id"
                ),
                {
                    "p": json.dumps([provider_id]),
                    "bp": json.dumps(bandit_pull) if bandit_pull else None,
                    "id": run_id,
                },
            )
    except Exception as exc:
        _log.warning(
            "[spawn_executor] could not persist resolved provider on %s: %s",
            run_id, exc,
        )


async def _mark_terminal(
    run_id: str,
    status: str,
    usage: dict | None = None,
    *,
    failure_reason: str | None = None,
) -> None:
    """Set the final state on a row. failure_reason is only written when
    provided so success paths leave it NULL — operators reading the DB
    can grep for non-null failure_reason to find every reaped row."""
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
    """If retry_policy permits and `exc` looks transient, re-mark the row
    'running' and bump retry_count; the poll loop will pick it up again.
    Returns True iff the retry was scheduled (caller skips _mark_terminal).
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
                    "SET status = 'running', "
                    "    retry_count = retry_count + 1, "
                    "    worker_id = NULL, "
                    "    last_heartbeat_at = CURRENT_TIMESTAMP "
                    "WHERE id = :id "
                    "  AND retry_count = 0 "
                    "  AND status IN ('executing', 'running') "
                    "RETURNING id"
                ),
                {"id": run_id},
            )
            scheduled = r.first() is not None
    except Exception as inner:
        _log.error(
            "[spawn_executor] retry-schedule UPDATE failed for %s: %s",
            run_id, inner,
        )
        return False
    if not scheduled:
        return False
    try:
        get_run_logger().emit(
            "retry_scheduled",
            {
                "run_id": run_id,
                "policy": retry_policy,
                "error_type": type(exc).__name__,
                "error": str(exc)[:200],
            },
            level="WARN",
        )
    except Exception:
        pass
    return True


# Both sentinels go through the bandit; explicit provider ids bypass it.
_SENTINEL_ACTIVE = "active"
_SENTINEL_BANDIT = "bandit"
_AUTO_SENTINELS = frozenset({_SENTINEL_ACTIVE, _SENTINEL_BANDIT})


def _candidate_provider_ids() -> list[str]:
    """Available providers for the bandit pool (env keys present)."""
    return [s["id"] for s in energy_registry.list_providers() if s.get("available")]


def _resolve_provider(
    providers: Any,
    *,
    parent_pcna: Any = None,
) -> tuple[str, Optional[dict]]:
    """Resolve providers field → (provider_id, chosen_arm_or_None).

    Sentinels "active" and "bandit" both run UCB1 over the cost-gated
    candidate pool ("active" = single-arm over the active provider).
    Explicit provider ids bypass the bandit. Malformed input raises.
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

    if pid in _AUTO_SENTINELS:
        # Both "active" and "bandit" are bandit-driven learning paths.
        # "active" narrows the candidate pool to just the active
        # provider (1-arm bandit — still records reward history);
        # "bandit" considers every auto-selectable provider.
        if parent_pcna is None:
            raise ValueError(
                f"{pid!r} selector requires a reachable parent PCNA "
                f"(bandit_state lives on the PCNA core)"
            )
        if pid == _SENTINEL_ACTIVE:
            active = energy_registry.get_active_provider()
            if not active:
                raise ValueError("no active provider configured for 'active' binding")
            candidates = [active]
        else:
            candidates = _candidate_provider_ids()
            if not candidates:
                raise ValueError(
                    "'bandit' selector found no available providers"
                )
        arms = parent_pcna.bandit_state.setdefault("provider", [])
        chosen = _bandit.select_filtered(
            arms,
            candidates,
            is_eligible=energy_registry.is_auto_selectable,
        )
        if chosen is None:
            # Cost gate filtered everything out — surface the cause
            # rather than mark the row failed with a generic error.
            raise ValueError(
                f"{pid!r} selector: every candidate is human-only "
                f"(cost above gpt-5.5 baseline). Spawn explicitly "
                f"with a non-flagged provider id."
            )
        return str(chosen["arm_id"]), chosen

    # Explicit provider id — the caller's choice IS the human
    # instantiation event; cost gate does not apply.
    return pid, None


def _compute_cost_usd(provider_id: str, usage: Optional[dict]) -> float:
    """Real USD cost from a provider usage dict using pricing.json.

    Returns 0.0 when usage is missing or pricing is unknown — the
    bandit's cost floor (_MIN_COST_USD) handles the divide-by-zero;
    callers can detect the gap by reading usage themselves.
    """
    if not usage:
        return 0.0
    try:
        cb = energy_registry.cache_breakdown(usage)
        return float(energy_registry.estimate_cost(
            provider_id,
            cb.get("fresh_input", 0),
            cb.get("output", 0),
            cb.get("cache_read", 0),
            cb.get("cache_write", 0),
        ))
    except Exception as exc:
        _log.warning("[spawn_executor] cost estimation failed: %s", exc)
        return 0.0


async def _record_bandit_reward(
    parent_pcna: Any,
    arm: Optional[dict],
    *,
    delta: dict,
    cost_usd: float,
    total_tokens: int,
    spawn_id: str,
    shape: str = _bandit.DEFAULT_REWARD_SHAPE,
) -> Optional[dict]:
    """Update chosen arm + AWAIT bandit_pulls audit insert + checkpoint PCNA."""
    if arm is None or parent_pcna is None:
        return None
    try:
        reward = _bandit.compute_reward(
            delta, cost_usd=cost_usd, total_tokens=total_tokens, shape=shape,
        )
    except Exception as exc:
        _log.warning("[spawn_executor] reward compute failed: %s", exc)
        return None

    arm = _bandit.update_arm_stats(arm, reward)
    arm_id = str(arm.get("arm_id", ""))
    payload = {
        "domain": "provider",
        "arm_id": arm_id,
        "reward": reward,
        "shape": shape,
        "cost_usd": float(cost_usd),
        "pulls_after": int(arm.get("pulls", 0)),
        "avg_reward_after": float(arm.get("avg_reward", 0.0)),
        "ema_reward_after": float(arm.get("ema_reward", 0.0)),
    }
    pcna_id = getattr(parent_pcna.theta, "instance_id", "unknown")
    audit_ok = await _append_bandit_pull(
        spawn_id=spawn_id, parent_pcna_id=pcna_id, domain="provider",
        arm_id=arm_id, reward=reward, shape=shape, cost_usd=cost_usd,
    )
    payload["audit_persisted"] = audit_ok
    # Persist updated bandit_state so a restart between merge and the
    # next fork does not lose this learning event.
    try:
        await parent_pcna.save_checkpoint()
        payload["checkpoint_persisted"] = True
    except Exception as exc:
        _log.error("[spawn_executor] PCNA checkpoint save failed: %s", exc)
        payload["checkpoint_persisted"] = False
    return payload


async def _append_bandit_pull(
    *, spawn_id: str, parent_pcna_id: str, domain: str,
    arm_id: str, reward: float, shape: str, cost_usd: float,
) -> bool:
    """Awaited INSERT into bandit_pulls; True on success, False on failure
    (logged). The merge still completes either way — the in-memory PCNA
    update is the source of truth for the next pull."""
    try:
        from ..database import get_session
        async with get_session() as s:
            await s.execute(
                _sa_text(
                    "INSERT INTO bandit_pulls "
                    "(spawn_id, parent_pcna_id, domain, arm_id, reward, "
                    " reward_shape, cost_usd) "
                    "VALUES (:sid, :pid, :dom, :aid, :rw, :sh, :cu)"
                ),
                {"sid": spawn_id, "pid": parent_pcna_id, "dom": domain,
                 "aid": arm_id, "rw": float(reward), "sh": shape,
                 "cu": float(cost_usd)},
            )
        return True
    except Exception as exc:
        _log.error("[spawn_executor] bandit_pulls INSERT failed: %s", exc)
        return False


def _snapshot_pcna(p) -> dict:
    """Capture the four observable PCNA quantities used as merge deltas.

    Cheap — reads four floats off in-memory ring state. Safe to call on
    the same PCNA before and after absorb to compute the learning gain.
    """
    return {
        "phi": round(float(p.phi.ring_coherence), 6),
        "psi": round(float(p.psi.ring_coherence), 6),
        "omega": round(float(p.omega.ring_coherence), 6),
        "theta_circles": int(p.theta.circle_count.mean()),
    }


def _try_get_primary_pcna() -> tuple[Any, Optional[str]]:
    """Return (primary_pcna_or_None, error_or_None).

    Lazy import from ``python.main`` (where the singleton lives) so this
    module stays importable during early bootstrap and so the lazy import
    cleanly breaks the main↔services cycle. The two-value return surfaces
    *why* the PCNA was unreachable rather than collapsing into a silent
    None — callers log the reason so a real bug never masquerades as a
    benign 'primary unavailable' skip.
    """
    try:
        from ..main import get_pcna
    except Exception as exc:
        return None, f"import_failed: {type(exc).__name__}: {exc}"[:200]
    try:
        p = get_pcna()
    except Exception as exc:
        return None, f"call_failed: {type(exc).__name__}: {exc}"[:200]
    if p is None:
        return None, "get_pcna_returned_none"
    return p, None


def _retire_fork_quietly(parent_pcna, sub_name: str) -> None:
    """Best-effort fork cleanup for failure paths. Never raises."""
    if not sub_name or parent_pcna is None:
        return
    try:
        from .agent_lifecycle import merge_sub_agent
        merge_sub_agent(parent_pcna, sub_name)
    except Exception:
        pass


async def _execute_one(row: dict[str, Any]) -> None:
    """Run one claimed spawn row to terminal status. Never raises.

    Lifecycle (single mode):
      1. Bind run-scoped ContextVars from the row.
      2. Fork a child PCNA from the primary (if reachable). The fork
         carries the parent's full ring topology — the sub-agent's work
         updates THIS state, not the primary's.
      3. Construct an AgentInstance against the row's declared provider
         and run one inference turn with the row's task_summary.
      4. Feed the task and the model response into child.infer() so the
         child PCNA accumulates observations from the work just done.
      5. Snapshot parent state, absorb the child back into the parent,
         snapshot again — log the merge event with full before/after/delta
         payload so the user can SEE alpha echo's learning gain.
      6. Mark the row terminal (completed | failed). On any failure the
         fork is best-effort retired so it doesn't leak in _sub_agents.

    Exceptions during execution are converted to status='failed' plus
    an 'error' event on the run's log stream. The poller never sees
    them (so a single bad row cannot wedge the loop).
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
    chosen_arm: Optional[dict] = None
    # Task #122 — heartbeat task. Started before any work begins so even
    # a hung early step (e.g. provider resolution stuck on DNS) keeps
    # advancing last_heartbeat_at long enough to distinguish "slow" from
    # "dead". Cancelled in finally so it never outlives execution.
    heartbeat_task = asyncio.create_task(
        _heartbeat_loop(run_id),
        name=f"spawn_hb_{run_id[:8]}",
    )
    try:
        if mode not in _SUPPORTED_MODES:
            raise NotImplementedError(
                f"orchestration_mode={mode!r} not implemented by spawn_executor; "
                f"supported: {sorted(_SUPPORTED_MODES)}"
            )

        # ---- (2) fork child PCNA from primary -------------------------
        # Parent PCNA must resolve first so the bandit sentinel can read
        # parent.bandit_state. Resolution may raise (cost-gate failure);
        # the row is then marked failed in the outer except.
        parent_pcna, pcna_err = _try_get_primary_pcna()
        provider_id, chosen_arm = _resolve_provider(
            row.get("providers"),
            parent_pcna=parent_pcna,
        )
        if chosen_arm is not None:
            # Capture the pull metadata (domain, arm, ucb, pulls_before,
            # parent_pcna_id) so a crash before merge does not lose
            # the attribution chain. Persisted on agent_runs.bandit_pull
            # in the same UPDATE that resolves providers.
            pull_meta = {
                "domain": "provider",
                "arm_id": chosen_arm.get("arm_id"),
                "pulls_before": int(chosen_arm.get("pulls", 0)),
                "ucb_score": chosen_arm.get("ucb_score"),
                "parent_pcna_id": (
                    getattr(parent_pcna.theta, "instance_id", "unknown")
                    if parent_pcna is not None else None
                ),
            }
            await _persist_resolved_provider(
                run_id, provider_id, bandit_pull=pull_meta,
            )
            logger.emit("custom", {"phase": "bandit_pull", **pull_meta})
        if parent_pcna is not None:
            try:
                from .agent_lifecycle import spawn_sub_agent
                # Task #122 — pass parent_run_id and run_id so the
                # registry entry can be reconciled against agent_runs
                # rows (no-orphan contract) and counted by the
                # concurrent-live cap (spawn_caps.max_concurrent_live).
                fork_info = spawn_sub_agent(
                    parent_pcna,
                    provider=provider_id,
                    parent_run_id=parent_run_id,
                    run_id=run_id,
                )
                sub_name = fork_info.get("sub_agent_name")
                logger.emit("custom", {"phase": "pcna_fork", **fork_info})
            except Exception as exc:
                logger.emit("error", {
                    "stage": "pcna_fork",
                    "error": str(exc)[:300],
                })
                sub_name = None
        else:
            # explicit, not silent — the reason is logged so a genuine
            # bug here surfaces in the run stream instead of presenting
            # as a benign skip
            logger.emit("error", {
                "stage": "pcna_fork_skipped",
                "reason": pcna_err or "primary_pcna_unreachable",
            })

        # ---- (3) inference --------------------------------------------
        instance = AgentInstance.from_model(
            model_id=provider_id,
            user_id=None,
            use_tools=True,
            enforce_tier=False,
            enforce_enabled=True,
        )
        messages = [{"role": "user", "content": row.get("task_summary") or ""}]
        content, usage = await instance.run(messages)

        # ---- (4) feed observations to child PCNA ----------------------
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
                logger.emit("error", {
                    "stage": "child_infer",
                    "error": str(exc)[:300],
                })

        # ---- (5) absorb child back into parent ------------------------
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
                    "theta_circles_delta": (
                        after["theta_circles"] - before["theta_circles"]
                    ),
                }
                # Task #112 — fork=pull, merge=reward. Cost is computed
                # from provider pricing (not a missing usage["total_cost_usd"]
                # field), so coherence_per_dollar is actually cost-aware.
                cost_usd = _compute_cost_usd(provider_id, usage)
                total_tokens = int((usage or {}).get("total_tokens", 0) or 0)
                bandit_reward_payload = await _record_bandit_reward(
                    parent_pcna,
                    chosen_arm,
                    delta=delta,
                    cost_usd=cost_usd,
                    total_tokens=total_tokens,
                    spawn_id=run_id,
                )

                merge_payload = {
                    "sub_agent_name": sub_name,
                    "provider": provider_id,
                    "before": before,
                    "after": after,
                    "delta": delta,
                    "bandit": bandit_reward_payload,
                    **absorb_result,
                }
                sub_name = None  # ownership transferred — fork retired by absorb
                logger.emit("merge", merge_payload)
            except Exception as exc:
                logger.emit("error", {
                    "stage": "pcna_merge",
                    "error": str(exc)[:300],
                })

        logger.emit("spawn_complete", {
            "provider": provider_id,
            "content_preview": (content or "")[:500],
            "usage": usage,
            "mode": mode,
            "merge": merge_payload,
        })
        await _mark_terminal(run_id, "completed", usage)
    except Exception as exc:
        logger.emit("error", {
            "stage": "spawn_executor.execute",
            "error_type": type(exc).__name__,
            "error": str(exc)[:500],
        }, level="ERROR")
        # Task #122 — retry policy. If row was spawned with
        # retry_policy='once_on_transient', retry_count=0, and the
        # exception classifies as transient, re-mark 'running' instead
        # of 'failed'. Capped at one retry — never loops.
        retried = False
        try:
            retried = await _maybe_schedule_retry(
                run_id,
                str(row.get("retry_policy") or "none"),
                int(row.get("retry_count") or 0),
                exc,
            )
        except Exception as inner:
            _log.error(
                "[spawn_executor] retry scheduler raised for %s: %s",
                run_id, inner,
            )
            retried = False
        if not retried:
            try:
                await _mark_terminal(
                    run_id, "failed",
                    failure_reason=f"executor:{type(exc).__name__}",
                )
            except Exception as inner:
                _log.error(
                    "[spawn_executor] failed to mark run %s as failed: %s",
                    run_id, inner,
                )
    finally:
        # Task #122 — stop the heartbeat task before we release the row.
        # cancel() then await with shield so a slow shutdown doesn't
        # leave the loop running past the final terminal UPDATE.
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


# ---- Task #122: stale-claim sweep ---------------------------------------
#
# A worker that crashes mid-execution leaves an `agent_runs` row stuck
# in 'executing'. The sweep finds rows whose last_heartbeat_at is older
# than 2 × HEARTBEAT_INTERVAL_S and marks them failed/worker_lost. The
# loop is owned by main.py's lifespan (via bg_tasks.spawn).


async def _reap_stale_claims(
    heartbeat_interval_s: float = HEARTBEAT_INTERVAL_S,
) -> list[dict]:
    """Single sweep pass. Returns the list of reaped rows (may be empty).

    Public-ish so the contract test can drive it deterministically. The
    forever-loop wrapper (`_stale_sweep_loop`) just calls this on a
    timer and emits a log entry per reaped row.
    """
    stale_secs = max(2.0 * float(heartbeat_interval_s), 30.0)
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(seconds=stale_secs)
    from ..database import get_session
    async with get_session() as s:
        r = await s.execute(
            _sa_text(
                "UPDATE agent_runs "
                "SET status = 'failed', "
                "    failure_reason = 'worker_lost', "
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
    """Emit a structured 'worker_lost_reaped' event on the reaped run's
    own log stream so the SSE tail and `/api/v1/runs/{id}` reflect why
    the row went terminal. Best-effort — never raises."""
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

    Like _poll_loop, this never raises; per-iteration exceptions log
    and sleep one cycle. Owned by main.py lifespan.
    """
    while True:
        try:
            await asyncio.sleep(sweep_interval_s)
            reaped = await _reap_stale_claims(heartbeat_interval_s)
            for row in reaped:
                _log.warning(
                    "[spawn_executor] worker_lost_reaped run=%s worker=%s "
                    "last_heartbeat_at=%s",
                    row["id"], row.get("worker_id"),
                    row.get("last_heartbeat_at"),
                )
                await _emit_worker_lost_event(row)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.exception(
                "[spawn_executor] stale-sweep iteration failed: %s", exc,
            )


# ---- Task #122: no-orphan invariant -------------------------------------


async def check_no_orphan_invariant() -> dict:
    """Reconcile in-memory _sub_agents registry with agent_runs DB rows.

    Returns a dict with:
      * registry_orphans — registry entries whose run_id has no row in
        ('running', 'executing'). These are the *true* leaks.
      * worker_orphans   — agent_runs rows owned by THIS WORKER_ID in
        ('running', 'executing') with no matching registry entry.
      * registry_count, db_executing_count — for sanity / dashboards.

    Does NOT mutate either side; this is a read-only invariant probe
    used by the contract test and by future ops tooling.
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

    # (a) registry → DB: every registry entry with a run_id must have a
    #     matching row in a compatible status.
    registry_orphans = []
    for entry in snap:
        rid = entry.get("run_id")
        if not rid:
            # Admin-spawned children have no run row; not an orphan.
            continue
        row = live_by_id.get(rid)
        if row is None:
            registry_orphans.append({
                "name": entry["name"],
                "run_id": rid,
                "parent_run_id": entry.get("parent_run_id"),
                "reason": "no_matching_agent_runs_row",
            })

    # (b) DB → registry: every executing row owned by THIS worker must
    #     have a registry entry.
    worker_orphans = []
    for row in live_rows:
        if row.get("status") != "executing":
            continue
        if row.get("worker_id") != WORKER_ID:
            continue
        if row["id"] not in snap_run_ids:
            worker_orphans.append({
                "id": row["id"],
                "worker_id": row.get("worker_id"),
                "reason": "no_registry_entry_on_this_worker",
            })

    return {
        "registry_count": len(snap),
        "db_executing_count": sum(
            1 for r in live_rows if r.get("status") == "executing"
        ),
        "registry_orphans": registry_orphans,
        "worker_orphans": worker_orphans,
        "ok": not registry_orphans and not worker_orphans,
        "worker_id": WORKER_ID,
    }
# N:M
# 694:328
