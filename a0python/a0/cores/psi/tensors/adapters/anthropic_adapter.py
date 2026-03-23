"""anthropic_adapter — calls the Anthropic Messages API directly.

Selected when A0_MODEL=anthropic-api in .env.
Requires ANTHROPIC_API_KEY and the `anthropic` package.

Install::

    pip install anthropic
"""
from __future__ import annotations

from typing import Any, Dict, List

Message = Dict[str, str]

try:
    import anthropic as _anthropic_lib
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False


class AnthropicAdapter:
    name = "anthropic-api"

    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]:
        if not _ANTHROPIC_AVAILABLE:
            raise ImportError(
                "anthropic package not installed. Run: pip install anthropic"
            )

        from a0.cores.psi.tensors.env import ANTHROPIC_API_KEY

        if not ANTHROPIC_API_KEY:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Add it to .env or set it in the settings tab."
            )

        client = _anthropic_lib.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            messages=messages,
            max_tokens=2048,
        )
        text = response.content[0].text if response.content else ""
        return {
            "text": text,
            "raw": {"stop_reason": response.stop_reason},
            "subagents_used": [],
        }
