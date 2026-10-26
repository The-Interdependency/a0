# 28:7 0:0 0:0
# N:M
# DOC module: tests.test_run_context
# DOC label: Run-context inheritance
# DOC description: ContextVars must inherit through asyncio task spawning so
# nested sub-agent tools see the right depth + parent run id.
import asyncio

from python.services.run_context import (
    bind_run, snapshot, get_current_depth, get_current_run_id,
)


def test_bind_and_snapshot():
    async def _go():
        bind_run(run_id="root", depth=0, root_run_id="root", parent_run_id=None)
        snap = snapshot()
        assert snap["run_id"] == "root"
        assert snap["depth"] == 0

        async def _child():
            bind_run(run_id="c1", depth=1, root_run_id="root", parent_run_id="root")
            return snapshot()

        child = await asyncio.create_task(_child())
        assert child["run_id"] == "c1"
        assert child["depth"] == 1
        # parent context is still root because child mutated its own copy
        assert get_current_run_id() == "root"
        assert get_current_depth() == 0

    asyncio.run(_go())


def test_run_logger_emit_uses_context():
    from python.services.run_logger import get_run_logger, queued_count

    async def _go():
        bind_run(run_id="r2", depth=2, root_run_id="root2", parent_run_id="root2")
        before = queued_count()
        get_run_logger().emit("custom", {"hello": "world"})
        after = queued_count()
        assert after == before + 1

    asyncio.run(_go())
# N:M
# 28:7 0:0 0:0
