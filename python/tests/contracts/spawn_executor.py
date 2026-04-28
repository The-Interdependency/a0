"""Contract tests for python.services.spawn_executor.

Each test is referenced from the CONTRACTS block in
python/services/spawn_executor.py. Run via:

    python -m python.tests.contract_runner

These tests touch the real database; they create uuid-prefixed rows
that they own end-to-end and clean up in finally blocks. No mocking
of the executor itself — _claim_one_pending and _execute_one are
called directly so the tests exercise the same code paths the poller
loop runs in production.
"""
from __future__ import annotations

import asyncio
import json
import uuid

from sqlalchemy import text as _sa_text

from ...database import get_session
from ...services.spawn_executor import (
    _claim_one_pending,
    _execute_one,
    _resolve_provider,
)


async def _insert_pending_row(
    *,
    providers: list[str] | None = None,
    task: str = "test task",
    orchestration_mode: str = "single",
) -> str:
    """Insert a 'running' agent_runs row that the executor will pick up."""
    rid = f"test-spawn-{uuid.uuid4()}"
    async with get_session() as s:
        await s.execute(
            _sa_text(
                "INSERT INTO agent_runs "
                "(id, parent_run_id, root_run_id, depth, status, "
                " orchestration_mode, cut_mode, providers, "
                " spawned_by_tool, task_summary) "
                "VALUES (:id, NULL, :id, 0, 'running', :om, 'soft', "
                "        CAST(:p AS jsonb), 'sub_agent_spawn', :task)"
            ),
            {
                "id": rid,
                "om": orchestration_mode,
                "p": json.dumps(providers or ["__nonexistent_provider__"]),
                "task": task,
            },
        )
    return rid


async def _row_status(run_id: str) -> str | None:
    async with get_session() as s:
        r = await s.execute(
            _sa_text("SELECT status FROM agent_runs WHERE id = :id"),
            {"id": run_id},
        )
        row = r.first()
        return None if row is None else str(row[0])


async def _delete_run(run_id: str) -> None:
    async with get_session() as s:
        await s.execute(
            _sa_text("DELETE FROM agent_logs WHERE run_id = :id"),
            {"id": run_id},
        )
        await s.execute(
            _sa_text("DELETE FROM agent_runs WHERE id = :id"),
            {"id": run_id},
        )


async def test_claim_atomic() -> None:
    """Two concurrent claims of the same set succeed once and return None once."""
    rid = await _insert_pending_row()
    try:
        a, b = await asyncio.gather(_claim_one_pending(), _claim_one_pending())
        # At most one claim returned our specific row id; the other
        # returned None or some other row entirely (in case the test
        # DB has other pending rows). The contract is: our row is
        # claimed at most once.
        ours = [r for r in (a, b) if r and r["id"] == rid]
        assert len(ours) == 1, (
            f"expected exactly one claim of {rid}, got {len(ours)}: a={a}, b={b}"
        )
        status = await _row_status(rid)
        assert status == "executing", f"expected 'executing', got {status!r}"
    finally:
        await _delete_run(rid)


async def test_skips_non_running() -> None:
    """A row with status != 'running' is never claimed by the executor."""
    rid = f"test-spawn-{uuid.uuid4()}"
    async with get_session() as s:
        await s.execute(
            _sa_text(
                "INSERT INTO agent_runs "
                "(id, parent_run_id, root_run_id, depth, status, "
                " orchestration_mode, cut_mode, providers, "
                " spawned_by_tool, task_summary) "
                "VALUES (:id, NULL, :id, 0, 'completed', 'single', 'soft', "
                "        '[\"__nonexistent_provider__\"]'::jsonb, "
                "        'sub_agent_spawn', 'already done')"
            ),
            {"id": rid},
        )
    try:
        # Loop a few times since the test DB may have other pending rows
        # the claim consumes first. We just assert ours is never picked.
        for _ in range(5):
            r = await _claim_one_pending()
            if r is None:
                break
            assert r["id"] != rid, (
                f"completed row {rid} was claimed when it should have been skipped"
            )
        status = await _row_status(rid)
        assert status == "completed", (
            f"row status changed unexpectedly: {status!r} (should still be completed)"
        )
    finally:
        await _delete_run(rid)


async def test_marks_failed_on_exception() -> None:
    """When execution raises, the row is marked 'failed' and the poller continues."""
    rid = await _insert_pending_row(
        providers=["__definitely_not_a_real_provider_xyz__"],
        task="this will fail at provider resolution",
    )
    try:
        # Drain other pending rows until we claim ours (so the test is
        # robust to a noisy DB).
        claimed = None
        for _ in range(20):
            r = await _claim_one_pending()
            if r is None:
                break
            if r["id"] == rid:
                claimed = r
                break
            # Not ours — release it back so the test stays clean
            async with get_session() as s:
                await s.execute(
                    _sa_text(
                        "UPDATE agent_runs SET status = 'running' WHERE id = :id"
                    ),
                    {"id": r["id"]},
                )
        assert claimed is not None, f"never claimed our row {rid}"
        # _execute_one MUST NOT raise — it must catch and mark failed
        await _execute_one(claimed)
        status = await _row_status(rid)
        assert status == "failed", (
            f"expected 'failed' after unresolvable provider, got {status!r}"
        )
        # An error event should exist for this run_id
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "SELECT COUNT(*) FROM agent_logs "
                    "WHERE run_id = :id AND event = 'error'"
                ),
                {"id": rid},
            )
            err_count = int(r.scalar_one() or 0)
        assert err_count >= 1, f"expected ≥1 'error' log row for {rid}, got {err_count}"
    finally:
        await _delete_run(rid)


def test_resolve_provider_rejects_empty() -> None:
    """_resolve_provider raises on empty/malformed input — no silent default."""
    import pytest_style
del None  # noqa


def _smoke_resolve_provider() -> None:
    """Synchronous smoke checks for _resolve_provider (called by the
    other tests via import); not registered as a contract itself."""
    try:
        _resolve_provider([])
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError on empty providers list")
    try:
        _resolve_provider("not a list and not json")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError on malformed providers")


_smoke_resolve_provider()
