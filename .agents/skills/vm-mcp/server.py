# ratios: loc_comments=102:70 imports_exports=11:12 calls_definitions=43:14
"""MCP server for bounded or personal-console access to a private Linux VM.

Usage guidance:
    VM_MCP_PROFILE=read-only python server.py
    VM_MCP_PROFILE=workspace python server.py
    VM_MCP_PROFILE=personal-console python server.py

The service always binds to loopback. ``personal-console`` additionally exposes
explicit ``user_exec`` and ``admin_exec`` through the separate root broker; use
that profile only for a single-owner private VM behind an authenticated tunnel.
"""
from __future__ import annotations

# First statement: become non-dumpable before the token is read from fd 0 and
# before any heavy import, so same-UID shell_exec children cannot ptrace this
# process, pidfd_getfd its descriptors, or read its /proc/<pid>/mem. (Under the
# systemd unit the token is never in the environment; Yama ptrace_scope >= 1
# for shell profiles is enforced by the root ExecStartPre gate.) Fails closed;
# auth.protect_process repeats it in main().
import ctypes as _ctypes

if _ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) != 0:  # PR_SET_DUMPABLE, 0
    raise SystemExit("vm-mcp: cannot disable process dumpability (prctl PR_SET_DUMPABLE)")

import os

# Still before any heavy import: refuse if traced, then read the token from
# fd 0 and replace fd 0 with /dev/null. Yama ptrace_scope is checked by the
# root ExecStartPre gate (yama_gate.py), since ProcSubset=pid hides sysctls
# here. auth and profiles import only the standard library.
from auth import BearerAuth, protect_process, startup_token
from profiles import resolve_profile

_TOKEN = startup_token(resolve_profile())

import uvicorn
from typing import Any, Callable

from mcp.server import MCPServer
from mcp.types import ToolAnnotations

from first_use import ClientKeyMiddleware, FirstUseContext, with_notice
from policy import (
    VmMcpConfig,
    broker_exec,
    list_directory as policy_list_directory,
    make_directory as policy_make_directory,
    move_path as policy_move_path,
    read_text as policy_read_text,
    remove_path as policy_remove_path,
    run_shell as policy_run_shell,
    stat_path as policy_stat_path,
    vm_info as policy_vm_info,
    write_text as policy_write_text,
)

# === MODULE_BUILD ===
# id: vm_mcp_control_plane
#   module_name: vm_mcp_control_plane
#   module_kind: service
#   summary: exposes loopback-only VM inspection, workspace mutation, confined shell, and explicit personal-console user/root execution surfaces
#   owner: skill-lib vm-mcp maintainers
#   public_surface: vm_info, list_directory, read_text, stat_path, write_text, make_directory, move_path, remove_path, shell_exec, user_exec, admin_exec
#   internal_surface: policy.py, admin_client.py, admin_broker.py
#   auth_boundary: admin
#   storage_boundary: write
#   network_boundary: external
#   user_data_boundary: read_write
#   admin_only: true
#   tests: vm-mcp/tests/test_policy.py, vm-mcp/tests/test_assets.py, vm-mcp/tests/test_admin_broker.py
#   rollout: root_installer_plus_systemd_plus_private_mcp_tunnel
#   rollback: disable vm-mcp services and remove private client registration
#   feature_flag: VM_MCP_PROFILE
#   unresolved: client_specific_private_tunnel_registration, operator_provisioned_bearer_token_and_client_header_support
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: vm_mcp_loopback_only
#   given: the MCP server starts with its shipped runtime configuration
#   then: Streamable HTTP binds to 127.0.0.1 on /mcp rather than a public interface
#   class: security
#
# id: vm_mcp_host_write_confined
#   given: the non-root MCP service starts with its shipped systemd configuration
#   then: NoNewPrivileges remains enabled, Linux capabilities are empty, and direct service writes stay under VM_MCP_ROOT
#   class: security
#
# id: vm_mcp_metadata_credentials_blocked
#   given: the non-root MCP service attempts to reach the standard cloud metadata-service address
#   then: the systemd network policy denies 169.254.169.254
#   class: security
#
# id: vm_mcp_personal_console_root_separate
#   given: personal-console admin_exec is enabled
#   then: root execution occurs only in the separate Unix-socket broker and not by making the MCP service root
#   class: authority
# === END CONTRACTS ===

mcp = MCPServer("vm-mcp")

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=False)
WRITE_FS = ToolAnnotations(readOnlyHint=False, destructiveHint=False, idempotentHint=False, openWorldHint=False)
WRITE_SHELL = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=True)
ADMIN_SHELL = ToolAnnotations(readOnlyHint=False, destructiveHint=True, idempotentHint=False, openWorldHint=True)


_FIRST_USE = FirstUseContext()


def _config() -> VmMcpConfig:
    return VmMcpConfig.from_env()


def _result(call: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    try:
        return {"ok": True, **call()}
    except (OSError, ValueError, PermissionError, RuntimeError) as exc:
        return {"ok": False, "error_type": type(exc).__name__, "error": str(exc)}


@mcp.tool(annotations=READ_ONLY)
def vm_info() -> dict[str, Any]:
    """Return service identity, profile, workspace root, broker socket, and limits."""
    return _result(lambda: policy_vm_info(_config()))


@mcp.tool(annotations=READ_ONLY)
def list_directory(path: str = ".", max_entries: int = 200) -> dict[str, Any]:
    """List one directory under VM_MCP_ROOT without following outside symlinks."""
    return _result(lambda: policy_list_directory(_config(), path, max_entries=max_entries))


@mcp.tool(annotations=READ_ONLY)
def read_text(path: str, max_bytes: int = 65536) -> dict[str, Any]:
    """Read bounded UTF-8-compatible text from a file under VM_MCP_ROOT."""
    return _result(lambda: policy_read_text(_config(), path, max_bytes=max_bytes))


@mcp.tool(annotations=READ_ONLY)
def stat_path(path: str) -> dict[str, Any]:
    """Return bounded metadata for one path under VM_MCP_ROOT."""
    return _result(lambda: policy_stat_path(_config(), path))


@mcp.tool(annotations=WRITE_FS)
def write_text(path: str, text: str, create_parents: bool = False) -> dict[str, Any]:
    """Atomically write one UTF-8 text file under VM_MCP_ROOT."""
    return _result(lambda: policy_write_text(_config(), path, text, create_parents=create_parents))


@mcp.tool(annotations=WRITE_FS)
def make_directory(path: str, parents: bool = False) -> dict[str, Any]:
    """Create a directory under VM_MCP_ROOT."""
    return _result(lambda: policy_make_directory(_config(), path, parents=parents))


@mcp.tool(annotations=WRITE_FS)
def move_path(source: str, destination: str) -> dict[str, Any]:
    """Atomically move one path to another location under VM_MCP_ROOT."""
    return _result(lambda: policy_move_path(_config(), source, destination))


@mcp.tool(annotations=WRITE_SHELL)
def remove_path(path: str, recursive: bool = False) -> dict[str, Any]:
    """Remove a file/symlink or, when requested, a directory under VM_MCP_ROOT."""
    return _result(lambda: policy_remove_path(_config(), path, recursive=recursive))


@mcp.tool(annotations=WRITE_SHELL)
def shell_exec(command: str, cwd: str = ".", timeout_seconds: float = 60.0) -> dict[str, Any]:
    """Run one bounded shell command as the confined non-root vm-mcp service user."""
    return _result(lambda: policy_run_shell(_config(), command, cwd=cwd, timeout_seconds=timeout_seconds))


@mcp.tool(annotations=WRITE_SHELL)
def user_exec(
    user: str,
    command: str,
    cwd: str = "/",
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    """Personal-console only: execute as an explicit local non-root user."""
    return _result(
        lambda: broker_exec(
            _config(), mode="user", user=user, command=command, cwd=cwd,
            timeout_seconds=timeout_seconds,
        )
    )


@mcp.tool(annotations=ADMIN_SHELL)
def admin_exec(command: str, cwd: str = "/", timeout_seconds: float = 60.0) -> dict[str, Any]:
    """Personal-console only: execute an explicitly privileged command as root."""
    return with_notice(
        _result(
            lambda: broker_exec(
                _config(), mode="admin", user=None, command=command, cwd=cwd,
                timeout_seconds=timeout_seconds,
            )
        ),
        _FIRST_USE,
    )


def main() -> None:
    protect_process()
    token = _TOKEN
    app = mcp.streamable_http_app(
        host="127.0.0.1",
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
    )
    uvicorn.run(BearerAuth(ClientKeyMiddleware(app), token), host="127.0.0.1", port=int(os.environ.get("VM_MCP_PORT", "8765")))


if __name__ == "__main__":
    main()
# ratios: loc_comments=102:70 imports_exports=11:12 calls_definitions=43:14
