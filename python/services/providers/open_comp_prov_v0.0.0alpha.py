# 338:55 0:0 2:5
"""Generic OpenAI-compatible provider transport.

Provider identity, endpoint, credential name, model, API family, reasoning
scale, and tool profile are registry data. This module contains no
provider-specific endpoint or model literals.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_openai_compatible
#   module_name: openai_compatible_provider
#   module_kind: adapter
#   summary: Registry-driven OpenAI-compatible transport supporting Responses and Chat Completions with the shared repeat-safe tool loop.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: _call_responses, _call_chat_completions, _normalize_reasoning_effort, _response_tools
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: tests/test_open_comp_prov_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Revert this module and remove registry entries whose adapter is openai-compatible.
#   requires: a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference, a0_service_energy_registry
#   since: 2026-09-07
#   unresolved: none
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: openai_compatible_registry_driven
#   given: a registered OpenAI-compatible provider id, messages, and optional model/key/effort overrides
#   then: endpoint, model, credential name, API family, effort scale, and tool profile come from providers.json; missing explicit configuration fails closed and credentials do not enter error text
#   class: correctness
#   since: 2026-09-07
#
# id: openai_compatible_responses_preserves_reasoning_items
#   given: a Responses tool round emits reasoning and function-call output items
#   then: the continuation includes the complete output sequence before function-call outputs
#   class: correctness
#   since: 2026-09-09
#
# id: openai_stateless_reasoning_is_replayable
#   given: an OpenAI Responses request enables reasoning while store is false
#   then: reasoning.encrypted_content is requested for the stateless continuation
#   class: correctness
#   since: 2026-09-09
#
# id: openai_compatible_caller_provider_is_scoped
#   given: a compatible-provider call runs inside an async task with an existing caller-provider context
#   then: the provider identity is active for the complete transport loop and the prior context is restored on every exit
#   class: correctness
#   since: 2026-09-09
# === END CONTRACTS ===

import copy
import json
import os
from typing import Any, Callable, Optional

from openai import AsyncOpenAI

from ._resolver import resolve_model_for_role


def _accumulate_usage(total: dict, usage: dict | None) -> None:
    for key, value in (usage or {}).items():
        if isinstance(value, (int, float)):
            total[key] = total.get(key, 0) + value
        elif isinstance(value, dict):
            nested = total.setdefault(key, {})
            if isinstance(nested, dict):
                _accumulate_usage(nested, value)


def _safe_provider_error(provider_name: str, exc: BaseException, api_key: str) -> str:
    from ..inference import _safe_error_snippet

    raw = str(exc).replace(api_key, "[redacted]") if api_key else str(exc)
    return f"[{provider_name} error: {type(exc).__name__}: {safe}]" if (safe := _safe_error_snippet(raw)) else f"[{provider_name} error: {type(exc).__name__}]"


def _normalize_reasoning_effort(spec: dict, effort: Optional[str]) -> Optional[str]:
    if not spec.get("supports_reasoning_effort"):
        return None
    requested = (effort or spec.get("default_reasoning_effort") or "medium").lower().strip()
    mapped = (spec.get("reasoning_effort_map") or {}).get(requested, requested)
    allowed = spec.get("reasoning_efforts") or []
    if allowed and mapped not in allowed:
        return spec.get("default_reasoning_effort") or allowed[0]
    return mapped


def _response_tools(tool_profile: str) -> list[dict]:
    from ..tool_executor import get_active_chat_schemas, get_active_responses_schemas

    if tool_profile != "functions-only":
        return get_active_responses_schemas()
    result: list[dict] = []
    for schema in get_active_chat_schemas():
        function = schema.get("function") or {}
        if not function.get("name"):
            continue
        result.append({
            "type": "function",
            "name": function["name"],
            "description": function.get("description", ""),
            "parameters": function.get(
                "parameters", {"type": "object", "properties": {}}
            ),
        })
    return result


def _format_responses_messages(messages: list[dict]) -> list[dict]:
    formatted: list[dict] = []
    for message in copy.deepcopy(messages):
        role = message.get("role", "user")
        content = message.get("content", "")
        if isinstance(content, list):
            formatted.append({"role": role, "content": content})
        elif role in {"system", "assistant", "developer"}:
            formatted.append({"role": role, "content": content})
        else:
            formatted.append({
                "role": "user",
                "content": [{"type": "input_text", "text": str(content)}],
            })
    return formatted


def _responses_text(data: dict) -> str:
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "output_text" and part.get("text"):
                return str(part["text"])
    return str(data.get("output_text") or "")


def _responses_kwargs(
    *,
    model: str,
    input_items: list[dict],
    max_output_tokens: int,
    temperature: float,
    reasoning_effort: Optional[str],
    store: bool,
    supports_store: bool,
    tools: list[dict] | None,
) -> dict:
    kwargs: dict[str, Any] = {
        "model": model,
        "input": input_items,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
        "text": {"format": {"type": "text"}},
    }
    if supports_store:
        kwargs["store"] = store
    if reasoning_effort and reasoning_effort != "none":
        kwargs["reasoning"] = {"effort": reasoning_effort}
        if supports_store and not store:
            kwargs["include"] = ["reasoning.encrypted_content"]
    if tools:
        kwargs["tools"] = tools
    return kwargs


async def _call_responses(
    *,
    api_key: str,
    model: str,
    input_messages: list[dict],
    max_output_tokens: int,
    temperature: float,
    reasoning_effort: Optional[str],
    store: bool,
    use_tools: bool,
    base_url: str | None = None,
    provider_name: str = "openai-compatible",
    tools_override: list[dict] | None = None,
    supports_store: bool = False,
) -> tuple[str, dict]:
    """Run the Responses API with a repeat-safe local function-tool loop."""
    from ..inference import (
        _canonical_tool_calls,
        _get_max_tool_rounds,
    )
    from ..tool_executor import execute_tool

    input_items = _format_responses_messages(input_messages)
    client_kwargs: dict[str, str] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url.rstrip("/")
    client = AsyncOpenAI(**client_kwargs)
    accumulated_usage: dict = {}
    previous_fingerprint: Optional[str] = None
    tools = tools_override if use_tools else None

    for round_index in range(_get_max_tool_rounds() + 1):
        kwargs = _responses_kwargs(
            model=model,
            input_items=input_items,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            reasoning_effort=reasoning_effort,
            store=store,
            supports_store=supports_store,
            tools=tools,
        )
        try:
            response = await client.responses.create(**kwargs)
            data = response.model_dump()
        except Exception as exc:
            return _safe_provider_error(provider_name, exc, api_key), accumulated_usage

        _accumulate_usage(accumulated_usage, data.get("usage"))
        output_items = data.get("output") or []
        tool_calls = [item for item in output_items if item.get("type") == "function_call"]

        if tool_calls:
            fingerprint = _canonical_tool_calls(tool_calls)
            if fingerprint == previous_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            previous_fingerprint = fingerprint

        if not tool_calls or not use_tools or round_index >= _get_max_tool_rounds():
            content = _responses_text(data)
            if content:
                return content, accumulated_usage
            input_items.append({
                "role": "user",
                "content": [{"type": "input_text", "text": "Please provide your response."}],
            })
            try:
                nudge = await client.responses.create(**_responses_kwargs(
                    model=model,
                    input_items=input_items,
                    max_output_tokens=max_output_tokens,
                    temperature=temperature,
                    reasoning_effort=reasoning_effort,
                    store=store,
                    supports_store=supports_store,
                    tools=None,
                ))
                nudge_data = nudge.model_dump()
                _accumulate_usage(accumulated_usage, nudge_data.get("usage"))
                return _responses_text(nudge_data) or f"[{provider_name}: empty response]", accumulated_usage
            except Exception as exc:
                return _safe_provider_error(provider_name, exc, api_key), accumulated_usage

        # Responses continuations without previous_response_id must replay the
        # complete output sequence, including encrypted/reasoning state.
        input_items.extend(copy.deepcopy(output_items))
        for tool_call in tool_calls:
            try:
                arguments = json.loads(tool_call.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}
            result = await execute_tool(tool_call.get("name", ""), arguments)
            input_items.append({
                "type": "function_call_output",
                "call_id": tool_call.get("call_id", ""),
                "output": result,
            })

    return f"[{provider_name}: tool loop exhausted]", accumulated_usage


def _chat_text(message: dict) -> str:
    content = message.get("content") or ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(part.get("text", "")) for part in content if isinstance(part, dict)
        )
    return str(content)


async def _call_chat_completions(
    *,
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    reasoning_effort: Optional[str],
    use_tools: bool,
    base_url: str | None,
    provider_name: str,
) -> tuple[str, dict]:
    """Run Chat Completions with the same repeat and tool-execution contract."""
    from ..inference import (
        _canonical_tool_calls,
        _get_max_tool_rounds,
    )
    from ..tool_executor import execute_tool, get_active_chat_schemas

    client_kwargs: dict[str, str] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url.rstrip("/")
    client = AsyncOpenAI(**client_kwargs)
    conversation = copy.deepcopy(messages)
    accumulated_usage: dict = {}
    previous_fingerprint: Optional[str] = None

    for round_index in range(_get_max_tool_rounds() + 1):
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": conversation,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if reasoning_effort and reasoning_effort != "none":
            kwargs["reasoning_effort"] = reasoning_effort
        if use_tools:
            kwargs["tools"] = get_active_chat_schemas()
        try:
            response = await client.chat.completions.create(**kwargs)
            data = response.model_dump()
        except Exception as exc:
            return _safe_provider_error(provider_name, exc, api_key), accumulated_usage

        _accumulate_usage(accumulated_usage, data.get("usage"))
        choices = data.get("choices") or []
        message = (choices[0].get("message") if choices else None) or {}
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            fingerprint = _canonical_tool_calls(tool_calls)
            if fingerprint == previous_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            previous_fingerprint = fingerprint

        if not tool_calls or not use_tools or round_index >= _get_max_tool_rounds():
            return _chat_text(message) or f"[{provider_name}: empty response]", accumulated_usage

        conversation.append({
            "role": "assistant",
            "content": message.get("content"),
            "tool_calls": tool_calls,
        })
        for tool_call in tool_calls:
            function = tool_call.get("function") or {}
            try:
                arguments = json.loads(function.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {}
            result = await execute_tool(function.get("name", ""), arguments)
            conversation.append({
                "role": "tool",
                "tool_call_id": tool_call.get("id", ""),
                "content": result,
            })

    return f"[{provider_name}: tool loop exhausted]", accumulated_usage


async def call(
    messages: list[dict],
    *,
    provider_id: str,
    role: str = "conduct",
    model_override: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4096,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    temperature: float = 1.0,
    store: bool = False,
    pin_model_override: bool = False,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> tuple[str, dict]:
    """Dispatch one registry-defined provider through its configured API family."""
    del progress_callback  # Reserved for a future streaming implementation.
    from ..energy_registry import BUILTIN_PROVIDERS

    spec = BUILTIN_PROVIDERS.get(provider_id)
    if not spec:
        raise ValueError(f"Unknown provider_id: {provider_id!r}")
    if spec.get("adapter") != "openai-compatible" and spec.get("vendor") != "openai":
        raise ValueError(f"Provider {provider_id!r} is not OpenAI-compatible")

    api_key_env = str(spec.get("api_key_env") or "").strip()
    if not api_key_env:
        raise ValueError(f"Provider {provider_id!r} has no api_key_env")
    key = (api_key or os.environ.get(api_key_env, "")).strip()
    if not key:
        raise ValueError(f"{api_key_env} not configured")

    if pin_model_override:
        model = model_override or str(spec.get("model") or "").strip()
        if not model:
            raise ValueError(f"Provider {provider_id!r} has no model to pin")
    elif model_override is None or model_override == spec.get("model"):
        model = await resolve_model_for_role(provider_id, role)
    else:
        model = model_override
    base_url = str(spec.get("base_url") or "").strip() or None
    effort = _normalize_reasoning_effort(spec, reasoning_effort)
    api_family = spec.get("api_family", "responses")
    from ..tool_distill import reset_caller_provider, set_caller_provider

    caller_provider_token = set_caller_provider(provider_id)
    try:
        if api_family == "responses":
            tools = _response_tools(spec.get("tool_profile", "all-responses")) if use_tools else None
            return await _call_responses(
                api_key=key,
                model=model,
                input_messages=messages,
                max_output_tokens=max_tokens,
                temperature=temperature,
                reasoning_effort=effort,
                store=store,
                use_tools=use_tools,
                base_url=base_url,
                provider_name=provider_id,
                tools_override=tools,
                supports_store=bool(spec.get("supports_store", spec.get("vendor") == "openai")),
            )
        if api_family == "chat_completions":
            return await _call_chat_completions(
                api_key=key,
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                reasoning_effort=effort,
                use_tools=use_tools,
                base_url=base_url,
                provider_name=provider_id,
            )
        raise ValueError(
            f"Provider {provider_id!r} has unsupported api_family={api_family!r}"
        )
    finally:
        reset_caller_provider(caller_provider_token)
# 338:55 0:0 2:5
