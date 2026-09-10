# 399:164 0:0 16:15
# === MODULE_BUILD ===
# id: a0_service_inference
#   module_name: inference
#   module_kind: service
#   summary: Orchestrates LLM calls across registered energy providers (Grok/Gemini/Claude/OpenAI-compatible) — resolves role, normalizes reasoning effort, runs the tool loop, and injects tier-specific prompt_context.
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
#   requires: a0_service_tool_executor, a0_service_prompt_assembly, a0_service_attachments, a0_service_energy_registry, a0_service_approval_gate
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===
# === CONTRACTS ===
# id: inference_tool_repeat_fingerprint_ignores_transport_ids
#   given: consecutive tool calls have the same function name and semantic arguments but different provider-generated ids
#   then: _canonical_tool_calls emits the same fingerprint so the second execution is refused
#   class: safety
#   since: 2026-09-09
#
# id: inference_compatible_provider_receives_classified_role
#   given: routing classifies a request into a role slot handled by an OpenAI-compatible provider
#   then: the compatible transport receives that exact role for model override resolution
#   class: correctness
#   since: 2026-09-09
#
# id: inference_fanout_preserves_requested_provider
#   given: multi-model orchestration explicitly requests one provider for a lane
#   then: call_provider uses that provider and its instance memory without replacing it from the shared prompt's role slot
#   class: correctness
#   since: 2026-09-09
#
# id: inference_auto_route_gates_and_reports_effective_provider
#   given: an unpinned request is reassigned from its seed provider to a classified role-slot provider
#   then: the role-resolved concrete model's catalog owner is tier-gated before transport and returned with that model in usage for billing and provenance attribution
#   class: security
#   since: 2026-09-09
#
# id: inference_explicit_openai_model_is_pinned
#   given: an explicit concrete OpenAI model resolves through the legacy openai provider branch
#   then: the selected model reaches the compatible transport without role-policy or environment replacement
#   class: correctness
#   since: 2026-09-09
#
# id: inference_legacy_model_alias_memory_survives
#   given: a canonical provider has persisted model instances stored under a declared legacy model alias
#   then: provider memory lookup considers the canonical model and every declared alias while preferring the canonical row
#   class: correctness
#   since: 2026-09-10
#
# id: inference_compatible_provider_approval_gate
#   given: a tool-enabled provider turn requests an external write without a grant, whether text preflight or actual dispatch identifies it
#   then: inference returns a pending approval gate before mutation and replay bypasses text preflight only while dispatch remains limited to the gate's exact scopes
#   class: security
#   since: 2026-09-09
#
# id: inference_compatible_transport_uses_effective_owner
#   given: role routing selects a concrete model owned by a different compatible-provider catalog entry
#   then: transport uses the owning provider's complete registry spec and identity as well as the selected model
#   class: correctness
#   since: 2026-09-09
# === END CONTRACTS ===
import json
import logging
import os
from typing import Awaitable, Callable, Optional, Sequence
import httpx

from .prompt_assembly import _prepend_doctrine
from .attachments import build_provider_messages as _build_provider_messages
# Single source of truth for provider specs — loaded from python/config/providers.json.
# Replaces the old hardcoded PROVIDER_ENDPOINTS dict per the no-string-literals doctrine.
from .energy_registry import BUILTIN_PROVIDERS

_log = logging.getLogger("a0p.inference")


async def _instance_memory_block(provider_id: str) -> str:
    """Fetch editable instance memory for the provider's primary model.

    Reads instance_memory rows for the model_instances row whose model_id
    matches this provider's current model or a declared legacy alias. Also
    prepends swarm_context if set.
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
        model_ids = [model_id, *(
            alias for alias in (spec.get("model_aliases") or []) if alias != model_id
        )]
        model_ids.extend(pid for pid, candidate in BUILTIN_PROVIDERS.items()
                         if candidate.get("deprecated_alias_for") == provider_id)
        async with get_session() as session:
            inst = (await session.execute(_sa_text(
                "SELECT id, swarm_context FROM model_instances "
                "WHERE model_id = ANY(CAST(:mids AS text[])) "
                "ORDER BY CASE WHEN model_id = :mid THEN 0 ELSE 1 END LIMIT 1"
            ), {"mid": model_id, "mids": model_ids})).mappings().first()
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
            (
                pid
                for pid, p in BUILTIN_PROVIDERS.items()
                if p.get("model") == model_id
                or model_id in (p.get("model_aliases") or [])
            ),
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
    """Fingerprint semantic tool requests without volatile transport identifiers."""
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
        norm.append({"name": str(name), "arguments": args_str})
    return json.dumps(norm, sort_keys=True, separators=(",", ":"))

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


def _attribute_provider(result: tuple[str, dict], provider_id: str,
                        model_id: Optional[str] = None) -> tuple[str, dict]:
    content, usage = result
    attributed = dict(usage or {})
    attributed["provider_id"] = provider_id
    if model_id: attributed["model_id"] = model_id
    return content, attributed


async def call_provider(
    provider_id: str, messages: list[dict],
    system_prompt: Optional[str] = None, max_tokens: int = 8000,
    use_tools: bool = True, user_id: Optional[str] = None,
    skip_approval: bool = False, reasoning_effort: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    skip_manifest: bool = False,
    pin_requested_provider: bool = False, model_override: Optional[str] = None,
    routed_user_tier: Optional[str] = None,
    approved_tool_scopes: Optional[Sequence[str]] = None,
) -> tuple[str, dict]:
    """
    Forward messages to the named provider with the system prompt prepended.
    Returns (content, usage_dict).
    user_id is threaded into the OpenAI path for approval-scope checking.
    skip_approval=True bypasses only replayed text preflight; tool dispatch still
    requires an exact match in approved_tool_scopes or a persisted user scope.
    skip_manifest=True omits the skill manifest from the doctrine prefix (saves
    ~500 tokens; use for internal/automated callers that never invoke skill_load).
    pin_requested_provider=True is reserved for explicit-model and multi-model
    orchestration lanes; it preserves the resolved provider, model, and that
    provider's instance memory.
    reasoning_effort is mapped per-provider, gated by capability flags in
    providers.json (single source of truth — no model slugs in code):
      - OpenAI: passed via openai_router call_cfg unless a concrete model is pinned
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
    if pin_requested_provider:
        _imem = await _instance_memory_block(provider_id)
        _slot_provider = None
    else:
        _imem, _slot_provider = await _slot_routing_info(_slot)
        if not _imem:
            _imem = await _instance_memory_block(provider_id)
    if _imem:
        system_prompt = (system_prompt or "") + "\n\n## Instance Memory\n" + _imem
    if _slot_provider:
        provider_id = _slot_provider
    if provider_id == "openai":
        result = await _call_openai_routed(
            messages, system_prompt, use_tools=use_tools, user_id=user_id,
            skip_approval=skip_approval,
            model_override=model_override if pin_requested_provider else None,
            routed_user_tier=routed_user_tier,
            approved_tool_scopes=approved_tool_scopes)
        return _attribute_provider(result, result[1].get("provider_id", provider_id), result[1].get("model_id"))

    spec = BUILTIN_PROVIDERS.get(provider_id)
    if not spec:
        raise RuntimeError(
            f"Unknown provider_id={provider_id!r} — no spec in BUILTIN_PROVIDERS. "
            f"This indicates a misrouted call; fix at the caller."
        )
    from .model_catalog import resolve_routed_model
    effective_provider_id, effective_model = await resolve_routed_model(
        provider_id, _slot, pin_requested_provider=pin_requested_provider,
        model_override=model_override, user_tier=routed_user_tier)
    # A role-selected model can belong to a different provider entry. From
    # this point onward transport must use that owner's complete configuration
    # (identity, base URL, key env, capabilities), not the seed provider's.
    provider_id = effective_provider_id
    spec = BUILTIN_PROVIDERS[effective_provider_id]
    messages = _build_provider_messages(messages, effective_provider_id)

    from . import approval_gate_service
    if use_tools:
        _, pending = await approval_gate_service.approval_gate_result(
            messages, user_id=user_id, skip_approval=skip_approval,
            provider_id=effective_provider_id, model_id=effective_model,
            reasoning_effort=reasoning_effort,
        )
        if pending is not None:
            return pending

    async def capture(transport: Awaitable[tuple[str, dict]]) -> tuple[str, dict]:
        return await approval_gate_service.capture_tool_approval(
            transport, messages=messages, provider_id=effective_provider_id,
            model_id=effective_model, reasoning_effort=reasoning_effort,
            approved_tool_scopes=approved_tool_scopes,
        )

    # OpenAI-vendored single-model providers (openai-5.5, openai-5.5-pro and
    # any future siblings). The legacy "openai" provider above goes through
    # role-based router; these go through the generic compatible transport
    # with the spec's pinned model. reasoning_effort is clamped UP to the spec's
    # min_reasoning_effort (no silent downgrade — gpt-5.5-pro returns HTTP
    # 400 on 'low', so we honor the floor verbatim, not silently swallow).
    if spec.get("vendor") == "openai":
        api_key = os.environ.get(spec["api_key_env"], "")
        if not api_key:
            raise RuntimeError(
                f"{provider_id} unavailable: env var {spec['api_key_env']} is not set. "
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
        from .providers import openai_compatible_provider
        result = await capture(openai_compatible_provider.call(
            payload_messages, provider_id=provider_id, role=_slot,
            model_override=effective_model, api_key=api_key, max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=effective_effort, pin_model_override=True))
        return _attribute_provider(result, effective_provider_id, effective_model)

    api_key = os.environ.get(spec["api_key_env"], "")
    if not api_key:
        raise RuntimeError(
            f"{provider_id} unavailable: env var {spec['api_key_env']} is not set. "
            f"Set the API key or route the request to a configured provider."
        )

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    vendor = spec.get("vendor", "")

    if spec.get("adapter") == "openai-compatible":
        from .providers import openai_compatible_provider
        result = await capture(openai_compatible_provider.call(
            payload_messages, provider_id=provider_id, role=_slot,
            api_key=api_key, model_override=effective_model, max_tokens=max_tokens,
            use_tools=use_tools, reasoning_effort=reasoning_effort,
            pin_model_override=True, progress_callback=progress_callback))
        return _attribute_provider(result, effective_provider_id, effective_model)

    if vendor == "anthropic":
        result = await capture(_call_anthropic(
            api_key, effective_model, payload_messages, max_tokens,
            use_tools=use_tools, reasoning_effort=reasoning_effort,
            enable_caching=spec.get("supports_prompt_caching", False)))
        return _attribute_provider(result, effective_provider_id, effective_model)

    if vendor == "google":
        from .providers.gemini_provider import call as gemini_call
        result = await capture(gemini_call(
            payload_messages, api_key=api_key, model_override=effective_model,
            max_tokens=max_tokens, use_tools=use_tools, reasoning_effort=reasoning_effort,
            provider_id=provider_id,
            supports_thinking=bool(spec.get("supports_thinking"))))
        return _attribute_provider(result, effective_provider_id, effective_model)

    if vendor == "xai":
        from .providers.xai_provider import call as grok_call
        result = await capture(grok_call(
            payload_messages, api_key=api_key, model_override=effective_model,
            max_tokens=max_tokens, use_tools=use_tools, reasoning_effort=reasoning_effort,
            progress_callback=progress_callback))
        return _attribute_provider(result, effective_provider_id, effective_model)

    # No-silent-fallback doctrine: if we got here the spec exists in
    # BUILTIN_PROVIDERS but its vendor isn't wired to a call path — raise so
    # the caller sees a real error rather than a silent no-op.
    raise ValueError(
        f"provider_id={provider_id!r} vendor={vendor!r} has no call path in "
        f"the inference dispatcher. Add a vendor branch or fix providers.json."
    )


async def _call_openai_routed(
    messages: list[dict], system_prompt: Optional[str] = None,
    use_tools: bool = True, user_id: Optional[str] = None,
    skip_approval: bool = False, model_override: Optional[str] = None,
    routed_user_tier: Optional[str] = None,
    approved_tool_scopes: Optional[Sequence[str]] = None,
) -> tuple[str, dict]:
    """
    Route to the appropriate role via openai_router, check approval gate,
    then call the Responses API.
    route_decision and approval_packet are kept strictly schema-compliant.
    Call config (model, effort, etc.) is obtained separately via make_call_config().
    user_id is used to load pre-approved scopes so pre-authorized actions bypass the gate.
    """
    from . import approval_gate_service
    from .openai_router import make_call_config, resolve_role
    from ..logger import log_openai_event

    task_text = approval_gate_service._current_user_text(messages)

    role = resolve_role(task_text)
    call_cfg = make_call_config(role)
    if model_override is not None:
        call_cfg = {**call_cfg, "model": model_override}
    from .model_catalog import routed_model_owner
    effective_provider_id = routed_model_owner(
        call_cfg["model"], "openai", routed_user_tier)
    messages = _build_provider_messages(messages, effective_provider_id)
    route_decision, pending = await approval_gate_service.approval_gate_result(
        messages, user_id=user_id, skip_approval=skip_approval,
        provider_id=effective_provider_id, model_id=call_cfg["model"],
        reasoning_effort=call_cfg["reasoning_effort"],
    )
    if pending is not None:
        return pending

    spec = BUILTIN_PROVIDERS[effective_provider_id]
    api_key_env = str(spec.get("api_key_env") or "")
    api_key = os.environ.get(api_key_env, "")
    if not api_key:
        raise RuntimeError(
            f"{effective_provider_id} unavailable: env var {api_key_env} is not set. "
            "Set the API key or route the request to a configured provider."
        )

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    from .providers import openai_compatible_provider
    result = await approval_gate_service.capture_tool_approval(
        openai_compatible_provider.call(
        full_input, provider_id=effective_provider_id, role=role,
        api_key=api_key, model_override=call_cfg["model"],
        max_tokens=call_cfg["max_output_tokens"],
        use_tools=use_tools, reasoning_effort=call_cfg["reasoning_effort"],
        temperature=call_cfg["temperature"],
        store=call_cfg["store"],
        pin_model_override=True), messages=messages,
        provider_id=effective_provider_id, model_id=call_cfg["model"],
        reasoning_effort=call_cfg["reasoning_effort"],
        approved_tool_scopes=approved_tool_scopes)
    if result[1].get("approval_state") == "pending":
        return result
    content, usage = result
    usage.update({"provider_id": effective_provider_id, "model_id": call_cfg["model"]})

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
        messages, api_key=api_key, model_override=model,
        max_tokens=max_tokens, use_tools=use_tools,
        reasoning_effort=reasoning_effort,
        enable_caching=enable_caching)


# 399:164 0:0 16:15
