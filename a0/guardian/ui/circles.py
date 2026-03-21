"""Circle — the tab unit of the Guardian UI.

Each tab is a circle. Seeds group circles.

A circle has:
- name: unique identifier
- label: display text
- seed: which seed group it belongs to
- active: whether it is currently the focused tab
- hmmm: its unresolved-constraint register (never omitted)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class Circle:
    """A single tab, displayed as a circle."""
    name: str
    label: str
    seed: str
    active: bool = False
    hmmm: List[str] = field(default_factory=list)
    state: Dict[str, Any] = field(default_factory=dict)

    def activate(self) -> "Circle":
        return Circle(
            name=self.name,
            label=self.label,
            seed=self.seed,
            active=True,
            hmmm=self.hmmm,
            state=self.state,
        )

    def deactivate(self) -> "Circle":
        return Circle(
            name=self.name,
            label=self.label,
            seed=self.seed,
            active=False,
            hmmm=self.hmmm,
            state=self.state,
        )

    def with_hmmm(self, entries: List[str]) -> "Circle":
        return Circle(
            name=self.name,
            label=self.label,
            seed=self.seed,
            active=self.active,
            hmmm=entries,
            state=self.state,
        )
