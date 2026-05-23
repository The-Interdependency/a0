# 19:2
cat > a0/contract.py <<'EOF'
# a0/contract.py
# hmmm: Contract is the stability anchor.

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
    hmm: List[str] = field(default_factory=list)

@dataclass
class A0Response:
    task_id: str
    result: Dict[str, Any]
    logs: Dict[str, Any] = field(default_factory=lambda: {"events": []})
    hmm: List[str] = field(default_factory=list)
EOF
# 19:2
