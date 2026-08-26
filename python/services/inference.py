# 406:107 0:0 16:14
# === MODULE_BUILD ===
# id: a0_service_inference
#   module_name: inference
#   module_kind: service
#   summary: Orchestrates LLM calls across registered energy providers (Grok/Gemini/Claude/OpenAI-style) — resolves role, normalizes reasoning effort, runs the tool loop, and injects tier-specific prompt_context.
#   owner: Erin Spencer
#   public_surface: call_provider
#   internal_surface: _instance_memory_block, _slot_instance_block, _slot_routing_info, _sanitize_provider_error, _canonical_tool_calls, _gate_to_effort, _effort_to_thinking_budget, _call_openai_routed, _call_anthropic
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; inference is the live model-call path and has no migration state.
#   requires: a0_service_tool_executor, a0_service_prompt_assembly, a0_service_attachments, a0_service_energy_registry
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===
import os
import json
import copy
import random
import asyncio
import logging
from typing import Optional, Callable, Awaitable, Any
import httpx

from .tool_executor import (
    TOOL_SCHEMAS_CHAT,
    TOOL_SCHEMAS_RESPONSES,
    execute_tool,
    set_caller_provider,
)
from .prompt_assembly import _prepend_doctrine
from .attachments import build_provider_messages as _build_provider_messages
# Single source of truth for provider specs — loaded from python/config/providers.json.
# Replaces the old hardcoded PROVIDER_ENDPOINTS dict per the no-string-literals doctrine.
from .energy_registry import BUILTIN_PROVIDERS, resolve_provider_id

_log = logging.getLogger("a0p.inference")


async def _instance_memory_block(provider_id: str) -> str:
    """Fetch editable instance memory for the provider's primary model.

    Reads instance_memory rows for the model_instances row whose model_id
    matches this provider's model string. Also prepends swarm_context if set.
    Returns "" when no instance exists, no entries exist, or on any error —
    so inference is never blocked by this path.

    The user controls injection by editing or deleting memory entries via
    /api/v1/agents/instances/{id}/memory (admin). Deleting all entries and
    clearing swarm_context on the instance stops injection entirely.
    """
    try:
        from ..database import get_session
        from sqlalchemy import text as _sa_text
        spec = BUILTIN_PROVIDERS.get(provider_id, {})
        model_id = (spec.get("model") or "").strip()
        if not model_id:
            return ""
        async with get_session() as session:
            inst = (await session.execute(_sa_text(
                "SELECT id, swarm_context FROM model_instances "
                "WHERE model_id = :mid LIMIT 1"
            ), {"mid": model_id})).mappings().first()
            if not inst:
                return ""
            iid = str(inst["id"])
            sc = (inst["swarm_context"] or "").strip()
            rows = (await session.execute(_sa_text(
                "SELECT tier, content FROM instance_memory "
                "WHERE instance_id = :iid "
                "ORDER BY tier DESC, created_at DESC LIMIT 40"
            ), {"iid": iid})).mappings().all()
        parts: list[str] = []
        if sc:
            parts.append(sc)
        for r in rows:
            parts.append(f"[{(r['tier'] or '').upper()}] {r['content']}")
        return "\n".join(parts)
    except Exception:
        return ""


async def _slot_instance_block(slot: str) -> str:
    """Fetch instance memory for the instance assigned to the given role slot.

    Queries model_instances by role_slot, then fetches instance_memory rows.
    Also prepends swarm_context if set. Returns "" when no instance is assigned
    to the slot, no entries exist, or on any error — inference is never blocked.
    """
    mem, _ = await _slot_routing_info(slot)
    return mem


async def _slot_routing_info(slot: str) -> tuple[str, "str | None"]:
    """Return (instance_memory_block, resolved_provider_id) for a role slot.

    Extends _slot_instance_block by also resolving which provider_id to use
    based on the model_id stored on the assigned model_instances row.
    Matches model_id against BUILTIN_PROVIDERS so the slot can route across
    vendors (grok, gemini, claude, openai-*), not just inject memory.
    Returns ("", None) when no instance is assigned, on any error, or when
    the model_id does not match any known provider — inference is never blocked.
    """
    try:
        from ..database import get_session
        from sqlalchemy import text as _sa_text
        async with get_session() as session:
            inst = (await session.execute(_sa_text(
                "SELECT id, model_id, swarm_context FROM model_instances "
                "WHERE role_slot = :slot LIMIT 1"
            ), {"slot": slot})).mappings().first()
            if not inst:
                return "", None
            iid = str(inst["id"])
            model_id = (inst["model_id"] or "").strip()
            sc = (inst["swarm_context"] or "").strip()
            rows = (await session.execute(_sa_text(
                "SELECT tier, content FROM instance_memory "
                "WHERE instance_id = :iid "
                "ORDER BY tier DESC, created_at DESC LIMIT 40"
            ), {"iid": iid})).mappings().all()
        parts: list[str] = []
        if sc:
            parts.append(sc)
        for r in rows:
            parts.append(f"[{(r['tier'] or '').upper()}] {r['content']}")
        mem = "\n".join(parts)
        resolved = next(
            (pid for pid, p in BUILTIN_PROVIDERS.items() if p.get("model") == model_id),
            None,
        )
        return mem, resolved
    except Exception:
        return "", None


# Anthropic prompt caching minimum is 1024 tokens. We use a rough char-based
# estimate (~4 chars/token) to skip cache_control when the prefix is too small.
_ANTHROPIC_CACHE_MIN_CHARS = 4096


# Retry policy: 2 retries (3 attempts total) with jittered exponential backoff
# on 429 and 5xx. 4xx other than 429 fail fast.
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_SLEEP = 1.5


def _safe_error_snippet(raw: object, limit: int = 200) -> str:
    """Sanitize an arbitrary error string so it's safe to surface to the UI.

    Strips control chars, collapses whitespace, drops anything that looks like
    a credential token or query string, and truncates. Empty if nothing safe
    remains — callers should fall back to a generic label in that case.
    """
    if not raw:
        return ""
    s = str(raw).replace("\r", " ").replace("\n", " ").replace("\t", " ")
    s = " ".join(s.split())
    # Strip URL query strings and obvious key=value pairs (env-var leakage guard).
    import re as _re
    s = _re.sub(r"\?[^\s]+", "", s)
    s = _re.sub(r"\b[A-Za-z_][A-Za-z0-9_]*=[\S]+", "", s)
    # Strip bearer/sk- token shapes.
    s = _re.sub(r"\b(?:Bearer\s+|sk-)[A-Za-z0-9_\-\.]{6,}", "", s)
    s = s.strip(" .,;:")
    if len(s) > limit:
        s = s[:limit].rstrip() + "…"
    return s


def _sanitize_provider_error(provider: str, exc: BaseException) -> str:
    """Return a single-line user-safe error summary; full detail goes to server log."""
    _log.exception("[%s] provider call failed", provider)

    # google-genai SDK errors carry useful, safe fields (.code, .message, .status).
    # Surface them so users can tell quota/auth/blocked-content apart instead of
    # all collapsing to "[gemini error: ClientError]".
    try:
        from google.genai import errors as _genai_errors  # type: ignore
        if isinstance(exc, _genai_errors.APIError):
            code = getattr(exc, "code", None) or getattr(exc, "status", None) or "?"
            msg = _safe_error_snippet(getattr(exc, "message", None) or str(exc))
            return f"[{provider} error: {code} {msg}]".rstrip(" ]") + "]"
    except ImportError:
        pass

    if isinstance(exc, httpx.HTTPStatusError):
        try:
            code = exc.response.status_code
        except Exception:
            code = "?"
        # Try to lift a JSON `error.message` / `message` field from the response body.
        body_msg = ""
        try:
            data = exc.response.json()
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, dict):
                    body_msg = err.get("message") or err.get("code") or ""
                elif isinstance(err, str):
                    body_msg = err
                else:
                    body_msg = data.get("message") or ""
        except Exception:
            body_msg = ""
        body_msg = _safe_error_snippet(body_msg)
        if body_msg:
            return f"[{provider} error: HTTP {code} {body_msg}]"
        return f"[{provider} error: HTTP {code}]"
    if isinstance(exc, httpx.TimeoutException):
        return f"[{provider} error: request timed out]"
    if isinstance(exc, httpx.HTTPError):
        return f"[{provider} error: network error]"
    # Generic — include the type plus a sanitized message snippet if non-empty.
    snippet = _safe_error_snippet(str(exc))
    if snippet:
        return f"[{provider} error: {type(exc).__name__}: {snippet}]"
    return f"[{provider} error: {type(exc).__name__}]"


def _canonical_tool_calls(tool_calls: list[dict]) -> str:
    """Produce a stable string fingerprint of a list of tool calls for repeat detection."""
    norm = []
    for tc in tool_calls:
        if "function" in tc:
            name = tc.get("function", {}).get("name", "")
            args = tc.get("function", {}).get("arguments", "")
        elif tc.get("type") == "function_call":
            name = tc.get("name", "")
            args = tc.get("arguments", "")
        else:
            name = tc.get("name", "")
            args = tc.get("input", "") or tc.get("arguments", "")
        try:
            args_obj = json.loads(args) if isinstance(args, str) else args
            args_str = json.dumps(args_obj, sort_keys=True, default=str)
        except Exception:
            args_str = str(args)

# Anthropic API version (stable; new features arrive via anthropic-beta header).
_ANTHROPIC_VERSION = "2023-06-01"


def _gate_to_effort(effort: Optional[str]) -> str:
    """Normalize a reasoning effort hint to the canonical scale used by Grok / GPT-5."""
    if not effort:
        return "low"
    e = effort.lower()
    if e in ("minimal", "low", "medium", "high"):
        return e
    return "low"


def _effort_to_thinking_budget(effort: Optional[str], max_tokens: int) -> int:
    """Map effort → Claude thinking budget tokens. Must be < max_tokens and >= 1024."""
    e = _gate_to_effort(effort)
    budget = {"minimal": 0, "low": 1024, "medium": 4096, "high": 16384}.get(e, 1024)
    if budget == 0:
        return 0
    # budget must be strictly less than max_tokens, and at least 1024
    return max(1024, min(budget, max(1024, max_tokens - 512)))

_MAX_TOOL_ROUNDS = 5


def _get_max_tool_rounds() -> int:
    """Return the per-request tool round limit, honoring any per-conversation override."""
    from .run_context import current_max_tool_rounds as _cmtr
    v = _cmtr.get(None)
    return v if v is not None else _MAX_TOOL_ROUNDS


async def call_provider(
    provider_id: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    max_tokens: int = 8000,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
    reasoning_effort: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    skip_manifest: bool = False,
) -> tuple[str, dict]:
    """
    Forward messages to the named provider with the system prompt prepended.
    Returns (content, usage_dict).
    user_id is threaded into the OpenAI path for approval-scope checking.
    skip_approval=True bypasses the approval gate (used for replay after explicit APPROVE).
    skip_manifest=True omits the skill manifest from the doctrine prefix (saves
    ~500 tokens; use for internal/automated callers that never invoke skill_load).
    reasoning_effort is mapped per-provider, gated by capability flags in
    providers.json (single source of truth — no model slugs in code):
      - OpenAI: passed via openai_router call_cfg (ignored on the openai branch)
      - Grok:   passed as reasoning_effort when spec.supports_reasoning_effort
      - Claude: mapped to thinking.budget_tokens when spec.supports_thinking
      - Gemini: honored only on the native SDK path (gemini3 spec.supports_thinking)
    """
    system_prompt = _prepend_doctrine(system_prompt, skip_manifest=skip_manifest)
    # Conductor slot routing: classify task → pick slot → inject that slot's instance memory.
    # resolve_role does keyword matching against routing rules; defaults to "conduct".
    # Falls back to provider model_id match if no instance is assigned to the resolved slot.
    from .openai_router import resolve_role as _resolve_role
    _task_text = next(
        (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), ""
    )
    _slot = _resolve_role(_task_text)
    _imem, _slot_provider = await _slot_routing_info(_slot)
    if not _imem:
        _imem = await _instance_memory_block(provider_id)
    if _imem:
        system_prompt = (system_prompt or "") + "\n\n## Instance Memory\n" + _imem
    if _slot_provider:
        provider_id = _slot_provider
    provider_id = resolve_provider_id(provider_id) or provider_id
    messages = _build_provider_messages(messages, provider_id)

    if provider_id == "openai":
        return await _call_openai_routed(messages, system_prompt, use_tools=use_tools, user_id=user_id, skip_approval=skip_approval)

    spec = BUILTIN_PROVIDERS.get(provider_id)
    if not spec:
        raise RuntimeError(
            f"Unknown provider_id={provider_id!r} — no spec in BUILTIN_PROVIDERS. "
            f"This indicates a misrouted call; fix at the caller."
        )

    # OpenAI-vendored single-model providers (openai-5.5, openai-5.5-pro and
    # any future siblings). The legacy "openai" provider above goes through
    # role-based router; these go straight to openai_provider.call with the
    # spec's pinned model. reasoning_effort is clamped UP to the spec's
    # min_reasoning_effort (no silent downgrade — gpt-5.5-pro returns HTTP
    # 400 on 'low', so we honor the floor verbatim, not silently swallow).
    if spec.get("vendor") == "openai":
        api_key = os.environ.get(spec["env_key"], "")
        if not api_key:
            raise RuntimeError(
                f"{provider_id} unavailable: env var {spec['env_key']} is not set. "
                f"Set the API key or route the request to a configured provider."
            )
        effective_effort = (reasoning_effort or "medium").lower()
        min_effort = spec.get("min_reasoning_effort")
        if min_effort:
            order = {"minimal": 0, "low": 1, "medium": 2, "high": 3}
            if order.get(effective_effort, 0) < order.get(min_effort, 0):
                effective_effort = min_effort
        payload_messages: list[dict] = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        payload_messages.extend(messages)
        from .providers.openai_provider import call as openai_call
        return await openai_call(
            payload_messages,
            model_override=spec["model"],
            api_key=api_key,
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=effective_effort,
        )

    api_key = os.environ.get(spec["env_key"], "")
    if not api_key:
        raise RuntimeError(
            f"{provider_id} unavailable: env var {spec['env_key']} is not set. "
            f"Set the API key or route the request to a configured provider."
        )

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    vendor = spec.get("vendor", "")

    if vendor == "anthropic":
        return await _call_anthropic(
            api_key, spec["model"], payload_messages, max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            enable_caching=spec.get("supports_prompt_caching", False),
        )

    if vendor == "google":
        from .providers.gemini_provider import call as gemini_call
        return await gemini_call(
            payload_messages,
            api_key=api_key,
            model_override=spec["model"],
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            provider_id=provider_id,
            supports_thinking=bool(spec.get("supports_thinking")),
        )

    if vendor == "xai":
        from .providers.xai_provider import call as grok_call
        return await grok_call(
            payload_messages,
            api_key=api_key,
            model_override=spec["model"],
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            progress_callback=progress_callback,
        )

    if vendor == "deepseek":
        from .providers.deepseek_provider import call as deepseek_call
        return await deepseek_call(
            payload_messages,
            api_key=api_key,
            model_override=spec["model"],
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            provider_id=provider_id,
            progress_callback=progress_callback,
        )

    # No-silent-fallback doctrine: if we got here the spec exists in
    # BUILTIN_PROVIDERS but its vendor isn't wired to a call path — raise so
    # the caller sees a real error rather than a silent no-op.
    raise ValueError(
        f"provider_id={provider_id!r} vendor={vendor!r} has no call path in "
        f"the inference dispatcher. Add a vendor branch or fix providers.json."
    )


async def _call_openai_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
) -> tuple[str, dict]:
    """
    Route to the appropriate role via openai_router, check approval gate,
    then call the Responses API.
    route_decision and approval_packet are kept strictly schema-compliant.
    Call config (model, effort, etc.) is obtained separately via make_call_config().
    user_id is used to load pre-approved scopes so pre-authorized actions bypass the gate.
    """
    from .openai_router import make_route_decision, make_call_config, make_approval_packet, get_triggered_actions
    from ..logger import log_openai_event, seed_openai_hmmm_if_empty
    from ..config.policy_loader import get_hmmm_seed_items, get_action_scope, get_scope_categories
    from ..storage import storage

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())

    task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")

    pre_approved_scopes: set[str] = set()
    if user_id:
        try:
            pre_approved_scopes = await storage.get_approval_scope_names(user_id)
        except Exception as _scope_err:
            print(f"[approval_scopes] failed to load scopes for {user_id}: {_scope_err}")

    route_decision = make_route_decision(task_text, pre_approved_scopes=pre_approved_scopes)
    role = route_decision["role"]
    call_cfg = make_call_config(role)

    if route_decision["requires_approval"] and not skip_approval:
        import uuid
        gate_id = f"gate-{uuid.uuid4().hex[:8]}"
        packet = make_approval_packet(task_text, gate_id)
        input_repr = json.dumps({"task": task_text})
        output_repr = json.dumps(packet)
        await log_openai_event(
            role=role,
            model=call_cfg["model"],
            reasoning_effort=call_cfg["reasoning_effort"],
            input_text=input_repr,
            output_text=output_repr,
            approval_state="pending",
        )
        usage = {
            "approval_state": "pending",
            "gate_id": gate_id,
            "approval_packet": packet,
            "route_decision": route_decision,
        }
        triggered = get_triggered_actions(task_text)
        scope_hints: list[str] = []
        scope_categories = get_scope_categories()
        seen_scopes: set[str] = set()
        for action in triggered:
            sc = get_action_scope(action)
            if sc and sc not in seen_scopes and sc in scope_categories:
                meta = scope_categories[sc]
                scope_hints.append(f"  Pre-approve all {meta['label']}: APPROVE SCOPE {sc}")
                seen_scopes.add(sc)
        scope_section = "\n" + "\n".join(scope_hints) if scope_hints else ""
        content = (
            f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
            f"Action: {packet['action'][:120]}\n"
            f"Impact: {packet['impact']}\n"
            f"Rollback: {packet['rollback']}\n"
            f"To approve this action: APPROVE {gate_id}"
            f"{scope_section}"
        )
        return content, usage

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "openai unavailable: env var OPENAI_API_KEY is not set. "
            "Set the API key or route the request to a configured provider."
        )

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    from .providers.openai_provider import call as openai_call
    content, usage = await openai_call(
        full_input,
        api_key=api_key,
        model_override=call_cfg["model"],
        max_tokens=call_cfg["max_output_tokens"],
        use_tools=use_tools,
        reasoning_effort=call_cfg["reasoning_effort"],
        temperature=call_cfg["temperature"],
        store=call_cfg["store"],
    )

    input_repr = json.dumps(full_input)
    await log_openai_event(
        role=role,
        model=call_cfg["model"],
        reasoning_effort=call_cfg["reasoning_effort"],
        input_text=input_repr,
        output_text=content,
        approval_state="not_required",
    )
    usage["route_decision"] = route_decision
    return content, usage



async def _call_anthropic(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    enable_caching: bool = True,
) -> tuple[str, dict]:
    """Backward-compat shim — delegates to providers.claude_provider.call.

    The real implementation moved to python/services/providers/claude_provider.py
    per energy-model-task-overhaul P3. New callers should import that module
    directly and pass `role=` instead of a pre-resolved model id; legacy
    callers in this file (the dispatcher at line ~547) still pass `model`
    positionally and that path keeps working via `model_override`.
    """
    from .providers.claude_provider import call as _claude_call
    return await _claude_call(
        messages,
        api_key=api_key,
        model_override=model,
        max_tokens=max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort,
        enable_caching=enable_caching,
    )


# 406:107 0:0 16:14
