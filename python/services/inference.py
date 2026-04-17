# 355:27
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
)

_log = logging.getLogger("a0p.inference")

# Anthropic prompt caching minimum is 1024 tokens. We use a rough char-based
# estimate (~4 chars/token) to skip cache_control when the prefix is too small.
_ANTHROPIC_CACHE_MIN_CHARS = 4096

# Retry policy: 2 retries (3 attempts total) with jittered exponential backoff
# on 429 and 5xx. 4xx other than 429 fail fast.
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_SLEEP = 1.5


def _sanitize_provider_error(provider: str, exc: BaseException) -> str:
    """Return a single-line user-safe error summary; full detail goes to server log."""
    _log.exception("[%s] provider call failed", provider)
    if isinstance(exc, httpx.HTTPStatusError):
        try:
            code = exc.response.status_code
        except Exception:
            code = "?"
        return f"[{provider} error: HTTP {code}]"
    if isinstance(exc, httpx.TimeoutException):
        return f"[{provider} error: request timed out]"
    if isinstance(exc, httpx.HTTPError):
        return f"[{provider} error: network error]"
    # Generic — never include str(exc) which may carry env-var values, URLs, or keys.
    return f"[{provider} error: {type(exc).__name__}]"


async def _post_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_payload: dict,
    headers: dict,
) -> httpx.Response:
    """POST with jittered exponential backoff on 429 and 5xx. 4xx other than 429 fail fast."""
    last_exc: Optional[BaseException] = None
    for attempt in range(_RETRY_MAX_ATTEMPTS):
        try:
            resp = await client.post(url, json=json_payload, headers=headers)
            status = resp.status_code
            if status == 429 or 500 <= status < 600:
                last_exc = httpx.HTTPStatusError(
                    f"retryable status {status}", request=resp.request, response=resp
                )
                if attempt < _RETRY_MAX_ATTEMPTS - 1:
                    sleep_s = _RETRY_BASE_SLEEP * (2 ** attempt) + random.uniform(0, 0.5)
                    await asyncio.sleep(sleep_s)
                    continue
                resp.raise_for_status()
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt < _RETRY_MAX_ATTEMPTS - 1:
                sleep_s = _RETRY_BASE_SLEEP * (2 ** attempt) + random.uniform(0, 0.5)
                await asyncio.sleep(sleep_s)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("retry loop exited without response")


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
        norm.append(f"{name}::{args_str}")
    return "|".join(sorted(norm))

PROVIDER_ENDPOINTS = {
    "grok": {
        "url": "https://api.x.ai/v1/chat/completions",
        "env_key": "XAI_API_KEY",
        "model": "grok-4-fast-reasoning",
        "supports_reasoning_effort": True,
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/chat/completions",
        "env_key": "GEMINI_API_KEY",
        "model": "gemini-2.5-flash",
        "supports_reasoning_effort": False,
    },
    "claude": {
        "url": "https://api.anthropic.com/v1/messages",
        "env_key": "ANTHROPIC_API_KEY",
        "model": "claude-sonnet-4-5",
        "supports_reasoning_effort": False,
        "supports_thinking": True,
        "supports_prompt_caching": True,
    },
}

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

_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

_MAX_TOOL_ROUNDS = 5


async def call_energy_provider(
    provider_id: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    max_tokens: int = 2048,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
    reasoning_effort: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Forward messages to the active energy provider with the system prompt prepended.
    Returns (content, usage_dict).
    user_id is threaded into the OpenAI path for approval-scope checking.
    skip_approval=True bypasses the approval gate (used for replay after explicit APPROVE).
    reasoning_effort is mapped per-provider:
      - OpenAI: passed via openai_router call_cfg (this param is ignored on the openai branch)
      - Grok:   passed as reasoning_effort on grok-4 / grok-4-fast-reasoning
      - Claude: mapped to thinking.budget_tokens (extended thinking)
      - Gemini: not honored on the compat endpoint (no thinking_config support there)
    """
    if provider_id == "openai":
        return await _call_openai_routed(messages, system_prompt, use_tools=use_tools, user_id=user_id, skip_approval=skip_approval)

    spec = PROVIDER_ENDPOINTS.get(provider_id)
    if not spec:
        return _fallback_response(provider_id), {}

    api_key = os.environ.get(spec["env_key"], "")
    if not api_key:
        return _fallback_response(provider_id), {}

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    if provider_id == "claude":
        return await _call_anthropic(
            api_key, spec["model"], payload_messages, max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            enable_caching=spec.get("supports_prompt_caching", False),
        )

    return await _call_openai_compat(
        api_key, spec["url"], spec["model"], payload_messages, max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort if spec.get("supports_reasoning_effort") else None,
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
        return _fallback_response("openai"), {}

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    content, usage = await _call_openai_responses(
        api_key=api_key,
        model=call_cfg["model"],
        input_messages=full_input,
        max_output_tokens=call_cfg["max_output_tokens"],
        temperature=call_cfg["temperature"],
        reasoning_effort=call_cfg["reasoning_effort"],
        store=call_cfg["store"],
        use_tools=use_tools,
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


async def _call_openai_responses(
    api_key: str,
    model: str,
    input_messages: list[dict],
    max_output_tokens: int = 4000,
    temperature: float = 1.0,
    reasoning_effort: str = "low",
    store: bool = False,
    use_tools: bool = True,
) -> tuple[str, dict]:
    """
    Call the OpenAI Responses API (/v1/responses) with optional tool calling.
    Runs up to _MAX_TOOL_ROUNDS tool-call/result loops before returning final text.
    """

    def _fmt_messages(msgs: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in msgs:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                out.append({"role": "system", "content": content})
            elif role == "assistant":
                out.append({"role": "assistant", "content": [{"type": "output_text", "text": content}]})
            else:
                out.append({"role": "user", "content": [{"type": "input_text", "text": content}]})
        return out

    # Defensive deepcopy: caller's list is never mutated by our tool loop.
    openai_input = _fmt_messages(copy.deepcopy(input_messages))

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        payload: dict = {
            "model": model,
            "input": openai_input,
            "store": store,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
            "text": {"format": {"type": "text"}},
        }
        if reasoning_effort and reasoning_effort != "none":
            payload["reasoning"] = {"effort": reasoning_effort}
        if use_tools:
            payload["tools"] = TOOL_SCHEMAS_RESPONSES

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await _post_with_retry(client, _OPENAI_RESPONSES_URL, json_payload=payload, headers=headers)
                data = resp.json()
        except Exception as exc:
            return _sanitize_provider_error("openai", exc), accumulated_usage

        for k, v in data.get("usage", {}).items():
            accumulated_usage[k] = accumulated_usage.get(k, 0) + (v if isinstance(v, (int, float)) else 0)

        output_items = data.get("output", [])
        tool_calls = [item for item in output_items if item.get("type") == "function_call"]

        # Repeat-tool break: if the LLM emitted the exact same set of calls
        # as last round, it's looping. Stop and answer directly.
        if tool_calls:
            fp = _canonical_tool_calls(tool_calls)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_calls or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            content = ""
            for item in output_items:
                if item.get("type") == "message":
                    for part in item.get("content", []):
                        if part.get("type") == "output_text":
                            content = part.get("text", "")
                            break
                if content:
                    break
            return content or "[openai: empty response]", accumulated_usage

        # Responses API multi-turn: only function_call items from the model's output
        # belong in the next round's input (ahead of function_call_output results).
        # Including message/reasoning/web_search_call items causes 400/404 errors.
        for item in output_items:
            if item.get("type") == "function_call":
                openai_input.append(item)

        for tc in tool_calls:
            call_id = tc.get("call_id", "")
            name = tc.get("name", "")
            try:
                args = json.loads(tc.get("arguments", "{}"))
            except Exception:
                args = {}
            result = await execute_tool(name, args)
            openai_input.append({
                "type": "function_call_output",
                "call_id": call_id,
                "output": result,
            })

    return "[openai: tool loop exhausted]", accumulated_usage


async def _call_openai_compat(
    api_key: str,
    url: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Chat Completions format (Grok, Gemini).
    Runs tool-calling loop: execute tool_calls, inject tool results, re-call until done.
    reasoning_effort is forwarded only when the caller has confirmed support (Grok).
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    # Defensive deepcopy: caller's list is never mutated by our tool loop.
    current_messages = copy.deepcopy(messages)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None
    # Provider name for sanitized errors — derive from URL.
    provider_name = "grok" if "x.ai" in url else ("gemini" if "googleapis" in url else "provider")

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        payload: dict = {
            "model": model,
            "messages": current_messages,
            "max_tokens": max_tokens,
        }
        if reasoning_effort:
            payload["reasoning_effort"] = _gate_to_effort(reasoning_effort)
        if use_tools:
            payload["tools"] = TOOL_SCHEMAS_CHAT
            payload["tool_choice"] = "auto"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await _post_with_retry(client, url, json_payload=payload, headers=headers)
                data = resp.json()
        except Exception as exc:
            return _sanitize_provider_error(provider_name, exc), accumulated_usage

        for k, v in data.get("usage", {}).items():
            accumulated_usage[k] = accumulated_usage.get(k, 0) + (v if isinstance(v, (int, float)) else 0)

        choice = data.get("choices", [{}])[0]
        message = choice.get("message", {})
        finish_reason = choice.get("finish_reason", "stop")
        tool_calls = message.get("tool_calls") or []

        # Repeat-tool break: detect and short-circuit identical call sets.
        if tool_calls:
            fp = _canonical_tool_calls(tool_calls)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_calls or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            return message.get("content") or "[no content]", accumulated_usage

        current_messages.append(message)

        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "")
            call_id = tc.get("id", "")
            try:
                args = json.loads(tc.get("function", {}).get("arguments", "{}"))
            except Exception:
                args = {}
            result = await execute_tool(name, args)
            current_messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": result,
            })

    return "[tool loop exhausted]", accumulated_usage


async def _call_anthropic(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    enable_caching: bool = True,
) -> tuple[str, dict]:
    """
    Anthropic Messages API with Claude tool use, extended thinking, and prompt caching.

    - reasoning_effort: when set, enables extended thinking with a budget mapped from effort.
    - enable_caching: when True, marks the system prompt and tools list with cache_control,
      cutting input cost ~80% on repeated turns. Requires the prefix to be >= 1024 tokens
      to actually cache (Anthropic ignores cache_control on smaller prefixes silently).
    """
    spec = PROVIDER_ENDPOINTS["claude"]
    system_text = ""
    filtered: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system_text = m["content"]
        else:
            filtered.append(m)

    headers = {
        "x-api-key": api_key,
        "anthropic-version": _ANTHROPIC_VERSION,
        "Content-Type": "application/json",
    }

    claude_tools = [
        {
            "name": s["function"]["name"],
            "description": s["function"]["description"],
            "input_schema": s["function"]["parameters"],
        }
        for s in TOOL_SCHEMAS_CHAT
    ]
    # Anthropic prompt caching has a 1024-token minimum (~4096 chars). Below that
    # the cache_control header just adds overhead, so we skip it.
    tools_size_estimate = sum(
        len(t.get("name", "")) + len(t.get("description", "")) + len(json.dumps(t.get("input_schema", {})))
        for t in claude_tools
    )
    cache_tools = enable_caching and claude_tools and tools_size_estimate >= _ANTHROPIC_CACHE_MIN_CHARS
    if cache_tools:
        claude_tools[-1] = {**claude_tools[-1], "cache_control": {"type": "ephemeral"}}

    # Build the system prompt as a structured block so we can attach cache_control.
    system_blocks: list[dict] = []
    if system_text:
        block: dict = {"type": "text", "text": system_text}
        if enable_caching and len(system_text) >= _ANTHROPIC_CACHE_MIN_CHARS:
            block["cache_control"] = {"type": "ephemeral"}
        system_blocks.append(block)

    # Extended thinking (skip for tool-use turns to avoid the "preserve thinking blocks"
    # complexity — re-enable for the final answer turn only).
    thinking_budget = _effort_to_thinking_budget(reasoning_effort, max_tokens)

    # Defensive deepcopy: caller's list is never mutated by our tool loop.
    current_messages = copy.deepcopy(filtered)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        payload: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": current_messages,
        }
        if system_blocks:
            payload["system"] = system_blocks
        if use_tools:
            payload["tools"] = claude_tools
        # Extended thinking is enabled on every round; the assistant turn we re-inject
        # below preserves the model's thinking blocks intact (Anthropic requires this
        # when continuing a thinking conversation).
        if thinking_budget > 0:
            payload["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
            # thinking forces temperature=1 — don't set temperature alongside it.

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await _post_with_retry(client, spec["url"], json_payload=payload, headers=headers)
                data = resp.json()
        except Exception as exc:
            return _sanitize_provider_error("claude", exc), accumulated_usage

        for k, v in (data.get("usage") or {}).items():
            accumulated_usage[k] = accumulated_usage.get(k, 0) + (v if isinstance(v, (int, float)) else 0)

        stop_reason = data.get("stop_reason", "end_turn")
        content_blocks = data.get("content", [])

        tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

        # Repeat-tool break for Claude.
        if tool_use_blocks:
            fp = _canonical_tool_calls(tool_use_blocks)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_use_blocks or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            for block in content_blocks:
                if block.get("type") == "text":
                    return block["text"], accumulated_usage
            return "[claude: no text in response]", accumulated_usage

        current_messages.append({"role": "assistant", "content": content_blocks})

        tool_results = []
        for block in tool_use_blocks:
            name = block.get("name", "")
            tool_id = block.get("id", "")
            args = block.get("input", {})
            result = await execute_tool(name, args)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result,
            })

        current_messages.append({"role": "user", "content": tool_results})

    return "[claude: tool loop exhausted]", accumulated_usage


def _fallback_response(provider_id: str) -> str:
    return f"[{provider_id} API key not configured — energy provider unavailable]"
# 355:27
