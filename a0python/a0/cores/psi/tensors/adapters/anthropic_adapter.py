"""anthropic_adapter — calls the Anthropic Messages API directly.

Selected when A0_MODEL=anthropic-api in .env, or when a ModelConfig with
adapter="anthropic-api" is resolved via the model registry.

Requires ANTHROPIC_API_KEY and the ``anthropic`` package.

Install::

    pip install anthropic
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

Message = Dict[str, str]

try:
    import anthropic as _anthropic_lib
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False


class AnthropicAdapter:
    name = "anthropic-api"

    def __init__(self, config: Optional[Any] = None) -> None:
        """
        Args:
            config: Optional ModelConfig.  When provided, model_name,
                    max_tokens, temperature, and system_prompt are read
                    from it.  Falls back to built-in defaults when None.
        """
        if config is not None:
            self._model        = getattr(config, "model_name", None) or "claude-sonnet-4-6"
            self._max_tokens   = getattr(config, "max_tokens", 2048) or 2048
            self._temperature  = getattr(config, "temperature", 0.7)
            self._system_prompt = getattr(config, "system_prompt", None)
        else:
            self._model        = "claude-sonnet-4-6"
            self._max_tokens   = 2048
            self._temperature  = 0.7
            self._system_prompt = None

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

        create_kwargs: Dict[str, Any] = {
            "model":      self._model,
            "messages":   messages,
            "max_tokens": self._max_tokens,
        }
        # system_prompt kwarg (memory injection from router) overrides instance default
        system = kwargs.get("system_prompt") or self._system_prompt
        if system:
            create_kwargs["system"] = system

        response = client.messages.create(**create_kwargs)
        text = response.content[0].text if response.content else ""
        return {
            "text": text,
            "raw": {"stop_reason": response.stop_reason},
            "subagents_used": [],
        }
