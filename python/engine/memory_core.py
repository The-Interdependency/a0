"""
MemoryCore — parameterized memory ring.
Each instance self-declares: n, seed, role.
Tensor shape: [N, DIMS=4, PHASES=8, HEPT=7]

Instantiate as:
  MemoryCore(n=19, seed=19, role="long_term")
  MemoryCore(n=17, seed=17, role="short_term")
"""

import time
import numpy as np

DIMS = 4
PHASES = 7
HEPT_SITES = 7

FLUSH_REWARD_THRESHOLD = 0.0
FLUSH_ALPHA = 0.25


class MemoryCore:
    """Parameterized memory ring — self-declares role in state()."""

    def __init__(self, n: int, seed: int, role: str):
        self.n = n
        self.seed = seed
        self.role = role

        rng = np.random.default_rng(seed=seed)
        low = 0.2 if role == "long_term" else 0.1
        high = 0.8 if role == "long_term" else 0.9
        self.tensor = rng.uniform(low, high, (n, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.hub_avg = np.zeros(n, dtype=np.float64)
        self._recompute_hub_avg()
        self.write_count = 0
        self.flush_count = 0
        self.created_at = time.time()

    def _recompute_hub_avg(self):
        for i in range(self.n):
            self.hub_avg[i] = float(self.tensor[i, :, :, 6].mean())

    def write(self, signal: np.ndarray, alpha: float = 0.30):
        if signal.ndim == 1 and signal.shape[0] >= 1:
            val = float(np.clip(signal.mean(), 0.0, 1.0))
            node_idx = self.write_count % self.n
            self.tensor[node_idx, 0, 0, :] = np.clip(
                self.tensor[node_idx, 0, 0, :] * (1 - alpha) + val * alpha, 0.0, 1.0
            )
        self._recompute_hub_avg()
        self.write_count += 1

    def absorb(self, other_tensor: np.ndarray, alpha: float = FLUSH_ALPHA):
        src_n = other_tensor.shape[0]
        for i in range(min(src_n, self.n)):
            self.tensor[i] = (1.0 - alpha) * self.tensor[i] + alpha * other_tensor[i]
            np.clip(self.tensor[i], 0.0, 1.0, out=self.tensor[i])
        self._recompute_hub_avg()
        self.flush_count += 1

    def query(self, probe: np.ndarray) -> np.ndarray:
        scores = np.zeros(self.n)
        for i in range(self.n):
            node_mean = self.tensor[i].mean(axis=(1, 2))
            scores[i] = float(1.0 - np.abs(node_mean - probe[:DIMS]).mean())
        return scores

    def flush_to(self, target: "MemoryCore", reward: float) -> bool:
        if reward > FLUSH_REWARD_THRESHOLD:
            target.absorb(self.tensor)
            self._reset()
            self.flush_count += 1
            return True
        return False

    def _reset(self):
        rng = np.random.default_rng(seed=int(time.time()) % 10000 + self.seed)
        self.tensor = rng.uniform(0.1, 0.5, (self.n, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self._recompute_hub_avg()

    def state(self) -> dict:
        return {
            "ring": f"memory_{self.role[0]}",
            "role": self.role,
            "n": self.n,
            "seed": self.seed,
            "tensor_mean": round(float(self.tensor.mean()), 4),
            "tensor_std": round(float(self.tensor.std()), 4),
            "hub_avg": [round(float(v), 4) for v in self.hub_avg],
            "avg_hub": round(float(self.hub_avg.mean()), 4),
            "write_count": self.write_count,
            "flush_count": self.flush_count,
        }
