# 73:13
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


# Canonical side-effect taxonomy (see a0p-self-declaring-modules SKILL.md).
# Any tool tagged "security_active" emits offensive traffic to a target system
# (port scan, fuzzer, exploit run, brute force) and MUST declare a non-None
# approval_scope. This is enforced at boot below — drop a pen-test tool with
# "security_active" but no approval_scope and the registry refuses to load.
_CANONICAL_SIDE_EFFECTS = frozenset({
    "filesystem", "network", "billing", "external_account",
    "mutating_db", "irreversible", "security_passive", "security_active",
})


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
    recommended_skills: tuple[str, ...]


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
    """Return {name: ToolSpec}, sorted by tool name for cache stability.
    Enforces: any tool with "security_active" in side_effects must declare a
    non-None approval_scope (gates offensive tooling by construction)."""
    mods = _discover()
    out: dict[str, ToolSpec] = {}
    for name in sorted(mods.keys()):
        mod = mods[name]
        s = mod.SCHEMA
        side_effects = tuple(s.get("side_effects", ()))
        approval_scope = s.get("approval_scope")
        if "security_active" in side_effects and not approval_scope:
            raise RuntimeError(
                f"tool {name!r} declares side_effects=['security_active', ...] "
                f"but approval_scope is None — offensive tooling must be gated. "
                f"Set SCHEMA['approval_scope'] to a scope name."
            )
        recommended = tuple(sorted(s.get("recommended_skills", ()) or ()))
        out[name] = ToolSpec(
            schema=s,
            handle=mod.handle,
            tier=s.get("tier", "free"),
            approval_scope=approval_scope,
            enabled=bool(s.get("enabled", True)),
            category=s.get("category", "misc"),
            cost_hint=s.get("cost_hint", "low"),
            side_effects=side_effects,
            version=int(s.get("version", 1)),
            recommended_skills=recommended,
        )
    return out


def tool_schemas_chat() -> list[dict]:
    """OpenAI-shape function declarations for every enabled tool. Sorted.
    For tools with a non-empty recommended_skills list, append a one-line tail
    to the description so the model sees the skill connection at decode time."""
    out: list[dict] = []
    for spec in registry().values():
        if not spec.enabled:
            continue
        fn = dict(spec.schema["function"])
        if spec.recommended_skills:
            joined = ", ".join(spec.recommended_skills)
            tail = (
                f"\n\nBest used with skill(s): {joined}. "
                f"Call skill_load(name) to fetch the body before executing."
            )
            fn["description"] = (fn.get("description", "") or "") + tail
        out.append({
            "type": spec.schema.get("type", "function"),
            "function": fn,
        })
    return out


async def dispatch(name: str, **kwargs) -> Any:
    """Resolve a tool by name and await its handler. Raises KeyError if unknown."""
    reg = registry()
    if name not in reg:
        raise KeyError(name)
    return await reg[name].handle(**kwargs)
# 73:13
