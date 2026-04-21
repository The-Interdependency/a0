# N:M
"""sub_agent_spawn — fork a ZFAE sub-agent for a parallel task.

Spawn enforces depth + fanout caps from python.services.spawn_caps and
records a fresh agent_runs row so per-recursion-level logs (agent_logs)
can be attributed to it. The parent's run scope is captured at call time
via ContextVars so nested spawns inherit correctly.

Optional aimmh-lib orchestration knobs (orchestration_mode, providers,
cut_mode) propagate into the new run row; the inference layer reads them
back when the spawned agent's first turn lands.
"""
import json
import uuid

from sqlalchemy import text as _sa_text

from ..run_context import (
    get_current_run_id, get_current_depth, get_current_root_run_id,
    current_user_tier,
)
from ..run_logger import get_run_logger
from ..spawn_caps import check_can_spawn, SpawnCapExceeded, caps_description_tail


SCHEMA = {
    "type": "function",
    "function": {
        "name": "sub_agent_spawn",
        "description": (
            "Spawn a ZFAE sub-agent with a forked PCNA instance to handle a specific task in parallel. "
            "Returns the sub-agent ID and run_id. "
            "Optional knobs: orchestration_mode (single|fan_out|council|daisy_chain|room_synthesized|room_all), "
            "providers (list of provider ids; default ['active']), "
            "cut_mode (off|soft|hard, default 'soft'). "
            "These propagate into the spawned agent's ContextVars so nested spawns inherit unless overridden."
            + caps_description_tail()
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "Description of the task for the sub-agent to execute",
                },
                "orchestration_mode": {
                    "type": "string",
                    "enum": ["single", "fan_out", "council", "daisy_chain", "room_synthesized", "room_all"],
                    "default": "single",
                },
                "providers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Provider ids for multi-model orchestration. Default ['active'].",
                    "default": ["active"],
                },
                "cut_mode": {
                    "type": "string",
                    "enum": ["off", "soft", "hard"],
                    "default": "soft",
                },
            },
            "required": ["task"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "agent",
    "cost_hint": "low",
    "side_effects": [],
    "version": 2,
}


async def handle(
    task: str = "",
    orchestration_mode: str = "single",
    providers: list[str] | None = None,
    cut_mode: str = "soft",
    **_,
) -> str:
    providers = providers or ["active"]
    parent_run_id = get_current_run_id()
    parent_depth = get_current_depth()
    parent_root = get_current_root_run_id()
    tier = current_user_tier.get()
    logger = get_run_logger()

    try:
        caps = await check_can_spawn(parent_run_id, parent_depth, tier)
    except SpawnCapExceeded as exc:
        logger.emit(
            "cap_hit",
            {
                "cap": exc.cap, "current": exc.current,
                "limit": exc.limit, "tier": exc.tier,
            },
            level="WARN",
        )
        try:
            from ..run_logger import flush as _flush
            await _flush()
        except Exception:
            pass
        return json.dumps({
            "ok": False, "error": "spawn_cap_exceeded",
            "cap": exc.cap, "current": exc.current, "limit": exc.limit,
            "tier": exc.tier,
        })

    new_run_id = str(uuid.uuid4())
    root_run_id = parent_root or new_run_id
    new_depth = parent_depth + 1
    agent_id = f"a0z-{new_run_id[:8]}"
    try:
        from ...database import get_session
        async with get_session() as s:
            await s.execute(
                _sa_text(
                    "INSERT INTO agent_runs "
                    "(id, parent_run_id, root_run_id, depth, status, "
                    "orchestration_mode, cut_mode, providers, spawned_by_tool, task_summary) "
                    "VALUES (:id, :pid, :root, :depth, 'running', :om, :cm, "
                    "CAST(:providers AS jsonb), 'sub_agent_spawn', :task)"
                ),
                {
                    "id": new_run_id, "pid": parent_run_id, "root": root_run_id,
                    "depth": new_depth, "om": orchestration_mode, "cm": cut_mode,
                    "providers": json.dumps(providers), "task": (task or "")[:2000],
                },
            )
    except Exception as exc:
        logger.emit("error", {"stage": "insert_run", "error": str(exc)}, level="ERROR")
    logger.emit(
        "spawn_start",
        {
            "agent_id": agent_id, "new_run_id": new_run_id,
            "depth": new_depth, "orchestration_mode": orchestration_mode,
            "providers": providers, "cut_mode": cut_mode, "tier": tier,
            "caps": caps,
        },
    )
    return json.dumps({
        "agent_id": agent_id,
        "run_id": new_run_id,
        "parent_run_id": parent_run_id,
        "root_run_id": root_run_id,
        "depth": new_depth,
        "task": task,
        "orchestration_mode": orchestration_mode,
        "providers": providers,
        "cut_mode": cut_mode,
        "status": "spawned",
        "note": "Sub-agent forked PCNA — call sub_agent_merge with run_id when complete",
    })
# N:M
