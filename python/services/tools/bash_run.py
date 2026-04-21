# N:M
"""bash_run — run a shell command. Admin-only, gated behind code_self_modify.

This tool is the foundation for ZFAE self-modification. It is intentionally
ungated *only* by an explicit user grant of the `code_self_modify` approval
scope. Without that grant in the active ContextVar, every invocation
returns a refusal — never silently runs.
"""
import asyncio
import json
import os
from typing import Optional

from ..run_context import _approval_scope_user_cv

SCHEMA = {
    "type": "function",
    "function": {
        "name": "bash_run",
        "description": (
            "Run a shell command from the project root and return "
            "{stdout, stderr, exit_code, duration_ms}. Admin-only. "
            "Requires the active user to have granted the 'code_self_modify' "
            "approval scope; without that grant the tool refuses to execute. "
            "Default timeout 60s; cap 300s. NEVER use this for destructive "
            "git operations — those go through Project Tasks."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (single string).",
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Per-command wallclock timeout. Default 60, max 300.",
                    "default": 60,
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory (relative to repo root). Default '.'.",
                    "default": ".",
                },
            },
            "required": ["command"],
        },
    },
    "tier": "admin",
    "approval_scope": "code_self_modify",
    "enabled": True,
    "category": "system",
    "cost_hint": "medium",
    "side_effects": ["filesystem", "irreversible"],
    "version": 1,
}


async def _check_grant() -> Optional[str]:
    user_id = _approval_scope_user_cv.get()
    if not user_id:
        return "[bash_run: no user_id bound — refusing]"
    try:
        from ...storage import storage
        scopes = await storage.get_approval_scope_names(user_id)
    except Exception as exc:
        return f"[bash_run: failed to verify approval scopes: {exc!s}]"
    if "code_self_modify" not in scopes:
        return (
            "[bash_run: user has not granted 'code_self_modify' scope. "
            "Use manage_approval_scope to grant before retry.]"
        )
    return None


async def handle(command: str = "", timeout_seconds: int = 60, cwd: str = ".", **_) -> str:
    refusal = await _check_grant()
    if refusal:
        return refusal
    if not command:
        return "[bash_run: command required]"
    timeout_seconds = max(1, min(int(timeout_seconds or 60), 300))
    base = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    )
    safe_cwd = os.path.normpath(os.path.join(base, cwd or "."))
    if not safe_cwd.startswith(base):
        return "[bash_run: cwd escapes project root — refused]"
    import time as _t
    t0 = _t.perf_counter()
    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=safe_cwd,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout_seconds,
        )
        rc = proc.returncode
    except asyncio.TimeoutError:
        return json.dumps({
            "ok": False,
            "stage": "timeout",
            "command": command,
            "timeout_seconds": timeout_seconds,
        })
    dur_ms = int((_t.perf_counter() - t0) * 1000)
    return json.dumps({
        "ok": rc == 0,
        "command": command,
        "cwd": cwd,
        "exit_code": rc,
        "duration_ms": dur_ms,
        "stdout": stdout.decode("utf-8", errors="replace")[:8192],
        "stderr": stderr.decode("utf-8", errors="replace")[:8192],
    })
# N:M
