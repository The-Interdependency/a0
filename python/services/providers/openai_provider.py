# 27:22 0:0 1:1
"""Compatibility wrapper for the registry-driven OpenAI provider."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_openai
#   module_name: openai_provider
#   module_kind: adapter
#   summary: Stable OpenAI-specific call surface delegating transport behavior to the generic OpenAI-compatible adapter.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: tests/test_open_comp_prov_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Restore the former OpenAI-only Responses implementation.
#   requires: a0_service_providers_openai_compatible
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

from typing import Optional

from . import openai_compatible_provider


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
    """Run the built-in OpenAI provider through the shared transport."""
    return await openai_compatible_provider.call(
        messages,
        provider_id="openai",
        role=role,
        model_override=model_override,
        api_key=api_key,
        max_tokens=max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort,
        temperature=temperature,
        store=store,
    )
# 27:22 0:0 1:1
