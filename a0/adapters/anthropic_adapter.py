"""
Anthropic (Claude) adapter.

    A0_MODEL=claude + ANTHROPIC_API_KEY
"""

from __future__ import annotations

from typing import Any, Dict, List


class AnthropicAdapter:
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6") -> None:
        try:
            import anthropic
        except ImportError as e:
            raise ImportError("pip install anthropic") from e

        import anthropic
        self.model = model
        self.name = f"claude/{model}"
        self._client = anthropic.Anthropic(api_key=api_key)

    def complete(self, messages: List[Dict[str, str]], **kwargs: Any) -> Dict[str, Any]:
        # Separate system message if present
        system = ""
        chat_messages = []
        for m in messages:
            if m.get("role") == "system":
                system = m["content"]
            else:
                chat_messages.append({"role": m["role"], "content": m["content"]})

        create_kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": kwargs.pop("max_tokens", 4096),
            "messages": chat_messages,
            **kwargs,
        }
        if system:
            create_kwargs["system"] = system

        resp = self._client.messages.create(**create_kwargs)
        text = resp.content[0].text if resp.content else ""
        return {"text": text, "raw": resp.model_dump()}
