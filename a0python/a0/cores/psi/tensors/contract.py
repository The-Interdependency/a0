from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal

Mode = Literal["analyze", "route", "act"]

@dataclass
class A0Request:
    task_id: str
    input: Dict[str, Any]
    tools_allowed: List[str] = field(default_factory=lambda: ["none"])
    mode: Mode = "analyze"
    hmmm: List[str] = field(default_factory=list)
    history: List[Dict[str, str]] = field(default_factory=list)

@dataclass
class A0Response:
    task_id: str
    result: Dict[str, Any]
    logs: Dict[str, Any] = field(default_factory=lambda: {"events": []})
    hmmm: List[str] = field(default_factory=list)
