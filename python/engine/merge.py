# 118:28 0:0 1:3
"""
Instance Merge Protocol — three modes for multi-instance PCNA mesh.

  absorb   — dominant absorbs donor; donor is retired
  fork     — parent spawns child with copied state + noise; both continue
  converge — both exchange tensors via federated averaging; both continue

Operates on PCNAEngine instances containing PTCACore + MemoryCore + ThetaTensor.
"""

# === MODULE_BUILD ===
# id: a0_engine_merge
#   module_name: merge
#   module_kind: engine
#   summary: InstanceMerge — stateless absorb/fork/converge operators for the multi-instance PCNA mesh, blending PTCACore/MemoryCore/ThetaTensor state via federated averaging.
#   owner: Erin Spencer
#   public_surface: InstanceMerge
#   internal_surface: _fed_avg, _blend_core
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; merge operators are pure functions over in-memory engine state.
#   requires: a0_engine_theta, a0_engine_ptca_core, a0_engine_pcna
#   since: 2026-06-02
#   unresolved: fork() time-seeds its RNG so rapid successive calls may collide.
# === END MODULE_BUILD ===

import time
import numpy as np
from .theta import ThetaTensor
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

        dominant.theta.tensor = _fed_avg(
            dominant.theta.tensor, donor.theta.tensor, alpha=1.0 - alpha
        )
        dominant.memory_l.tensor = _fed_avg(
            dominant.memory_l.tensor, donor.memory_l.tensor, alpha=0.8
        )

        for i in range(min(len(dominant.theta.circle_count), len(donor.theta.circle_count))):
            dominant.theta.circle_count[i] = max(
                dominant.theta.circle_count[i],
                donor.theta.circle_count[i],
            )

        dominant.theta._recompute_coherence()
        dominant.memory_l._recompute_hub_avg()

        phi_c = round(dominant.phi.ring_coherence, 4)
        guard_c = round(float(dominant.theta.node_coherence.mean()), 4)

        return {
            "mode": "absorb",
            "dominant_id": dominant.theta.instance_id,
            "donor_id": donor.theta.instance_id,
            "donor_status": "retired",
            "dominant_phi_coherence": phi_c,
            "dominant_theta_coherence": guard_c,
            "dominant_psi_coherence": round(dominant.psi.ring_coherence, 4),
            "dominant_omega_coherence": round(dominant.omega.ring_coherence, 4),
            "circle_counts_after": [int(v) for v in dominant.theta.circle_count],
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

        child.theta.tensor = np.clip(
            parent.theta.tensor + noise.normal(0, 0.01, parent.theta.tensor.shape), 0.0, 1.0
        )
        child.memory_l.tensor = parent.memory_l.tensor.copy()
        child.theta.circle_count = parent.theta.circle_count.copy()
        child.theta.blueprint_shards = parent.theta.blueprint_shards[:]
        child.theta._recompute_coherence()
        child.memory_l._recompute_hub_avg()

        result = {
            "mode": "fork",
            "parent_id": parent.theta.instance_id,
            "child_id": child.theta.instance_id,
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

        new_ga = _fed_avg(a.theta.tensor, b.theta.tensor, alpha)
        new_gb = _fed_avg(b.theta.tensor, a.theta.tensor, alpha)
        new_mla = _fed_avg(a.memory_l.tensor, b.memory_l.tensor, alpha=0.6)
        new_mlb = _fed_avg(b.memory_l.tensor, a.memory_l.tensor, alpha=0.6)

        a.theta.tensor = new_ga
        b.theta.tensor = new_gb
        a.memory_l.tensor = new_mla
        b.memory_l.tensor = new_mlb

        for i in range(min(len(a.theta.circle_count), len(b.theta.circle_count))):
            avg = (int(a.theta.circle_count[i]) + int(b.theta.circle_count[i])) // 2
            a.theta.circle_count[i] = avg
            b.theta.circle_count[i] = avg

        a.theta._recompute_coherence()
        b.theta._recompute_coherence()
        a.memory_l._recompute_hub_avg()
        b.memory_l._recompute_hub_avg()

        return {
            "mode": "converge",
            "instance_a": a.theta.instance_id,
            "instance_b": b.theta.instance_id,
            "alpha": alpha,
            "a_phi_coherence_after": round(a.phi.ring_coherence, 4),
            "b_phi_coherence_after": round(b.phi.ring_coherence, 4),
            "a_theta_coherence_after": round(float(a.theta.node_coherence.mean()), 4),
            "b_theta_coherence_after": round(float(b.theta.node_coherence.mean()), 4),
            "a_psi_coherence_after": round(a.psi.ring_coherence, 4),
            "b_psi_coherence_after": round(b.psi.ring_coherence, 4),
            "a_omega_coherence_after": round(a.omega.ring_coherence, 4),
            "b_omega_coherence_after": round(b.omega.ring_coherence, 4),
            "both_status": "diverging",
            "timestamp": time.time(),
        }
# 118:28 0:0 1:3
