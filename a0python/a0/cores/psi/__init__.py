# 11:8
"""Psi — private semantic and contextual cognitive core.

Psi thinks. Psi does not emit outward directly.

Psi's domain of concern: semantic processing, contextual reasoning,
relational inference — and the build logic of a0 (the routing/processing
framework that IS semantic work).

Psi tensors hold the a0 build logic.
"""
from __future__ import annotations

from typing import Any

from .._base import PrivateCore


class Psi(PrivateCore):
    """Secondary private cognitive core — semantic and contextual reasoning."""

    name = "psi"

    def _process(self, stimulus: Any) -> Any:
        from ..pcna.psi import PsiTensor
        text = stimulus if isinstance(stimulus, str) else str(stimulus)
        result = PsiTensor().process(text)
        result["core"] = self.name
        return result
# 11:8
