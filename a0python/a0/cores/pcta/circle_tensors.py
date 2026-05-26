# 59:35 0:0 1:0
"""PCTA circle tensor layer.

Transforms PCNA state (Cartesian tensor values) into circular /
phase coordinates — the unit-circle eigenbasis.

Mathematical foundation (from PCNA spec):

    All recursive systems reduce locally to:
        E(t+1) = T · E(t)

    Linearizing, eigen decomposition of T yields:
        λ = r · e^(iθ)

    So state evolution is spiral/helix motion.
    Circular coordinates are the native basis of recursion.

The transform:
    raw vector v  →  magnitude |v|, phase θ = atan2(v[1], v[0])

This is applied per tensor field (phi, psi, omega) and the results
feed upward to the PTCA seed router for shard assignment.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class CircleTensorState:
    """A PCNA tensor field expressed in circular coordinates.

    magnitude  — energy level of the field (radius in phase space)
    phase      — orientation in the unit-circle basis (radians, -π..π)
    raw        — original Cartesian values (retained for diagnostics)
    """

    field_name: str
    magnitude: float
    phase: float
    raw: List[float] = field(default_factory=list)

    @property
    def unit_x(self) -> float:
        """Projection onto real axis of unit circle."""
        return math.cos(self.phase)

    @property
    def unit_y(self) -> float:
        """Projection onto imaginary axis of unit circle."""
        return math.sin(self.phase)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field_name,
            "magnitude": self.magnitude,
            "phase": self.phase,
            "unit_x": self.unit_x,
            "unit_y": self.unit_y,
            "raw": self.raw,
        }


def _field_to_circle(name: str, values: List[float]) -> CircleTensorState:
    """Convert a raw tensor field vector to circular coordinates."""
    if not values:
        return CircleTensorState(field_name=name, magnitude=0.0, phase=0.0, raw=[])

    magnitude = math.sqrt(sum(x * x for x in values))
    phase = math.atan2(values[1] if len(values) > 1 else 0.0, values[0])

    return CircleTensorState(field_name=name, magnitude=magnitude, phase=phase, raw=list(values))


def to_phase_coords(
    state: Dict[str, Any],
) -> Dict[str, CircleTensorState]:
    """Transform a PCNA state dict into circular coordinates.

    Accepts the combined output of PhiTensor + PsiTensor + OmegaTensor:

        state = {
            "phi": {"raw": [...], ...},
            "psi": {"raw": [...], ...},
            "omega": {"raw": [...], ...},
        }

    Also accepts flat dicts of the form {"phi": [f1, f2, f3], ...}
    for testing and direct use.

    Returns a dict of field_name → CircleTensorState.
    """
    result: Dict[str, CircleTensorState] = {}

    for key in ("phi", "psi", "omega"):
        val = state.get(key)
        if val is None:
            result[key] = CircleTensorState(field_name=key, magnitude=0.0, phase=0.0)
            continue

        if isinstance(val, dict):
            raw = val.get("raw", [])
        elif isinstance(val, (list, tuple)):
            raw = list(val)
        else:
            raw = [float(val)]

        result[key] = _field_to_circle(key, raw)

    return result


def combined_phase_state(
    phi_result: Dict[str, Any],
    psi_result: Dict[str, Any],
    omega_result: Dict[str, Any],
) -> Dict[str, CircleTensorState]:
    """Convenience wrapper: combine three core outputs into circle state."""
    merged = {
        "phi": phi_result.get("phi", {}),
        "psi": psi_result.get("psi", {}),
        "omega": omega_result.get("omega", {}),
    }
    return to_phase_coords(merged)
# 59:35 0:0 1:0
