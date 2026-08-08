from __future__ import annotations

import os
from typing import Any, Callable

from mcp.server import MCPServer

from python.vm_mcp_policy import (
    VmMcpConfig,
    list_directory as policy_list_directory,
    read_text as policy_read_text,
    run_shell as policy_run_shell,
    vm_info as policy_vm_info,
)

# === MODULE_BUILD ===
# id: a0_vm_mcp_control_plane
#   module_name: vm_mcp_control_plane
#   module_kind: service
#   summary: exposes a VM-local MCP control plane for bounded inspection and gated shell execution without exporting SSH credentials
#   owner: Erin Spencer
#   public_surface: vm_info, list_directory, read_text, shell_exec
#   internal_surface: python.vm_mcp_policy
#   auth_boundary: admin
#   storage_boundary: write
#   network_boundary: external
#   user_data_boundary: read
#   admin_only: true
#   tests: python/tests/test_vm_mcp_policy.py
#   rollout: systemd_service_plus_secure_mcp_tunnel
#   rollback: stop_and_disable_a0-vm-mcp.service_and_remove_tunnel_app
#   feature_flag: A0_MCP_SHELL_ENABLED
#   unresolved: secure_mcp_tunnel_endpoint_registration, chatgpt_write_capability_availability
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: vm_mcp_read_paths_confined
#   given: a file or directory tool receives a relative path, absolute path, parent traversal, or symlink target
#   then: only the resolved subtree under A0_MCP_ROOT can be read or listed
#   class: security
#
# id: vm_mcp_read_output_bounded
#   given: a requested text file or directory is larger than the configured response limit
#   then: the response is capped and reports truncation visibly
#   class: safety
#
# id: vm_mcp_shell_default_disabled
#   given: the service starts without an explicit A0_MCP_SHELL_ENABLED opt-in
#   then: shell_exec refuses command execution
#   class: security
#
# id: vm_mcp_shell_cwd_confined
#   given: shell_exec receives a working directory outside A0_MCP_ROOT or through an escaping symlink
#   then: execution is refused before a process is spawned
#   class: security
#
# id: vm_mcp_shell_execution_bounded
#   given: shell_exec emits excessive output or exceeds the configured execution timeout
#   then: output is capped and over-time work is killed and reported as timed out
#   class: safety
#
# id: vm_mcp_credentials_not_inherited
#   given: the MCP service process has unrelated environment variables or host credentials
#   then: shell_exec receives a sanitized environment rather than the service process environment
#   class: security
# === END CONTRACTS ===

mcp = MCPServer("a0-vm-control-plane")


def _config() -> VmMcpConfig:
    return VmMcpConfig.from_env()


def _result(call: Callable[[], dict[str, Any]]) -> dict[str, Any]:
    try:
        return {"ok": True, **call()}
    except (OSError, ValueError, PermissionError) as exc:
        return {"ok": False, "error_type": type(exc).__name__, "error": str(exc)}


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": False})
def vm_info() -> dict[str, Any]:
    """Return the MCP service identity, workspace root, feature state, and limits."""
    return _result(lambda: policy_vm_info(_config()))


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": False})
def list_directory(path: str = ".", max_entries: int = 200) -> dict[str, Any]:
    """List one directory under A0_MCP_ROOT without following paths outside the root."""
    return _result(
        lambda: policy_list_directory(_config(), path, max_entries=max_entries)
    )


@mcp.tool(annotations={"readOnlyHint": True, "openWorldHint": False})
def read_text(path: str, max_bytes: int = 65536) -> dict[str, Any]:
    """Read bounded UTF-8-compatible text from a file under A0_MCP_ROOT."""
    return _result(lambda: policy_read_text(_config(), path, max_bytes=max_bytes))


@mcp.tool(
    annotations={
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": False,
        "openWorldHint": True,
    }
)
def shell_exec(
    command: str,
    cwd: str = ".",
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    """Run a shell command as the confined MCP service user when explicitly enabled."""
    return _result(
        lambda: policy_run_shell(
            _config(), command, cwd=cwd, timeout_seconds=timeout_seconds
        )
    )


def main() -> None:
    port = int(os.environ.get("A0_MCP_PORT", "8765"))
    mcp.run(
        transport="streamable-http",
        host="127.0.0.1",
        port=port,
        streamable_http_path="/mcp",
        json_response=True,
    )


if __name__ == "__main__":
    main()
