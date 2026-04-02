"""
PCNA Inference Engine — six-ring pipeline, all rings real.

Six rings:
  Φ  (phi)       N=53, seed=53  — cognitive substrate
  Ψ  (psi)       N=53, seed=43  — self-model
  Ω  (omega)     N=53, seed=47  — autonomy
  Guardian       N=29           — microkernel gate
  Memory-L       N=19, seed=19  — long-term
  Memory-S       N=17, seed=17  — short-term

Six inference steps:
  1. Project    — encode input text → normalized signal vector
  2. Inject     — push signal into Φ, self-referential into Ψ, autonomy into Ω
  3. Propagate  — run heptagram propagation on Φ/Ψ/Ω + guardian
  4. PTCA-seed  — per-prime-node audit on all three PTCA cores
  5. PCTA-circle — guardian circle audit
  6. Coherence  — weighted ring coherence → winner + confidence

Backprop:
  reward(winner, outcome) → nudge all three PTCA cores + guardian + memory flush
"""

import hashlib
import time
import numpy as np

from .ptca_core import PTCACore
from .memory_core import MemoryCore
from .guardian import GuardianTensor

RING_WEIGHTS = {
    "phi": 0.30,
    "psi": 0.15,
    "omega": 0.15,
    "guardian": 0.20,
    "memory_l": 0.12,
    "memory_s": 0.08,
}

WINNER_RINGS = ["phi", "psi", "omega"]


class PCNAEngine:
    """PCNA six-ring inference engine — no stubs, all rings real."""

    def __init__(self):
        self.phi = PTCACore(name="phi", symbol="Φ", role="cognitive", n=53, seed=53)
        self.psi = PTCACore(name="psi", symbol="Ψ", role="self_model", n=53, seed=43)
        self.omega = PTCACore(name="omega", symbol="Ω", role="autonomy", n=53, seed=47)
        self.memory_l = MemoryCore(n=19, seed=19, role="long_term")
        self.memory_s = MemoryCore(n=17, seed=17, role="short_term")
        self.guardian = GuardianTensor()
        self.infer_count = 0
        self.reward_count = 0
        self.last_coherence = 0.0
        self.last_winner = "phi"
        self.blueprint_hash = self.guardian.blueprint_hash
        self.created_at = time.time()

    def _project(self, text: str) -> np.ndarray:
        h = hashlib.sha512(text.encode("utf-8")).digest()
        arr = np.frombuffer(h, dtype=np.uint8).astype(np.float64)
        arr = arr / 255.0
        padded = np.tile(arr, 4)[:53]
        return padded

    def _inject(self, signal: np.ndarray):
        self.phi.inject(signal)
        self.memory_s.write(signal)

        psi_signal = np.full(53, self.phi.ring_coherence, dtype=np.float64)
        phi_node_c = self.phi.node_coherence
        psi_signal[:len(phi_node_c)] = phi_node_c
        self.psi.inject(psi_signal)

        ml_hub = self.memory_l.hub_avg
        omega_base = np.full(53, float(ml_hub.mean()), dtype=np.float64)
        omega_base[:len(ml_hub)] *= ml_hub
        omega_base = np.clip(omega_base, 0.0, 1.0)
        self.omega.inject(omega_base)

    def _propagate(self):
        self.phi.propagate(steps=10)
        self.psi.propagate(steps=8)
        self.omega.propagate(steps=6)
        self.guardian.propagate(steps=5)

    def _ptca_seed_audit(self) -> dict:
        cores = {"phi": self.phi, "psi": self.psi, "omega": self.omega}
        result = {}
        for name, core in cores.items():
            audit = core.ptca_seed_audit()
            result[f"{name}_nodes_audited"] = len(audit)
            result[f"{name}_coherence"] = round(core.ring_coherence, 4)
            result[f"{name}_top3"] = sorted(audit, key=lambda x: x["coherence"], reverse=True)[:3]
            result[f"{name}_bottom3"] = sorted(audit, key=lambda x: x["coherence"])[:3]
        result["memory_s_hub_avg"] = self.memory_s.state()["avg_hub"]
        return result

    def _pcta_circle_audit(self) -> dict:
        g_audit = self.guardian.pcta_circle_audit()
        open_nodes = [n for n in g_audit if n["gate"]]
        closed_nodes = [n for n in g_audit if not n["gate"]]
        return {
            "guardian_nodes": len(g_audit),
            "gates_open": len(open_nodes),
            "gates_closed": len(closed_nodes),
            "avg_circles": round(sum(n["circles"] for n in g_audit) / len(g_audit), 2),
            "guardian_coherence": round(float(self.guardian.node_coherence.mean()), 4),
            "memory_l_hub_avg": self.memory_l.state()["avg_hub"],
        }

    def _coherence_score(self, seed_audit: dict, circle_audit: dict) -> dict:
        ring_scores = {
            "phi": seed_audit["phi_coherence"],
            "psi": seed_audit["psi_coherence"],
            "omega": seed_audit["omega_coherence"],
            "guardian": circle_audit["guardian_coherence"],
            "memory_l": self.memory_l.state()["avg_hub"],
            "memory_s": self.memory_s.state()["avg_hub"],
        }

        weighted = sum(RING_WEIGHTS[r] * ring_scores[r] for r in ring_scores)
        winner = max(WINNER_RINGS, key=lambda r: ring_scores[r])
        confidence = float(np.clip(weighted, 0.0, 1.0))

        return {
            "ring_scores": {k: round(v, 4) for k, v in ring_scores.items()},
            "weighted_coherence": round(weighted, 4),
            "winner": winner,
            "confidence": round(confidence, 4),
        }

    def infer(self, text: str) -> dict:
        t0 = time.time()

        signal = self._project(text)
        self._inject(signal)
        self._propagate()
        seed_audit = self._ptca_seed_audit()
        circle_audit = self._pcta_circle_audit()
        coherence = self._coherence_score(seed_audit, circle_audit)

        self.infer_count += 1
        self.last_coherence = coherence["weighted_coherence"]
        self.last_winner = coherence["winner"]

        elapsed_ms = round((time.time() - t0) * 1000, 1)

        return {
            "step": "pcna_infer",
            "infer_index": self.infer_count,
            "blueprint_hash": self.blueprint_hash[:16] + "...",
            "elapsed_ms": elapsed_ms,
            "signal_mean": round(float(signal.mean()), 4),
            "step1_project": {"signal_len": len(signal), "signal_mean": round(float(signal.mean()), 4)},
            "step2_inject": {"phi_n": 53, "psi_n": 53, "omega_n": 53, "memory_s_n": 17},
            "step3_propagate": {"phi_steps": 10, "psi_steps": 8, "omega_steps": 6, "guardian_steps": 5},
            "step4_ptca_seed": seed_audit,
            "step5_pcta_circle": circle_audit,
            "step6_coherence": coherence,
            "coherence_score": coherence["weighted_coherence"],
            "winner": coherence["winner"],
            "confidence": coherence["confidence"],
            "guardian_circles": int(self.guardian.circle_count.mean()),
            "memory_l_state": self.memory_l.state(),
            "memory_s_state": self.memory_s.state(),
        }

    def reward(self, winner: str, outcome: float) -> dict:
        self.phi.nudge(outcome, lr=0.025)
        self.psi.nudge(outcome, lr=0.020)
        self.omega.nudge(outcome, lr=0.015)
        self.guardian.apply_reward(outcome)
        flushed = self.memory_s.flush_to(self.memory_l, outcome)

        self.reward_count += 1

        return {
            "step": "pcna_reward",
            "reward_index": self.reward_count,
            "winner": winner,
            "outcome": round(outcome, 4),
            "nudged_cores": ["phi", "psi", "omega", "guardian"],
            "memory_flush": flushed,
            "phi_coherence_after": round(self.phi.ring_coherence, 4),
            "psi_coherence_after": round(self.psi.ring_coherence, 4),
            "omega_coherence_after": round(self.omega.ring_coherence, 4),
            "guardian_coherence_after": round(float(self.guardian.node_coherence.mean()), 4),
            "guardian_circles_after": [int(v) for v in self.guardian.circle_count],
            "memory_l_flush_count": self.memory_l.flush_count,
            "memory_s_flush_count": self.memory_s.flush_count,
        }

    def state(self) -> dict:
        return {
            "engine": "pcna",
            "version": "2.0.0",
            "infer_count": self.infer_count,
            "reward_count": self.reward_count,
            "last_coherence": round(self.last_coherence, 4),
            "last_winner": self.last_winner,
            "rings": {
                "phi": self.phi.state(),
                "psi": self.psi.state(),
                "omega": self.omega.state(),
                "guardian": self.guardian.state(),
                "memory_l": self.memory_l.state(),
                "memory_s": self.memory_s.state(),
            },
            "ring_weights": RING_WEIGHTS,
            "uptime_s": round(time.time() - self.created_at, 1),
        }
