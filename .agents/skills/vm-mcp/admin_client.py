# ratios: loc_comments=46:33 imports_exports=5:1 calls_definitions=15:1
"""Unix-socket client for the vm-mcp personal-console broker.

Usage guidance: call :func:`request_exec` only from the non-root MCP service.
The broker socket is local-only and must be owned by root with group access for
``vmmcp``.
"""
from __future__ import annotations

import json
import socket
from pathlib import Path
from typing import Any

# === MODULE_BUILD ===
# id: vm_mcp_admin_client
#   module_name: vm_mcp_admin_client
#   module_kind: adapter
#   summary: sends bounded personal-console execution requests from the non-root MCP service to the local root broker
#   owner: skill-lib vm-mcp maintainers
#   public_surface: request_exec
#   internal_surface: AF_UNIX JSON request/response transport
#   auth_boundary: admin
#   storage_boundary: none
#   network_boundary: local
#   user_data_boundary: read_write
#   admin_only: true
#   tests: vm-mcp/tests/test_assets.py
#   rollout: imported by policy.py only in personal-console profile
#   rollback: return deployment to workspace/read-only profile
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: vm_mcp_admin_client_socket_boundary
#   summary: connects only to the configured local Unix-domain broker socket and sends no SSH/cloud credentials
#   auth_boundary: admin
#   storage_boundary: none
#   network_boundary: local
#   user_data_boundary: read_write
#   admin_only: true
#   side_effects: process
#   owner: skill-lib vm-mcp maintainers
# === END BOUNDARIES ===

MAX_RESPONSE_BYTES = 2 * 1024 * 1024


def request_exec(
    *,
    socket_path: Path,
    mode: str,
    user: str | None,
    command: str,
    cwd: str,
    timeout_seconds: float,
    max_output_bytes: int,
) -> dict[str, Any]:
    request = {
        "mode": mode,
        "user": user,
        "command": command,
        "cwd": cwd,
        "timeout_seconds": timeout_seconds,
        "max_output_bytes": max_output_bytes,
    }
    encoded = (json.dumps(request, separators=(",", ":")) + "\n").encode("utf-8")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.connect(str(socket_path))
        client.sendall(encoded)
        client.shutdown(socket.SHUT_WR)
        chunks: list[bytes] = []
        size = 0
        while True:
            chunk = client.recv(64 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_RESPONSE_BYTES:
                raise RuntimeError("admin broker response exceeded client limit")
            chunks.append(chunk)
    payload = b"".join(chunks).decode("utf-8")
    response = json.loads(payload)
    if not isinstance(response, dict):
        raise RuntimeError("admin broker returned a non-object response")
    if not response.get("ok"):
        raise RuntimeError(str(response.get("error", "admin broker request failed")))
    return response
# ratios: loc_comments=46:33 imports_exports=5:1 calls_definitions=15:1
