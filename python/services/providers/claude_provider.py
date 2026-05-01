# 125:33
"""claude_provider — Anthropic Messages API via the official SDK.

One of four sibling modules under python/services/providers/. Exposes a
single async `call(messages, role=..., model_override=..., **kwargs)`
that the inference dispatcher delegates into; all Anthropic-specific
shape-shifting (system blocks, prompt caching breakpoints, extended
thinking, tool loop with repeat-call detection) lives here.

Migrated from the in-line implementation in services/inference.py
`_call_anthropic` per the energy-model-task-overhaul P3 spec. Behavior
is identical — same SDK calls, same caching strategy, same tool loop
contract — but the call site is now a thin shim and the model id is
resolved from env > seed > spec instead of being passed in.

Acceptance contract:
  - Returns (text, usage) where usage is a dict of token counters
    summed across all tool-loop rounds (cache_read_input_tokens,
    cache_creation_input_tokens, input_tokens, output_tokens).
  - Never returns a silent fallback string on hard failures — raises
    via _sanitize_provider_error which yields a user-visible error
    string but preserves the partial usage so cost accounting works.
  - Tool loop bounded by _MAX_TOOL_ROUNDS; repeat-call fingerprint
    short-circuits with "[noticed repeat tool call — answering directly]".
"""
from __future__ import annotations

import copy
import json
import os
from typing import Optional

from ._resolver import resolve_model_for_role


async def call(
    messages: list[dict],
    *,
    role: str = "conduct",
    model_override: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4096,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    enable_caching: bool = True,
) -> tuple[str, dict]:
    """Run a chat turn against Anthropic, with tool loop + thinking + caching.

    Resolution:
      - api_key: explicit kwarg → ANTHROPIC_API_KEY env
      - model: model_override → resolve_model_for_role("claude", role)
    """
    # Lazy imports to avoid claude_provider ↔ inference circular at module load.
    from ..tool_distill import set_caller_provider
    from ..tool_executor import TOOL_SCHEMAS_CHAT, execute_tool
    from ..inference import (
        _ANTHROPIC_CACHE_MIN_CHARS,
        _MAX_TOOL_ROUNDS,
        _canonical_tool_calls,
        _effort_to_thinking_budget,
        _sanitize_provider_error,
    )

    key = api_key or os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise ValueError("ANTHROPIC_API_KEY not configured")
    model = model_override or await resolve_model_for_role("claude", role)

    set_caller_provider("claude")
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=key, max_retries=2, timeout=90.0)

    # Lift the system message out — Anthropic takes it as a separate kwarg.
    system_text = ""
    filtered: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system_text = m["content"]
        else:
            filtered.append(m)

    claude_tools = [
        {
            "name": s["function"]["name"],
            "description": s["function"]["description"],
            "input_schema": s["function"]["parameters"],
        }
        for s in TOOL_SCHEMAS_CHAT
    ]
    # Anthropic's prompt cache has a 1024-token (~4096-char) minimum;
    # below that the cache_control header just adds overhead.
    tools_size_estimate = sum(
        len(t.get("name", "")) + len(t.get("description", "")) + len(json.dumps(t.get("input_schema", {})))
        for t in claude_tools
    )
    cache_tools = enable_caching and claude_tools and tools_size_estimate >= _ANTHROPIC_CACHE_MIN_CHARS
    if cache_tools:
        claude_tools[-1] = {**claude_tools[-1], "cache_control": {"type": "ephemeral"}}

    # System blocks: split prefix (identity + base + tier + persona) from
    # suffix (memory seeds, dynamic context) at the literal "## Memory"
    # marker so each gets its own cache breakpoint when long enough.
    system_blocks: list[dict] = []
    if system_text:
        split_marker = "\n\n## Memory\n"
        idx = system_text.find(split_marker) if enable_caching else -1
        if idx > 0 and len(system_text[:idx]) >= _ANTHROPIC_CACHE_MIN_CHARS:
            prefix = system_text[:idx]
            suffix = system_text[idx + 2:]
            system_blocks.append({
                "type": "text", "text": prefix,
                "cache_control": {"type": "ephemeral"},
            })
            suffix_block: dict = {"type": "text", "text": suffix}
            if len(suffix) >= _ANTHROPIC_CACHE_MIN_CHARS:
                suffix_block["cache_control"] = {"type": "ephemeral"}
            system_blocks.append(suffix_block)
        else:
            block: dict = {"type": "text", "text": system_text}
            if enable_caching and len(system_text) >= _ANTHROPIC_CACHE_MIN_CHARS:
                block["cache_control"] = {"type": "ephemeral"}
            system_blocks.append(block)

    thinking_budget = _effort_to_thinking_budget(reasoning_effort, max_tokens)

    current_messages = copy.deepcopy(filtered)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": current_messages,
        }
        if system_blocks:
            kwargs["system"] = system_blocks
        if use_tools:
            kwargs["tools"] = claude_tools
        if thinking_budget > 0:
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}

        try:
            msg = await client.messages.create(**kwargs)
        except Exception as exc:
            return _sanitize_provider_error("claude", exc), accumulated_usage

        usage_dict = msg.usage.model_dump() if msg.usage else {}
        for k, v in usage_dict.items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        content_blocks = [b.model_dump() for b in (msg.content or [])]
        tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

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
# 125:33
