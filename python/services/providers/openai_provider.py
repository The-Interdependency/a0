# 160:42 0:0 1:4
"""openai_provider — OpenAI GPT-5 family via the Responses API.

Migrated from raw httpx to the `openai` Python SDK (v2). The contract is
unchanged; the httpx block is replaced by `AsyncOpenAI.responses.create()`,
which gives us built-in retries, proper error typing, and OpenAI tracing.

    call(messages, *, role, model_override, api_key,
         max_tokens, use_tools, reasoning_effort, ...)
        -> (content, usage)

The tool loop structure is identical to the pre-SDK version; only the outbound
HTTP call changes. `response.model_dump()` converts the SDK object to the same
dict shape the tool-loop code already understood, so zero churn downstream.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_openai
#   module_name: openai_provider
#   module_kind: adapter
#   summary: OpenAI GPT-5-family provider adapter using the Responses API via the openai SDK — exposes the standard async call(...) -> (content, usage) with the shared tool-loop contract.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: _call_responses
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; OpenAI calls revert to the prior httpx-based implementation.
#   requires: a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import copy
import json
import logging
import os
from typing import Optional

from openai import AsyncOpenAI

from ._resolver import resolve_model_for_role

_log = logging.getLogger("a0p.providers.responses")


async def call(
    messages: list[dict],
    *,
    role: str = "conduct",
    model_override: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4000,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = "medium",
    temperature: float = 1.0,
    store: bool = False,
    base_url: Optional[str] = None,
    provider_name: str = "openai",
    tools_override: Optional[list[dict]] = None,
) -> tuple[str, dict]:
    """Run a chat turn against OpenAI's Responses API."""
    key = api_key or os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise ValueError("OPENAI_API_KEY not configured")
    model = model_override or await resolve_model_for_role("openai", role)

    return await _call_responses(
        api_key=key,
        model=model,
        input_messages=messages,
        max_output_tokens=max_tokens,
        temperature=temperature,
        reasoning_effort=reasoning_effort or "medium",
        store=store,
        use_tools=use_tools,
        base_url=base_url,
        provider_name=provider_name,
        tools_override=tools_override,
    )


async def _call_responses(
    api_key: str,
    model: str,
    input_messages: list[dict],
    max_output_tokens: int,
    temperature: float,
    reasoning_effort: str,
    store: bool,
    use_tools: bool,
    base_url: Optional[str] = None,
    provider_name: str = "openai",
    tools_override: Optional[list[dict]] = None,
) -> tuple[str, dict]:
    """Tool loop over the OpenAI Responses API via the native SDK.

    The SDK replaces the raw httpx POST; `response.model_dump()` converts the
    typed response to a plain dict so the rest of the loop is unchanged.
    Up to _MAX_TOOL_ROUNDS rounds; repeat-call short-circuit prevents infinite
    loops; only `function_call` items are echoed back per Responses API rules.
    """
    from ..tool_distill import set_caller_provider
    from ..tool_executor import get_active_responses_schemas, execute_tool
    from ..inference import (
        _get_max_tool_rounds,
        _canonical_tool_calls,
        _sanitize_provider_error,
    )

    set_caller_provider(provider_name)

    def _fmt_messages(msgs: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in msgs:
            r = m.get("role", "user")
            content = m.get("content", "")
            if r == "system":
                out.append({"role": "system", "content": content})
            elif r == "assistant":
                out.append({"role": "assistant", "content": content})
            else:
                out.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": content}],
                })
        return out

    openai_input = _fmt_messages(copy.deepcopy(input_messages))
    client_kwargs: dict = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url
    oai_client = AsyncOpenAI(**client_kwargs)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None

    for _round in range(_get_max_tool_rounds() + 1):
        kwargs: dict = {
            "model": model,
            "input": openai_input,
            "store": store,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
            "text": {"format": {"type": "text"}},
        }
        if reasoning_effort and reasoning_effort != "none":
            kwargs["reasoning"] = {"effort": reasoning_effort}
        if use_tools:
            kwargs["tools"] = (
                tools_override
                if tools_override is not None
                else get_active_responses_schemas()
            )

        _log.debug(
            "provider=%s round=%s input_len=%s roles=%s",
            provider_name,
            _round,
            len(openai_input),
            [
                m.get("role", "?")
                for m in openai_input
                if isinstance(m, dict) and "role" in m
            ],
        )
        try:
            response = await oai_client.responses.create(**kwargs)
            data = response.model_dump()
        except Exception as exc:
            return _sanitize_provider_error(provider_name, exc), accumulated_usage

        for k, v in (data.get("usage") or {}).items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        output_items = data.get("output") or []
        _log.debug(
            "provider=%s output item types=%s",
            provider_name,
            [it.get("type") for it in output_items],
        )
        tool_calls = [it for it in output_items if it.get("type") == "function_call"]

        if tool_calls:
            fp = _canonical_tool_calls(tool_calls)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_calls or not use_tools or _round >= _get_max_tool_rounds():
            content = ""
            for item in output_items:
                if item.get("type") == "message":
                    for part in item.get("content") or []:
                        if part.get("type") == "output_text":
                            content = part.get("text", "")
                            break
                if content:
                    break
            if content:
                return content, accumulated_usage
            # GPT-5 produced no message item — either the tool loop exhausted
            # without a final answer or reasoning ran without emitting one.
            # One explicit nudge to surface the response.
            openai_input.append({
                "role": "user",
                "content": [{"type": "input_text", "text": "Please provide your response."}],
            })
            try:
                _nudge_kw: dict = {
                    "model": model,
                    "input": openai_input,
                    "store": store,
                    "temperature": temperature,
                    "max_output_tokens": max_output_tokens,
                    "text": {"format": {"type": "text"}},
                }
                if reasoning_effort and reasoning_effort != "none":
                    _nudge_kw["reasoning"] = {"effort": reasoning_effort}
                _nr = await oai_client.responses.create(**_nudge_kw)
                _nd = _nr.model_dump()
                for k, v in (_nd.get("usage") or {}).items():
                    if isinstance(v, (int, float)):
                        accumulated_usage[k] = accumulated_usage.get(k, 0) + v
                for item in (_nd.get("output") or []):
                    if item.get("type") == "message":
                        for part in item.get("content") or []:
                            if part.get("type") == "output_text":
                                content = part.get("text", "")
                                break
                    if content:
                        break
            except Exception:
                pass
            return content or f"[{provider_name}: empty response]", accumulated_usage

        # Multi-turn rule: only function_call items in next round's input
        for item in output_items:
            if item.get("type") == "function_call":
                openai_input.append(item)

        for tc in tool_calls:
            call_id = tc.get("call_id", "")
            name = tc.get("name", "")
            try:
                args = json.loads(tc.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            result = await execute_tool(name, args)
            openai_input.append({
                "type": "function_call_output",
                "call_id": call_id,
                "output": result,
            })

    return f"[{provider_name}: tool loop exhausted]", accumulated_usage
# 160:42 0:0 1:4
