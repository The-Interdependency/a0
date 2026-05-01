# 132:27
"""openai_provider — OpenAI GPT-5 family via the Responses API (/v1/responses).

This module owns the actual outbound API call. The role-decision /
approval-gate / audit-logging orchestration around it stays in
inference._call_openai_routed because that's a meta-orchestrator
shared with the openai_router policy and the approval gate plumbing —
it is not itself a "provider call".

Contract harmonized with grok/gemini/claude providers so the dispatcher
treats all four uniformly:

    call(messages, *, role, model_override, api_key,
         max_tokens, use_tools, reasoning_effort, ...)
        -> (content, usage)

OpenAI-specific kwargs (temperature, store, max_output_tokens) are
threaded through with sensible defaults that match what
_call_openai_routed used to pass directly.

Currently httpx-based — lifted verbatim from inference.py so no
outbound openai HTTP traffic originates in inference.py anymore.
SDK migration to the openai Python SDK is a follow-up that swaps
the httpx block without changing this contract or any caller.
"""
from __future__ import annotations

import copy
import json
import os
from typing import Optional

import httpx

from ._resolver import resolve_model_for_role


_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


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
) -> tuple[str, dict]:
    """Lifted from inference._call_openai_responses — same tool loop semantics:
    up to _MAX_TOOL_ROUNDS rounds, repeat-call short-circuit, function_call
    items only (not message/reasoning/web_search_call) appended to next
    round's input per Responses API multi-turn rules."""
    from ..tool_distill import set_caller_provider
    from ..tool_executor import TOOL_SCHEMAS_RESPONSES, execute_tool
    from ..inference import (
        _MAX_TOOL_ROUNDS,
        _canonical_tool_calls,
        _post_with_retry,
        _sanitize_provider_error,
    )

    set_caller_provider("openai")

    def _fmt_messages(msgs: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in msgs:
            r = m.get("role", "user")
            content = m.get("content", "")
            if r == "system":
                out.append({"role": "system", "content": content})
            elif r == "assistant":
                out.append({
                    "role": "assistant",
                    "content": [{"type": "output_text", "text": content}],
                })
            else:
                out.append({
                    "role": "user",
                    "content": [{"type": "input_text", "text": content}],
                })
        return out

    openai_input = _fmt_messages(copy.deepcopy(input_messages))
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
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

        for k, v in (data.get("usage") or {}).items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        output_items = data.get("output") or []
        tool_calls = [it for it in output_items if it.get("type") == "function_call"]

        if tool_calls:
            fp = _canonical_tool_calls(tool_calls)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_calls or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            content = ""
            for item in output_items:
                if item.get("type") == "message":
                    for part in item.get("content") or []:
                        if part.get("type") == "output_text":
                            content = part.get("text", "")
                            break
                if content:
                    break
            return content or "[openai: empty response]", accumulated_usage

        # Multi-turn rule: only function_call items belong in next round's input
        # alongside their function_call_output results. Other item types (message,
        # reasoning, web_search_call) cause 400/404s if echoed back.
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

    return "[openai: tool loop exhausted]", accumulated_usage
# 132:27
