"""
Memory rings.
  Memory-L (long-term):  N=19 prime nodes, persistent across sessions.
  Memory-S (short-term): N=17 prime nodes, flushed to Memory-L on positive reward.
Each node: [DIMS=4, PHASES=8, HEPT=7]
"""

import time
import numpy as np

NL = 19
NS = 17
DIMS = 4
PHASES = 8
HEPT_SITES = 7

FLUSH_REWARD_THRESHOLD = 0.0
FLUSH_ALPHA = 0.25


class MemoryL:
    """Long-term memory ring — N=19 prime nodes."""

    def __init__(self):
        rng = np.random.default_rng(seed=19)
        self.tensor = rng.uniform(0.2, 0.8, (NL, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.hub_avg = np.zeros(NL, dtype=np.float64)
        self._recompute_hub_avg()
        self.flush_count = 0
        self.created_at = time.time()

    def _recompute_hub_avg(self):
        for i in range(NL):
            self.hub_avg[i] = float(self.tensor[i, :, :, 6].mean())

    def absorb(self, short_tensor: np.ndarray, alpha: float = FLUSH_ALPHA):
        """Absorb a short-term tensor slice into long-term memory (weighted average)."""
        if short_tensor.shape[0] != NS:
            return
        for i in range(min(NS, NL)):
            self.tensor[i] = (1.0 - alpha) * self.tensor[i] + alpha * short_tensor[i]
            np.clip(self.tensor[i], 0.0, 1.0, out=self.tensor[i])
        self._recompute_hub_avg()
        self.flush_count += 1

    def query(self, probe: np.ndarray) -> np.ndarray:
        """Return similarity scores for each long-term node vs probe vector [DIMS]."""
        scores = np.zeros(NL)
        for i in range(NL):
            node_mean = self.tensor[i].mean(axis=(1, 2))
            scores[i] = float(1.0 - np.abs(node_mean - probe[:DIMS]).mean())
        return scores

    def state(self) -> dict:
        return {
            "ring": "memory_l",
            "n": NL,
            "tensor_mean": round(float(self.tensor.mean()), 4),
            "tensor_std": round(float(self.tensor.std()), 4),
            "hub_avg": [round(float(v), 4) for v in self.hub_avg],
            "avg_hub": round(float(self.hub_avg.mean()), 4),
            "flush_count": self.flush_count,
        }


class MemoryS:
    """Short-term memory ring — N=17 prime nodes. Flushed to Memory-L on positive reward."""

    def __init__(self):
        rng = np.random.default_rng(seed=17)
        self.tensor = rng.uniform(0.1, 0.9, (NS, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.hub_avg = np.zeros(NS, dtype=np.float64)
        self._recompute_hub_avg()
        self.write_count = 0
        self.flush_count = 0
        self.created_at = time.time()

    def _recompute_hub_avg(self):
        for i in range(NS):
            self.hub_avg[i] = float(self.tensor[i, :, :, 6].mean())

    def write(self, signal: np.ndarray, alpha: float = 0.30):
        """Write a new experience signal into short-term memory."""
        if signal.ndim == 1 and signal.shape[0] >= 1:
            val = float(np.clip(signal.mean(), 0.0, 1.0))
            node_idx = self.write_count % NS
            self.tensor[node_idx, 0, 0, :] = np.clip(
                self.tensor[node_idx, 0, 0, :] * (1 - alpha) + val * alpha, 0.0, 1.0
            )
        self._recompute_hub_avg()
        self.write_count += 1

    def flush_to(self, memory_l: MemoryL, reward: float) -> bool:
        """Flush short-term → long-term if reward exceeds threshold. Returns True if flushed."""
        if reward > FLUSH_REWARD_THRESHOLD:
            memory_l.absorb(self.tensor)
            self._reset()
            self.flush_count += 1
            return True
        return False

    def _reset(self):
        rng = np.random.default_rng(seed=int(time.time()) % 10000 + 17)
        self.tensor = rng.uniform(0.1, 0.5, (NS, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self._recompute_hub_avg()

    def state(self) -> dict:
        return {
            "ring": "memory_s",
            "n": NS,
            "tensor_mean": round(float(self.tensor.mean()), 4),
            "tensor_std": round(float(self.tensor.std()), 4),
            "hub_avg": [round(float(v), 4) for v in self.hub_avg],
            "avg_hub": round(float(self.hub_avg.mean()), 4),
            "write_count": self.write_count,
            "flush_count": self.flush_count,
        }
