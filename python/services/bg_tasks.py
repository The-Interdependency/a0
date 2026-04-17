# 60:0
"""Managed background task registry.

Wraps `asyncio.create_task` so that:
- Tasks are tracked (preventing premature GC of fire-and-forget coroutines).
- Exceptions are logged instead of silently swallowed.
- Done tasks remove themselves from the registry.
- A coroutine factory `cancel_all` is exposed for shutdown integration.
"""
import asyncio
import logging
import traceback
from typing import Coroutine, Set

_log = logging.getLogger("a0p.bg_tasks")
_tasks: Set[asyncio.Task] = set()


def spawn(coro: Coroutine, name: str | None = None) -> asyncio.Task:
    """Schedule a coroutine as a tracked background task.

    The returned task will:
    - Be retained until completion (added to a module-level set).
    - Log any exception via the standard logger.
    - Auto-remove itself from the registry on done.
    """
    task = asyncio.create_task(coro, name=name)
    _tasks.add(task)
    task.add_done_callback(_on_done)
    return task


def _on_done(task: asyncio.Task) -> None:
    _tasks.discard(task)
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        _log.error(
            "[bg_tasks] background task %s failed: %s\n%s",
            task.get_name(),
            exc,
            tb,
        )


async def cancel_all(timeout: float = 5.0) -> None:
    """Cancel all in-flight tasks; intended for graceful shutdown."""
    if not _tasks:
        return
    pending = list(_tasks)
    for t in pending:
        t.cancel()
    try:
        await asyncio.wait(pending, timeout=timeout)
    except Exception:
        pass


def active_count() -> int:
    return len(_tasks)
# 60:0
