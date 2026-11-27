# ratios: loc_comments=234:60 imports_exports=17:3 calls_definitions=102:11
"""Root-side Unix-socket execution broker for vm-mcp personal-console mode.

Usage guidance:
- Run only as the root-owned ``vm-mcp-admin.service``.
- Accept requests only from the configured ``vmmcp`` Unix account.
- ``user`` mode drops to the requested non-root account before execution.
- ``admin`` mode remains root and is intentionally equivalent to broad host
  administration; keep the MCP transport private and single-owner.
"""
from __future__ import annotations

import grp
import hashlib
import json
import os
import pwd
import selectors
import signal
import socket
import subprocess
import struct
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from first_use import INSTALL_FLAG, claim_install_marker

# === MODULE_BUILD ===
# id: vm_mcp_personal_console_broker
#   module_name: vm_mcp_personal_console_broker
#   module_kind: service
#   summary: root-side Unix-socket broker for explicit non-root user_exec and root admin_exec in single-owner personal-console deployments
#   owner: skill-lib vm-mcp maintainers
#   public_surface: execute_request, serve
#   internal_surface: peer credential verification, privilege drop, bounded process execution
#   auth_boundary: admin
#   storage_boundary: write
#   network_boundary: local
#   user_data_boundary: read_write
#   admin_only: true
#   tests: vm-mcp/tests/test_admin_broker.py
#   rollout: vm-mcp-admin.service only when VM_MCP_PROFILE=personal-console
#   rollback: stop and disable vm-mcp-admin.service; return vm-mcp to read-only or workspace profile
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: vm_mcp_admin_broker_root_boundary
#   summary: root-owned local broker receives only verified vmmcp Unix-socket requests and may execute arbitrary host commands in personal-console mode
#   auth_boundary: admin
#   storage_boundary: write
#   network_boundary: local
#   user_data_boundary: read_write
#   admin_only: true
#   side_effects: process, filesystem, service, database, network
#   owner: skill-lib vm-mcp maintainers
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: vm_mcp_admin_broker_peer_verified
#   given: a process connects to the root broker Unix socket
#   then: SO_PEERCRED must identify the configured vmmcp user and systemd current service MainPID or the request is rejected
#   class: security
#
# id: vm_mcp_user_exec_non_root
#   given: personal-console user_exec requests a local user
#   then: root is rejected and the child process drops uid/gid/groups to the requested non-root account before exec
#   class: security
#
# id: vm_mcp_admin_exec_explicit_root
#   given: personal-console admin_exec requests a command
#   then: the broker executes it as uid 0 and reports root mode explicitly in the result
#   class: authority
#
# id: vm_mcp_broker_execution_bounded
#   given: a brokered command times out, emits excessive output, or leaves descendants running
#   then: the process group is killed, output is capped, and terminal evidence is returned
#   class: safety
# === END CONTRACTS ===

DEFAULT_SOCKET = Path("/run/vm-mcp/admin.sock")
DEFAULT_CALLER = "vmmcp"
MAX_REQUEST_BYTES = 1024 * 1024
MAX_TIMEOUT_SECONDS = 3600.0
MAX_OUTPUT_BYTES = 1024 * 1024
_READ_CHUNK = 64 * 1024


def _safe_env(account: pwd.struct_passwd) -> dict[str, str]:
    return {
        "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME": account.pw_dir,
        "USER": account.pw_name,
        "LOGNAME": account.pw_name,
        "SHELL": account.pw_shell or "/bin/bash",
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "GIT_TERMINAL_PROMPT": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
    }


def _drop_privileges(account: pwd.struct_passwd) -> None:
    os.initgroups(account.pw_name, account.pw_gid)
    os.setgid(account.pw_gid)
    os.setuid(account.pw_uid)


def _kill_group(process: subprocess.Popen[bytes]) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def _communicate_bounded(
    process: subprocess.Popen[bytes], *, timeout: float, limit: int
) -> tuple[bytes, bytes, bool, bool, bool]:
    if process.stdout is None or process.stderr is None:
        raise RuntimeError("stdout/stderr pipes are required")
    selector = selectors.DefaultSelector()
    for stream, name in ((process.stdout, "stdout"), (process.stderr, "stderr")):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, data=name)
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    truncated = {"stdout": False, "stderr": False}
    deadline = time.monotonic() + timeout
    timed_out = False
    descendants_cleaned = False
    try:
        while selector.get_map():
            now = time.monotonic()
            if not timed_out and now >= deadline:
                timed_out = True
                _kill_group(process)
                descendants_cleaned = True
            if process.poll() is not None and not descendants_cleaned:
                _kill_group(process)
                descendants_cleaned = True
            events = selector.select(0.05 if timed_out else max(0.0, min(0.1, deadline - now)))
            for key, _ in events:
                stream = key.fileobj
                name = key.data
                try:
                    chunk = os.read(stream.fileno(), _READ_CHUNK)
                except BlockingIOError:
                    continue
                if not chunk:
                    selector.unregister(stream)
                    stream.close()
                    continue
                remaining = max(0, limit - len(buffers[name]))
                if remaining:
                    buffers[name].extend(chunk[:remaining])
                if len(chunk) > remaining:
                    truncated[name] = True
            if timed_out and time.monotonic() > deadline + 2.0:
                for key in list(selector.get_map().values()):
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
    finally:
        selector.close()
    if process.poll() is None:
        _kill_group(process)
    process.wait(timeout=2.0)
    return (
        bytes(buffers["stdout"]), bytes(buffers["stderr"]), timed_out,
        truncated["stdout"], truncated["stderr"],
    )


def _account_for_request(mode: str, user: str | None) -> pwd.struct_passwd:
    if mode == "admin":
        return pwd.getpwnam("root")
    if mode != "user":
        raise ValueError("mode must be 'user' or 'admin'")
    if not user or user == "root":
        raise ValueError("user mode requires an explicit non-root account")
    account = pwd.getpwnam(user)
    if account.pw_uid == 0:
        raise ValueError("user mode cannot target uid 0")
    return account


def execute_request(request: dict[str, Any]) -> dict[str, Any]:
    if os.geteuid() != 0:
        raise PermissionError("broker execution requires root")
    mode = str(request.get("mode", ""))
    user = request.get("user")
    command = str(request.get("command", ""))
    cwd = str(request.get("cwd", "/"))
    if not command.strip():
        raise ValueError("command must not be empty")
    directory = Path(cwd).expanduser().resolve()
    if not directory.is_dir():
        raise NotADirectoryError(directory)
    timeout = max(0.1, min(float(request.get("timeout_seconds", 60.0)), MAX_TIMEOUT_SECONDS))
    limit = max(1, min(int(request.get("max_output_bytes", 256 * 1024)), MAX_OUTPUT_BYTES))
    account = _account_for_request(mode, str(user) if user is not None else None)
    preexec = None if account.pw_uid == 0 else lambda: _drop_privileges(account)
    request_id = f"exec_{uuid.uuid4().hex}"
    command_sha256 = hashlib.sha256(command.encode("utf-8")).hexdigest()
    started = time.monotonic()
    process = subprocess.Popen(
        ["/bin/bash", "-lc", command], cwd=directory,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=_safe_env(account), preexec_fn=preexec, start_new_session=True,
    )
    stdout, stderr, timed_out, stdout_truncated, stderr_truncated = _communicate_bounded(
        process, timeout=timeout, limit=limit
    )
    result = {
        "ok": True,
        "request_id": request_id,
        "mode": mode,
        "run_as": account.pw_name,
        "uid": account.pw_uid,
        "cwd": str(directory),
        "command": command,
        "command_sha256": command_sha256,
        "exit_code": None if timed_out else process.returncode,
        "timed_out": timed_out,
        "duration_seconds": round(time.monotonic() - started, 6),
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
        "stdout_truncated": stdout_truncated,
        "stderr_truncated": stderr_truncated,
        "output_limit_bytes_per_stream": limit,
    }
    if mode == "admin":
        result[INSTALL_FLAG] = claim_install_marker()
    print(
        json.dumps({
            "event": "vm_mcp_exec",
            "request_id": request_id,
            "mode": mode,
            "run_as": account.pw_name,
            "cwd": str(directory),
            "command_sha256": command_sha256,
            "exit_code": result["exit_code"],
            "timed_out": timed_out,
        }, sort_keys=True),
        file=sys.stderr,
        flush=True,
    )
    return result


def _peer_credentials(connection: socket.socket) -> tuple[int, int]:
    if not hasattr(socket, "SO_PEERCRED"):
        raise RuntimeError("SO_PEERCRED is required")
    raw = connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
    pid, uid, _gid = struct.unpack("3i", raw)
    return pid, uid


def _authorize_peer(connection: socket.socket, caller_uid: int) -> None:
    """Bind the request to the service main process, never its shell descendants."""
    peer_pid, peer_uid = _peer_credentials(connection)
    if peer_uid != caller_uid:
        raise PermissionError("broker peer is not the configured service user")
    # systemd owns this identity. A workspace-writable PID file, /proc command
    # line, or UID alone would let a shell child impersonate the control plane.
    result = subprocess.run(
        ["/usr/bin/systemctl", "show", "--property=MainPID", "--value", "vm-mcp.service"],
        check=True, capture_output=True, text=True, timeout=5.0,
        env={"PATH": "/usr/bin:/bin", "LANG": "C"},
    )
    main_pid = result.stdout.strip()
    if not main_pid.isdecimal() or int(main_pid) <= 0 or peer_pid != int(main_pid):
        raise PermissionError("broker peer is not the vm-mcp service main process")


def _recv_request(connection: socket.socket) -> dict[str, Any]:
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = connection.recv(64 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > MAX_REQUEST_BYTES:
            raise ValueError("request exceeds broker limit")
        chunks.append(chunk)
    payload = b"".join(chunks).decode("utf-8").strip()
    value = json.loads(payload)
    if not isinstance(value, dict):
        raise ValueError("request must be a JSON object")
    return value


def serve() -> None:
    if os.geteuid() != 0:
        raise PermissionError("vm-mcp admin broker must run as root")
    socket_path = Path(os.environ.get("VM_MCP_ADMIN_SOCKET", str(DEFAULT_SOCKET)))
    caller_name = os.environ.get("VM_MCP_CALLER_USER", DEFAULT_CALLER)
    caller = pwd.getpwnam(caller_name)
    caller_group = grp.getgrnam(caller_name)
    socket_path.parent.mkdir(parents=True, exist_ok=True)
    os.chown(socket_path.parent, 0, caller_group.gr_gid)
    os.chmod(socket_path.parent, 0o750)
    socket_path.unlink(missing_ok=True)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
        server.bind(str(socket_path))
        os.chown(socket_path, 0, caller_group.gr_gid)
        os.chmod(socket_path, 0o660)
        server.listen(16)
        while True:
            connection, _ = server.accept()
            with connection:
                try:
                    connection.settimeout(5.0)
                    _authorize_peer(connection, caller.pw_uid)
                    response = execute_request(_recv_request(connection))
                except Exception as exc:
                    response = {"ok": False, "error_type": type(exc).__name__, "error": str(exc)}
                connection.sendall(json.dumps(response, separators=(",", ":")).encode("utf-8"))


def main() -> None:
    serve()


if __name__ == "__main__":
    main()
# ratios: loc_comments=234:60 imports_exports=17:3 calls_definitions=102:11
