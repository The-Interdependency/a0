# 24:11 0:0 4:1
"""Phi tensor field — structural analysis layer of PCNA.

Phi's domain: constraint satisfaction, contradiction detection,
formal legality, structural pattern recognition.

In PCNA's circular basis, phi occupies the early layers:
tokenizer → early attention → syntactic structure → constraint graph.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List

from .inference import get_backend


class PhiTensor:
    """Live phi tensor field — structural processing."""

    def process(
        self,
        stimulus: str,
        context: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        """Process stimulus through the phi field.

        Returns phi tensor state including structural strain and
        circular coordinates (magnitude, phase).
        """
        slices = get_backend().generate(stimulus, context or [])
        raw = slices.phi_raw

        structural_strain = sum(raw) / max(len(raw), 1)
        magnitude = math.sqrt(sum(x * x for x in raw))
        phase = math.atan2(raw[1] if len(raw) > 1 else 0.0, raw[0] if raw else 0.0)

        return {
            "phi": {
                "raw": raw,
                "structural_strain": structural_strain,
                "magnitude": magnitude,
                "phase": phase,
                "backend": slices.backend_name,
            }
        }
# 24:11 0:0 4:1
