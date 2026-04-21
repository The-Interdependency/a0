# N:M
"""edcm_score — return current EDCM ring coherence (edcmbone-backed)."""
import json
from ..edcm import EDCMBONE_VERSION

SCHEMA = {
    "type": "function",
    "function": {
        "name": "edcm_score",
        "description": (
            "Return the current EDCM (Energy Directional Coherence Metric) score "
            "and ring state for all three PCNA rings. "
            f"Math is delegated to edcmbone v{EDCMBONE_VERSION} "
            "(bone-token density, repetition ratio, novelty, fixation/loop risks)."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "pcna",
    "cost_hint": "free",
    "side_effects": [],
    "version": 2,
}


async def handle(**_) -> str:
    from ...main import get_pcna as _get
    pcna = _get()
    return json.dumps({
        "phi": round(pcna.phi.ring_coherence, 4),
        "psi": round(pcna.psi.ring_coherence, 4),
        "omega": round(pcna.omega.ring_coherence, 4),
        "mean": round(
            (pcna.phi.ring_coherence + pcna.psi.ring_coherence + pcna.omega.ring_coherence) / 3,
            4,
        ),
        "infer_count": pcna.infer_count,
        "reward_count": pcna.reward_count,
        "edcmbone_version": EDCMBONE_VERSION,
    })
# N:M
