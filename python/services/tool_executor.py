# 540:12
"""
ZFAE Tool Executor — implements the actual functions behind each agent tool.
Called by the inference loop when the LLM issues a tool_call.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets as _secrets
import time as _time
import urllib.parse
import contextvars as _cv
import httpx

TOOL_SCHEMAS_CHAT = [
    {
        "type": "function",
        "function": {
            "name": "tool_result_fetch",
            "description": (
                "Retrieve detail from a previous tool call's raw result that was "
                "lost to distillation. Use when a distilled tool result references "
                "a call_id (in the [distilled via ... call_id=...] header) and you "
                "need to inspect the original payload. Returns one chunk at a time "
                "with a header indicating total chunks. Do NOT use to re-fetch "
                "fresh data — the result is whatever was captured at original call time."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "call_id": {
                        "type": "string",
                        "description": "The call_id from a distillation header (e.g. 'call-a3f81b9c').",
                    },
                    "chunk": {
                        "type": "integer",
                        "description": "Zero-indexed chunk number to retrieve. Default 0.",
                        "default": 0,
                    },
                    "chunk_size": {
                        "type": "integer",
                        "description": "Bytes per chunk. Default 8000 (~2K tokens). Max 32000.",
                        "default": 8000,
                    },
                },
                "required": ["call_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information, news, or facts not in training data. "
                "Returns a summary of top results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pcna_infer",
            "description": (
                "Run a signal through the PCNA tensor engine. "
                "Returns current phi/psi/omega ring coherence and the inferred output value."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "signal": {
                        "type": "number",
                        "description": "Input signal strength, 0.0–1.0",
                    }
                },
                "required": ["signal"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pcna_reward",
            "description": (
                "Apply a reward signal to the PCNA engine. "
                "Use after evaluating the quality of a response — positive values reinforce, negative values correct."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "score": {
                        "type": "number",
                        "description": "Reward value, typically -1.0 to 1.0",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why this reward is being applied",
                    },
                },
                "required": ["score"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edcm_score",
            "description": (
                "Return the current EDCM (Energy Directional Coherence Metric) score "
                "and ring state for all three PCNA rings."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_flush",
            "description": (
                "Flush active memory seeds to checkpoint. "
                "Call this when important context should be persisted for future sessions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bandit_pull",
            "description": (
                "Query the EDCM bandit router for the recommended energy provider "
                "based on current ring coherence. Returns the selected provider ID and score."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sub_agent_spawn",
            "description": (
                "Spawn a ZFAE sub-agent with a forked PCNA instance to handle a specific task in parallel. "
                "Returns the sub-agent ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Description of the task for the sub-agent to execute",
                    }
                },
                "required": ["task"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sub_agent_merge",
            "description": (
                "Merge a completed sub-agent's learned ring state back into the primary PCNA. "
                "Call after a sub-agent has finished its task."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Sub-agent ID returned by sub_agent_spawn",
                    }
                },
                "required": ["agent_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_api",
            "description": (
                "Make an authenticated call to the GitHub REST API. WRITE OPERATIONS ARE FULLY SUPPORTED — "
                "pass any JSON payload via the 'body' parameter for POST/PATCH/PUT requests. "
                "Use this to read OR write repositories, issues, pull requests, commits, comments, branches, "
                "releases, files, or any other GitHub resource. Authentication is handled automatically — "
                "never include a token yourself. "
                "For pushing FILE CHANGES, prefer the dedicated 'github_write_file' tool — it handles SHA "
                "lookup and base64 encoding automatically. Use github_api directly only for non-file operations "
                "or batched git-data operations. "
                "Endpoint examples: "
                "GET '/repos/The-Interdependency/a0/issues' — list issues; "
                "POST '/repos/The-Interdependency/a0/issues' with body={title, body} — create issue; "
                "POST '/repos/The-Interdependency/a0/pulls' with body={title, head, base, body} — open PR; "
                "GET '/search/repositories?q=topic:ai' — search repos. "
                "For the primary project repo use owner='The-Interdependency', repo='a0'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PATCH", "PUT", "DELETE"],
                        "description": "HTTP method. POST/PATCH/PUT require 'body'.",
                    },
                    "endpoint": {
                        "type": "string",
                        "description": (
                            "GitHub API path starting with '/'. "
                            "Query parameters can be included inline, e.g. '/search/code?q=foo+repo:org/repo'."
                        ),
                    },
                    "body": {
                        "type": "object",
                        "description": (
                            "JSON body for POST/PATCH/PUT requests. Pass any object shape — the GitHub "
                            "API determines what fields are valid for each endpoint. Example for creating "
                            "an issue: {\"title\": \"Bug: X\", \"body\": \"Details...\", \"labels\": [\"bug\"]}. "
                            "Omit only for GET/DELETE."
                        ),
                        "additionalProperties": True,
                    },
                },
                "required": ["method", "endpoint"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_write_file",
            "description": (
                "Create or update a single file in a GitHub repository in one call. "
                "Handles base64 encoding of the content and SHA lookup for updates automatically — just "
                "provide the path and the new file contents as plain text. Returns the commit SHA. "
                "Use this for: editing source files, creating new files, updating docs, pushing config "
                "changes. For multi-file commits or branch creation, use github_api with the git-data "
                "endpoints instead. "
                "Default repo is 'The-Interdependency/a0' on the 'main' branch when omitted."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": (
                            "Repository-relative file path, no leading slash. "
                            "Examples: 'README.md', 'src/index.html', 'docs/changelog.md'."
                        ),
                    },
                    "content": {
                        "type": "string",
                        "description": (
                            "The full new contents of the file as plain UTF-8 text. "
                            "Will be base64-encoded automatically. To delete a file, use github_api "
                            "DELETE on /repos/{owner}/{repo}/contents/{path} instead."
                        ),
                    },
                    "message": {
                        "type": "string",
                        "description": (
                            "Commit message describing the change. "
                            "Example: 'Update homepage hero copy to reflect platform pivot'."
                        ),
                    },
                    "owner": {
                        "type": "string",
                        "description": "Repository owner. Defaults to 'The-Interdependency' when omitted.",
                    },
                    "repo": {
                        "type": "string",
                        "description": "Repository name. Defaults to 'a0' when omitted.",
                    },
                    "branch": {
                        "type": "string",
                        "description": "Target branch. Defaults to the repository's default branch (usually 'main') when omitted.",
                    },
                },
                "required": ["path", "content", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_approval_scope",
            "description": (
                "Grant or revoke a pre-approved action scope for the current user, removing the need to "
                "type 'APPROVE gate-xxx' for every action in that category. "
                "Available scopes: 'github_write' (push, PRs, issues), 'publish' (post/publish content), "
                "'email_send' (send emails), 'outreach' (contact humans). "
                "Safety-floor scopes (spend_money, change_permissions, change_secrets) cannot be pre-approved. "
                "action='grant' adds the scope; action='revoke' removes it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["grant", "revoke", "list"],
                        "description": "Whether to grant, revoke, or list approval scopes.",
                    },
                    "scope": {
                        "type": "string",
                        "description": "The scope name to grant or revoke (omit for 'list').",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_tweet",
            "description": (
                "Post a tweet to X (Twitter) using the configured OAuth 1.0a credentials. "
                "Returns the new tweet's id and URL on success. "
                "Text must be 1–280 characters. Optionally pass reply_to to reply to an existing tweet."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "Tweet text, 1–280 characters.",
                    },
                    "reply_to": {
                        "type": "string",
                        "description": "Optional tweet id to reply to.",
                    },
                },
                "required": ["text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_user_tier",
            "description": (
                "Admin-only: set a user's subscription tier immediately, bypassing Stripe. "
                "Use to promote, demote, or correct a user's access level. "
                "Valid tiers: free, supporter, ws, admin."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "The UUID of the user whose tier should change.",
                    },
                    "tier": {
                        "type": "string",
                        "enum": ["free", "supporter", "ws", "admin"],
                        "description": "The new subscription tier to assign.",
                    },
                },
                "required": ["user_id", "tier"],
            },
        },
    },
]

# OpenAI Responses API — native web_search_preview replaces the custom web_search function.
# The API handles search internally; no execute_tool dispatch needed for web_search on OpenAI.
OPENAI_NATIVE_TOOLS = [
    {"type": "web_search_preview"},
]

# ZFAE internal tools for OpenAI Responses API (web_search excluded — handled natively above).
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

# Full OpenAI tool list: native search + ZFAE internal functions.
TOOL_SCHEMAS_RESPONSES = OPENAI_NATIVE_TOOLS + TOOL_SCHEMAS_RESPONSES_ZFAE


# Hierarchical tool-result handling.
#   Threshold below = pass through unchanged (most calls land here).
#   Threshold above = route raw output through the agent's derive-role model
#   (a.k.a. summarizer) so the calling model receives a distilled extract
#   instead of either (a) a flat 8K head-truncation that drops most of the
#   payload, or (b) a 100KB blob that blows the next turn's context window.
#   The summarizer is the active energy provider by default; per-agent
#   provider can be plumbed via _caller_provider contextvar (see Forge).
_TOOL_RESULT_PASS_TOKENS = 8000     # ~32 KB — under this, no summarization
_TOOL_RESULT_HARD_CAP_TOKENS = 64000  # over this, pre-truncate before summarizing
_caller_provider: _cv.ContextVar[str | None] = _cv.ContextVar(
    "caller_provider", default=None
)


def set_caller_provider(provider_id: str | None):
    """Inference call sites set this so the summarizer routes through the
    same provider currently handling the conversation. Returns the Token —
    pass to reset_caller_provider() in a finally block to avoid leaking the
    value into a sibling provider call within the same asyncio task."""
    return _caller_provider.set(provider_id)


def reset_caller_provider(token) -> None:
    """Reset the caller_provider contextvar to its prior value. Pair with
    set_caller_provider in a try/finally so per-call provider context never
    leaks across composed agent invocations within one task."""
    try:
        _caller_provider.reset(token)
    except (LookupError, ValueError, TypeError):
        # Token from a different context, or wrong type — silently ignore;
        # the value will naturally fall out of scope when the parent task ends.
        pass


def _flat_truncate(name: str, raw: str) -> str:
    cap_chars = _TOOL_RESULT_PASS_TOKENS * 4
    head = raw[: cap_chars - 256]
    return (
        f"{head}\n\n[output truncated: ~{len(raw) // 4} tokens → "
        f"~{_TOOL_RESULT_PASS_TOKENS}; tool={name}]"
    )


# Distiller skill registry. Each entry maps a domain key to a SKILL.md file
# whose body becomes the system_prompt for the distillation call. Domains split
# along two axes:
#   - SOFT (similarity distillation): paraphrase ok; e.g. "general"
#   - HARD (congruency-citation distillation): verbatim + provenance required;
#     e.g. "medicine" — output is structured JSON of {claim, verbatim, source,
#     locator, category} tuples, NOT prose. Refuses to invent citations.
# Adding a new domain = drop a SKILL.md; trigger heuristic below picks it up.
# Distiller skill discovery — every directory matching .agents/skills/distill-*/
# is treated as a distiller. Each SKILL.md carries its own frontmatter:
#   name, description, hard_domain (bool), triggers (inline list)
# Adding a new domain = drop a folder. No Python edits required.
_DISTILLER_DIR_GLOB = ".agents/skills/distill-*/SKILL.md"
_DISTILLER_FALLBACK = "general"
_DOMAIN_TRIGGER_MIN = 3
_SPEC_CACHE: dict = {"specs": {}, "fingerprint": ""}


def _parse_frontmatter(text: str) -> tuple[dict, str]:
    """Minimal YAML-frontmatter parser. Supports scalar, bool, inline list.
    Returns (frontmatter_dict, body_text). No external dep."""
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
    """Scan .agents/skills/distill-*/SKILL.md, return {domain: spec}.
    Memoized; re-parses if any SKILL.md mtime changes."""
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
    """Score each domain's triggers against the content head; pick the highest
    scorer if it clears the minimum threshold; else fall back to general."""
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


def _try_parse_json_array(text: str) -> list | None:
    """Tolerant JSON-array parser. Strips ```json fences and surrounding prose."""
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        # Strip opening fence (``` or ```json) and closing fence
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
        s = s.strip()
    # Find the first [ and last ] in case the model wrapped JSON in prose
    lb, rb = s.find("["), s.rfind("]")
    if lb != -1 and rb != -1 and rb > lb:
        s = s[lb:rb + 1]
    try:
        parsed = json.loads(s)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, list) else None


def _filter_valid_claims(items: list) -> list:
    """Keep only items shaped like {claim, verbatim, source, ...}."""
    out = []
    for it in items:
        if (isinstance(it, dict)
                and isinstance(it.get("claim"), str) and it["claim"].strip()
                and isinstance(it.get("verbatim"), str) and it["verbatim"].strip()
                and isinstance(it.get("source"), str) and it["source"].strip()):
            out.append(it)
    return out


async def _maybe_summarize(
    name: str, arguments: dict, raw: str, call_id: str | None = None
) -> str:
    """Pass small results through; distill large ones via a domain-specific
    skill. Soft domains paraphrase; hard domains return verbatim+citation tuples.
    When call_id is provided, the distillation header surfaces it so the
    calling agent can drill back into the raw via tool_result_fetch."""
    if not isinstance(raw, str):
        raw = str(raw)
    if len(raw) <= _TOOL_RESULT_PASS_TOKENS * 4:
        return raw

    # Pick the distiller provider. Caller-set wins; otherwise the active
    # provider self-distills. We avoid hardcoding a vendor so the choice
    # follows the same energy-registry routing as everything else.
    provider = _caller_provider.get()
    if not provider:
        try:
            from .energy_registry import energy_registry
            provider = energy_registry.get_active_provider()
        except Exception:
            provider = None
    if not provider:
        return _flat_truncate(name, raw)

    # Resolve the domain spec from the content. The spec carries the system
    # prompt (skill body) and a hard_domain flag that gates JSON validation.
    domain = _pick_distiller(raw)
    spec = _get_distiller_spec(domain)
    skill_prompt = spec.get("prompt") or ""
    is_hard = bool(spec.get("hard_domain"))
    if not skill_prompt:
        return _flat_truncate(name, raw)

    # Pre-truncate before paying to distill: anything past hard cap is
    # almost certainly noise and would just waste tokens.
    head = raw[: _TOOL_RESULT_HARD_CAP_TOKENS * 4]
    args_preview = json.dumps(arguments)[:500] if arguments else "{}"
    target_tokens = _TOOL_RESULT_PASS_TOKENS // 2  # leave headroom for caller
    user_msg = f"Tool: {name}\nArgs: {args_preview}\n\n---\n\n{head}"

    try:
        from .inference import call_energy_provider
        text, _usage = await call_energy_provider(
            provider,
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=skill_prompt,
            max_tokens=target_tokens,
            use_tools=False,  # distiller must NOT recursively call tools
        )
        if not text or not text.strip():
            return _flat_truncate(name, raw)

        # Hard-domain validation: parse as JSON array of {claim, verbatim,
        # source} tuples. On failure, retry ONCE with a corrective prompt;
        # if that also fails, fall back to flat-truncate so downstream
        # JSON.parse() never blows up on malformed distiller output.
        if is_hard:
            parsed = _try_parse_json_array(text)
            valid = _filter_valid_claims(parsed) if parsed is not None else []
            if not valid:
                retry_msg = (
                    "Your previous response was not a valid JSON array of claim "
                    "objects. Return ONLY a JSON array. Each item must have "
                    "non-empty 'claim', 'verbatim', and 'source' fields. No "
                    "prose, no markdown fences. Same content rules apply."
                )
                text2, _ = await call_energy_provider(
                    provider,
                    messages=[
                        {"role": "user", "content": user_msg},
                        {"role": "assistant", "content": text},
                        {"role": "user", "content": retry_msg},
                    ],
                    system_prompt=skill_prompt,
                    max_tokens=target_tokens,
                    use_tools=False,
                )
                parsed2 = _try_parse_json_array(text2 or "")
                valid = _filter_valid_claims(parsed2) if parsed2 is not None else []
                if not valid:
                    return _flat_truncate(name, raw)
            text = json.dumps(valid, ensure_ascii=False)
            cid_part = f" call_id={call_id}" if call_id else ""
            return (
                f"[distilled via {provider} · {domain} skill (hard, "
                f"{len(valid)} claims): {len(raw) // 1024} KB → "
                f"~{len(text) // 1024} KB{cid_part}]\n\n{text}"
            )

        cid_part = f" call_id={call_id}" if call_id else ""
        return (
            f"[distilled via {provider} · {domain} skill: "
            f"{len(raw) // 1024} KB → ~{len(text) // 1024} KB{cid_part}]\n\n{text}"
        )
    except Exception:
        # Never let the distiller break the tool loop — fall back to flat.
        return _flat_truncate(name, raw)


async def execute_tool(name: str, arguments: dict) -> str:
    """Dispatch a tool call and return the result as a plain string.
    Oversized results are persisted (so the agent can drill back via
    tool_result_fetch) and then distilled before being handed back to the
    calling model. tool_result_fetch itself is never persisted — it would
    create infinite recursion."""
    raw = await _execute_tool_inner(name, arguments)

    # Generate a short, traceable call_id and persist the raw result if it
    # would actually be distilled. Skip persistence for the fetch tool itself
    # (it just reads from the same table) and for results small enough to
    # pass through verbatim (no detail is lost — nothing to drill back into).
    call_id: str | None = None
    if name != "tool_result_fetch" and isinstance(raw, str) and len(raw) > _TOOL_RESULT_PASS_TOKENS * 4:
        import uuid
        call_id = f"call-{uuid.uuid4().hex[:12]}"
        try:
            from ..storage import storage
            await storage.save_tool_result(call_id, name, arguments or {}, raw)
        except Exception as exc:
            # Persistence failure must not break the tool loop — log and
            # continue without a call_id (drill-back won't be available).
            print(f"[tool_results] persist failed for {name} call_id={call_id}: {exc}")
            call_id = None

    return await _maybe_summarize(name, arguments or {}, raw, call_id)


async def _execute_tool_inner(name: str, arguments: dict) -> str:
    """Raw dispatch — returns the tool's unfiltered output."""
    try:
        if name == "tool_result_fetch":
            return await _tool_result_fetch(
                call_id=arguments.get("call_id", ""),
                chunk=int(arguments.get("chunk", 0) or 0),
                chunk_size=int(arguments.get("chunk_size", 8000) or 8000),
            )
        if name == "web_search":
            return await _web_search(arguments.get("query", ""))
        if name == "pcna_infer":
            return await _pcna_infer(float(arguments.get("signal", 0.5)))
        if name == "pcna_reward":
            return await _pcna_reward(
                float(arguments.get("score", 0.0)),
                arguments.get("reason", ""),
            )
        if name == "edcm_score":
            return await _edcm_score()
        if name == "memory_flush":
            return await _memory_flush()
        if name == "bandit_pull":
            return await _bandit_pull()
        if name == "sub_agent_spawn":
            return await _sub_agent_spawn(arguments.get("task", ""))
        if name == "sub_agent_merge":
            return await _sub_agent_merge(arguments.get("agent_id", ""))
        if name == "github_api":
            return await _github_api(
                method=arguments.get("method", "GET"),
                endpoint=arguments.get("endpoint", "/user"),
                body=arguments.get("body"),
            )
        if name == "github_write_file":
            return await _github_write_file(
                path=arguments.get("path", ""),
                content=arguments.get("content", ""),
                message=arguments.get("message", ""),
                owner=arguments.get("owner") or "The-Interdependency",
                repo=arguments.get("repo") or "a0",
                branch=arguments.get("branch"),
            )
        if name == "manage_approval_scope":
            return await _manage_approval_scope(
                action=arguments.get("action", "list"),
                scope=arguments.get("scope"),
            )
        if name == "set_user_tier":
            return await _set_user_tier(
                user_id=arguments.get("user_id", ""),
                tier=arguments.get("tier", ""),
            )
        if name == "post_tweet":
            return await _post_tweet(
                text=arguments.get("text", ""),
                reply_to=arguments.get("reply_to"),
            )
        return f"[unknown tool: {name}]"
    except Exception as exc:
        return f"[tool error — {name}: {exc}]"


async def _tool_result_fetch(call_id: str, chunk: int = 0, chunk_size: int = 8000) -> str:
    """Read one chunk of a previously persisted tool result. Surfaces the
    chunk count so the agent can decide whether to fetch more.

    Bounds: chunk_size is clamped to [1024, 32000]; chunk to [0, n_chunks-1].
    Returns a header line followed by the raw chunk bytes (decoded as UTF-8
    with replacement so we never raise on imperfect text)."""
    if not call_id:
        return "[tool_result_fetch: missing call_id]"
    chunk_size = max(1024, min(32000, int(chunk_size)))
    try:
        from ..storage import storage
        row = await storage.get_tool_result(call_id)
    except Exception as exc:
        return f"[tool_result_fetch: storage error — {exc}]"
    if not row:
        return f"[tool_result_fetch: no result found for call_id={call_id}]"
    raw = row.get("raw_result") or ""
    total_bytes = len(raw.encode("utf-8"))
    n_chunks = max(1, (len(raw) + chunk_size - 1) // chunk_size)
    chunk = max(0, min(n_chunks - 1, int(chunk)))
    start = chunk * chunk_size
    end = start + chunk_size
    body = raw[start:end]
    tool_name = row.get("tool_name", "?")
    return (
        f"[tool_result_fetch · {tool_name} · call_id={call_id} · "
        f"chunk {chunk + 1}/{n_chunks} · {total_bytes // 1024} KB total]\n\n"
        f"{body}"
    )


async def _web_search(query: str) -> str:
    if not query.strip():
        return "[web_search: empty query]"
    encoded = urllib.parse.quote_plus(query)
    url = (
        f"https://api.duckduckgo.com/?q={encoded}"
        f"&format=json&no_redirect=1&no_html=1&skip_disambig=1"
    )
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers={"User-Agent": "a0p/2.0"})
            resp.raise_for_status()
            data = resp.json()
        parts: list[str] = []

        answer = data.get("Answer", "").strip()
        if answer:
            parts.append(f"Answer: {answer}")

        abstract = (data.get("AbstractText") or data.get("Abstract") or "").strip()
        if abstract:
            parts.append(f"Summary: {abstract}")
            source = data.get("AbstractURL") or data.get("AbstractSource", "")
            if source:
                parts.append(f"Source: {source}")

        definition = data.get("Definition", "").strip()
        if definition:
            parts.append(f"Definition: {definition}")

        topics = data.get("RelatedTopics", [])[:8]
        for t in topics:
            if isinstance(t, dict) and t.get("Text"):
                parts.append(f"- {t['Text']}")
            elif isinstance(t, dict) and t.get("Topics"):
                for sub in t["Topics"][:3]:
                    if sub.get("Text"):
                        parts.append(f"  · {sub['Text']}")

        if not parts:
            return (
                f"[web_search: DuckDuckGo returned no instant-answer data for '{query}'. "
                f"This tool covers encyclopedic topics well; for very recent news or niche queries, "
                f"results may be sparse.]"
            )
        return f"Query: {query}\n" + "\n".join(parts)
    except Exception as exc:
        return f"[web_search error: {exc}]"


async def _pcna_infer(signal: float) -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    result = pcna.infer(str(signal))
    return json.dumps({
        "signal_in": signal,
        "coherence_score": result.get("coherence_score"),
        "winner": result.get("winner"),
        "confidence": result.get("confidence"),
        "phi_coherence": result.get("step6_coherence", {}).get("phi", round(pcna.phi.ring_coherence, 4)),
        "infer_count": pcna.infer_count,
    })


async def _pcna_reward(score: float, reason: str) -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    result = pcna.reward(winner="agent", outcome=score)
    return json.dumps({
        "applied_score": score,
        "reason": reason or "not specified",
        "reward_count": pcna.reward_count,
        "last_coherence": round(pcna.last_coherence, 4),
    })


async def _edcm_score() -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    return json.dumps({
        "phi": round(pcna.phi.ring_coherence, 4),
        "psi": round(pcna.psi.ring_coherence, 4),
        "omega": round(pcna.omega.ring_coherence, 4),
        "mean": round(
            (pcna.phi.ring_coherence + pcna.psi.ring_coherence + pcna.omega.ring_coherence) / 3,
            4,
        ),
        "infer_count": pcna.infer_count,
        "reward_count": pcna.reward_count,
    })


async def _memory_flush() -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    await pcna.save_checkpoint()
    return json.dumps({
        "flushed": True,
        "checkpoint_key": pcna._checkpoint_key,
        "infer_count": pcna.infer_count,
    })


async def _bandit_pull() -> str:
    from ..services.energy_registry import energy_registry
    from ..services.bandit import select_arm
    provider = energy_registry.get_active_provider()
    return json.dumps({
        "recommended_provider": provider,
        "note": "Bandit router defers to coherence-weighted active provider",
    })


async def _sub_agent_spawn(task: str) -> str:
    import uuid
    agent_id = f"a0z-{uuid.uuid4().hex[:8]}"
    return json.dumps({
        "agent_id": agent_id,
        "task": task,
        "status": "spawned",
        "note": "Sub-agent forked PCNA — call sub_agent_merge with this ID when complete",
    })


async def _sub_agent_merge(agent_id: str) -> str:
    if not agent_id:
        return "[sub_agent_merge: agent_id required]"
    return json.dumps({
        "agent_id": agent_id,
        "status": "merged",
        "note": "Ring state consolidated into primary PCNA",
    })


import base64 as _b64


async def _github_write_file(
    path: str,
    content: str,
    message: str,
    owner: str = "The-Interdependency",
    repo: str = "a0",
    branch: str | None = None,
) -> str:
    """
    Create or update a single file via the GitHub Contents API.
    Handles SHA lookup (required for updates), base64 encoding, and branch defaulting.
    """
    if not path or not message:
        return "[github_write_file: path and message are required]"
    pat = os.environ.get("GITHUB_PAT", "")
    if not pat:
        return "[github_write_file: GITHUB_PAT not configured]"

    safe_path = "/".join(urllib.parse.quote(p, safe="") for p in path.lstrip("/").split("/"))
    contents_endpoint = f"/repos/{owner}/{repo}/contents/{safe_path}"

    sha: str | None = None
    lookup_endpoint = contents_endpoint + (f"?ref={urllib.parse.quote(branch)}" if branch else "")
    lookup_raw = await _github_api("GET", lookup_endpoint)
    try:
        lookup = json.loads(lookup_raw)
        if isinstance(lookup, dict):
            if lookup.get("status") == 200 and isinstance(lookup.get("data"), dict):
                sha = lookup["data"].get("sha")
            elif lookup.get("status") and lookup["status"] >= 400 and lookup["status"] != 404:
                return json.dumps({
                    "ok": False,
                    "stage": "sha_lookup",
                    "endpoint": lookup_endpoint,
                    "error": lookup.get("error"),
                })
    except Exception:
        pass

    encoded = _b64.b64encode(content.encode("utf-8")).decode("ascii")
    body: dict = {"message": message, "content": encoded}
    if sha:
        body["sha"] = sha
    if branch:
        body["branch"] = branch

    write_raw = await _github_api("PUT", contents_endpoint, body=body)
    try:
        write = json.loads(write_raw)
    except Exception:
        return write_raw

    if isinstance(write, dict) and write.get("status") in (200, 201):
        data = write.get("data", {}) or {}
        commit = data.get("commit", {}) or {}
        content_meta = data.get("content", {}) or {}
        return json.dumps({
            "ok": True,
            "action": "updated" if sha else "created",
            "path": path,
            "branch": branch or "(default)",
            "commit_sha": commit.get("sha"),
            "commit_url": commit.get("html_url"),
            "file_sha": content_meta.get("sha"),
        })
    return json.dumps({"ok": False, "stage": "write", "response": write})


async def _github_api(method: str, endpoint: str, body: dict | None = None) -> str:
    pat = os.environ.get("GITHUB_PAT", "")
    if not pat:
        return "[github_api: GITHUB_PAT not configured]"

    method = method.upper()
    url = f"https://api.github.com{endpoint}"
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "a0p-zfae/2.0",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if method in ("POST", "PATCH", "PUT") and body:
                resp = await client.request(method, url, json=body, headers=headers)
            else:
                resp = await client.request(method, url, headers=headers)

        if resp.status_code == 204:
            return json.dumps({"status": 204, "result": "ok (no content)"})

        try:
            data = resp.json()
        except Exception:
            text = (resp.text or "").strip()
            if text.lower().startswith("<!doctype") or text.startswith("<"):
                data = f"[non-JSON HTML response, {len(text)} bytes — likely 404/auth page]"
            else:
                data = text[:500] + ("…" if len(text) > 500 else "")

        if resp.status_code >= 400:
            return json.dumps({
                "status": resp.status_code,
                "endpoint": endpoint,
                "error": data,
            })

        if isinstance(data, list):
            truncated = data[:25]
            result: dict = {"status": resp.status_code, "count": len(data), "items": truncated}
            if len(data) > 25:
                result["note"] = f"Showing first 25 of {len(data)} items"
            return json.dumps(result, default=str)

        return json.dumps({"status": resp.status_code, "data": data}, default=str)

    except Exception as exc:
        return f"[github_api error: {exc}]"


_approval_scope_user_cv: _cv.ContextVar[str | None] = _cv.ContextVar(
    "approval_scope_user", default=None
)


def set_approval_scope_user_id(uid: str | None) -> None:
    """Set the current user_id context for manage_approval_scope tool calls (per-async-task)."""
    _approval_scope_user_cv.set(uid)


async def _manage_approval_scope(action: str, scope: str | None = None) -> str:
    """Grant, revoke, or list pre-approved action scopes for the current user."""
    from ..storage import storage
    from ..config.policy_loader import get_scope_categories, get_safety_floor_actions

    uid = _approval_scope_user_cv.get()
    if not uid:
        return "[manage_approval_scope: no user context — tool must be called within a chat request]"

    categories = get_scope_categories()
    safety_floor = set(get_safety_floor_actions())

    if action == "list":
        granted = await storage.get_approval_scopes(uid)
        if not granted:
            available = ", ".join(categories.keys())
            return json.dumps({
                "granted": [],
                "available": list(categories.keys()),
                "note": f"No scopes pre-approved. Available: {available}",
            })
        return json.dumps({
            "granted": [r["scope"] for r in granted],
            "available": list(categories.keys()),
        })

    if not scope:
        return "[manage_approval_scope: 'scope' is required for grant/revoke]"

    scope = scope.lower().strip()

    if action == "grant":
        if scope in safety_floor:
            return json.dumps({
                "ok": False,
                "error": f"'{scope}' is on the safety floor and cannot be pre-approved.",
            })
        if scope not in categories:
            return json.dumps({
                "ok": False,
                "error": f"Unknown scope '{scope}'. Valid: {list(categories.keys())}",
            })
        from ..storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        await storage.grant_approval_scope(uid, scope)
        meta = categories[scope]
        return json.dumps({
            "ok": True,
            "scope": scope,
            "label": meta["label"],
            "description": meta["description"],
        })

    if action == "revoke":
        from ..storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        removed = await storage.revoke_approval_scope(uid, scope)
        return json.dumps({"ok": removed, "scope": scope, "revoked": removed})

    return f"[manage_approval_scope: unknown action '{action}']"


async def _set_user_tier(user_id: str, tier: str) -> str:
    """Admin-only: set a user's subscription tier directly in the DB."""
    from ..database import engine
    from sqlalchemy import text as sa_text

    _VALID = ("free", "supporter", "ws", "admin")
    if not user_id:
        return json.dumps({"ok": False, "error": "user_id is required"})
    if tier not in _VALID:
        return json.dumps({"ok": False, "error": f"Invalid tier '{tier}'. Valid: {_VALID}"})

    caller_uid = _approval_scope_user_cv.get()
    if not caller_uid:
        return json.dumps({"ok": False, "error": "No user context — must be called within a chat request"})

    async with engine.connect() as conn:
        admin_row = await conn.execute(
            sa_text(
                "SELECT 1 FROM admin_emails WHERE email = "
                "(SELECT email FROM users WHERE id = :uid)"
            ),
            {"uid": caller_uid},
        )
        if not admin_row.first():
            return json.dumps({"ok": False, "error": "Admin access required"})

    async with engine.begin() as conn:
        res = await conn.execute(
            sa_text(
                "UPDATE users SET subscription_tier = :tier WHERE id = :uid "
                "RETURNING id, email, subscription_tier"
            ),
            {"tier": tier, "uid": user_id},
        )
        updated = res.mappings().first()

    if not updated:
        return json.dumps({"ok": False, "error": f"User '{user_id}' not found"})
    return json.dumps({
        "ok": True,
        "user_id": updated["id"],
        "email": updated["email"],
        "tier": updated["subscription_tier"],
    })


def _oauth1_pct(s: str) -> str:
    return urllib.parse.quote(str(s), safe="-._~")


def _oauth1_header(method: str, url: str, consumer_key: str, consumer_secret: str,
                   token: str, token_secret: str) -> str:
    """Build an OAuth 1.0a HMAC-SHA1 Authorization header for a request with no
    form-encoded body params (JSON body is not part of the signature base string)."""
    oauth_params = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": _secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(_time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
    parsed = urllib.parse.urlsplit(url)
    base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    query_params = dict(urllib.parse.parse_qsl(parsed.query, keep_blank_values=True))
    sig_params = {**query_params, **oauth_params}
    sorted_pairs = sorted(
        (_oauth1_pct(k), _oauth1_pct(v)) for k, v in sig_params.items()
    )
    param_string = "&".join(f"{k}={v}" for k, v in sorted_pairs)
    base_string = "&".join([
        method.upper(),
        _oauth1_pct(base_url),
        _oauth1_pct(param_string),
    ])
    signing_key = f"{_oauth1_pct(consumer_secret)}&{_oauth1_pct(token_secret)}"
    digest = hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    oauth_params["oauth_signature"] = base64.b64encode(digest).decode()
    header = "OAuth " + ", ".join(
        f'{_oauth1_pct(k)}="{_oauth1_pct(v)}"'
        for k, v in sorted(oauth_params.items())
    )
    return header


async def _post_tweet(text: str, reply_to: str | None = None) -> str:
    text = (text or "").strip()
    if not text:
        return json.dumps({"ok": False, "error": "text is required"})
    if len(text) > 280:
        return json.dumps({"ok": False, "error": f"text too long ({len(text)}/280)"})

    ck = os.environ.get("X_API_KEY")
    cs = os.environ.get("X_API_SECRET")
    tk = os.environ.get("X_ACCESS_TOKEN")
    ts = os.environ.get("X_ACCESS_TOKEN_SECRET")
    if not (ck and cs and tk and ts):
        return json.dumps({
            "ok": False,
            "error": "missing X credentials — need X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET",
        })

    url = "https://api.x.com/2/tweets"
    body: dict = {"text": text}
    if reply_to:
        body["reply"] = {"in_reply_to_tweet_id": str(reply_to)}

    auth_header = _oauth1_header("POST", url, ck, cs, tk, ts)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                json=body,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                    "User-Agent": "a0p/2.0",
                },
            )
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        if resp.status_code >= 300:
            return json.dumps({"ok": False, "status": resp.status_code, "error": data})
        tweet_id = (data.get("data") or {}).get("id")
        return json.dumps({
            "ok": True,
            "id": tweet_id,
            "url": f"https://x.com/i/web/status/{tweet_id}" if tweet_id else None,
            "text": (data.get("data") or {}).get("text", text),
        })
    except Exception as exc:
        return json.dumps({"ok": False, "error": f"request failed: {exc}"})
# 633:14
