# 41:21 0:0 0:1
"""pcna_infer — run a signal through the PCNA tensor engine."""

# === MODULE_BUILD ===
# id: a0_service_tools_pcna_infer
#   module_name: pcna_infer
#   module_kind: service
#   summary: pcna_infer tool — runs a scalar signal through the active PCNA tensor engine and returns the inference result (winner + coherence).
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
#   rollback: Revert this file; removes the pcna_infer tool from the registry.
#   requires: a0_platonic_ptcna_state
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import json

SCHEMA = {
    "type": "function",
    "function": {
        "name": "pcna_infer",
        "description": (
            "Run a signal through the PCNA tensor engine. "
            "Returns current phi/psi/omega ring coherence and the inferred output value."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "signal": {
                    "type": "number",
                    "description": "Input signal strength, 0.0–1.0",
                }
            },
            "required": ["signal"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "pcna",
    "cost_hint": "low",
    "side_effects": [],
    "version": 1,
}


async def handle(signal: float = 0.5, **_) -> str:
    from ...main import get_pcna as _get
    pcna = _get()
    signal = float(signal)
    result = pcna.infer(str(signal))
    return json.dumps({
        "signal_in": signal,
        "coherence_score": result.get("coherence_score"),
        "winner": result.get("winner"),
        "confidence": result.get("confidence"),
        "phi_coherence": result.get("step6_coherence", {}).get("phi", round(pcna.phi.ring_coherence, 4)),
        "infer_count": pcna.infer_count,
    })
# 41:21 0:0 0:1
