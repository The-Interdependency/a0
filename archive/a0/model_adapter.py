# 11:0 0:0 4:0
from __future__ import annotations
from typing import Any, Dict, List, Protocol

Message = Dict[str, str]  # {"role": "...", "content": "..."}

class ModelAdapter(Protocol):
    name: str
    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]: ...

class LocalEchoAdapter:
    name = "local-echo"
    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]:
        last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        return {"text": f"(local-echo) {last}", "raw": {"messages": messages, "kwargs": kwargs}}
# 11:0 0:0 4:0
