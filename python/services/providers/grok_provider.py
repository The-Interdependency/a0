# 256:38
"""grok_provider — xAI Grok via api.x.ai.

Two upstream surfaces:
  - Responses API (`/v1/responses`) when the active model supports live
    search — payload includes `tools=[{type:web_search},{type:x_search}]`
    and the response carries `url_citation` annotations we extract into
    a Sources footer.
  - Chat Completions (`/v1/chat/completions`) for everything else, with
    our own function-tool loop (skill_* tools).

Both are currently httpx-based — lifted verbatim from inference.py so the
inference dispatcher no longer reaches outbound for grok. SDK migration
to the openai SDK pointed at base_url=https://api.x.ai/v1 is a follow-up
within P3 and will replace the httpx blocks below without touching the
contract or the dispatcher.

Selection rule (mirrors the original dispatcher logic at inference.py:564):
  - If the resolved provider spec has `supports_live_search=True` AND a
    `responses_url`, route to the Responses path.
  - Otherwise route to the Chat Completions path.
"""
from __future__ import annotations

import asyncio
import copy
import json
import os
from typing import Callable, Optional

import httpx

from ._resolver import resolve_model_for_role


_MAX_TOOL_ROUNDS = 5  # mirrors inference.py:_MAX_TOOL_ROUNDS


async def call(
    messages: list[dict],
    *,
    role: str = "conduct",
    model_override: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4096,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> tuple[str, dict]:
    """Run a chat turn against xAI Grok, choosing search vs. chat-completions.

    Picks the surface from BUILTIN_PROVIDERS["grok"] capability flags. The
    `progress_callback` is honored only on the chat-completions path with
    use_tools=False, matching the original streaming behavior.
    """
    from ..energy_registry import BUILTIN_PROVIDERS

    spec = BUILTIN_PROVIDERS.get("grok", {})
    key = api_key or os.environ.get(spec.get("env_key", "XAI_API_KEY"), "").strip()
    if not key:
        raise ValueError("XAI_API_KEY not configured")
    model = model_override or await resolve_model_for_role("grok", role)

    use_search = (
        spec.get("supports_live_search")
        and spec.get("responses_url")
    )
    if use_search:
        return await _call_responses_with_search(
            key,
            spec["responses_url"],
            model,
            messages,
            max_tokens,
            reasoning_effort if spec.get("supports_reasoning_effort") else None,
        )
    chat_url = spec.get("url")
    if not chat_url:
        raise ValueError(
            "providers.json grok entry missing 'url' (chat completions endpoint). "
            "No silent fallback to a hardcoded literal."
        )
    return await _call_chat_completions(
        key,
        chat_url,
        model,
        messages,
        max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort if spec.get("supports_reasoning_effort") else None,
        progress_callback=progress_callback,
    )


async def _call_responses_with_search(
    api_key: str,
    url: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    reasoning_effort: Optional[str],
) -> tuple[str, dict]:
    """Grok Responses API + hosted retrieval (web_search, x_search).

    Cannot also run our function tools (skill_*) — live-search is a
    "search-then-answer" surface; mixed retrieval + skill loading would
    require parsing function_call output items here. Same trade-off as
    the original implementation in inference.py.
    """
    from ..tool_distill import set_caller_provider
    from ..inference import _gate_to_effort, _post_with_retry, _sanitize_provider_error

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    set_caller_provider("grok")
    accumulated_usage: dict = {}

    payload: dict = {
        "model": model,
        "input": messages,
        "max_output_tokens": max_tokens,
        "tools": [{"type": "web_search"}, {"type": "x_search"}],
    }
    if reasoning_effort:
        payload["reasoning"] = {"effort": _gate_to_effort(reasoning_effort)}

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await _post_with_retry(client, url, json_payload=payload, headers=headers)
            data = resp.json()
    except Exception as exc:
        return _sanitize_provider_error("grok", exc), accumulated_usage

    for k, v in (data.get("usage") or {}).items():
        if isinstance(v, (int, float)):
            accumulated_usage[k] = accumulated_usage.get(k, 0) + v

    text_parts: list[str] = []
    citation_urls: list[str] = []
    seen_urls: set[str] = set()
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for c in item.get("content") or []:
            if c.get("type") == "output_text":
                if c.get("text"):
                    text_parts.append(c["text"])
                for ann in c.get("annotations") or []:
                    if ann.get("type") == "url_citation":
                        u = ann.get("url")
                        if u and u not in seen_urls:
                            seen_urls.add(u)
                            citation_urls.append(u)

    content = "\n".join(text_parts).strip() or "[no content]"
    if citation_urls:
        accumulated_usage["live_search_sources"] = (
            accumulated_usage.get("live_search_sources", 0) + len(citation_urls)
        )
        bullets = "\n".join(f"- {u}" for u in citation_urls[:10])
        content = f"{content}\n\n---\n**Sources:**\n{bullets}"
    return content, accumulated_usage


async def _call_chat_completions(
    api_key: str,
    url: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    *,
    use_tools: bool,
    reasoning_effort: Optional[str],
    progress_callback: Optional[Callable[[int, int], None]],
) -> tuple[str, dict]:
    """Chat Completions with our function-tool loop. Lifted from
    inference._call_openai_compat with provider pinned to grok."""
    from ..tool_distill import set_caller_provider
    from ..tool_executor import TOOL_SCHEMAS_CHAT, execute_tool
    from ..inference import (
        _MAX_TOOL_ROUNDS as INF_MAX_ROUNDS,
        _canonical_tool_calls,
        _gate_to_effort,
        _post_with_retry,
        _sanitize_provider_error,
    )

    rounds_cap = INF_MAX_ROUNDS or _MAX_TOOL_ROUNDS
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    current_messages = copy.deepcopy(messages)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None
    set_caller_provider("grok")

    chat_tools = TOOL_SCHEMAS_CHAT if use_tools else []
    # Streaming branch: only when not using tools and a progress callback is set.
    if not use_tools and progress_callback is not None:
        return await _stream_chat(
            api_key, url, model, current_messages, max_tokens,
            reasoning_effort=reasoning_effort,
            progress_callback=progress_callback,
        )

    for _round in range(rounds_cap + 1):
        payload: dict = {
            "model": model,
            "messages": current_messages,
            "max_tokens": max_tokens,
        }
        if chat_tools:
            payload["tools"] = chat_tools
            payload["tool_choice"] = "auto"
        if reasoning_effort:
            payload["reasoning_effort"] = _gate_to_effort(reasoning_effort)
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
                resp = await _post_with_retry(client, url, json_payload=payload, headers=headers)
                data = resp.json()
        except Exception as exc:
            return _sanitize_provider_error("grok", exc), accumulated_usage

        for k, v in (data.get("usage") or {}).items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message", {}) or {}
        tool_calls = msg.get("tool_calls") or []

        if tool_calls:
            fp = _canonical_tool_calls(tool_calls)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_calls or not use_tools or _round >= rounds_cap:
            content = msg.get("content") or "[no content]"
            return content, accumulated_usage

        current_messages.append(msg)
        for tc in tool_calls:
            fn = (tc.get("function") or {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await execute_tool(name, args)
            current_messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id"),
                "name": name,
                "content": result,
            })
    return "[grok: tool loop exhausted]", accumulated_usage


async def _stream_chat(
    api_key: str,
    url: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    *,
    reasoning_effort: Optional[str] = None,
    progress_callback: Callable[[int, int], None],
) -> tuple[str, dict]:
    """Streaming Chat Completions for the no-tools / progress-bar path.

    Emits ~6 progress callbacks/sec with chars/4 token estimates; final
    usage block (stream_options.include_usage) overwrites the estimate.
    Lifted from inference._call_openai_compat_streamed with provider
    pinned to grok — no other provider currently needs SSE streaming.
    """
    from ..inference import _gate_to_effort

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    payload: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    if reasoning_effort:
        payload["reasoning_effort"] = _gate_to_effort(reasoning_effort)

    accumulated_usage: dict = {}
    text_parts: list[str] = []
    cumulative_chars = 0
    last_emit = 0.0
    EMIT_THROTTLE_S = 0.15

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0)) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code >= 400:
                body = await resp.aread()
                raise RuntimeError(f"HTTP {resp.status_code}: {body[:300]!r}")
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                chunk_str = line[5:].strip()
                if not chunk_str or chunk_str == "[DONE]":
                    continue
                try:
                    chunk = json.loads(chunk_str)
                except json.JSONDecodeError:
                    continue
                for k, v in (chunk.get("usage") or {}).items():
                    if isinstance(v, (int, float)):
                        accumulated_usage[k] = accumulated_usage.get(k, 0) + v
                for ch in chunk.get("choices") or []:
                    delta = (ch.get("delta") or {}).get("content")
                    if not delta:
                        continue
                    text_parts.append(delta)
                    cumulative_chars += len(delta)
                    now = asyncio.get_event_loop().time()
                    if now - last_emit >= EMIT_THROTTLE_S:
                        last_emit = now
                        try:
                            progress_callback(cumulative_chars, max(1, cumulative_chars // 4))
                        except Exception:
                            pass

    if cumulative_chars > 0:
        try:
            progress_callback(cumulative_chars, max(1, cumulative_chars // 4))
        except Exception:
            pass
    return ("".join(text_parts) or "[no content]"), accumulated_usage
# 256:38
