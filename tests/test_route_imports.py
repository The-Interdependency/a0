# 38:7
# DOC module: tests.test_route_imports
# DOC label: Route-import smoke
# DOC description: Imports every route module under python/routes/ to catch
# import-time errors (missing deps, syntax breaks, circular imports) without
# needing a live FastAPI process. Cheap regression net for boot failures.
import importlib
import pkgutil
import pytest

import python.routes as routes_pkg


ROUTE_MODULES = [
    name for _, name, _ in pkgutil.iter_modules(routes_pkg.__path__)
    if not name.startswith("_")
]


@pytest.mark.parametrize("modname", ROUTE_MODULES)
def test_route_module_imports_clean(modname):
    importlib.import_module(f"python.routes.{modname}")


def test_routes_init_registers_all_routers():
    from python.routes import ALL_ROUTERS
    assert len(ALL_ROUTERS) > 0
    # Each entry should be a FastAPI APIRouter
    from fastapi import APIRouter
    for r in ALL_ROUTERS:
        assert isinstance(r, APIRouter), f"non-router in ALL_ROUTERS: {r!r}"


def test_ui_meta_collection_runs():
    from python.routes import collect_ui_meta
    tabs = collect_ui_meta()
    assert isinstance(tabs, list)
    assert len(tabs) >= 8, f"expected at least 8 tabs, got {len(tabs)}"
    for t in tabs:
        assert "tab_id" in t, f"tab missing tab_id: {t}"
        assert "label" in t
# 38:7
