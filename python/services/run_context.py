# 70:33 0:0 9:0
# N:M
"""Run-scoped ContextVars for ZFAE recursion tracking.

Every async tool / inference call inherits these vars from its spawning
context (the asyncio default behavior for ContextVar). Sub-agent spawn
re-binds them inside an `asyncio.create_task` so nested spawns see the
right depth and parent_run_id.

NO silent fallback: callers that need a run id must check whether one is
present via `get_current_run_id()` and decide explicitly. The logger
treats absence as "out of band" and logs to the unbound bucket.
"""

# === MODULE_BUILD ===
# id: a0_service_run_context
#   module_name: run_context
#   module_kind: service
#   summary: Run-scoped ContextVars for ZFAE recursion tracking — run id, depth, root/parent run id, and approval-scope user id, inherited by async tool/inference calls and rebound on sub-agent spawn.
#   owner: Erin Spencer
#   public_surface: get_current_run_id, set_approval_scope_user_id, get_approval_scope_user_id, get_current_depth, get_current_root_run_id, get_current_parent_run_id, bind_run, reset_run, snapshot
#   internal_surface: none
#   auth_boundary: holds the approval-scope user id that tools read to scope pre-approved actions
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_run_context.py
#   rollout: default_enabled
#   rollback: Revert this file; recursion tracking reverts to prior ContextVar surface.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import contextvars
from typing import Optional

current_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "a0p_run_id", default=None,
)
current_parent_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "a0p_parent_run_id", default=None,
)
current_root_run_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "a0p_root_run_id", default=None,
)
current_depth: contextvars.ContextVar[int] = contextvars.ContextVar(
    "a0p_depth", default=0,
)
current_cut_mode: contextvars.ContextVar[str] = contextvars.ContextVar(
    "a0p_cut_mode", default="soft",
)
current_orchestration_mode: contextvars.ContextVar[str] = contextvars.ContextVar(
    "a0p_orchestration_mode", default="single",
)
current_user_tier: contextvars.ContextVar[str] = contextvars.ContextVar(
    "a0p_user_tier", default="free",
)
current_max_tool_rounds: contextvars.ContextVar[Optional[int]] = contextvars.ContextVar(
    "a0p_max_tool_rounds", default=None,
)


def get_current_run_id() -> Optional[str]:
    return current_run_id.get()


_approval_scope_user_cv: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "approval_scope_user", default=None,
)


def set_approval_scope_user_id(uid: Optional[str]) -> None:
    _approval_scope_user_cv.set(uid)


def get_approval_scope_user_id() -> Optional[str]:
    return _approval_scope_user_cv.get()


def get_current_depth() -> int:
    return current_depth.get()


def get_current_root_run_id() -> Optional[str]:
    return current_root_run_id.get()


def get_current_parent_run_id() -> Optional[str]:
    return current_parent_run_id.get()


def bind_run(run_id: str, depth: int, root_run_id: str, parent_run_id: Optional[str]) -> dict:
    """Bind a new run scope. Returns the previous tokens so callers can reset."""
    return {
        "run": current_run_id.set(run_id),
        "depth": current_depth.set(depth),
        "root": current_root_run_id.set(root_run_id),
        "parent": current_parent_run_id.set(parent_run_id),
    }


def reset_run(tokens: dict) -> None:
    for k, t in tokens.items():
        try:
            {
                "run": current_run_id,
                "depth": current_depth,
                "root": current_root_run_id,
                "parent": current_parent_run_id,
            }[k].reset(t)
        except Exception:
            pass


def snapshot() -> dict:
    """Return a dict snapshot of every ContextVar — safe to log."""
    return {
        "run_id": current_run_id.get(),
        "parent_run_id": current_parent_run_id.get(),
        "root_run_id": current_root_run_id.get(),
        "depth": current_depth.get(),
        "cut_mode": current_cut_mode.get(),
        "orchestration_mode": current_orchestration_mode.get(),
        "user_tier": current_user_tier.get(),
        "max_tool_rounds": current_max_tool_rounds.get(),
    }
# N:M
# 70:33 0:0 9:0
