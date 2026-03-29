"""
Instance Merge Protocol — three modes for multi-instance Guardian mesh.

  absorb   — one instance absorbs the other; survivor continues, donor is retired
  fork     — parent spawns a child with a copy of its state; both continue
  converge — both instances exchange tensors and update via federated averaging; then diverge

Each mode operates on GuardianTensor + PhiRing state exports.
"""

import time
import numpy as np
from .guardian_tensor import GuardianTensor
from .phi import PhiRing
from .pcna import PCNAEngine


# ── federated average helper ───────────────────────────────────────────────────
def _fed_avg(a: np.ndarray, b: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    return np.clip(alpha * a + (1.0 - alpha) * b, 0.0, 1.0)


class InstanceMerge:
    """
    Stateless merge operator — takes two PCNAEngine instances and a mode,
    returns a result dict describing the outcome.
    """

    @staticmethod
    def absorb(dominant: PCNAEngine, donor: PCNAEngine) -> dict:
        """
        Absorb mode: dominant absorbs donor's memory and guardian circles.
        Donor is marked retired. Dominant continues with blended tensors.
        """
        alpha = 0.15
        dominant.phi.tensor = _fed_avg(dominant.phi.tensor, donor.phi.tensor, alpha=1.0 - alpha)
        dominant.guardian.tensor = _fed_avg(dominant.guardian.tensor, donor.guardian.tensor, alpha=1.0 - alpha)
        dominant.memory_l.tensor = _fed_avg(dominant.memory_l.tensor, donor.memory_l.tensor, alpha=0.8)

        for i in range(min(len(dominant.guardian.circle_count), len(donor.guardian.circle_count))):
            dominant.guardian.circle_count[i] = max(
                dominant.guardian.circle_count[i],
                donor.guardian.circle_count[i],
            )

        dominant.phi._recompute_coherence()
        dominant.guardian._recompute_coherence()
        dominant.memory_l._recompute_hub_avg()

        return {
            "mode": "absorb",
            "dominant_id": dominant.guardian.instance_id,
            "donor_id": donor.guardian.instance_id,
            "donor_status": "retired",
            "dominant_phi_coherence": round(dominant.phi.ring_coherence, 4),
            "dominant_guardian_coherence": round(float(dominant.guardian.node_coherence.mean()), 4),
            "circle_counts_after": [int(v) for v in dominant.guardian.circle_count],
            "timestamp": time.time(),
        }

    @staticmethod
    def fork(parent: PCNAEngine) -> tuple[PCNAEngine, dict]:
        """
        Fork mode: create a child engine seeded from parent state.
        Both parent and child continue independently.
        """
        child = PCNAEngine()

        noise = np.random.default_rng(int(time.time() * 1000) % 2**32)
        child.phi.tensor = np.clip(
            parent.phi.tensor + noise.normal(0, 0.02, parent.phi.tensor.shape), 0.0, 1.0
        )
        child.guardian.tensor = np.clip(
            parent.guardian.tensor + noise.normal(0, 0.01, parent.guardian.tensor.shape), 0.0, 1.0
        )
        child.memory_l.tensor = parent.memory_l.tensor.copy()
        child.guardian.circle_count = parent.guardian.circle_count.copy()
        child.guardian.blueprint_shards = parent.guardian.blueprint_shards[:]
        child.phi._recompute_coherence()
        child.guardian._recompute_coherence()
        child.memory_l._recompute_hub_avg()

        result = {
            "mode": "fork",
            "parent_id": parent.guardian.instance_id,
            "child_id": child.guardian.instance_id,
            "parent_status": "continues",
            "child_status": "spawned",
            "child_phi_coherence": round(child.phi.ring_coherence, 4),
            "timestamp": time.time(),
        }
        return child, result

    @staticmethod
    def converge(a: PCNAEngine, b: PCNAEngine, alpha: float = 0.5) -> dict:
        """
        Converge mode: both engines exchange tensors via federated average.
        Both continue after the exchange with updated states.
        """
        new_phi_a = _fed_avg(a.phi.tensor, b.phi.tensor, alpha)
        new_phi_b = _fed_avg(b.phi.tensor, a.phi.tensor, alpha)
        new_guard_a = _fed_avg(a.guardian.tensor, b.guardian.tensor, alpha)
        new_guard_b = _fed_avg(b.guardian.tensor, a.guardian.tensor, alpha)
        new_ml_a = _fed_avg(a.memory_l.tensor, b.memory_l.tensor, alpha=0.6)
        new_ml_b = _fed_avg(b.memory_l.tensor, a.memory_l.tensor, alpha=0.6)

        a.phi.tensor = new_phi_a
        b.phi.tensor = new_phi_b
        a.guardian.tensor = new_guard_a
        b.guardian.tensor = new_guard_b
        a.memory_l.tensor = new_ml_a
        b.memory_l.tensor = new_ml_b

        for i in range(min(len(a.guardian.circle_count), len(b.guardian.circle_count))):
            avg = (int(a.guardian.circle_count[i]) + int(b.guardian.circle_count[i])) // 2
            a.guardian.circle_count[i] = avg
            b.guardian.circle_count[i] = avg

        a.phi._recompute_coherence()
        b.phi._recompute_coherence()
        a.guardian._recompute_coherence()
        b.guardian._recompute_coherence()
        a.memory_l._recompute_hub_avg()
        b.memory_l._recompute_hub_avg()

        return {
            "mode": "converge",
            "instance_a": a.guardian.instance_id,
            "instance_b": b.guardian.instance_id,
            "alpha": alpha,
            "a_phi_coherence_after": round(a.phi.ring_coherence, 4),
            "b_phi_coherence_after": round(b.phi.ring_coherence, 4),
            "a_guardian_coherence_after": round(float(a.guardian.node_coherence.mean()), 4),
            "b_guardian_coherence_after": round(float(b.guardian.node_coherence.mean()), 4),
            "both_status": "diverging",
            "timestamp": time.time(),
        }
