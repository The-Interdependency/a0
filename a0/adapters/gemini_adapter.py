"""
Google Gemini adapter.

    A0_MODEL=gemini + GEMINI_API_KEY
"""

from __future__ import annotations

from typing import Any, Dict, List


class GeminiAdapter:
    def __init__(self, api_key: str, model: str = "gemini-1.5-flash") -> None:
        try:
            import google.generativeai as genai
        except ImportError as e:
            raise ImportError("pip install google-generativeai") from e

        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.model = model
        self.name = f"gemini/{model}"
        self._genai = genai

    def complete(self, messages: List[Dict[str, str]], **kwargs: Any) -> Dict[str, Any]:
        # Convert OpenAI-style messages to Gemini format
        history = []
        prompt = ""
        for m in messages:
            role = "user" if m.get("role") == "user" else "model"
            if role == "user":
                prompt = m["content"]
            history.append({"role": role, "parts": [m["content"]]})

        client = self._genai.GenerativeModel(self.model)
        chat = client.start_chat(history=history[:-1] if len(history) > 1 else [])
        resp = chat.send_message(prompt)
        return {"text": resp.text, "raw": {}}
