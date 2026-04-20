# 76:30
"""Tool registry — self-declaring per-tool modules.

Discovery is filesystem-based: every `*.py` sibling that exports both a
`SCHEMA` dict and an async `handle` callable is registered. Order is
deterministic (sorted glob + sorted registry) so the prompt-prefix that
includes the tool list comes out byte-identical across boots and the
provider-side cache prefix stays valid.

See .agents/skills/a0p-self-declaring-modules/SKILL.md for the pattern.
"""
import glob
import importlib
import os
from dataclasses import dataclass
from types import ModuleType
from typing import Any, Callable

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_PATTERN = os.path.join(_PKG_DIR, "*.py")
_CACHE: dict = {"modules": None, "fingerprint": ""}


@dataclass(frozen=True)
class ToolSpec:
    """Typed view over a tool module's SCHEMA + handler."""
    schema: dict
    handle: Callable[..., Any]
    tier: str
    approval_scope: str | None
    enabled: bool
    category: str
    cost_hint: str
    side_effects: tuple[str, ...]
    version: int


def _discover() -> dict[str, ModuleType]:
    """Sorted-glob scan over sibling .py files. Mtime-fingerprinted cache."""
    files = sorted(
        p for p in glob.glob(_PATTERN)
        if not os.path.basename(p).startswith("_")
    )
    fingerprint = "|".join(f"{p}:{os.path.getmtime(p)}" for p in files)
    cached = _CACHE.get("modules")
    if cached is not None and fingerprint == _CACHE.get("fingerprint"):
        return cached
    modules: dict[str, ModuleType] = {}
    for path in files:
        stem = os.path.basename(path)[:-3]
        mod = importlib.import_module(f".{stem}", package=__name__)
        if not hasattr(mod, "SCHEMA") or not hasattr(mod, "handle"):
            continue
        name = mod.SCHEMA["function"]["name"]
        modules[name] = mod
    _CACHE["modules"] = modules
    _CACHE["fingerprint"] = fingerprint
    return modules


def registry() -> dict[str, ToolSpec]:
    """Return {name: ToolSpec}, sorted by tool name for cache stability."""
    mods = _discover()
    out: dict[str, ToolSpec] = {}
    for name in sorted(mods.keys()):
        mod = mods[name]
        s = mod.SCHEMA
        out[name] = ToolSpec(
            schema=s,
            handle=mod.handle,
            tier=s.get("tier", "free"),
            approval_scope=s.get("approval_scope"),
            enabled=bool(s.get("enabled", True)),
            category=s.get("category", "misc"),
            cost_hint=s.get("cost_hint", "low"),
            side_effects=tuple(s.get("side_effects", ())),
            version=int(s.get("version", 1)),
        )
    return out


def tool_schemas_chat() -> list[dict]:
    """OpenAI-shape function declarations for every enabled tool. Sorted."""
    out: list[dict] = []
    for spec in registry().values():
        if not spec.enabled:
            continue
        out.append({
            "type": spec.schema.get("type", "function"),
            "function": spec.schema["function"],
        })
    return out


async def dispatch(name: str, **kwargs) -> Any:
    """Resolve a tool by name and await its handler. Raises KeyError if unknown."""
    reg = registry()
    if name not in reg:
        raise KeyError(name)
    return await reg[name].handle(**kwargs)
# 76:30
