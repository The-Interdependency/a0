# 61:4 0:0 1:0
"""Interdependent-core bootstrap checks for a0 startup."""

from __future__ import annotations

import importlib
import importlib.metadata as md
from pathlib import PurePosixPath


_REQUIRED_DIST_CANDIDATES = ("interdependent-core", "interdependent-lib")
_REQUIRED_MODULE_CANDIDATES = ("interdependent_core", "interdependent_lib")


def _first_installed_dist_name() -> str | None:
    for name in _REQUIRED_DIST_CANDIDATES:
        try:
            md.distribution(name)
            return name
        except md.PackageNotFoundError:
            continue
    return None


def check_interdependent_core() -> dict:
    """Return package health data for interdependent-core compatibility."""
    dist_name = _first_installed_dist_name()
    if not dist_name:
        return {"status": "missing", "dist": None, "version": None, "payload_py": 0}

    try:
        dist = md.distribution(dist_name)
        files = list(dist.files or [])
        payload_py = [f for f in files if f.suffix == ".py"]

        importable_mod = None
        for mod in _REQUIRED_MODULE_CANDIDATES:
            try:
                importlib.import_module(mod)
                importable_mod = mod
                break
            except (ModuleNotFoundError, ImportError):
                continue

        # A successfully importable module is "ready"; payload_py/sample are diagnostic only.
        if importable_mod:
            status = "ready"
        elif payload_py:
            status = "module_unimportable"
        else:
            status = "metadata_only"

        return {
            "status": status,
            "dist": dist_name,
            "version": dist.version,
            "module": importable_mod,
            "payload_py": len(payload_py),
            "sample": [str(PurePosixPath(f)) for f in payload_py[:5]],
        }
    except Exception as exc:
        return {
            "status": "error",
            "dist": dist_name,
            "version": None,
            "payload_py": 0,
            "error": str(exc),
        }


def require_interdependent_core_ready() -> dict:
    """Validate interdependent-core readiness and return diagnostic."""
    state = check_interdependent_core()
    if state["status"] == "ready":
        return state
    raise RuntimeError(
        "interdependent-core is required but not ready "
        f"(status={state.get('status')}, dist={state.get('dist')}, "
        f"version={state.get('version')}, payload_py={state.get('payload_py')})."
    )
# 61:4 0:0 1:0
