# 90:55
"""
ModuleRegistry — hot-swap Python route modules into the live FastAPI app
without a server restart.

Handler code convention
-----------------------
The exec'd code must define a module-level variable ``router`` that is an
``APIRouter`` instance.  Console tab metadata is stored separately in the DB
``ui_meta`` column (edited via PATCH /modules/{id}) — it is NOT extracted
from the handler code at runtime.

Example minimal handler::

    from fastapi import APIRouter
    router = APIRouter(prefix="/api/v1/custom/hello")

    @router.get("/")
    async def hello():
        return {"hello": "world"}

Lifecycle
---------
  initialize_registry(app)   — bind to live FastAPI instance (call once)
  get_registry()             — return singleton
  registry.mount(id, slug, code) — compile + splice routes in
  registry.unmount(id)           — remove routes
  registry.swap(id, slug, code)  — atomic unmount + mount under async lock
  await registry.load_all_active()  — startup bootstrap from DB
"""

import asyncio
import traceback
from typing import Optional

from fastapi import FastAPI, APIRouter


class _ModuleRegistry:
    """Singleton that manages hot-swappable route modules."""

    def __init__(self) -> None:
        self._app: Optional[FastAPI] = None
        # module_id -> list of route objects we added
        self._mounted: dict[int, list] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def initialize(self, app: FastAPI) -> None:
        """Bind to the live FastAPI instance.  Call once after app creation."""
        self._app = app

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _compile_router(self, slug: str, handler_code: str) -> APIRouter:
        """Exec handler_code and return the ``APIRouter`` it defines."""
        if not handler_code or not handler_code.strip():
            raise ValueError("handler_code is empty")
        namespace: dict = {"__builtins__": __builtins__}
        try:
            compiled = compile(handler_code, f"<ws_module:{slug}>", "exec")
            exec(compiled, namespace)  # noqa: S102  (ws-tier is trusted)
        except SyntaxError as exc:
            raise ValueError(f"SyntaxError in module '{slug}': {exc}") from exc
        except Exception as exc:
            tb = traceback.format_exc()
            raise ValueError(f"Runtime error in module '{slug}':\n{tb}") from exc
        router = namespace.get("router")
        if router is None:
            raise ValueError(
                f"Module '{slug}' handler_code must define a top-level "
                "variable named 'router' (fastapi.APIRouter)."
            )
        if not isinstance(router, APIRouter):
            raise ValueError(
                f"Module '{slug}': 'router' must be an APIRouter, "
                f"got {type(router).__name__}."
            )
        return router

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def mount(self, module_id: int, slug: str, handler_code: str) -> None:
        """Compile handler_code and splice its routes into the live app.

        If the module is already mounted, it is unmounted first (atomic swap).
        Raises ``ValueError`` on compilation or type errors — caller should
        catch and mark the module status as 'error'.
        """
        if self._app is None:
            raise RuntimeError(
                "ModuleRegistry not initialized — call initialize_registry(app) first."
            )
        router = self._compile_router(slug, handler_code)
        if module_id in self._mounted:
            self._do_unmount(module_id)
        before = len(self._app.router.routes)
        self._app.include_router(router)
        added = list(self._app.router.routes[before:])
        self._mounted[module_id] = added

    def _do_unmount(self, module_id: int) -> None:
        if module_id not in self._mounted or self._app is None:
            return
        to_remove = {id(r) for r in self._mounted[module_id]}
        self._app.router.routes = [
            r for r in self._app.router.routes if id(r) not in to_remove
        ]
        del self._mounted[module_id]

    def unmount(self, module_id: int) -> None:
        """Remove all routes contributed by this module from the live app (no lock).

        Prefer ``unmount_safe()`` when calling from async request handlers so
        that concurrent swap/deactivate/delete operations are serialised.
        """
        self._do_unmount(module_id)

    async def unmount_safe(self, module_id: int) -> None:
        """Lock-guarded async unmount — use from HTTP route handlers."""
        async with self._lock:
            self._do_unmount(module_id)

    def is_mounted(self, module_id: int) -> bool:
        return module_id in self._mounted

    async def swap(self, module_id: int, slug: str, handler_code: str) -> None:
        """Atomically hot-swap a module under the async lock."""
        async with self._lock:
            self.mount(module_id, slug, handler_code)

    async def load_all_active(self) -> int:
        """Mount every active (non-system) module from the DB.

        Modules that fail to compile are marked 'error' in the DB.
        Returns the count of successfully mounted modules.
        """
        from ..storage import storage as _storage
        mods = await _storage.list_ws_modules()
        count = 0
        for mod in mods:
            if mod["status"] != "active" or mod["owner_id"] == "system":
                continue
            code = (mod.get("handler_code") or "").strip()
            if not code:
                continue
            mid = mod["id"]
            try:
                self.mount(mid, mod["slug"], code)
                count += 1
            except Exception as exc:
                await _storage.update_ws_module(mid, {
                    "status": "error",
                    "error_log": f"[startup load] {exc}",
                })
        return count


# ── Singleton ──────────────────────────────────────────────────────────
_registry: _ModuleRegistry = _ModuleRegistry()


def initialize_registry(app: FastAPI) -> None:
    """Bind the singleton registry to the FastAPI app.  Call once in main.py."""
    _registry.initialize(app)


def get_registry() -> _ModuleRegistry:
    """Return the singleton ModuleRegistry."""
    return _registry
# 90:55
