# 11:6
"""Phi — private structural and analytic cognitive core.

Phi thinks. Phi does not emit outward directly.

Phi's domain of concern: structural analysis, constraint checking,
contradiction detection, and formal legality.
"""
from __future__ import annotations

from typing import Any

from .._base import PrivateCore


class Phi(PrivateCore):
    """Primary private cognitive core — structural and analytic reasoning."""

    name = "phi"

    def _process(self, stimulus: Any) -> Any:
        from ..pcna.phi import PhiTensor
        text = stimulus if isinstance(stimulus, str) else str(stimulus)
        result = PhiTensor().process(text)
        result["core"] = self.name
        return result
# 11:6
