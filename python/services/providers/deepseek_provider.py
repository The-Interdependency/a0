# 63:24
"""deepseek_provider - DeepSeek V4 via the OpenAI-compatible Responses API."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_deepseek
#   module_name: deepseek_provider
#   module_kind: adapter
#   summary: DeepSeek V4 provider adapter over DeepSeek's OpenAI-compatible Responses API, reusing the standard Responses tool loop while pinning DeepSeek-safe tool schemas and effort levels.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: _deepseek_tools, _normalize_reasoning_effort
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: tests/test_deepseek_provider.py
#   rollout: default_enabled
#   rollback: Remove this file plus the deepseek entries in providers/pricing JSON and inference dispatcher branch.
#   requires: a0_service_providers_resolver, a0_service_providers_openai, a0_service_tool_executor, a0_service_energy_registry
#   since: 2026-08-26
#   unresolved: none
# === END MODULE_BUILD ===

import os
from typing import Optional

from ._resolver import resolve_model_for_role
from .openai_provider import _call_responses


def _normalize_reasoning_effort(effort: Optional[str]) -> str:
    """Map a0/OpenAI-ish effort labels to DeepSeek's low/high/max scale."""
    value = (effort or "high").lower().strip()
    if value in {"none", "minimal", "low"}:
        return "low"
    if value in {"max", "xhigh"}:
        return "max"
    return "high"


def _deepseek_tools() -> list[dict]:
    """Return Responses-format function tools DeepSeek can round-trip."""
    from ..tool_executor import get_active_chat_schemas

    tools: list[dict] = []
    for schema in get_active_chat_schemas():
        fn = schema.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        tools.append({
            "type": "function",
            "name": name,
            "description": fn.get("description", ""),
            "parameters": fn.get("parameters", {
                "type": "object",
                "properties": {},
            }),
        })
    return tools


async def call(
    messages: list[dict],
    *,
    role: str = "conduct",
    model_override: Optional[str] = None,
    api_key: Optional[str] = None,
    max_tokens: int = 4096,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    provider_id: str = "deepseek",
    progress_callback: Optional[object] = None,
) -> tuple[str, dict]:
    """Run a chat turn against DeepSeek V4 using the Responses API."""
    from ..energy_registry import BUILTIN_PROVIDERS

    spec = BUILTIN_PROVIDERS.get(provider_id, {})
    env_key = spec.get("env_key", "DEEPSEEK_API_KEY")
    key = api_key or os.environ.get(env_key, "").strip()
    if not key:
        raise ValueError(f"{env_key} not configured")

    model = model_override or await resolve_model_for_role(provider_id, role)
    base_url = (spec.get("base_url") or "https://api.deepseek.com").rstrip("/")

    return await _call_responses(
        api_key=key,
        model=model,
        input_messages=messages,
        max_output_tokens=max_tokens,
        temperature=1.0,
        reasoning_effort=_normalize_reasoning_effort(reasoning_effort),
        store=False,
        use_tools=use_tools,
        base_url=base_url,
        provider_name=provider_id,
        tools_override=_deepseek_tools(),
    )
# 63:24
