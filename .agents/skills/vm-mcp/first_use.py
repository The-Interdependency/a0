# ratios: loc_comments=80:36 imports_exports=6:4 calls_definitions=23:8
"""First-use context for the profile's privileged tool (standard library only).

Usage: the broker calls ``claim_install_marker()`` once per privileged request; the
server wraps its result with ``with_notice()`` so the calling agent sees
``SCOPE_NOTICE`` on its first successful authenticated call per session, and on the
first call ever made on this install. Stateless calls always receive the notice:
User-Agent is not a client identity. Marker I/O errors never change command results.
Tests must set VM_MCP_FIRST_USE_MARKER to a disposable path, never production state.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: vm_mcp_first_use_context
#   module_name: first_use
#   module_kind: adapter
#   summary: add non-blocking root-scope context to successful authenticated administrative results
#   owner: skill-lib vm-mcp maintainers
#   public_surface: SCOPE_NOTICE, claim_install_marker, with_notice, ClientKeyMiddleware
#   internal_surface: FirstUseContext, CLIENT_KEY, INSTALL_FLAG
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: vm-mcp/tests/test_first_use.py, vm-mcp/tests/test_admin_broker.py
#   rollout: installer copies module; authenticated server wraps admin_exec; root broker claims /var/lib/vm-mcp-admin/first-use with 0600 under 0700 StateDirectory
#   rollback: revert server and broker notice call sites and installer copy; retained marker is inert; operator may remove it separately to reset first-use state
# === END MODULE_BUILD ===

import contextvars
import os
import threading
import time
from typing import Any

SCOPE_NOTICE = (
    "CONTEXT NOTICE (first use on this VM): you now hold superuser (root) scope on this "
    "host. Commands you send through this tool run as root, so you can run arbitrary "
    "commands, read and write any file, manage services and users, change networking, "
    "and install or remove packages. Root actions can be irreversible, can expose or "
    "destroy other people's data and private information, and can take the host or its "
    "services offline. You are responsible for every action taken with this scope: "
    "prefer the least-privileged tool that works, keep changes reversible, and confirm "
    "with the VM owner before any destructive or hard-to-undo step."
)

MARKER_ENV = "VM_MCP_FIRST_USE_MARKER"
DEFAULT_MARKER = "/var/lib/vm-mcp-admin/first-use"
NOTICE_KEY = "context_notice"
INSTALL_FLAG = "first_use_install"

CLIENT_KEY: contextvars.ContextVar[str | None] = contextvars.ContextVar("vm_mcp_client_key", default=None)


def claim_install_marker(path: str | None = None) -> bool:
    """Claim a private marker without turning completed commands into failures.

    An I/O failure leaves any created reservation in place: do not race another
    caller by unlinking or retrying close on a potentially reused descriptor.
    Session/stateless notices remain available even if install marking fails.
    """
    target = path or os.environ.get(MARKER_ENV) or DEFAULT_MARKER
    try:
        os.makedirs(os.path.dirname(target), mode=0o700, exist_ok=True)
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    except FileExistsError:
        return False
    except OSError:
        return False
    claimed = False
    try:
        payload = f"{int(time.time())}\n".encode()
        claimed = os.write(fd, payload) == len(payload)
    except OSError:
        pass
    finally:
        try:
            os.close(fd)
        except OSError:
            claimed = False
    return claimed


class FirstUseContext:
    """In-memory, per-client record of who has already seen the notice."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._seen: set[str] = set()

    def should_notify(self, key: str | None) -> bool:
        if key is None:
            return True
        with self._lock:
            if key in self._seen:
                return False
            self._seen.add(key)
            return True


def with_notice(result: dict[str, Any], tracker: FirstUseContext, key: str | None = None) -> dict[str, Any]:
    """Prefix the notice to a successful result when this client or install is new."""
    try:
        install_first = bool(result.pop(INSTALL_FLAG, False))
        if result.get("ok") is not True:
            return result
        client_first = tracker.should_notify(key if key is not None else CLIENT_KEY.get())
        if client_first or install_first:
            return {NOTICE_KEY: SCOPE_NOTICE, **result}
    except Exception:  # noqa: BLE001 - non-blocking by design
        pass
    return result


class ClientKeyMiddleware:
    """Use a bounded session ID for advisory deduplication, never authorization.

    Stateless or oversized IDs have no reliable client identity and therefore
    receive a notice on every successful admin call without growing the tracker.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") == "http":
            headers = {k.lower(): v for k, v in scope.get("headers", [])}
            raw = headers.get(b"mcp-session-id")
            key = raw.decode("latin-1") if raw and len(raw) <= 256 else None
            token = CLIENT_KEY.set(key)
            try:
                await self.app(scope, receive, send)
            finally:
                CLIENT_KEY.reset(token)
            return
        await self.app(scope, receive, send)
# ratios: loc_comments=80:36 imports_exports=6:4 calls_definitions=23:8
