# 11:3 0:0 4:0
# a0/model_adapter.py
# hmmm: single interface; swap providers freely.

from __future__ import annotations
from typing import Any, Dict, List, Protocol

Message = Dict[str, str]  # {"role": "user|assistant|system", "content": "..."}

class ModelAdapter(Protocol):
    name: str
    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]: ...

class LocalEchoAdapter:
    name = "local-echo"
    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]:
        # Minimal safe default: echoes last user content.
        last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        return {"text": f"(local-echo) {last}", "raw": {"messages": messages, "kwargs": kwargs}}
# 11:3 0:0 4:0
