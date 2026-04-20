# 316:55
"""ZFAE Tool Executor — thin shim over the per-tool registry.

Tools live in `python/services/tools/*.py` (one file per tool, self-declared
SCHEMA + async handle). This module:
  - Re-exports a stable TOOL_SCHEMAS_CHAT / TOOL_SCHEMAS_RESPONSES list
    that includes the tool registry plus the two skill-surface tools
    (skill_recommend, skill_load) that still live here.
  - Wraps the registry dispatcher with the call_id persistence + distiller
    summarization the inference loop relies on.
  - Owns the distiller skill loader (.agents/skills/distill-*) and the a0
    skill loader (.agents/skills/a0-*) — neither is a "tool".
  - Owns the per-task _approval_scope_user_cv ContextVar that tools read via
    get_approval_scope_user_id() and that chat.py sets via
    set_approval_scope_user_id().
"""
import contextvars as _cv
import os

from .tool_distill import (
    maybe_summarize as _maybe_summarize_impl,
    set_caller_provider,
    reset_caller_provider,
)
from .tools import dispatch as _registry_dispatch
from .tools import registry as _registry
from .tools import tool_schemas_chat as _registry_schemas

_TOOL_RESULT_PASS_TOKENS = 8000  # mirrored from tool_distill for the persist gate


# ---------------------------------------------------------------------------
# Distiller skill loader (.agents/skills/distill-*) — NOT a tool surface.
# ---------------------------------------------------------------------------
_DISTILLER_DIR_GLOB = ".agents/skills/distill-*/SKILL.md"
_DISTILLER_FALLBACK = "general"
_DOMAIN_TRIGGER_MIN = 3
_SPEC_CACHE: dict = {"specs": {}, "fingerprint": ""}

_A0_SKILL_DIR_GLOB = ".agents/skills/a0-*/SKILL.md"
_A0_SKILL_CACHE: dict = {"specs": {}, "fingerprint": ""}


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Minimal YAML-frontmatter parser. Supports scalar, bool, inline list."""
    if not text.startswith("---\n"):
        return {}, text.strip()
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text.strip()
    fm_text = text[4:end]
    body = text[end + 5:].strip()
    fm: dict = {}
    for line in fm_text.split("\n"):
        if ":" not in line or line.lstrip().startswith("#"):
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        v = v.strip()
        if v.lower() in ("true", "false"):
            fm[k] = (v.lower() == "true")
            continue
        if v.startswith("[") and v.endswith("]"):
            inner = v[1:-1]
            items: list[str] = []
            buf = ""
            in_q = False
            for ch in inner:
                if ch == '"':
                    in_q = not in_q
                    continue
                if ch == "," and not in_q:
                    if buf.strip():
                        items.append(buf.strip().strip('"'))
                    buf = ""
                else:
                    buf += ch
            if buf.strip():
                items.append(buf.strip().strip('"'))
            fm[k] = items
            continue
        if v.startswith('"') and v.endswith('"'):
            v = v[1:-1]
        fm[k] = v
    return fm, body


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _discover_distiller_specs() -> dict[str, dict]:
    """Scan .agents/skills/distill-*/SKILL.md, return {domain: spec}."""
    import glob
    base = _project_root()
    pattern = os.path.join(base, _DISTILLER_DIR_GLOB)
    files = sorted(glob.glob(pattern))
    fingerprint = "|".join(f"{p}:{os.path.getmtime(p)}" for p in files)
    if fingerprint and fingerprint == _SPEC_CACHE.get("fingerprint"):
        return _SPEC_CACHE["specs"]
    specs: dict[str, dict] = {}
    for path in files:
        domain = os.path.basename(os.path.dirname(path)).removeprefix("distill-")
        try:
            with open(path, "r", encoding="utf-8") as fh:
                fm, body = _parse_frontmatter(fh.read())
        except OSError:
            continue
        specs[domain] = {
            "prompt": body,
            "triggers": tuple(t.lower() for t in (fm.get("triggers") or [])),
            "hard_domain": bool(fm.get("hard_domain", False)),
        }
    _SPEC_CACHE["specs"] = specs
    _SPEC_CACHE["fingerprint"] = fingerprint
    return specs


def _pick_distiller(raw: str) -> str:
    specs = _discover_distiller_specs()
    head_lower = raw[:8000].lower()
    scores = {
        domain: sum(1 for t in spec["triggers"] if t in head_lower)
        for domain, spec in specs.items() if spec["triggers"]
    }
    if scores:
        best_domain, best_score = max(scores.items(), key=lambda kv: kv[1])
        if best_score >= _DOMAIN_TRIGGER_MIN:
            return best_domain
    return _DISTILLER_FALLBACK


def _get_distiller_spec(domain: str) -> dict:
    specs = _discover_distiller_specs()
    return specs.get(domain) or specs.get(_DISTILLER_FALLBACK) or {}


def _discover_a0_skills() -> dict[str, dict]:
    """Scan .agents/skills/a0-*/SKILL.md, return {name: spec}."""
    import glob
    base = _project_root()
    pattern = os.path.join(base, _A0_SKILL_DIR_GLOB)
    files = sorted(glob.glob(pattern))
    fingerprint = "|".join(f"{p}:{os.path.getmtime(p)}" for p in files)
    if fingerprint and fingerprint == _A0_SKILL_CACHE.get("fingerprint"):
        return _A0_SKILL_CACHE["specs"]
    specs: dict[str, dict] = {}
    for path in files:
        slug = os.path.basename(os.path.dirname(path)).removeprefix("a0-")
        try:
            with open(path, "r", encoding="utf-8") as fh:
                fm, body = _parse_frontmatter(fh.read())
        except OSError:
            continue
        name = (fm.get("name") or slug).strip()
        specs[name] = {
            "slug": slug,
            "description": (fm.get("description") or "").strip(),
            "triggers": tuple(t.lower() for t in (fm.get("triggers") or [])),
            "body": body,
        }
    _A0_SKILL_CACHE["specs"] = specs
    _A0_SKILL_CACHE["fingerprint"] = fingerprint
    return specs


def get_a0_skill_manifest() -> str:
    """Stable, alphabetically-sorted bullet list of available a0 skills.
    Bodies are NOT included so the prefix stays small and cache-friendly."""
    specs = _discover_a0_skills()
    if not specs:
        return ""
    lines = ["## Available skills (load full body via skill_load)"]
    for name in sorted(specs.keys()):
        desc = specs[name].get("description") or "(no description)"
        lines.append(f"- **{name}** — {desc}")
    return "\n".join(lines)


def get_a0_skill_body(name: str) -> str | None:
    """Return the SKILL.md body for the named a0 skill, or None."""
    specs = _discover_a0_skills()
    spec = specs.get(name)
    return spec.get("body") if spec else None


def _score_skill_match(query: str, name: str, spec: dict) -> int:
    """Cheap keyword-overlap score for skill_recommend. Triggers count double."""
    q = query.lower()
    if not q.strip():
        return 0
    score = 0
    if name.lower() in q or any(part in q for part in name.lower().split("-") if len(part) > 2):
        score += 3
    desc = (spec.get("description") or "").lower()
    for word in q.split():
        if len(word) < 3:
            continue
        if word in desc:
            score += 1
        for trig in spec.get("triggers", ()):
            if word in trig:
                score += 2
    return score


def _skill_recommend(query: str, limit: int = 5) -> str:
    """Rank a0 skills against a free-text query. Returns a compact list."""
    if not query.strip():
        return "[skill_recommend: empty query]"
    limit = max(1, min(20, int(limit)))
    specs = _discover_a0_skills()
    if not specs:
        return "[skill_recommend: no a0 skills installed]"
    scored = [
        (name, _score_skill_match(query, name, spec), spec)
        for name, spec in specs.items()
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [(n, s, spec) for n, s, spec in scored if s > 0][:limit]
    if not top:
        return f"[skill_recommend: no skill matched query: {query!r}]"
    lines = [f"[skill_recommend · {len(top)} match(es) for: {query!r}]"]
    for name, score, spec in top:
        desc = spec.get("description") or ""
        lines.append(f"- {name} (score={score}) — {desc}")
    lines.append("\nLoad a body via skill_load(name=...).")
    return "\n".join(lines)


def _skill_load(name: str) -> str:
    """Return the full SKILL.md body for the named a0 skill."""
    if not name.strip():
        return "[skill_load: missing name]"
    body = get_a0_skill_body(name.strip())
    if body is None:
        available = sorted(_discover_a0_skills().keys())
        return (
            f"[skill_load: no skill named {name!r}]\n"
            f"Available: {', '.join(available) if available else '(none installed)'}"
        )
    return f"[skill_load · {name}]\n\n{body}"


# ---------------------------------------------------------------------------
# skill_* tool schemas — surfaced into TOOL_SCHEMAS_CHAT alongside the tools
# registry so the chat models can invoke them. They are NOT extracted into
# python/services/tools/ — they live with the a0-skill loader they wrap.
# ---------------------------------------------------------------------------
_SKILL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "skill_recommend",
            "description": (
                "Score the available a0 skills against a query and return the "
                "top matches (name + description + score). Use when you suspect "
                "a skill exists for the user's task but you're not sure which. "
                "Does NOT load skill bodies — call skill_load with a name to read."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "What the user wants to do (free text).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return. Default 5, max 20.",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "skill_load",
            "description": (
                "Return the full SKILL.md body for a named a0 skill. Use after "
                "skill_recommend or when you already know which skill applies. "
                "Bodies contain the full procedure, examples, and anti-patterns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Skill name as listed in the prefix manifest (e.g. 'deep-research').",
                    },
                },
                "required": ["name"],
            },
        },
    },
]


def _build_chat_schemas() -> list[dict]:
    """Combined chat schemas: registry tools + skill_* surfaces, sorted by name."""
    combined = list(_registry_schemas()) + list(_SKILL_SCHEMAS)
    combined.sort(key=lambda s: s["function"]["name"])
    return combined


# Snapshot at import time so back-compat consumers (inference.py, gemini_native,
# forge introspection) get a stable list reference. Discovery is sorted-glob,
# so the byte content is identical across boots on identical filesystems.
TOOL_SCHEMAS_CHAT: list[dict] = _build_chat_schemas()

# OpenAI Responses API — native web_search_preview replaces the custom tool.
OPENAI_NATIVE_TOOLS = [
    {"type": "web_search_preview"},
]

TOOL_SCHEMAS_RESPONSES_ZFAE = [
    {
        "type": "function",
        "name": s["function"]["name"],
        "description": s["function"]["description"],
        "parameters": s["function"]["parameters"],
    }
    for s in TOOL_SCHEMAS_CHAT
    if s["function"]["name"] != "web_search"
]

TOOL_SCHEMAS_RESPONSES = OPENAI_NATIVE_TOOLS + TOOL_SCHEMAS_RESPONSES_ZFAE


# ---------------------------------------------------------------------------
# Approval-scope user context (per-async-task uid for tools that need it)
# ---------------------------------------------------------------------------
_approval_scope_user_cv: _cv.ContextVar[str | None] = _cv.ContextVar(
    "approval_scope_user", default=None
)


def set_approval_scope_user_id(uid: str | None) -> None:
    """Set the current user_id context for manage_approval_scope / set_user_tier."""
    _approval_scope_user_cv.set(uid)


def get_approval_scope_user_id() -> str | None:
    """Read the current per-task user_id, or None if no chat context is active."""
    return _approval_scope_user_cv.get()


# ---------------------------------------------------------------------------
# Distiller — wraps oversize tool results before they reach the next turn.
# Implementation lives in tool_distill.py; we inject the distiller-loader
# helpers below so this module stays the single owner of the loader.
# ---------------------------------------------------------------------------
async def _maybe_summarize(
    name: str, arguments: dict, raw: str, call_id: str | None = None
) -> str:
    return await _maybe_summarize_impl(
        name, arguments, raw, call_id,
        pick_distiller=_pick_distiller,
        get_distiller_spec=_get_distiller_spec,
    )


# ---------------------------------------------------------------------------
# Public dispatch — routes through the registry, with skill_* handled inline.
# ---------------------------------------------------------------------------
async def execute_tool(name: str, arguments: dict) -> str:
    """Dispatch a tool call and return the result as a plain string. Oversized
    results are persisted (so the agent can drill back via tool_result_fetch)
    and then distilled before being handed back to the calling model."""
    raw = await _execute_tool_inner(name, arguments)

    call_id: str | None = None
    if name != "tool_result_fetch" and isinstance(raw, str) and len(raw) > _TOOL_RESULT_PASS_TOKENS * 4:
        import uuid
        call_id = f"call-{uuid.uuid4().hex[:12]}"
        try:
            from ..storage import storage
            await storage.save_tool_result(call_id, name, arguments or {}, raw)
        except Exception as exc:
            print(f"[tool_results] persist failed for {name} call_id={call_id}: {exc}")
            call_id = None

    return await _maybe_summarize(name, arguments or {}, raw, call_id)


async def _execute_tool_inner(name: str, arguments: dict) -> str:
    """Raw dispatch — returns the tool's unfiltered output. skill_* handlers
    live in this module (they wrap the a0-skill loader); everything else goes
    through the per-tool registry."""
    args = arguments or {}
    try:
        if name == "skill_recommend":
            return _skill_recommend(
                query=args.get("query", ""),
                limit=int(args.get("limit", 5) or 5),
            )
        if name == "skill_load":
            return _skill_load(args.get("name", ""))
        try:
            return await _registry_dispatch(name, **args)
        except KeyError:
            return f"[unknown tool: {name}]"
    except Exception as exc:
        return f"[tool error — {name}: {exc}]"


__all__ = [
    "TOOL_SCHEMAS_CHAT",
    "TOOL_SCHEMAS_RESPONSES",
    "TOOL_SCHEMAS_RESPONSES_ZFAE",
    "OPENAI_NATIVE_TOOLS",
    "execute_tool",
    "set_caller_provider",
    "reset_caller_provider",
    "set_approval_scope_user_id",
    "get_approval_scope_user_id",
    "get_a0_skill_manifest",
    "get_a0_skill_body",
    "_discover_a0_skills",
    "_skill_recommend",
    "_skill_load",
]
# 316:55
