# ratios: loc_comments=96:63 imports_exports=9:6 calls_definitions=45:10
"""HTTP caller and process isolation for the private VM control plane.

Usage: provision /etc/credstore/vm-mcp-token (root, 0600) via vm-mcp/install.sh,
then wrap the MCP ASGI app with BearerAuth. Never put the token in tool arguments,
URLs, command output, or a workspace file. Call protect_process before serving
or spawning commands; Linux must deny same-UID inspection of this process.
"""
from __future__ import annotations

import ctypes
import logging
import os
import re
import secrets
import stat
from typing import Any

from profiles import resolve_profile, runs_shell


# === MODULE_BUILD ===
# id: vm_mcp_caller_authentication
#   module_name: vm_mcp_caller_authentication
#   module_kind: adapter
#   summary: authenticate HTTP callers and isolate service credentials from same-UID shell processes
#   owner: skill-lib vm-mcp maintainers
#   public_surface: BearerAuth, configured_token, protect_process
#   internal_surface: Linux prctl and ASGI request boundary
#   auth_boundary: admin
#   storage_boundary: none
#   network_boundary: internal
#   user_data_boundary: read
#   admin_only: true
#   tests: vm-mcp/tests/test_security_p1.py
#   rollout: reviewed source deployment plus separately authorized operator credential provisioning
#   rollback: stop vm-mcp services; retain authenticated human recovery rather than restore unauthenticated root tools
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: vm_mcp_http_caller_authenticated
#   given: an HTTP caller reaches the MCP loopback listener
#   then: a configured bearer credential is required before request parsing or tool execution
#   class: security
#
# id: vm_mcp_service_memory_isolated
#   given: untrusted shell children run under the service UID
#   then: Linux process dumpability is disabled before commands may run, denying same-UID access to service credentials
#   class: security
# === END CONTRACTS ===


def protect_process() -> None:
    """Fail closed unless Linux disables ptrace/proc-memory access by shell peers."""
    libc = ctypes.CDLL(None, use_errno=True)
    # PR_SET_DUMPABLE=0 is inherited until exec; children get sanitized env and
    # cannot read the long-running parent's memory, environ or open descriptors.
    if libc.prctl(4, 0, 0, 0, 0) != 0:
        raise OSError(ctypes.get_errno(), "cannot isolate vm-mcp service process")


# Owner the stdin token file must have. A plain constant with no environment
# override: tests that hand over a file they own rebind it in-process.
TOKEN_FILE_OWNER_UID = 0


def _read_stdin_token() -> bytes:
    """Read the token from fd 0 once, then replace fd 0 with /dev/null.

    fd 0 must be a regular file owned by root (TOKEN_FILE_OWNER_UID) with no
    group or other permission bits, checked on the descriptor itself.
    """
    info = os.fstat(0)
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError("VM_MCP_AUTH_TOKEN_SOURCE=stdin requires stdin to be the root-only token file")
    if info.st_uid != TOKEN_FILE_OWNER_UID or info.st_mode & 0o077:
        raise RuntimeError("VM_MCP_AUTH_TOKEN_SOURCE=stdin requires the token file to be owned by root with no "
                           "group or other access (chown root:root, chmod 0600); re-run vm-mcp/install.sh")
    chunks = []
    while sum(map(len, chunks)) < 258:
        chunk = os.read(0, 258)
        if not chunk:
            break
        chunks.append(chunk)
    null = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null, 0)
    os.close(null)
    raw = b"".join(chunks)
    return raw[:-1] if raw.endswith(b"\n") else raw


def configured_token(profile: str = "read-only") -> bytes:
    """Load the operator-provisioned token without leaving it reachable by children.

    The installed unit sets VM_MCP_AUTH_TOKEN_SOURCE=stdin and
    StandardInput=file:/etc/credstore/vm-mcp-token, so the service manager opens
    the root-only file and the token never enters the environment. A token in
    VM_MCP_AUTH_TOKEN is a legacy fallback, used with a warning only when no stdin
    source is configured; the variable is always removed so children never
    inherit it.
    """
    log = logging.getLogger("vm-mcp")
    legacy = os.environ.pop("VM_MCP_AUTH_TOKEN", "")
    source_kind = os.environ.pop("VM_MCP_AUTH_TOKEN_SOURCE", "")
    if source_kind not in ("", "stdin"):
        raise RuntimeError("VM_MCP_AUTH_TOKEN_SOURCE must be unset or stdin")
    if source_kind == "stdin":
        token = _read_stdin_token()
        source = "the stdin token file"
        if legacy:
            log.warning("VM_MCP_AUTH_TOKEN is ignored because the token file is configured; re-run vm-mcp/install.sh to drop it from /etc/vm-mcp.env")
    else:
        if legacy and runs_shell(profile):
            # Yama does not gate /proc/<pid>/environ: same-UID shell children
            # could read an environment token during startup.
            raise RuntimeError(f"profile {profile} refuses VM_MCP_AUTH_TOKEN from the environment; "
                               "re-run vm-mcp/install.sh so the token arrives on stdin from the root-only file")
        token = legacy.encode("utf-8", "replace")
        source = "VM_MCP_AUTH_TOKEN"
        if token:
            log.warning("no token file configured; falling back to VM_MCP_AUTH_TOKEN from the environment. "
                        "Re-run vm-mcp/install.sh to move the token out of the service environment")
    if not re.fullmatch(rb"[A-Za-z0-9_-]{32,256}", token):
        raise RuntimeError(f"{source} must hold an operator-provisioned 32-256 character URL-safe token")
    return token


SELF_STATUS = "/proc/self/status"


def tracer_pid(path: str = SELF_STATUS) -> int:
    """Return TracerPid from /proc/self/status; unreadable counts as traced."""
    try:
        with open(path, encoding="ascii", errors="replace") as handle:
            for line in handle:
                if line.startswith("TracerPid:"):
                    return int(line.split(":", 1)[1].strip())
    except (OSError, ValueError):
        pass
    return -1


def refuse_if_traced(path: str = SELF_STATUS) -> None:
    """Exit before touching the token if anything already traces this process."""
    if tracer_pid(path) != 0:
        raise SystemExit("vm-mcp: refusing to start while traced (TracerPid is not 0)")


def startup_token(profile: str | None = None, *, status_path: str = SELF_STATUS) -> bytes:
    """Run right after PR_SET_DUMPABLE=0: refuse if traced, then read and close the token fd.

    Yama ptrace_scope is enforced by the root pre-start gate (yama_gate.py):
    ProcSubset=pid hides the kernel sysctl tree from this sandboxed process.
    """
    refuse_if_traced(status_path)
    return configured_token(resolve_profile() if profile is None else profile)


class BearerAuth:
    """Authorize before MCP parsing or routing, including direct loopback callers."""

    def __init__(self, app: Any, token: bytes) -> None:
        if not token:
            raise ValueError("HTTP bearer token is required")
        self.app = app
        self.token = token

    def _authorized(self, header: bytes) -> bool:
        """RFC 9110 credentials: the auth-scheme is case-insensitive, then 1*SP, then the token.

        Only the token is secret; it is compared in constant time.
        """
        scheme, separator, rest = header.partition(b" ")
        if not separator or scheme.lower() != b"bearer":
            return False
        return secrets.compare_digest(rest.lstrip(b" "), self.token)

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "lifespan":
            await self.app(scope, receive, send)
            return
        if scope["type"] != "http":
            await send({"type": "websocket.close", "code": 1008})
            return
        headers = [value for key, value in scope.get("headers", []) if key.lower() == b"authorization"]
        if len(headers) != 1 or not self._authorized(headers[0]):
            await send({"type": "http.response.start", "status": 401, "headers": [
                (b"www-authenticate", b"Bearer"), (b"content-type", b"text/plain"), (b"cache-control", b"no-store")]})
            await send({"type": "http.response.body", "body": b"Authentication required"})
            return
        await self.app(scope, receive, send)
# ratios: loc_comments=96:63 imports_exports=9:6 calls_definitions=45:10
