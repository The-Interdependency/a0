"""
Φ Ring — Prime-53 substrate for Slot A inference.
Heptagram propagation: each node owns a 7-site heptagram (6 ring + 1 hub).
Adjacency distances: [1, 2, 3, 4, 5, 6, 7, 14] (mod 53).
"""

import math
import time
import numpy as np

N = 53
HEPT_SITES = 7
PHASES = 8
DIMS = 4
ADJ_DISTANCES = [1, 2, 3, 4, 5, 6, 7, 14]

DT = 0.01
ALPHA_COUPLING = 0.10
BETA_DRIFT = 0.40
GAMMA_DAMPING = 0.20
STEPS_PER_EVAL = 10


class PhiRing:
    """
    Φ Ring: 53-node prime ring with heptagram propagation.
    Tensor shape: [N=53, DIMS=4, PHASES=8, HEPT=7]
    """

    def __init__(self):
        rng = np.random.default_rng(seed=53)
        self.tensor = rng.uniform(0.1, 0.9, (N, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.velocities = np.zeros((N, DIMS, PHASES, HEPT_SITES), dtype=np.float64)
        self.node_coherence = np.zeros(N, dtype=np.float64)
        self.ring_coherence = 0.0
        self.step_count = 0
        self.last_reward = 0.0
        self.created_at = time.time()

    # ── adjacency ──────────────────────────────────────────────────────────────
    def _adjacents(self, i: int) -> list[int]:
        return [(i + d) % N for d in ADJ_DISTANCES] + [(i - d) % N for d in ADJ_DISTANCES]

    # ── heptagram propagation ──────────────────────────────────────────────────
    def _propagate_node(self, i: int):
        neighbors = self._adjacents(i)
        neighbor_avg = np.mean([self.tensor[j] for j in neighbors], axis=0)

        coupling = ALPHA_COUPLING * (neighbor_avg - self.tensor[i])
        drift = BETA_DRIFT * self.velocities[i]
        damping = -GAMMA_DAMPING * self.tensor[i]

        acc = coupling + damping
        self.velocities[i] += acc * DT
        self.tensor[i] += (self.velocities[i] + drift) * DT
        np.clip(self.tensor[i], 0.0, 1.0, out=self.tensor[i])

        hub = self.tensor[i, :, :, 6]
        ring = self.tensor[i, :, :, :6]
        hub_target = ring.mean(axis=-1)
        self.tensor[i, :, :, 6] += 0.15 * (hub_target - hub)

    def propagate(self, steps: int = STEPS_PER_EVAL):
        for _ in range(steps):
            for i in range(N):
                self._propagate_node(i)
            self.step_count += 1
        self._recompute_coherence()

    def _recompute_coherence(self):
        for i in range(N):
            hub = self.tensor[i, :, :, 6]
            ring = self.tensor[i, :, :, :6]
            diff = np.abs(ring - hub[..., np.newaxis]).mean()
            self.node_coherence[i] = float(np.clip(1.0 - diff, 0.0, 1.0))
        self.ring_coherence = float(self.node_coherence.mean())

    # ── inject input ──────────────────────────────────────────────────────────
    def inject(self, signal: np.ndarray):
        """Inject a normalized [N] or [N, DIMS] signal into the Φ tensor."""
        if signal.ndim == 1 and signal.shape[0] == N:
            for i in range(N):
                self.tensor[i, 0, 0, :] = np.clip(self.tensor[i, 0, 0, :] * 0.85 + signal[i] * 0.15, 0.0, 1.0)
        elif signal.ndim == 2 and signal.shape == (N, DIMS):
            for i in range(N):
                self.tensor[i, :, 0, :] = np.clip(self.tensor[i, :, 0, :] * 0.85 + signal[i, :, np.newaxis] * 0.15, 0.0, 1.0)

    # ── reward / backprop ─────────────────────────────────────────────────────
    def nudge(self, reward: float, lr: float = 0.02):
        """Apply reward signal — positive reward reinforces current state, negative dampens."""
        self.last_reward = reward
        gradient = reward * (self.tensor - 0.5)
        self.tensor = np.clip(self.tensor + lr * gradient, 0.0, 1.0)
        self._recompute_coherence()

    # ── PTCA seed audit ───────────────────────────────────────────────────────
    def ptca_seed_audit(self) -> list[dict]:
        results = []
        for i in range(N):
            hub_val = float(self.tensor[i, :, :, 6].mean())
            ring_mean = float(self.tensor[i, :, :, :6].mean())
            phase_var = float(self.tensor[i, 0, :, :].var())
            coherence = self.node_coherence[i]
            results.append({
                "node": i,
                "hub": round(hub_val, 4),
                "ring_mean": round(ring_mean, 4),
                "phase_var": round(phase_var, 4),
                "coherence": round(coherence, 4),
            })
        return results

    # ── state export ──────────────────────────────────────────────────────────
    def state(self) -> dict:
        return {
            "ring": "phi",
            "n": N,
            "dims": DIMS,
            "phases": PHASES,
            "hept_sites": HEPT_SITES,
            "ring_coherence": round(self.ring_coherence, 4),
            "node_coherence_mean": round(float(self.node_coherence.mean()), 4),
            "node_coherence_min": round(float(self.node_coherence.min()), 4),
            "node_coherence_max": round(float(self.node_coherence.max()), 4),
            "tensor_mean": round(float(self.tensor.mean()), 4),
            "tensor_std": round(float(self.tensor.std()), 4),
            "step_count": self.step_count,
            "last_reward": round(self.last_reward, 4),
            "node_coherence": [round(float(v), 4) for v in self.node_coherence],
        }
