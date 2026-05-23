# 124:34
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

The 7 seeds here map 1:1 to the 7 Meta Routers (M₁..M₇) of the PTCA
seed router. Live tensor data from the PCTA circle tensor layer can be
pushed into seeds via push_pcta_state().

Guardian owns the UI. Seeds are Guardian's organizational principle.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .circles import Circle

# Optional callback type: called whenever PCTA circle state is pushed.
_LiveCallback = Callable[[str, Dict[str, Any]], None]


@dataclass
class Seed:
    """A named group of circles."""
    name: str
    label: str
    circles: List[Circle] = field(default_factory=list)
    # Live tensor data from the PCTA circle layer (magnitude, phase, etc.)
    tensor_state: Dict[str, Any] = field(default_factory=dict)

    def active_circle(self) -> Optional[Circle]:
        return next((c for c in self.circles if c.active), None)

    def circle(self, name: str) -> Optional[Circle]:
        return next((c for c in self.circles if c.name == name), None)

    def update_tensor(self, state: Dict[str, Any]) -> "Seed":
        """Return a new Seed with updated tensor_state (immutable update)."""
        return Seed(
            name=self.name,
            label=self.label,
            circles=self.circles,
            tensor_state={**self.tensor_state, **state},
        )


@dataclass
class SeedLayout:
    """The complete set of seeds forming the Guardian UI layout."""
    seeds: List[Seed] = field(default_factory=list)
    _live_callbacks: List[_LiveCallback] = field(default_factory=list)

    def seed(self, name: str) -> Optional[Seed]:
        return next((s for s in self.seeds if s.name == name), None)

    def all_circles(self) -> List[Circle]:
        return [c for s in self.seeds for c in s.circles]

    def active_circle(self) -> Optional[Circle]:
        return next((c for c in self.all_circles() if c.active), None)

    def register_live_callback(self, callback: _LiveCallback) -> None:
        """Register a callback invoked when PCTA state is pushed."""
        self._live_callbacks.append(callback)

    def push_pcta_state(
        self,
        phase_coords: Dict[str, Any],
        routing_verdict: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Push live PCTA circle tensor state into the seed layout.

        Args:
            phase_coords:     Output of to_phase_coords() — dict of
                              field_name → CircleTensorState.
            routing_verdict:  Optional RoutingVerdict.to_dict() from
                              SeedRouter.route().

        Updates seed_core circles with live phi/psi/omega tensor data.
        Notifies any registered live callbacks.
        """
        core_seed = self.seed("seed_core")
        if core_seed is None:
            return

        for field_name in ("phi", "psi", "omega"):
            cs = phase_coords.get(field_name)
            if cs is None:
                continue
            # Accept both CircleTensorState objects and plain dicts
            state = cs.to_dict() if hasattr(cs, "to_dict") else dict(cs)
            circle = core_seed.circle(field_name)
            if circle is not None:
                circle.state[f"tensor_{field_name}"] = state

        # Store routing verdict in seed_meta if provided
        if routing_verdict:
            meta_seed = self.seed("seed_meta")
            if meta_seed:
                exec_circle = meta_seed.circle("executive")
                if exec_circle is not None:
                    exec_circle.state["routing_verdict"] = routing_verdict

        # Fire live callbacks
        for cb in self._live_callbacks:
            try:
                cb("pcta_update", {"phase_coords": phase_coords, "routing_verdict": routing_verdict})
            except Exception:
                pass


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
# 124:34
