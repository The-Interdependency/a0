# 55:20 0:0 0:0
# === MODULE_BUILD ===
# id: a0_service_zeta_observe
#   module_name: zeta_observe
#   module_kind: service
#   summary: Zeta observation helpers — derive coherence and sentinel-seed observation summaries from a PCNA state dict / engine and classify coherence into bands.
#   owner: Erin Spencer
#   public_surface: observe_coherence, observe_sentinel_seeds
#   internal_surface: _classify
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; zeta observation summaries revert to prior behavior.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===
import time
from typing import Any


def observe_coherence(pcna_state: dict) -> dict[str, Any]:
    rings = pcna_state.get("rings", {})
    phi = rings.get("phi", {})
    psi = rings.get("psi", {})
    omega = rings.get("omega", {})
    theta = rings.get("theta", {})

    phi_c = phi.get("ring_coherence", 0)
    psi_c = psi.get("ring_coherence", 0)
    omega_c = omega.get("ring_coherence", 0)
    theta_c = theta.get("ring_coherence", 0)

    winner = "phi"
    best = phi_c
    for name, val in [("psi", psi_c), ("omega", omega_c)]:
        if val > best:
            best = val
            winner = name

    weighted = 0.30 * phi_c + 0.15 * psi_c + 0.15 * omega_c + 0.20 * theta_c
    confidence = min(1.0, max(0.0, weighted))

    return {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "coherence": round(weighted, 4),
        "winner": winner,
        "confidence": round(confidence, 4),
        "phi": round(phi_c, 4),
        "psi": round(psi_c, 4),
        "omega": round(omega_c, 4),
        "theta": round(theta_c, 4),
        "note": _classify(weighted),
    }


def observe_sentinel_seeds(pcna_engine, sentinel_indices: list[int] = None) -> dict[str, Any]:
    if sentinel_indices is None:
        sentinel_indices = [10, 11, 12]
    phi_audit = pcna_engine.phi.ptca_seed_audit()
    sentinel_nodes = [n for n in phi_audit if n.get("prime_index", -1) in sentinel_indices]
    avg_coherence = 0.0
    if sentinel_nodes:
        avg_coherence = sum(n.get("coherence", 0) for n in sentinel_nodes) / len(sentinel_nodes)
    return {
        "sentinel_count": len(sentinel_nodes),
        "avg_coherence": round(avg_coherence, 4),
        "nodes": sentinel_nodes,
        "healthy": avg_coherence > 0.3,
    }


def _classify(coherence: float) -> str:
    if coherence >= 0.8:
        return "excellent"
    if coherence >= 0.6:
        return "good"
    if coherence >= 0.4:
        return "moderate"
    if coherence >= 0.2:
        return "low"
    return "critical"
# 55:20 0:0 0:0
