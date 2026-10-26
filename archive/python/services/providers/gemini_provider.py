# 29:41 0:0 1:2
"""gemini_provider — Google Gemini via the google-genai SDK.

Thin contract-conforming wrapper around services/gemini_native.call_gemini_native.
gemini_native already uses the official google-genai SDK (no httpx), with full
tool-loop support, automatic citation extraction for grounding, and a
thinking_config branch gated by spec.supports_thinking from providers.json.
This module exists only to give it the standard
`providers/<name>.call(messages, role=..., ...)` contract so the inference
dispatcher delegates uniformly across all four providers.

Why both files exist (no merge): gemini_native.py is also imported by
non-provider callers (the chat composer's grounding badge code reads
extracted citations directly from a helper there). Moving the body would
break those imports; wrapping is the lighter touch.

When `supports_thinking` isn't passed, it's inferred from provider_id:
gemini3 → True, gemini → False (matches the dispatcher behavior in
inference.py:555).
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_providers_gemini
#   module_name: gemini_provider
#   module_kind: adapter
#   summary: Gemini provider adapter — a thin contract-conforming wrapper that gives gemini_native.call_gemini_native the standard providers.call(messages, role=..., ...) shape so the inference dispatcher delegates uniformly.
#   owner: Erin Spencer
#   public_surface: call
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; Gemini provider dispatch reverts to prior wrapper behavior.
#   requires: a0_service_providers_resolver, a0_service_gemini_native
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

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
    provider_id: str = "gemini3",
    supports_thinking: Optional[bool] = None,
) -> tuple[str, dict]:
    """Run a chat turn against Gemini via google-genai.

    provider_id chooses between "gemini" (2.5-flash baseline) and "gemini3"
    (3-pro with thinking_config). Defaults to gemini3 since that's the
    runtime active provider.
    """
    if supports_thinking is None:
        supports_thinking = provider_id == "gemini3"
    key = api_key or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY not configured")
    model = model_override or await resolve_model_for_role(provider_id, role)

    from ..gemini_native import call_gemini_native
    return await call_gemini_native(
        key, model, messages, max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort,
        supports_thinking=supports_thinking,
    )
# 29:41 0:0 1:2
