"""
Instance Merge Protocol — three modes for multi-instance PCNA mesh.

  absorb   — dominant absorbs donor; donor is retired
  fork     — parent spawns child with copied state + noise; both continue
  converge — both exchange tensors via federated averaging; both continue

Operates on PCNAEngine instances containing PTCACore + MemoryCore + GuardianTensor.
"""

import time
import numpy as np
from .guardian import GuardianTensor
from .ptca_core import PTCACore
from .pcna import PCNAEngine


def _fed_avg(a: np.ndarray, b: np.ndarray, alpha: float = 0.5) -> np.ndarray:
    return np.clip(alpha * a + (1.0 - alpha) * b, 0.0, 1.0)


def _blend_core(dst: PTCACore, src: PTCACore, alpha: float):
    dst.tensor = _fed_avg(dst.tensor, src.tensor, alpha=1.0 - alpha)
    dst._recompute_coherence()


class InstanceMerge:
    """Stateless merge operator for PCNAEngine instances."""

    @staticmethod
    def absorb(dominant: PCNAEngine, donor: PCNAEngine) -> dict:
        alpha = 0.15
        _blend_core(dominant.phi, donor.phi, alpha)
        _blend_core(dominant.psi, donor.psi, alpha)
        _blend_core(dominant.omega, donor.omega, alpha)

        dominant.guardian.tensor = _fed_avg(
            dominant.guardian.tensor, donor.guardian.tensor, alpha=1.0 - alpha
        )
        dominant.memory_l.tensor = _fed_avg(
            dominant.memory_l.tensor, donor.memory_l.tensor, alpha=0.8
        )

        for i in range(min(len(dominant.guardian.circle_count), len(donor.guardian.circle_count))):
            dominant.guardian.circle_count[i] = max(
                dominant.guardian.circle_count[i],
                donor.guardian.circle_count[i],
            )

        dominant.guardian._recompute_coherence()
        dominant.memory_l._recompute_hub_avg()

        return {
            "mode": "absorb",
            "dominant_id": dominant.guardian.instance_id,
            "donor_id": donor.guardian.instance_id,
            "donor_status": "retired",
            "phi_coherence": round(dominant.phi.ring_coherence, 4),
            "psi_coherence": round(dominant.psi.ring_coherence, 4),
            "omega_coherence": round(dominant.omega.ring_coherence, 4),
            "guardian_coherence": round(float(dominant.guardian.node_coherence.mean()), 4),
            "circle_counts_after": [int(v) for v in dominant.guardian.circle_count],
            "timestamp": time.time(),
        }

    @staticmethod
    def fork(parent: PCNAEngine) -> tuple[PCNAEngine, dict]:
        child = PCNAEngine()
        noise = np.random.default_rng(int(time.time() * 1000) % 2**32)

        for attr in ("phi", "psi", "omega"):
            p_core: PTCACore = getattr(parent, attr)
            c_core: PTCACore = getattr(child, attr)
            c_core.tensor = np.clip(
                p_core.tensor + noise.normal(0, 0.02, p_core.tensor.shape), 0.0, 1.0
            )
            c_core._recompute_coherence()

        child.guardian.tensor = np.clip(
            parent.guardian.tensor + noise.normal(0, 0.01, parent.guardian.tensor.shape), 0.0, 1.0
        )
        child.memory_l.tensor = parent.memory_l.tensor.copy()
        child.guardian.circle_count = parent.guardian.circle_count.copy()
        child.guardian.blueprint_shards = parent.guardian.blueprint_shards[:]
        child.guardian._recompute_coherence()
        child.memory_l._recompute_hub_avg()

        result = {
            "mode": "fork",
            "parent_id": parent.guardian.instance_id,
            "child_id": child.guardian.instance_id,
            "parent_status": "continues",
            "child_status": "spawned",
            "child_phi_coherence": round(child.phi.ring_coherence, 4),
            "child_psi_coherence": round(child.psi.ring_coherence, 4),
            "child_omega_coherence": round(child.omega.ring_coherence, 4),
            "timestamp": time.time(),
        }
        return child, result

    @staticmethod
    def converge(a: PCNAEngine, b: PCNAEngine, alpha: float = 0.5) -> dict:
        for attr in ("phi", "psi", "omega"):
            core_a: PTCACore = getattr(a, attr)
            core_b: PTCACore = getattr(b, attr)
            new_a = _fed_avg(core_a.tensor, core_b.tensor, alpha)
            new_b = _fed_avg(core_b.tensor, core_a.tensor, alpha)
            core_a.tensor = new_a
            core_b.tensor = new_b
            core_a._recompute_coherence()
            core_b._recompute_coherence()

        new_ga = _fed_avg(a.guardian.tensor, b.guardian.tensor, alpha)
        new_gb = _fed_avg(b.guardian.tensor, a.guardian.tensor, alpha)
        new_mla = _fed_avg(a.memory_l.tensor, b.memory_l.tensor, alpha=0.6)
        new_mlb = _fed_avg(b.memory_l.tensor, a.memory_l.tensor, alpha=0.6)

        a.guardian.tensor = new_ga
        b.guardian.tensor = new_gb
        a.memory_l.tensor = new_mla
        b.memory_l.tensor = new_mlb

        for i in range(min(len(a.guardian.circle_count), len(b.guardian.circle_count))):
            avg = (int(a.guardian.circle_count[i]) + int(b.guardian.circle_count[i])) // 2
            a.guardian.circle_count[i] = avg
            b.guardian.circle_count[i] = avg

        a.guardian._recompute_coherence()
        b.guardian._recompute_coherence()
        a.memory_l._recompute_hub_avg()
        b.memory_l._recompute_hub_avg()

        return {
            "mode": "converge",
            "instance_a": a.guardian.instance_id,
            "instance_b": b.guardian.instance_id,
            "alpha": alpha,
            "a_phi_coherence": round(a.phi.ring_coherence, 4),
            "b_phi_coherence": round(b.phi.ring_coherence, 4),
            "a_psi_coherence": round(a.psi.ring_coherence, 4),
            "b_psi_coherence": round(b.psi.ring_coherence, 4),
            "a_omega_coherence": round(a.omega.ring_coherence, 4),
            "b_omega_coherence": round(b.omega.ring_coherence, 4),
            "both_status": "diverging",
            "timestamp": time.time(),
        }
