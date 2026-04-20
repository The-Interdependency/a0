"""Native google-genai SDK adapter for Gemini 2.5 and Gemini 3.

Replaces the OpenAI-compat HTTP path for Gemini providers. Unlocks:
  - thinking_config (Gemini 3 reasoning budget — silently dropped on compat)
  - cached_content_token_count surfaced in usage (implicit cache hits)
  - clean tool-call loop using native FunctionDeclaration shape
  - future hooks for grounding, multimodal, cachedContents

Kept feature-parity with `_call_openai_compat` for now (text + tools + usage).
Streaming and Google Search grounding are deliberately out of scope for v1.
"""
from __future__ import annotations

import asyncio
import copy
import json
import os
from typing import Any, Optional

from google import genai
from google.genai import types as gtypes

from .tool_executor import TOOL_SCHEMAS_CHAT, execute_tool, set_caller_provider

_MAX_TOOL_ROUNDS = 5


def _client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def _effort_to_thinking_budget(effort: Optional[str]) -> int:
    """Map a0p effort scale → Gemini thinking_budget tokens.
      minimal → 0 (off)
      low     → 512
      medium  → 2048
      high    → 8192
    Aligned with the budget tiers in the gemini-api skill.
    """
    if not effort:
        return 0
    e = effort.lower()
    return {"minimal": 0, "low": 512, "medium": 2048, "high": 8192}.get(e, 0)


def _chat_tools_to_gemini(chat_tools: list[dict]) -> list[gtypes.Tool]:
    """Convert OpenAI nested-function tool schema to Gemini FunctionDeclarations.

    OpenAI shape: [{"type":"function","function":{"name","description","parameters":{json-schema}}}]
    Gemini accepts the JSON-schema dict directly as `parameters` in recent SDKs.
    """
    decls: list[gtypes.FunctionDeclaration] = []
    for entry in chat_tools:
        fn = entry.get("function") or entry
        name = fn.get("name")
        if not name:
            continue
        decls.append(gtypes.FunctionDeclaration(
            name=name,
            description=fn.get("description", ""),
            parameters=fn.get("parameters") or {"type": "object", "properties": {}},
        ))
    return [gtypes.Tool(function_declarations=decls)] if decls else []


def _split_system(messages: list[dict]) -> tuple[Optional[str], list[dict]]:
    """Pop leading system message(s) into a single string for system_instruction."""
    sys_parts: list[str] = []
    rest: list[dict] = []
    for m in messages:
        if m.get("role") == "system" and not rest:
            content = m.get("content")
            if isinstance(content, str):
                sys_parts.append(content)
        else:
            rest.append(m)
    sys_text = "\n\n".join(p for p in sys_parts if p) or None
    return sys_text, rest


def _messages_to_contents(messages: list[dict]) -> list[gtypes.Content]:
    """Convert OpenAI-style chat messages to Gemini Content list.

    Mapping:
      user (str)             → Content(role=user,  parts=[Part.from_text(...)])
      assistant (str)        → Content(role=model, parts=[Part.from_text(...)])
      assistant + tool_calls → Content(role=model, parts=[Part.from_function_call(...)])
      tool                   → Content(role=user,  parts=[Part.from_function_response(...)])
    """
    contents: list[gtypes.Content] = []
    # Map tool_call_id → function name so we can rebuild function_response parts.
    call_id_to_name: dict[str, str] = {}

    for m in messages:
        role = m.get("role")
        content = m.get("content")

        if role == "assistant" and m.get("tool_calls"):
            parts: list[gtypes.Part] = []
            if isinstance(content, str) and content.strip():
                parts.append(gtypes.Part.from_text(text=content))
            for tc in m["tool_calls"]:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                call_id_to_name[tc.get("id", "")] = name
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {}
                parts.append(gtypes.Part.from_function_call(name=name, args=args))
            contents.append(gtypes.Content(role="model", parts=parts))
            continue

        if role == "tool":
            name = m.get("name") or call_id_to_name.get(m.get("tool_call_id", ""), "tool")
            try:
                resp_obj = json.loads(content) if isinstance(content, str) else content
                if not isinstance(resp_obj, dict):
                    resp_obj = {"result": resp_obj}
            except Exception:
                resp_obj = {"result": str(content)}
            contents.append(gtypes.Content(
                role="user",
                parts=[gtypes.Part.from_function_response(name=name, response=resp_obj)],
            ))
            continue

        if role in ("user", "assistant") and isinstance(content, str):
            g_role = "model" if role == "assistant" else "user"
            parts: list[gtypes.Part] = []
            if content:
                parts.append(gtypes.Part.from_text(text=content))
            # Inline image (or other media) attachments — prepared upstream by
            # inference._build_provider_messages as {mime_type, data_b64}.
            for a in (m.get("attachments") or []):
                import base64 as _b64
                try:
                    raw = _b64.b64decode(a.get("data_b64", ""))
                except Exception:
                    continue
                parts.append(gtypes.Part.from_bytes(
                    data=raw, mime_type=a.get("mime_type", "image/png"),
                ))
            if parts:
                contents.append(gtypes.Content(role=g_role, parts=parts))

    return contents


def _accumulate_usage(usage_meta: Any, accumulated: dict) -> None:
    """Pull token counts out of UsageMetadata and accumulate across tool rounds."""
    if not usage_meta:
        return
    fields = [
        "prompt_token_count",
        "candidates_token_count",
        "total_token_count",
        "cached_content_token_count",
        "thoughts_token_count",
    ]
    for f in fields:
        v = getattr(usage_meta, f, None)
        if isinstance(v, (int, float)):
            accumulated[f] = accumulated.get(f, 0) + v


async def call_gemini_native(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    *,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    supports_thinking: bool = False,
) -> tuple[str, dict]:
    """Run a Gemini chat turn through the native SDK with tool-call loop.

    Returns (text_content, normalized_usage). Usage keys mirror the compat
    branch where possible (prompt_tokens, completion_tokens) plus native
    extras (cached_content_token_count, thoughts_token_count).
    """
    # Pin distiller to whichever Gemini variant we are — gemini3 for the
    # thinking-capable preview, plain gemini otherwise. Keeps tool-result
    # summarization on the same model class as the calling conversation.
    set_caller_provider("gemini3" if supports_thinking else "gemini")
    client = _client(api_key)
    sys_text, rest = _split_system(messages)
    contents = _messages_to_contents(rest)
    accumulated: dict = {}

    tools = _chat_tools_to_gemini(TOOL_SCHEMAS_CHAT) if use_tools else []

    cfg_kwargs: dict[str, Any] = {
        "max_output_tokens": max_tokens,
    }
    if sys_text:
        cfg_kwargs["system_instruction"] = sys_text
    if tools:
        cfg_kwargs["tools"] = tools
        cfg_kwargs["tool_config"] = gtypes.ToolConfig(
            function_calling_config=gtypes.FunctionCallingConfig(mode="AUTO"),
        )
    if supports_thinking:
        budget = _effort_to_thinking_budget(reasoning_effort)
        if budget > 0:
            cfg_kwargs["thinking_config"] = gtypes.ThinkingConfig(
                thinking_budget=budget,
                include_thoughts=False,
            )

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        config = gtypes.GenerateContentConfig(**cfg_kwargs)
        try:
            resp = await asyncio.to_thread(
                client.models.generate_content,
                model=model,
                contents=contents,
                config=config,
            )
        except Exception as exc:
            return f"[gemini error: {type(exc).__name__}]", accumulated

        _accumulate_usage(getattr(resp, "usage_metadata", None), accumulated)

        # Collect function calls (parallel calls supported).
        fn_calls = list(getattr(resp, "function_calls", None) or [])

        if not fn_calls or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            text = getattr(resp, "text", None) or ""
            if not text and resp.candidates:
                # Fallback: walk parts for any text.
                for p in resp.candidates[0].content.parts:
                    t = getattr(p, "text", None)
                    if t:
                        text += t
            # Normalize to compat keys for the rest of the stack.
            if "prompt_token_count" in accumulated:
                accumulated.setdefault("prompt_tokens", accumulated["prompt_token_count"])
            if "candidates_token_count" in accumulated:
                accumulated.setdefault("completion_tokens", accumulated["candidates_token_count"])
            return text or "[no content]", accumulated

        # Append the model's function-call turn back into contents.
        model_parts = [
            gtypes.Part.from_function_call(name=fc.name, args=dict(fc.args or {}))
            for fc in fn_calls
        ]
        contents.append(gtypes.Content(role="model", parts=model_parts))

        # Execute each tool and append responses.
        response_parts: list[gtypes.Part] = []
        for fc in fn_calls:
            try:
                result = await execute_tool(fc.name, dict(fc.args or {}))
            except Exception as exc:
                result = f"[tool {fc.name} error: {type(exc).__name__}]"
            try:
                resp_obj = json.loads(result) if isinstance(result, str) else result
                if not isinstance(resp_obj, dict):
                    resp_obj = {"result": resp_obj}
            except Exception:
                resp_obj = {"result": str(result)}
            response_parts.append(
                gtypes.Part.from_function_response(name=fc.name, response=resp_obj)
            )
        contents.append(gtypes.Content(role="user", parts=response_parts))

    # Loop exit safeguard (shouldn't reach here).
    return "[gemini: tool loop exhausted]", accumulated
