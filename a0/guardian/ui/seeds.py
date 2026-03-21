"""Seeds — circle group containers for the Guardian UI.

Seeds group circles. Each seed is a named category of tabs.

The seed taxonomy maps directly to the PTCA architecture:
- seed_core       : private cognitive cores (Phi, Psi, Omega)
- seed_transport  : internal transport (Phonon)
- seed_jury       : adjudication layer
- seed_memory     : continuity substrate
- seed_meta       : executive layer (Meta-13)
- seed_guardian   : microkernel shell (sentinels, recovery, approval, audit)
- seed_advisory   : bandit advisory layer

Guardian owns the UI. Seeds are Guardian's organizational principle.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .circles import Circle


@dataclass
class Seed:
    """A named group of circles."""
    name: str
    label: str
    circles: List[Circle] = field(default_factory=list)

    def active_circle(self) -> Optional[Circle]:
        return next((c for c in self.circles if c.active), None)

    def circle(self, name: str) -> Optional[Circle]:
        return next((c for c in self.circles if c.name == name), None)


@dataclass
class SeedLayout:
    """The complete set of seeds forming the Guardian UI layout."""
    seeds: List[Seed] = field(default_factory=list)

    def seed(self, name: str) -> Optional[Seed]:
        return next((s for s in self.seeds if s.name == name), None)

    def all_circles(self) -> List[Circle]:
        return [c for s in self.seeds for c in s.circles]

    def active_circle(self) -> Optional[Circle]:
        return next((c for c in self.all_circles() if c.active), None)


def default_layout() -> SeedLayout:
    """The default Guardian UI layout: all seeds and their circles."""
    return SeedLayout(seeds=[
        Seed(
            name="seed_core",
            label="Core",
            circles=[
                Circle(name="phi",   label="Phi",   seed="seed_core"),
                Circle(name="psi",   label="Psi",   seed="seed_core"),
                Circle(name="omega", label="Omega", seed="seed_core"),
            ],
        ),
        Seed(
            name="seed_transport",
            label="Transport",
            circles=[
                Circle(name="phonon", label="Phonon", seed="seed_transport"),
            ],
        ),
        Seed(
            name="seed_jury",
            label="Jury",
            circles=[
                Circle(name="adjudication", label="Adjudication", seed="seed_jury"),
                Circle(name="conflicts",    label="Conflicts",    seed="seed_jury"),
                Circle(name="standards",    label="Standards",    seed="seed_jury"),
            ],
        ),
        Seed(
            name="seed_memory",
            label="Memory",
            circles=[
                Circle(name="continuity", label="Continuity", seed="seed_memory"),
                Circle(name="recall",     label="Recall",     seed="seed_memory"),
            ],
        ),
        Seed(
            name="seed_meta",
            label="Meta-13",
            circles=[
                Circle(name="executive",  label="Executive",  seed="seed_meta"),
                Circle(name="fast_path",  label="Fast Path",  seed="seed_meta"),
                Circle(name="slow_path",  label="Slow Path",  seed="seed_meta"),
            ],
        ),
        Seed(
            name="seed_guardian",
            label="Guardian",
            circles=[
                Circle(name="sentinels", label="Sentinels", seed="seed_guardian"),
                Circle(name="recovery",  label="Recovery",  seed="seed_guardian"),
                Circle(name="approval",  label="Approval",  seed="seed_guardian"),
                Circle(name="audit",     label="Audit",     seed="seed_guardian"),
                Circle(name="emit",      label="Emit",      seed="seed_guardian"),
            ],
        ),
        Seed(
            name="seed_advisory",
            label="Advisory",
            circles=[
                Circle(name="bandit", label="Bandit", seed="seed_advisory"),
            ],
        ),
    ])
