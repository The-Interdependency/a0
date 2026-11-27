# ratios: loc_comments=376:58 imports_exports=14:13 calls_definitions=135:24
"""Policy primitives for the vm-mcp runtime.

Usage guidance:
- Construct :class:`VmMcpConfig` from the service environment.
- Keep the default ``read-only`` profile for shared or first-contact installs.
- Use ``workspace`` for root-confined writes and shell execution.
- Use ``personal-console`` only for a single-owner private VM where broad
  ``user_exec`` and explicit ``admin_exec`` are intended.
- Systemd confinement remains the host-write boundary for the non-root service;
  personal-console host/root execution crosses a separate Unix-socket broker.
"""
from __future__ import annotations

import os
import pwd
import selectors
import shutil
import signal
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from profiles import PROFILES, resolve_profile  # noqa: F401  (PROFILES re-exported)

# === CONTRACTS ===
# id: vm_mcp_read_paths_confined
#   given: a file or directory tool receives a relative path, absolute path, parent traversal, or symlink target
#   then: the resolved target must remain under VM_MCP_ROOT or the tool refuses access
#   class: security
#
# id: vm_mcp_listing_symlinks_not_followed
#   given: a directory listing encounters a symlink whose target is outside VM_MCP_ROOT
#   then: the listing reports the symlink itself and does not follow the target for file metadata
#   class: security
#
# id: vm_mcp_output_bounded
#   given: a file, directory, or process result exceeds its configured response limit
#   then: the response is capped and reports truncation visibly
#   class: safety
#
# id: vm_mcp_profile_default_read_only
#   given: the service starts without an explicit profile
#   then: writes, shell execution, user execution, and admin execution are refused
#   class: security
#
# id: vm_mcp_workspace_writes_confined
#   given: a workspace write, move, directory creation, or removal is requested
#   then: the resolved path remains under VM_MCP_ROOT and the profile must permit workspace mutation
#   class: security
#
# id: vm_mcp_shell_cwd_confined
#   given: shell execution receives a working directory outside VM_MCP_ROOT or through an escaping symlink
#   then: execution is refused before a process is spawned
#   class: security
#
# id: vm_mcp_shell_execution_bounded
#   given: shell execution emits excessive output, exceeds its timeout, or tries to leave background descendants running
#   then: output is capped, timed-out process groups are killed, and surviving descendants are killed before return
#   class: safety
#
# id: vm_mcp_credentials_not_inherited
#   given: the MCP service process has unrelated environment variables or host credentials
#   then: shell execution receives a sanitized environment rather than the service process environment
#   class: security
#
# id: vm_mcp_personal_console_explicit
#   given: user_exec or admin_exec is requested
#   then: the deployment must explicitly select the personal-console profile
#   class: security
# === END CONTRACTS ===

DEFAULT_ROOT = Path("/srv/vm-mcp/workspace")
DEFAULT_ADMIN_SOCKET = Path("/run/vm-mcp/admin.sock")
DEFAULT_MAX_READ_BYTES = 256 * 1024
DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
DEFAULT_MAX_TIMEOUT_SECONDS = 300.0
DEFAULT_MAX_DIRECTORY_ENTRIES = 500
_READ_CHUNK = 64 * 1024


@dataclass(frozen=True)
class VmMcpConfig:
    root: Path
    profile: str
    max_read_bytes: int
    max_output_bytes: int
    max_timeout_seconds: float
    max_directory_entries: int
    admin_socket: Path

    @property
    def workspace_write_enabled(self) -> bool:
        return self.profile in {"workspace", "personal-console"}

    @property
    def shell_enabled(self) -> bool:
        return self.profile in {"workspace", "personal-console"}

    @property
    def personal_console_enabled(self) -> bool:
        return self.profile == "personal-console"

    @classmethod
    def from_env(cls) -> "VmMcpConfig":
        # One resolver for policy, server, auth and the pre-start gate.
        profile = resolve_profile()
        return cls(
            root=Path(os.environ.get("VM_MCP_ROOT", str(DEFAULT_ROOT))).expanduser(),
            profile=profile,
            max_read_bytes=_positive_int(
                os.environ.get("VM_MCP_MAX_READ_BYTES"), DEFAULT_MAX_READ_BYTES
            ),
            max_output_bytes=_positive_int(
                os.environ.get("VM_MCP_MAX_OUTPUT_BYTES"), DEFAULT_MAX_OUTPUT_BYTES
            ),
            max_timeout_seconds=_positive_float(
                os.environ.get("VM_MCP_MAX_TIMEOUT_SECONDS"), DEFAULT_MAX_TIMEOUT_SECONDS
            ),
            max_directory_entries=_positive_int(
                os.environ.get("VM_MCP_MAX_DIRECTORY_ENTRIES"), DEFAULT_MAX_DIRECTORY_ENTRIES
            ),
            admin_socket=Path(
                os.environ.get("VM_MCP_ADMIN_SOCKET", str(DEFAULT_ADMIN_SOCKET))
            ),
        )


def _positive_int(raw: str | None, default: int) -> int:
    if raw is None:
        return default
    value = int(raw)
    if value <= 0:
        raise ValueError(f"configured integer limit must be positive: {raw!r}")
    return value


def _positive_float(raw: str | None, default: float) -> float:
    if raw is None:
        return default
    value = float(raw)
    if value <= 0:
        raise ValueError(f"configured timeout limit must be positive: {raw!r}")
    return value


def resolve_under_root(root: Path, requested: str, *, must_exist: bool = True) -> Path:
    root_resolved = root.expanduser().resolve(strict=False)
    requested_path = Path(requested).expanduser()
    candidate = (
        requested_path if requested_path.is_absolute() else root_resolved / requested_path
    ).resolve(strict=False)
    try:
        candidate.relative_to(root_resolved)
    except ValueError as exc:
        raise PermissionError(f"path escapes VM_MCP_ROOT: {requested}") from exc
    if must_exist and not candidate.exists():
        raise FileNotFoundError(candidate)
    return candidate


def resolve_entry_under_root(root: Path, requested: str, *, must_exist: bool = True) -> Path:
    """Resolve the parent only; destructive operations own the final entry."""
    root_resolved = root.expanduser().resolve(strict=False)
    raw = Path(requested).expanduser()
    if raw.name in {"", ".", ".."}:
        raise PermissionError("a non-root directory entry is required")
    candidate = raw if raw.is_absolute() else root_resolved / raw
    parent = resolve_under_root(root_resolved, str(candidate.parent))
    path = parent / candidate.name
    if path == root_resolved:
        raise PermissionError("refusing to move or remove VM_MCP_ROOT")
    if must_exist:
        path.lstat()  # broken links are entries too
    return path


def _require_workspace_write(config: VmMcpConfig) -> None:
    if not config.workspace_write_enabled:
        raise PermissionError(
            "workspace mutation is disabled; set VM_MCP_PROFILE=workspace or personal-console"
        )


def _require_personal_console(config: VmMcpConfig) -> None:
    if not config.personal_console_enabled:
        raise PermissionError(
            "host execution is disabled; set VM_MCP_PROFILE=personal-console"
        )


def vm_info(config: VmMcpConfig) -> dict[str, Any]:
    root = config.root.expanduser().resolve(strict=False)
    return {
        "hostname": socket.gethostname(),
        "user": pwd.getpwuid(os.getuid()).pw_name,
        "root": str(root),
        "root_exists": root.exists(),
        "profile": config.profile,
        "workspace_write_enabled": config.workspace_write_enabled,
        "shell_enabled": config.shell_enabled,
        "personal_console_enabled": config.personal_console_enabled,
        "admin_socket": str(config.admin_socket),
        "limits": {
            "max_read_bytes": config.max_read_bytes,
            "max_output_bytes": config.max_output_bytes,
            "max_timeout_seconds": config.max_timeout_seconds,
            "max_directory_entries": config.max_directory_entries,
        },
    }


def list_directory(
    config: VmMcpConfig,
    requested: str = ".",
    *,
    max_entries: int = 200,
) -> dict[str, Any]:
    directory = resolve_under_root(config.root, requested)
    if not directory.is_dir():
        raise NotADirectoryError(directory)
    limit = max(1, min(int(max_entries), config.max_directory_entries))
    entries: list[dict[str, Any]] = []
    truncated = False
    for index, child in enumerate(sorted(directory.iterdir(), key=lambda p: p.name)):
        if index >= limit:
            truncated = True
            break
        stat = child.lstat()
        kind = "symlink" if child.is_symlink() else "directory" if child.is_dir() else "file"
        entries.append(
            {"name": child.name, "kind": kind, "size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
        )
    return {"path": str(directory), "entries": entries, "truncated": truncated, "limit": limit}


def read_text(
    config: VmMcpConfig,
    requested: str,
    *,
    max_bytes: int = 64 * 1024,
) -> dict[str, Any]:
    path = resolve_under_root(config.root, requested)
    if not path.is_file():
        raise IsADirectoryError(path)
    limit = max(1, min(int(max_bytes), config.max_read_bytes))
    with path.open("rb") as handle:
        raw = handle.read(limit + 1)
    truncated = len(raw) > limit
    payload = raw[:limit]
    return {
        "path": str(path),
        "text": payload.decode("utf-8", errors="replace"),
        "bytes_read": len(payload),
        "truncated": truncated,
        "limit": limit,
    }


def stat_path(config: VmMcpConfig, requested: str) -> dict[str, Any]:
    path = resolve_under_root(config.root, requested)
    stat = path.lstat()
    return {
        "path": str(path),
        "kind": "symlink" if path.is_symlink() else "directory" if path.is_dir() else "file",
        "size": stat.st_size,
        "mode": oct(stat.st_mode & 0o7777),
        "uid": stat.st_uid,
        "gid": stat.st_gid,
        "mtime_ns": stat.st_mtime_ns,
    }


def write_text(
    config: VmMcpConfig,
    requested: str,
    text: str,
    *,
    create_parents: bool = False,
) -> dict[str, Any]:
    _require_workspace_write(config)
    path = resolve_under_root(config.root, requested, must_exist=False)
    if create_parents:
        parent = resolve_under_root(config.root, str(path.parent), must_exist=False)
        parent.mkdir(parents=True, exist_ok=True)
    elif not path.parent.is_dir():
        raise FileNotFoundError(path.parent)
    encoded = text.encode("utf-8")
    if len(encoded) > config.max_read_bytes:
        raise ValueError("write payload exceeds VM_MCP_MAX_READ_BYTES")
    tmp = path.with_name(f".{path.name}.vm-mcp.tmp")
    tmp.write_bytes(encoded)
    os.replace(tmp, path)
    return {"path": str(path), "bytes_written": len(encoded)}


def make_directory(
    config: VmMcpConfig,
    requested: str,
    *,
    parents: bool = False,
) -> dict[str, Any]:
    _require_workspace_write(config)
    path = resolve_under_root(config.root, requested, must_exist=False)
    path.mkdir(parents=parents, exist_ok=True)
    return {"path": str(path), "created": True}


def move_path(config: VmMcpConfig, source: str, destination: str) -> dict[str, Any]:
    _require_workspace_write(config)
    src = resolve_entry_under_root(config.root, source)
    dst = resolve_entry_under_root(config.root, destination, must_exist=False)
    if not dst.parent.is_dir():
        raise FileNotFoundError(dst.parent)
    os.replace(src, dst)
    return {"source": str(src), "destination": str(dst)}


def remove_path(config: VmMcpConfig, requested: str, *, recursive: bool = False) -> dict[str, Any]:
    _require_workspace_write(config)
    path = resolve_entry_under_root(config.root, requested)
    if path.is_dir() and not path.is_symlink():
        if recursive:
            shutil.rmtree(path)
        else:
            path.rmdir()
    else:
        path.unlink()
    return {"path": str(path), "removed": True, "recursive": recursive}


def _sanitized_subprocess_env() -> dict[str, str]:
    user = pwd.getpwuid(os.getuid())
    env = {
        "PATH": os.environ.get(
            "VM_MCP_EXEC_PATH",
            "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        ),
        "HOME": user.pw_dir,
        "USER": user.pw_name,
        "LOGNAME": user.pw_name,
        "LANG": os.environ.get("LANG", "C.UTF-8"),
        "GIT_TERMINAL_PROMPT": "0",
        "PYTHONDONTWRITEBYTECODE": "1",
    }
    if os.environ.get("LC_ALL"):
        env["LC_ALL"] = os.environ["LC_ALL"]
    return env


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
    streams = ((process.stdout, "stdout"), (process.stderr, "stderr"))
    for stream, name in streams:
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
            wait = 0.05 if timed_out else max(0.0, min(0.1, deadline - now))
            events = selector.select(wait)
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


def run_shell(
    config: VmMcpConfig,
    command: str,
    *,
    cwd: str = ".",
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    if not config.shell_enabled:
        raise PermissionError(
            "shell_exec is disabled; set VM_MCP_PROFILE=workspace or personal-console"
        )
    if not command.strip():
        raise ValueError("command must not be empty")
    directory = resolve_under_root(config.root, cwd)
    if not directory.is_dir():
        raise NotADirectoryError(directory)
    timeout = max(0.1, min(float(timeout_seconds), config.max_timeout_seconds))
    process = subprocess.Popen(
        ["/bin/bash", "-lc", command], cwd=directory,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=_sanitized_subprocess_env(), start_new_session=True,
    )
    stdout, stderr, timed_out, stdout_truncated, stderr_truncated = _communicate_bounded(
        process, timeout=timeout, limit=config.max_output_bytes
    )
    return {
        "command": command,
        "cwd": str(directory),
        "exit_code": None if timed_out else process.returncode,
        "timed_out": timed_out,
        "timeout_seconds": timeout,
        "stdout": stdout.decode("utf-8", errors="replace"),
        "stderr": stderr.decode("utf-8", errors="replace"),
        "stdout_truncated": stdout_truncated,
        "stderr_truncated": stderr_truncated,
        "output_limit_bytes_per_stream": config.max_output_bytes,
    }


def broker_exec(
    config: VmMcpConfig,
    *,
    mode: str,
    command: str,
    cwd: str,
    user: str | None = None,
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    _require_personal_console(config)
    if mode not in {"user", "admin"}:
        raise ValueError(f"unsupported broker mode: {mode}")
    if mode == "user" and (not user or user == "root"):
        raise ValueError("user_exec requires an explicit non-root local user")
    if not command.strip():
        raise ValueError("command must not be empty")
    timeout = max(0.1, min(float(timeout_seconds), config.max_timeout_seconds))
    from admin_client import request_exec
    return request_exec(
        socket_path=config.admin_socket,
        mode=mode,
        user=user,
        command=command,
        cwd=cwd,
        timeout_seconds=timeout,
        max_output_bytes=config.max_output_bytes,
    )
# ratios: loc_comments=376:58 imports_exports=14:13 calls_definitions=135:24
