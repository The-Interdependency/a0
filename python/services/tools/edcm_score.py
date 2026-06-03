# 37:23 0:0 0:2
# N:M
"""edcm_score — return current EDCM ring coherence (edcmbone-backed)."""

# === MODULE_BUILD ===
# id: a0_service_tools_edcm_score
#   module_name: edcm_score
#   module_kind: service
#   summary: edcm_score tool — returns the current EDCM ring coherence metrics (edcmbone-backed) for the active PCNA engine.
#   owner: Erin Spencer
#   public_surface: SCHEMA, handle
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; removes the edcm_score tool from the registry.
#   requires: a0_service_edcm, a0_engine_pcna
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

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
# 37:23 0:0 0:2
