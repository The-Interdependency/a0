"""
PTCACore — parameterized prime-ring tensor with heptagram propagation.
Each instance self-declares: name, symbol, role, n, seed.
Tensor shape: [N, DIMS=4, PHASES=8, HEPT=7]
"""

import math
import time
import numpy as np

DIMS = 4
PHASES = 7
HEPT_SITES = 7

DT = 0.01
ALPHA_COUPLING = 0.10
BETA_DRIFT = 0.40
GAMMA_DAMPING = 0.20
STEPS_PER_EVAL = 10


def _adj_distances(n: int) -> list[int]:
    base = [1, 2, 3, 4, 5, 6, 7]
    scaled = [d for d in base if d < n]
    gap = max(1, n // 4)
    if gap not in scaled and gap < n:
        scaled.append(gap)
    return scaled


class PTCACore:
    """
    Prime-ring PTCA core. Parameterized by (name, symbol, role, n, seed).
    Every instance self-declares its identity in state().
    """

    def __init__(self, name: str, symbol: str, role: str, n: int, seed: int):
        self.name = name
        self.symbol = symbol
        self.role = role
        self.n = n
        self.seed = seed
        self._adj_dists = _adj_distances(n)

        rng = np.random.default_rng(seed=seed)
        self.tensor = rng.uniform(0.1, 0.9, (n, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.velocities = np.zeros((n, DIMS, PHASES, HEPT_SITES), dtype=np.float64)
        self.node_coherence = np.zeros(n, dtype=np.float64)
        self.ring_coherence = 0.0
        self.step_count = 0
        self.last_reward = 0.0
        self.created_at = time.time()
        self._recompute_coherence()

    def _adjacents(self, i: int) -> list[int]:
        fwd = [(i + d) % self.n for d in self._adj_dists]
        bwd = [(i - d) % self.n for d in self._adj_dists]
        return fwd + bwd

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
            for i in range(self.n):
                self._propagate_node(i)
            self.step_count += 1
        self._recompute_coherence()

    def _recompute_coherence(self):
        for i in range(self.n):
            hub = self.tensor[i, :, :, 6]
            ring = self.tensor[i, :, :, :6]
            diff = np.abs(ring - hub[..., np.newaxis]).mean()
            self.node_coherence[i] = float(np.clip(1.0 - diff, 0.0, 1.0))
        self.ring_coherence = float(self.node_coherence.mean())

    def inject(self, signal: np.ndarray):
        if signal.ndim == 1 and signal.shape[0] == self.n:
            for i in range(self.n):
                self.tensor[i, 0, 0, :] = np.clip(
                    self.tensor[i, 0, 0, :] * 0.85 + signal[i] * 0.15, 0.0, 1.0
                )
        elif signal.ndim == 2 and signal.shape == (self.n, DIMS):
            for i in range(self.n):
                self.tensor[i, :, 0, :] = np.clip(
                    self.tensor[i, :, 0, :] * 0.85 + signal[i, :, np.newaxis] * 0.15, 0.0, 1.0
                )

    def nudge(self, reward: float, lr: float = 0.02):
        self.last_reward = reward
        gradient = reward * (self.tensor - 0.5)
        self.tensor = np.clip(self.tensor + lr * gradient, 0.0, 1.0)
        self._recompute_coherence()

    def ptca_seed_audit(self) -> list[dict]:
        results = []
        for i in range(self.n):
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

    def state(self) -> dict:
        return {
            "name": self.name,
            "symbol": self.symbol,
            "role": self.role,
            "ring": self.name,
            "n": self.n,
            "seed": self.seed,
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
