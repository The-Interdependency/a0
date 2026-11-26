# ratios: loc_comments=41:12 imports_exports=4:3 calls_definitions=16:4
"""Root pre-start gate for vm-mcp.service: shell profiles need Yama ptrace_scope >= 1.

Usage (unit): ExecStartPre=+/opt/vm-mcp/.venv/bin/python -I /opt/vm-mcp/yama_gate.py
The ``+`` prefix runs this as root outside the unit's sandbox, where
ProcSubset=pid does not hide /proc/sys. Exit 0 lets systemd start server.py;
any other exit stops the start, so the server never receives its token fd.

systemd applies StandardInput= to every executed process, ExecStartPre=
included, and opens file:/etc/credstore/vm-mcp-token separately for each one.
This gate therefore also starts with the token file on fd 0; it never reads it
and replaces fd 0 with /dev/null first thing.
"""
from __future__ import annotations

import os
import sys

YAMA_PTRACE_SCOPE = "/proc/sys/kernel/yama/ptrace_scope"
# Tests only: honoured solely for a non-root caller, so it can never weaken
# the real gate (which systemd runs as root).
TEST_SCOPE_PATH_ENV = "VM_MCP_TEST_YAMA_SCOPE_PATH"


def _detach_stdin() -> None:
    null = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null, 0)
    os.close(null)


def scope_path() -> str:
    override = os.environ.get(TEST_SCOPE_PATH_ENV)
    if override and os.geteuid() != 0:
        return override
    return YAMA_PTRACE_SCOPE


def read_scope(path: str) -> int | None:
    try:
        with open(path, encoding="ascii") as handle:
            return int(handle.read().strip())
    except (OSError, ValueError):
        return None


def main() -> int:
    _detach_stdin()
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from profiles import resolve_profile, runs_shell

    try:
        profile = resolve_profile()
    except ValueError as exc:
        print(f"vm-mcp-yama-gate: {exc}", file=sys.stderr)
        return 2
    if not runs_shell(profile):
        return 0
    scope = read_scope(scope_path())
    if scope is None or scope < 1:
        found = "unavailable" if scope is None else str(scope)
        print(f"vm-mcp-yama-gate: profile {profile} requires kernel.yama.ptrace_scope >= 1 (found {found}); "
              "shell_exec children could otherwise copy the service's token descriptor. "
              "Re-run vm-mcp/install.sh or use VM_MCP_PROFILE=read-only", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
# ratios: loc_comments=41:12 imports_exports=4:3 calls_definitions=16:4
