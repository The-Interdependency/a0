"""Policy primitives for the a0 VM MCP control plane.

Usage guidance:
- Build configuration with ``VmMcpConfig.from_env()``.
- Use ``list_directory`` and ``read_text`` only through the MCP wrapper.
- ``run_shell`` is a write-capable primitive and remains disabled unless
  ``A0_MCP_SHELL_ENABLED=1`` is explicitly present.
- The filesystem root and process limits are security boundaries; do not bypass
  ``resolve_under_root`` or replace the sanitized subprocess environment with
  ``os.environ.copy()``.
"""
from __future__ import annotations

import os
import pwd
import signal
import socket
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/srv/a0/workspaces")
DEFAULT_MAX_READ_BYTES = 256 * 1024
DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
DEFAULT_MAX_TIMEOUT_SECONDS = 120.0
DEFAULT_MAX_DIRECTORY_ENTRIES = 500


@dataclass(frozen=True)
class VmMcpConfig:
    root: Path
    shell_enabled: bool
    max_read_bytes: int
    max_output_bytes: int
    max_timeout_seconds: float
    max_directory_entries: int

    @classmethod
    def from_env(cls) -> "VmMcpConfig":
        return cls(
            root=Path(os.environ.get("A0_MCP_ROOT", str(DEFAULT_ROOT))).expanduser(),
            shell_enabled=_env_flag("A0_MCP_SHELL_ENABLED", default=False),
            max_read_bytes=_positive_int(
                os.environ.get("A0_MCP_MAX_READ_BYTES"), DEFAULT_MAX_READ_BYTES
            ),
            max_output_bytes=_positive_int(
                os.environ.get("A0_MCP_MAX_OUTPUT_BYTES"), DEFAULT_MAX_OUTPUT_BYTES
            ),
            max_timeout_seconds=_positive_float(
                os.environ.get("A0_MCP_MAX_TIMEOUT_SECONDS"),
                DEFAULT_MAX_TIMEOUT_SECONDS,
            ),
            max_directory_entries=_positive_int(
                os.environ.get("A0_MCP_MAX_DIRECTORY_ENTRIES"),
                DEFAULT_MAX_DIRECTORY_ENTRIES,
            ),
        )


def _env_flag(name: str, *, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _positive_int(raw: str | None, default: int) -> int:
    if raw is None:
        return default
    value = int(raw)
    if value <= 0:
        raise ValueError("configured integer limits must be positive")
    return value


def _positive_float(raw: str | None, default: float) -> float:
    if raw is None:
        return default
    value = float(raw)
    if value <= 0:
        raise ValueError("configured timeout limits must be positive")
    return value


def resolve_under_root(root: Path, requested: str, *, must_exist: bool = True) -> Path:
    root_resolved = root.expanduser().resolve(strict=False)
    requested_path = Path(requested).expanduser()
    candidate = (
        requested_path
        if requested_path.is_absolute()
        else root_resolved / requested_path
    ).resolve(strict=False)

    try:
        candidate.relative_to(root_resolved)
    except ValueError as exc:
        raise PermissionError(f"path escapes A0_MCP_ROOT: {requested}") from exc

    if must_exist and not candidate.exists():
        raise FileNotFoundError(candidate)
    return candidate


def vm_info(config: VmMcpConfig) -> dict[str, Any]:
    root = config.root.expanduser().resolve(strict=False)
    return {
        "hostname": socket.gethostname(),
        "user": pwd.getpwuid(os.getuid()).pw_name,
        "root": str(root),
        "root_exists": root.exists(),
        "shell_enabled": config.shell_enabled,
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

    limit = max(1, min(max_entries, config.max_directory_entries))
    entries: list[dict[str, Any]] = []
    truncated = False
    for index, child in enumerate(sorted(directory.iterdir(), key=lambda p: p.name)):
        if index >= limit:
            truncated = True
            break
        stat = child.stat()
        entries.append(
            {
                "name": child.name,
                "kind": "directory" if child.is_dir() else "file",
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        )

    return {
        "path": str(directory),
        "entries": entries,
        "truncated": truncated,
        "limit": limit,
    }


def read_text(
    config: VmMcpConfig,
    requested: str,
    *,
    max_bytes: int = 64 * 1024,
) -> dict[str, Any]:
    path = resolve_under_root(config.root, requested)
    if not path.is_file():
        raise IsADirectoryError(path)

    limit = max(1, min(max_bytes, config.max_read_bytes))
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


def _sanitized_subprocess_env() -> dict[str, str]:
    user = pwd.getpwuid(os.getuid())
    env = {
        "PATH": os.environ.get(
            "A0_MCP_EXEC_PATH", "/srv/a0/.venv/bin:/usr/local/bin:/usr/bin:/bin"
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


def _bounded_decode(raw: bytes, limit: int) -> tuple[str, bool]:
    truncated = len(raw) > limit
    return raw[:limit].decode("utf-8", errors="replace"), truncated


def run_shell(
    config: VmMcpConfig,
    command: str,
    *,
    cwd: str = ".",
    timeout_seconds: float = 60.0,
) -> dict[str, Any]:
    if not config.shell_enabled:
        raise PermissionError("shell_exec is disabled; set A0_MCP_SHELL_ENABLED=1")
    if not command.strip():
        raise ValueError("command must not be empty")

    directory = resolve_under_root(config.root, cwd)
    if not directory.is_dir():
        raise NotADirectoryError(directory)

    timeout = max(0.1, min(float(timeout_seconds), config.max_timeout_seconds))
    process = subprocess.Popen(
        ["/bin/bash", "-lc", command],
        cwd=directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=_sanitized_subprocess_env(),
        start_new_session=True,
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGKILL)
        stdout, stderr = process.communicate()

    stdout_text, stdout_truncated = _bounded_decode(stdout, config.max_output_bytes)
    stderr_text, stderr_truncated = _bounded_decode(stderr, config.max_output_bytes)
    return {
        "command": command,
        "cwd": str(directory),
        "exit_code": None if timed_out else process.returncode,
        "timed_out": timed_out,
        "timeout_seconds": timeout,
        "stdout": stdout_text,
        "stderr": stderr_text,
        "stdout_truncated": stdout_truncated,
        "stderr_truncated": stderr_truncated,
        "output_limit_bytes_per_stream": config.max_output_bytes,
    }
