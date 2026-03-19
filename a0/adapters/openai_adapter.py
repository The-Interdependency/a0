"""
OpenAI adapter — also used for Grok and DeepSeek (both OpenAI-compatible).

    A0_MODEL=openai   + OPENAI_API_KEY
    A0_MODEL=grok     + GROK_API_KEY     (base_url set automatically by get_adapter)
    A0_MODEL=deepseek + DEEPSEEK_API_KEY (base_url set automatically by get_adapter)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class OpenAIAdapter:
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o-mini",
        base_url: Optional[str] = None,
    ) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise ImportError("pip install openai") from e

        from openai import OpenAI
        self.model = model
        self.name = f"openai/{model}"
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def complete(self, messages: List[Dict[str, str]], **kwargs: Any) -> Dict[str, Any]:
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            **kwargs,
        )
        text = resp.choices[0].message.content or ""
        return {"text": text, "raw": resp.model_dump()}
