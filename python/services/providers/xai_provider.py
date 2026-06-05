# 251:69 0:0 1:6
"""xai_provider — xAI Grok via the official xai-sdk (gRPC).

Migrated from raw httpx to the `xai-sdk` Python SDK (v1.12+). The contract
matches the other providers exactly:

    call(messages, *, role, model_override, api_key,
         max_tokens, use_tools, reasoning_effort, ...)
        -> (content, usage)

Two internal paths:
  - Search path  (supports_live_search=True): `AsyncClient.chat.create()` with
    `SearchParameters(mode="auto")`. Citations surface via `response.citations`.
  - Tools path   (default): same AsyncClient with `tools=[xai_tool(...)]` and
    our `execute_tool()` dispatcher in a repeat-safe tool loop.

Streaming (no-tools + progress_callback) uses `chat.stream()`.
Built-in OpenTelemetry tracing fires automatically for every sample/stream.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_xai
#   module_name: xai_provider
#   module_kind: adapter
#   summary: xAI Grok provider adapter over the official xai-sdk (gRPC) — exposes the standard async call(...) -> (content, usage) with a live-search path, a repeat-safe tool-loop path, and streaming.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: _effort_enum, _get_max_tool_rounds_xai, _to_xai_messages, _to_xai_tools, _usage_from_response, _fingerprint_tool_calls, _call_with_search
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; Grok calls revert to the prior httpx-based implementation.
#   requires: a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference, a0_service_energy_registry, a0_service_run_context
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import asyncio
import json
import os
from typing import Callable, Optional, Sequence

from xai_sdk import AsyncClient
from xai_sdk.chat import (
    SearchParameters,
    assistant,
    system,
    tool as xai_tool,
    tool_result,
    user,
)
from xai_sdk.proto.v6 import chat_pb2 as _chat_pb2

_EFFORT_MAP: dict[str, int] = {
    "low":    _chat_pb2.ReasoningEffort.EFFORT_LOW,
    "medium": _chat_pb2.ReasoningEffort.EFFORT_MEDIUM,
    "high":   _chat_pb2.ReasoningEffort.EFFORT_HIGH,
}


def _effort_enum(effort: Optional[str]):
    """Map a string effort level to the xai-sdk proto enum value, or None."""
    if not effort:
        return None
    return _EFFORT_MAP.get(effort.lower())

from ._resolver import resolve_model_for_role

def _get_max_tool_rounds_xai() -> int:
    """Return per-request tool round limit from ContextVar or default."""
    try:
        from ..run_context import current_max_tool_rounds as _cmtr
        v = _cmtr.get(None)
        return v if v is not None else 5
    except Exception:
        return 5


# ---------------------------------------------------------------------------
# Public entry-point
# ---------------------------------------------------------------------------

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
    """Run a chat turn against xAI Grok via the native xai-sdk."""
    from ..energy_registry import BUILTIN_PROVIDERS

    spec = BUILTIN_PROVIDERS.get("grok", {})
    key = api_key or os.environ.get(spec.get("env_key", "XAI_API_KEY"), "").strip()
    if not key:
        raise ValueError("XAI_API_KEY not configured")
    model = model_override or await resolve_model_for_role("grok", role)

    use_search = bool(
        spec.get("supports_live_search") and spec.get("responses_url")
    )

    if use_search:
        return await _call_with_search(
            key,
            model,
            messages,
            max_tokens,
            reasoning_effort if spec.get("supports_reasoning_effort") else None,
        )

    return await _call_with_tools(
        key,
        model,
        messages,
        max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort if spec.get("supports_reasoning_effort") else None,
        progress_callback=progress_callback,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_xai_messages(msgs: list[dict]) -> list:
    """Convert {role, content} dicts to xai-sdk proto message objects."""
    out = []
    for m in msgs:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            out.append(system(content))
        elif role == "assistant":
            out.append(assistant(content))
        else:
            out.append(user(content))
    return out


def _to_xai_tools(schemas: list[dict]) -> list:
    """Convert TOOL_SCHEMAS_CHAT entries to xai-sdk tool() proto objects."""
    result = []
    for s in schemas:
        fn = s.get("function", {})
        name = fn.get("name", "")
        description = fn.get("description", "")
        parameters = fn.get("parameters", {"type": "object", "properties": {}})
        if name:
            result.append(xai_tool(name, description, parameters))
    return result


def _usage_from_response(response) -> dict:
    """Extract a flat usage dict from a xai-sdk Response object."""
    u = response.usage
    return {
        "prompt_tokens": u.prompt_tokens,
        "completion_tokens": u.completion_tokens,
        "total_tokens": u.total_tokens,
    }


def _fingerprint_tool_calls(tool_calls: Sequence) -> str:
    """Stable fingerprint of xai-sdk ToolCall protos for repeat detection."""
    parts = []
    for tc in tool_calls:
        name = tc.function.name
        args = tc.function.arguments
        try:
            args_obj = json.loads(args) if isinstance(args, str) else args
            args_str = json.dumps(args_obj, sort_keys=True, default=str)
        except Exception:
            args_str = str(args)
        parts.append(f"{name}:{args_str}")
    return "|".join(sorted(parts))


# ---------------------------------------------------------------------------
# Search path — live web + X search via SearchParameters
# ---------------------------------------------------------------------------

async def _call_with_search(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    reasoning_effort: Optional[str],
) -> tuple[str, dict]:
    """xai-sdk chat with SearchParameters(mode='auto') for live retrieval.

    Cannot mix with function tools (same trade-off as the old httpx path).
    Citations are available via `response.citations`.
    """
    from ..tool_distill import set_caller_provider

    set_caller_provider("grok")
    client = AsyncClient(api_key=api_key)

    xai_messages = _to_xai_messages(messages)
    search_params = SearchParameters(mode="auto", return_citations=True)

    create_kw: dict = dict(
        model=model,
        messages=xai_messages,
        max_tokens=max_tokens,
        search_parameters=search_params,
    )
    effort = _effort_enum(reasoning_effort)
    if effort is not None:
        create_kw["reasoning_effort"] = effort
    chat = client.chat.create(**create_kw)

    try:
        response = await chat.sample()
    except Exception as exc:
        from ..inference import _sanitize_provider_error
        return _sanitize_provider_error("grok", exc), {}

    usage = _usage_from_response(response)
    content = response.content or "[no content]"
    citation_urls = list(response.citations or [])

    if citation_urls:
        usage["live_search_sources"] = len(citation_urls)
        bullets = "\n".join(f"- {u}" for u in citation_urls[:10])
        content = f"{content}\n\n---\n**Sources:**\n{bullets}"

    return content, usage


# ---------------------------------------------------------------------------
# Tools path — function-tool loop via xai-sdk native tool calling
# ---------------------------------------------------------------------------

async def _call_with_tools(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    *,
    use_tools: bool,
    reasoning_effort: Optional[str],
    progress_callback: Optional[Callable[[int, int], None]],
) -> tuple[str, dict]:
    """xai-sdk chat with our function-tool loop. Streaming when no tools."""
    from ..tool_distill import set_caller_provider
    from ..tool_executor import get_active_chat_schemas, execute_tool

    set_caller_provider("grok")
    client = AsyncClient(api_key=api_key)
    xai_messages = _to_xai_messages(messages)

    # Streaming branch: only when not using tools and a progress callback is set.
    if not use_tools and progress_callback is not None:
        return await _stream_chat(
            client, model, xai_messages, max_tokens, progress_callback
        )

    xai_tools = _to_xai_tools(get_active_chat_schemas()) if use_tools else []

    create_kwargs: dict = dict(
        model=model,
        messages=xai_messages,
        max_tokens=max_tokens,
    )
    if xai_tools:
        create_kwargs["tools"] = xai_tools
    effort = _effort_enum(reasoning_effort)
    if effort is not None:
        create_kwargs["reasoning_effort"] = effort

    accumulated_usage: dict = {}
    prev_fingerprint: Optional[str] = None

    try:
        chat = client.chat.create(**create_kwargs)

        _max_rounds = _get_max_tool_rounds_xai()
        for _round in range(_max_rounds + 1):
            response = await chat.sample()

            for k, v in _usage_from_response(response).items():
                if isinstance(v, (int, float)):
                    accumulated_usage[k] = accumulated_usage.get(k, 0) + v

            tool_calls = list(response.tool_calls or [])

            if tool_calls:
                fp = _fingerprint_tool_calls(tool_calls)
                if prev_fingerprint is not None and fp == prev_fingerprint:
                    return (
                        "[noticed repeat tool call — answering directly]",
                        accumulated_usage,
                    )
                prev_fingerprint = fp

            # Capture reasoning content if present.
            reasoning = getattr(response, "thinking_content", None) or getattr(response, "reasoning_content", None)
            if reasoning:
                accumulated_usage.setdefault("thinking_blocks", []).append(
                    {"round": _round, "provider": "grok", "content": str(reasoning)}
                )

            if not tool_calls or not use_tools or _round >= _max_rounds:
                content = response.content or "[no content]"
                return content, accumulated_usage

            # Append assistant response (carries tool_calls) then tool results
            chat.append(response)
            for tc in tool_calls:
                name = tc.function.name
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = await execute_tool(name, args)
                chat.append(tool_result(result, tool_call_id=tc.id))

    except Exception as exc:
        from ..inference import _sanitize_provider_error
        return _sanitize_provider_error("grok", exc), accumulated_usage

    return "[grok: tool loop exhausted]", accumulated_usage


# ---------------------------------------------------------------------------
# Streaming path
# ---------------------------------------------------------------------------

async def _stream_chat(
    client: AsyncClient,
    model: str,
    xai_messages: list,
    max_tokens: int,
    progress_callback: Callable[[int, int], None],
) -> tuple[str, dict]:
    """xai-sdk streaming via `chat.stream()`.

    Emits ~6 progress callbacks/sec with chars/4 token estimates; the final
    usage block overwrites the estimate once streaming completes.
    """
    EMIT_THROTTLE_S = 0.15

    chat = client.chat.create(model=model, messages=xai_messages, max_tokens=max_tokens)
    text_parts: list[str] = []
    cumulative_chars = 0
    last_emit = 0.0
    accumulated_usage: dict = {}

    try:
        async for response, chunk in chat.stream():
            delta = chunk.content or ""
            if delta:
                text_parts.append(delta)
                cumulative_chars += len(delta)
                now = asyncio.get_event_loop().time()
                if now - last_emit >= EMIT_THROTTLE_S:
                    last_emit = now
                    try:
                        progress_callback(cumulative_chars, max(1, cumulative_chars // 4))
                    except Exception:
                        pass
        # Final response carries full usage
        accumulated_usage = _usage_from_response(response)
    except Exception as exc:
        from ..inference import _sanitize_provider_error
        return _sanitize_provider_error("grok", exc), accumulated_usage

    if cumulative_chars > 0:
        try:
            progress_callback(cumulative_chars, max(1, cumulative_chars // 4))
        except Exception:
            pass

    return ("".join(text_parts) or "[no content]"), accumulated_usage
# 251:69 0:0 1:6
