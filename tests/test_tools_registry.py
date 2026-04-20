# 37:7
# DOC module: tests.test_tools_registry
# DOC label: Tools registry
# DOC description: Self-declaring per-tool module discovery — every file in
# python/services/tools/ must export SCHEMA + handle, the registry must be
# deterministic, dispatch must raise KeyError on unknown names, and the
# combined chat schema must continue to surface the skill_* tools that still
# live in tool_executor.py.
import glob
import os

import pytest

from python.services import tools as tools_pkg
from python.services.tool_executor import TOOL_SCHEMAS_CHAT


_TOOLS_DIR = os.path.dirname(tools_pkg.__file__)
_TOOL_FILES = sorted(
    p for p in glob.glob(os.path.join(_TOOLS_DIR, "*.py"))
    if not os.path.basename(p).startswith("_")
)


@pytest.mark.parametrize("path", _TOOL_FILES, ids=lambda p: os.path.basename(p))
def test_every_tool_module_declares_schema_and_handle(path):
    stem = os.path.basename(path)[:-3]
    import importlib
    mod = importlib.import_module(f"python.services.tools.{stem}")
    assert hasattr(mod, "SCHEMA"), f"{stem} missing SCHEMA"
    assert hasattr(mod, "handle"), f"{stem} missing handle"
    assert mod.SCHEMA["function"]["name"] == stem, (
        f"{stem}: SCHEMA name {mod.SCHEMA['function']['name']!r} != filename stem"
    )


def test_registry_is_deterministic():
    a = list(tools_pkg.registry().keys())
    b = list(tools_pkg.registry().keys())
    assert a == b
    assert a == sorted(a)


def test_dispatch_unknown_raises():
    import asyncio
    with pytest.raises(KeyError):
        asyncio.run(tools_pkg.dispatch("definitely-not-a-real-tool"))


def test_image_generate_tool_present():
    reg = tools_pkg.registry()
    assert "image_generate" in reg
    assert reg["image_generate"].schema["function"]["name"] == "image_generate"


def test_skill_tools_still_present():
    names = {t["function"]["name"] for t in TOOL_SCHEMAS_CHAT}
    assert "skill_recommend" in names
    assert "skill_load" in names
# 37:7
