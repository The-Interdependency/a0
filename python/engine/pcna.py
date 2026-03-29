"""
PCNA Inference Engine — six-step pipeline across all six prime rings.

Six rings:
  Φ  (phi)       N=53  — slot-A substrate
  Ψ  (psi)       N=53  — self-model (TypeScript triad, mirrored here as a lightweight proxy)
  Ω  (omega)     N=53  — autonomy tensor (same)
  Guardian       N=29  — microkernel gate
  Memory-L       N=19  — long-term
  Memory-S       N=17  — short-term

Six inference steps:
  1. Project    — encode input text → normalized signal vector
  2. Inject     — push signal into Φ ring
  3. Propagate  — run heptagram propagation on Φ, Guardian, Memory
  4. PTCA-seed  — per-prime-node audit (Φ only, full; others summarised)
  5. PCTA-circle — per-ring circle audit (Guardian)
  6. Coherence  — weighted ring coherence → winner + confidence score

Backprop:
  pcna_reward(winner, outcome) → nudge all rings via reward signal
"""

import hashlib
import time
import numpy as np

from .phi import PhiRing
from .memory import MemoryL, MemoryS
from .guardian_tensor import GuardianTensor

RING_WEIGHTS = {
    "phi": 0.35,
    "guardian": 0.25,
    "memory_l": 0.20,
    "memory_s": 0.10,
    "psi": 0.05,
    "omega": 0.05,
}

WINNER_RINGS = ["phi", "psi", "omega"]


class PCNAEngine:
    """PCNA six-ring inference engine with backpropagation."""

    def __init__(self):
        self.phi = PhiRing()
        self.memory_l = MemoryL()
        self.memory_s = MemoryS()
        self.guardian = GuardianTensor()
        self.infer_count = 0
        self.reward_count = 0
        self.last_coherence = 0.0
        self.last_winner = "phi"
        self.blueprint_hash = self.guardian.blueprint_hash
        self.created_at = time.time()

    # ── step 1: project ────────────────────────────────────────────────────────
    def _project(self, text: str) -> np.ndarray:
        """Encode text → normalized float vector of length N=53."""
        h = hashlib.sha512(text.encode("utf-8")).digest()
        arr = np.frombuffer(h, dtype=np.uint8).astype(np.float64)
        arr = arr / 255.0
        padded = np.tile(arr, 4)[:53]
        return padded

    # ── step 2: inject ─────────────────────────────────────────────────────────
    def _inject(self, signal: np.ndarray):
        self.phi.inject(signal)
        self.memory_s.write(signal)

    # ── step 3: propagate ──────────────────────────────────────────────────────
    def _propagate(self):
        self.phi.propagate(steps=10)
        self.guardian.propagate(steps=5)

    # ── step 4: PTCA seed audit ────────────────────────────────────────────────
    def _ptca_seed_audit(self) -> dict:
        phi_audit = self.phi.ptca_seed_audit()
        phi_coherence = self.phi.ring_coherence
        return {
            "phi_nodes_audited": len(phi_audit),
            "phi_coherence": round(phi_coherence, 4),
            "phi_top3": sorted(phi_audit, key=lambda x: x["coherence"], reverse=True)[:3],
            "phi_bottom3": sorted(phi_audit, key=lambda x: x["coherence"])[:3],
            "memory_s_hub_avg": self.memory_s.state()["avg_hub"],
        }

    # ── step 5: PCTA circle audit ──────────────────────────────────────────────
    def _pcta_circle_audit(self) -> dict:
        g_audit = self.guardian.pcta_circle_audit()
        open_nodes = [n for n in g_audit if n["gate"]]
        closed_nodes = [n for n in g_audit if not n["gate"]]
        return {
            "guardian_nodes": len(g_audit),
            "gates_open": len(open_nodes),
            "gates_closed": len(closed_nodes),
            "avg_circles": round(sum(n["circles"] for n in g_audit) / len(g_audit), 2),
            "guardian_coherence": round(self.guardian.node_coherence.mean(), 4),
            "memory_l_hub_avg": self.memory_l.state()["avg_hub"],
        }

    # ── step 6: coherence score ────────────────────────────────────────────────
    def _coherence_score(self, seed_audit: dict, circle_audit: dict) -> dict:
        phi_c = seed_audit["phi_coherence"]
        guard_c = circle_audit["guardian_coherence"]
        ml_c = self.memory_l.state()["avg_hub"]
        ms_c = self.memory_s.state()["avg_hub"]
        psi_c = 0.5
        omega_c = 0.5

        ring_scores = {
            "phi": phi_c,
            "guardian": guard_c,
            "memory_l": ml_c,
            "memory_s": ms_c,
            "psi": psi_c,
            "omega": omega_c,
        }

        weighted = sum(RING_WEIGHTS[r] * ring_scores[r] for r in ring_scores)
        winner = max(WINNER_RINGS, key=lambda r: ring_scores.get(r, 0.0))
        confidence = float(np.clip(weighted, 0.0, 1.0))

        return {
            "ring_scores": {k: round(v, 4) for k, v in ring_scores.items()},
            "weighted_coherence": round(weighted, 4),
            "winner": winner,
            "confidence": round(confidence, 4),
        }

    # ── full inference ─────────────────────────────────────────────────────────
    def infer(self, text: str) -> dict:
        """Run 6-step PCNA inference on input text."""
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
            "step2_inject": {"phi_n": 53, "memory_s_n": 17},
            "step3_propagate": {"phi_steps": 10, "guardian_steps": 5},
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

    # ── reward / backprop ──────────────────────────────────────────────────────
    def reward(self, winner: str, outcome: float) -> dict:
        """
        Apply reward signal across all rings (backpropagation step).
          winner:  which ring slot won ("phi"/"psi"/"omega")
          outcome: float in [-1, 1], positive = good
        """
        self.phi.nudge(outcome, lr=0.025)
        self.guardian.apply_reward(outcome)
        flushed = self.memory_s.flush_to(self.memory_l, outcome)

        self.reward_count += 1

        circles_after = [int(v) for v in self.guardian.circle_count]

        return {
            "step": "pcna_reward",
            "reward_index": self.reward_count,
            "winner": winner,
            "outcome": round(outcome, 4),
            "nudged": True,
            "memory_flush": flushed,
            "phi_coherence_after": round(self.phi.ring_coherence, 4),
            "guardian_coherence_after": round(float(self.guardian.node_coherence.mean()), 4),
            "guardian_circles_after": circles_after,
            "memory_l_flush_count": self.memory_l.flush_count,
            "memory_s_flush_count": self.memory_s.flush_count,
        }

    # ── state export ───────────────────────────────────────────────────────────
    def state(self) -> dict:
        return {
            "engine": "pcna",
            "version": "1.0.0",
            "infer_count": self.infer_count,
            "reward_count": self.reward_count,
            "last_coherence": round(self.last_coherence, 4),
            "last_winner": self.last_winner,
            "rings": {
                "phi": self.phi.state(),
                "guardian": self.guardian.state(),
                "memory_l": self.memory_l.state(),
                "memory_s": self.memory_s.state(),
            },
            "ring_weights": RING_WEIGHTS,
            "uptime_s": round(time.time() - self.created_at, 1),
        }
