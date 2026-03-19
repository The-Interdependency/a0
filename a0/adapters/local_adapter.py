"""Local echo adapter — no API key required. Used as the default fallback."""

from __future__ import annotations

from typing import Any, Dict, List


class LocalEchoAdapter:
    name = "local-echo"

    def complete(self, messages: List[Dict[str, str]], **kwargs: Any) -> Dict[str, Any]:
        last = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
        )
        return {"text": f"(local-echo) {last}", "raw": {"messages": messages}}
