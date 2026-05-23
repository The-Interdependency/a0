# 24:11
"""Psi tensor field — semantic analysis layer of PCNA.

Psi's domain: semantic processing, contextual reasoning,
relational inference, pattern recognition.

In PCNA's circular basis, psi occupies the middle layers:
embedding space → contextual attention → relational graph.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List

from .inference import get_backend


class PsiTensor:
    """Live psi tensor field — semantic processing."""

    def process(
        self,
        stimulus: str,
        context: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        """Process stimulus through the psi field.

        Returns psi tensor state including semantic density and
        circular coordinates (magnitude, phase).
        """
        slices = get_backend().generate(stimulus, context or [])
        raw = slices.psi_raw

        semantic_density = sum(raw) / max(len(raw), 1)
        magnitude = math.sqrt(sum(x * x for x in raw))
        phase = math.atan2(raw[1] if len(raw) > 1 else 0.0, raw[0] if raw else 0.0)

        return {
            "psi": {
                "raw": raw,
                "semantic_density": semantic_density,
                "magnitude": magnitude,
                "phase": phase,
                "backend": slices.backend_name,
            }
        }
# 24:11
