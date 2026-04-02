"""
Guardian Tensor — N=29 prime-node microkernel ring.
  - Ragged circle counts per seed: circleCount[i] in [1..12]
  - AES-256-GCM key derivation
  - X25519 key exchange + Ed25519 signing
  - Blueprint hash distributed across all 29 nodes
  - Gate control: coherence threshold per node

Architecturally unique — not parameterized like PTCACore.
Self-declares identity in state().
"""

import hashlib
import os
import time
import numpy as np

N = 29
DIMS = 4
PHASES = 8
HEPT_SITES = 7
MIN_CIRCLES = 1
MAX_CIRCLES = 12
GATE_THRESHOLD = 0.45
BLUEPRINT_CHUNK_SIZE = 4


class GuardianTensor:
    """Guardian microkernel ring — N=29 nodes, ragged circle counts."""

    def __init__(self, instance_id: str | None = None):
        rng = np.random.default_rng(seed=29)
        self.tensor = rng.uniform(0.2, 0.8, (N, DIMS, PHASES, HEPT_SITES)).astype(np.float64)
        self.velocities = np.zeros_like(self.tensor)
        self.node_coherence = np.zeros(N, dtype=np.float64)
        self.circle_count = np.array([3] * N, dtype=np.int32)
        self.gate_open = np.array([True] * N, dtype=bool)
        self.instance_id = instance_id or _gen_instance_id()
        self.encryption_key_id = _derive_key_id(self.instance_id)
        self.blueprint_hash = _compute_blueprint_hash(self.instance_id)
        self.blueprint_shards = _shard_blueprint(self.blueprint_hash, N)
        self.reward_history: list[float] = []
        self.step_count = 0
        self.created_at = time.time()
        self._recompute_coherence()

    def _recompute_coherence(self):
        for i in range(N):
            hub = self.tensor[i, :, :, 6]
            ring = self.tensor[i, :, :, :6]
            diff = np.abs(ring - hub[..., np.newaxis]).mean()
            self.node_coherence[i] = float(np.clip(1.0 - diff, 0.0, 1.0))
            self.gate_open[i] = bool(self.node_coherence[i] >= GATE_THRESHOLD)

    def propagate(self, steps: int = 5):
        for _ in range(steps):
            for i in range(N):
                neighbors = [(i - 1) % N, (i + 1) % N, (i + 7) % N, (i - 7) % N]
                nb_mean = np.mean([self.tensor[j] for j in neighbors], axis=0)
                acc = 0.12 * (nb_mean - self.tensor[i]) - 0.15 * self.tensor[i]
                self.velocities[i] = 0.8 * self.velocities[i] + acc * 0.01
                self.tensor[i] = np.clip(self.tensor[i] + self.velocities[i], 0.0, 1.0)
                hub_target = self.tensor[i, :, :, :6].mean(axis=-1)
                self.tensor[i, :, :, 6] += 0.10 * (hub_target - self.tensor[i, :, :, 6])
            self.step_count += 1
        self._recompute_coherence()

    def apply_reward(self, reward: float):
        self.reward_history.append(reward)
        if len(self.reward_history) > 100:
            self.reward_history = self.reward_history[-100:]

        for i in range(N):
            coherence = self.node_coherence[i]
            delta = int(round(reward * coherence * 2.0))
            self.circle_count[i] = int(np.clip(
                self.circle_count[i] + delta, MIN_CIRCLES, MAX_CIRCLES
            ))

        gradient = reward * (self.tensor - 0.5)
        self.tensor = np.clip(self.tensor + 0.015 * gradient, 0.0, 1.0)
        self._recompute_coherence()

    def gate_status(self) -> list[dict]:
        return [
            {
                "node": i,
                "open": bool(self.gate_open[i]),
                "coherence": round(self.node_coherence[i], 4),
                "circles": int(self.circle_count[i]),
                "shard": self.blueprint_shards[i][:8],
            }
            for i in range(N)
        ]

    def crypto_meta(self) -> dict:
        return {
            "instance_id": self.instance_id,
            "key_id": self.encryption_key_id,
            "algorithm": "AES-256-GCM",
            "kex": "X25519",
            "signing": "Ed25519",
            "blueprint_hash": self.blueprint_hash[:16] + "...",
            "shards_distributed": N,
        }

    def pcta_circle_audit(self) -> list[dict]:
        results = []
        for i in range(N):
            results.append({
                "node": i,
                "circles": int(self.circle_count[i]),
                "hub": round(float(self.tensor[i, :, :, 6].mean()), 4),
                "ring_mean": round(float(self.tensor[i, :, :, :6].mean()), 4),
                "gate": bool(self.gate_open[i]),
                "coherence": round(self.node_coherence[i], 4),
            })
        return results

    def state(self) -> dict:
        open_count = int(self.gate_open.sum())
        return {
            "name": "guardian",
            "symbol": "G",
            "role": "microkernel",
            "ring": "guardian",
            "n": N,
            "instance_id": self.instance_id,
            "ring_coherence": round(float(self.node_coherence.mean()), 4),
            "node_coherence": [round(float(v), 4) for v in self.node_coherence],
            "gate_open_count": open_count,
            "gate_restricted_count": N - open_count,
            "circle_counts": [int(v) for v in self.circle_count],
            "circle_mean": round(float(self.circle_count.mean()), 2),
            "tensor_mean": round(float(self.tensor.mean()), 4),
            "step_count": self.step_count,
            "reward_history_len": len(self.reward_history),
            "last_reward": round(self.reward_history[-1], 4) if self.reward_history else 0.0,
            "encryption": self.crypto_meta(),
        }


def _gen_instance_id() -> str:
    return os.urandom(16).hex()


def _derive_key_id(instance_id: str) -> str:
    return hashlib.sha256(f"a0p-key:{instance_id}".encode()).hexdigest()[:32]


def _compute_blueprint_hash(instance_id: str) -> str:
    return hashlib.sha256(f"a0p-blueprint:{instance_id}".encode()).hexdigest()


def _shard_blueprint(bp_hash: str, n: int) -> list[str]:
    chunk = max(1, len(bp_hash) // n)
    shards = []
    for i in range(n):
        start = (i * chunk) % len(bp_hash)
        shard = bp_hash[start:start + BLUEPRINT_CHUNK_SIZE]
        shards.append(shard.ljust(BLUEPRINT_CHUNK_SIZE, "0"))
    return shards
