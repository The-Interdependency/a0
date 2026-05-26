# 38:5 0:0 7:0
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Literal

Mode = Literal["analyze", "route", "act"]
DEFAULT_HMMM_BOUNDARY = (
    "hmmm is the mandatory boundary object that records unresolved constraint, "
    "preserves honest incompletion, and marks the transition between delivered "
    "output and living continuation."
)


def normalize_hmmm(value: Any) -> List[str]:
    """Normalize hint payloads to a non-empty boundary list.

    - Accepts None, scalar, or list-like values.
    - Preserves provided entries as strings.
    - Ensures the mandatory boundary sentinel is always present.
    """
    if value is None:
        normalized: List[str] = []
    elif isinstance(value, str):
        normalized = [value.strip()] if value.strip() else []
    elif isinstance(value, Iterable):
        normalized = [str(v).strip() for v in value if str(v).strip()]
    else:
        normalized = [str(value).strip()] if str(value).strip() else []

    if DEFAULT_HMMM_BOUNDARY not in normalized:
        normalized.append(DEFAULT_HMMM_BOUNDARY)
    return normalized

@dataclass
class A0Request:
    task_id: str
    input: Dict[str, Any]
    tools_allowed: List[str] = field(default_factory=lambda: ["none"])
    mode: Mode = "analyze"
    hmmm: List[str] = field(default_factory=lambda: [DEFAULT_HMMM_BOUNDARY])

    def __post_init__(self) -> None:
        self.hmmm = normalize_hmmm(self.hmmm)

@dataclass
class A0Response:
    task_id: str
    result: Dict[str, Any]
    logs: Dict[str, Any] = field(default_factory=lambda: {"events": []})
    hmmm: List[str] = field(default_factory=lambda: [DEFAULT_HMMM_BOUNDARY])

    def __post_init__(self) -> None:
        self.hmmm = normalize_hmmm(self.hmmm)
# 38:5 0:0 7:0
