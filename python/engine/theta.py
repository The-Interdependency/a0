# 255:43
"""
Θ (Theta) — N=29 prime-node microkernel ring (formerly Guardian).

Theta runs PCEA (Prime Circular Encryption Algorithm) over external payloads,
with the current tensor state itself serving as the cryptographic key.
Two parties holding the same Theta tensor state can exchange encrypted
payloads; nobody else can.

  - Tensor shape: [N=29, DIMS=4, PHASES=7, HEPT=7] float64 in [0, 1]
  - PCEA mapping: each (node, dim) pair = one PCEA seed of 7×7 ints
                  → 29 × 4 = 116 seeds per tensor snapshot
  - Quantization: floats → ints via 7-byte packing per int (signed-safe range)
  - Encrypt: caller's payload bytes → packed seeds → PCEA encrypt with
             quantized tensor as last_state → header + body bytes
  - Decrypt: reverse direction, requires receiver to hold same tensor state
  - Self-declares identity in state() as symbol="Θ", name="theta".

Architecturally unique — not parameterized like PTCACore.
"""

import hashlib
import os
import struct
import time

import numpy as np
from pcea import (
    DEFAULT_WORD_BITS,
    decrypt_state as pcea_decrypt_state,
    encrypt_state as pcea_encrypt_state,
)

N = 29
DIMS = 4
PHASES = 7
HEPT_SITES = 7
MIN_CIRCLES = 1
MAX_CIRCLES = 12
GATE_THRESHOLD = 0.45
BLUEPRINT_CHUNK_SIZE = 4

WORD_BITS = DEFAULT_WORD_BITS
SEED_COUNT = N * DIMS
INTS_PER_SEED = 49
BYTES_PER_PLAIN_INT = 8
BYTES_PER_CIPHER_INT = 9
PAYLOAD_MAX_BYTES = SEED_COUNT * INTS_PER_SEED * BYTES_PER_PLAIN_INT
CIPHERTEXT_BODY_BYTES = SEED_COUNT * INTS_PER_SEED * BYTES_PER_CIPHER_INT

PCEA_HEADER_MAGIC = b"\xCE\x98PC"


class ThetaTensor:
    """Theta microkernel ring — N=29 nodes, ragged circle counts, PCEA-backed crypto."""

    def __init__(self, instance_id: str | None = None, phases: int = 7):
        self.phases = phases
        rng = np.random.default_rng(seed=29)
        self.tensor = rng.uniform(0.2, 0.8, (N, DIMS, phases, HEPT_SITES)).astype(np.float64)
        self.velocities = np.zeros_like(self.tensor)
        self.node_coherence = np.zeros(N, dtype=np.float64)
        self.circle_count = np.array([3] * N, dtype=np.int32)
        self.gate_open = np.array([True] * N, dtype=bool)
        self.instance_id = instance_id or _gen_instance_id()
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
        """Live crypto metadata. key_fingerprint is tensor-derived and CHANGES
        whenever the tensor mutates — two parties with the same fingerprint can
        decrypt each other's payloads; a different fingerprint means different keys.
        instance_id is the stable session identifier and is NOT cryptographically
        meaningful on its own."""
        sig = hashlib.sha256(self._tensor_key_bytes()).hexdigest()
        return {
            "instance_id": self.instance_id,
            "algorithm": "PCEA",
            "library": "pcea-lib",
            "word_bits": WORD_BITS,
            "seed_count": SEED_COUNT,
            "key_source": f"tensor:{N}x{DIMS}x{PHASES}x{HEPT_SITES} quantized",
            "key_fingerprint": sig[:16],
            "key_fingerprint_full": sig,
            "key_mutates": True,
            "integrity_tag": False,
            "max_payload_bytes": PAYLOAD_MAX_BYTES,
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
            "name": "theta",
            "symbol": "Θ",
            "role": "microkernel",
            "ring": "theta",
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

    def encrypt(self, payload: bytes) -> bytes:
        """Encrypt payload bytes using current tensor state as PCEA key.

        Receiver must hold the same tensor state to decrypt. Payload size
        is capped at PAYLOAD_MAX_BYTES; raises ValueError on overflow.
        Output format: 12-byte header (magic + plaintext_len + word_bits)
        followed by encrypted body.
        """
        if not isinstance(payload, (bytes, bytearray)):
            raise TypeError(f"payload must be bytes, got {type(payload).__name__}")
        plaintext_len = len(payload)
        if plaintext_len > PAYLOAD_MAX_BYTES:
            raise ValueError(
                f"payload {plaintext_len} bytes exceeds Theta single-block max {PAYLOAD_MAX_BYTES}"
            )

        plaintext_seeds = _pack_payload_to_seeds(bytes(payload))
        key_seeds = _quantize_tensor_to_seeds(self.tensor)
        encrypted_seeds = pcea_encrypt_state(plaintext_seeds, key_seeds, WORD_BITS)

        header = (
            PCEA_HEADER_MAGIC
            + struct.pack(">I", plaintext_len)
            + bytes([WORD_BITS, 0, 0, 0])
        )
        body = _seeds_to_bytes(encrypted_seeds)
        return header + body

    def decrypt(self, ciphertext: bytes) -> bytes:
        """Decrypt ciphertext produced by encrypt() under the same tensor state.

        Raises ValueError on missing/wrong header, word_bits mismatch, or
        truncated body. Decryption with a different tensor state silently
        produces wrong bytes (PCEA has no integrity tag); callers needing
        integrity should hash + sign the plaintext themselves.
        """
        if not isinstance(ciphertext, (bytes, bytearray)):
            raise TypeError(f"ciphertext must be bytes, got {type(ciphertext).__name__}")
        if len(ciphertext) < 12:
            raise ValueError(f"ciphertext too short ({len(ciphertext)}B) for 12-byte header")
        if bytes(ciphertext[:4]) != PCEA_HEADER_MAGIC:
            raise ValueError("ciphertext missing PCEA header magic (\\xCE\\x98PC)")

        plaintext_len = struct.unpack(">I", ciphertext[4:8])[0]
        word_bits = ciphertext[8]
        if word_bits != WORD_BITS:
            raise ValueError(
                f"word_bits mismatch: ciphertext={word_bits} theta={WORD_BITS}"
            )
        if plaintext_len > PAYLOAD_MAX_BYTES:
            raise ValueError(
                f"declared plaintext_len {plaintext_len} exceeds max {PAYLOAD_MAX_BYTES}"
            )

        body = bytes(ciphertext[12:])
        expected_body_len = CIPHERTEXT_BODY_BYTES
        if len(body) != expected_body_len:
            raise ValueError(
                f"body length {len(body)} != expected {expected_body_len}"
            )

        encrypted_seeds = _bytes_to_seeds(body)
        key_seeds = _quantize_tensor_to_seeds(self.tensor)
        plaintext_seeds = pcea_decrypt_state(encrypted_seeds, key_seeds, WORD_BITS)
        try:
            return _unpack_seeds_to_payload(plaintext_seeds, plaintext_len)
        except OverflowError as exc:
            raise ValueError(
                "decryption produced out-of-range values — wrong tensor key "
                "or corrupted ciphertext (PCEA has no integrity tag, but mismatched "
                f"keys often manifest this way): {exc}"
            ) from exc

    def _tensor_key_bytes(self) -> bytes:
        seeds = _quantize_tensor_to_seeds(self.tensor)
        return _seeds_to_bytes(seeds)


def _pack_payload_to_seeds(payload: bytes) -> list[list[list[int]]]:
    """Pack arbitrary bytes into PCEA seed shape (signed int64 per slot)."""
    padded = payload + b"\x00" * (PAYLOAD_MAX_BYTES - len(payload))
    seeds: list[list[list[int]]] = []
    offset = 0
    for _s in range(SEED_COUNT):
        seed: list[list[int]] = []
        for _c in range(7):
            row: list[int] = []
            for _t in range(7):
                chunk = padded[offset:offset + BYTES_PER_PLAIN_INT]
                row.append(int.from_bytes(chunk, "big", signed=True))
                offset += BYTES_PER_PLAIN_INT
            seed.append(row)
        seeds.append(seed)
    return seeds


def _unpack_seeds_to_payload(seeds: list[list[list[int]]], plaintext_len: int) -> bytes:
    out = bytearray()
    for seed in seeds:
        for row in seed:
            for val in row:
                out.extend(int(val).to_bytes(BYTES_PER_PLAIN_INT, "big", signed=True))
    return bytes(out[:plaintext_len])


def _quantize_tensor_to_seeds(tensor: np.ndarray) -> list[list[list[int]]]:
    """Quantize float tensor [0,1] to non-negative int seeds (key material)."""
    scale = float(2 ** 56 - 1)
    quantized = np.clip(tensor, 0.0, 1.0) * scale
    quantized_int = quantized.astype(np.int64)
    seeds: list[list[list[int]]] = []
    for n in range(N):
        for d in range(DIMS):
            seed = quantized_int[n, d].tolist()
            seeds.append(seed)
    return seeds


def _seeds_to_bytes(seeds: list[list[list[int]]]) -> bytes:
    """Serialize CIPHERTEXT seeds.

    PCEA encrypted values are unsigned and can exceed 2^64-1 because each
    digit-level shift produces values in [0, p^k - 1] where p^k may be slightly
    larger than 2^word_bits. Worst case at word_bits=64 needs 71 bits, so we
    use 9 bytes per int.
    """
    out = bytearray()
    for seed in seeds:
        for row in seed:
            for val in row:
                out.extend(int(val).to_bytes(BYTES_PER_CIPHER_INT, "big", signed=False))
    return bytes(out)


def _bytes_to_seeds(buf: bytes) -> list[list[list[int]]]:
    """Deserialize CIPHERTEXT seeds back to unsigned ints for PCEA decrypt input."""
    seeds: list[list[list[int]]] = []
    offset = 0
    for _s in range(SEED_COUNT):
        seed: list[list[int]] = []
        for _c in range(7):
            row: list[int] = []
            for _t in range(7):
                chunk = buf[offset:offset + BYTES_PER_CIPHER_INT]
                row.append(int.from_bytes(chunk, "big", signed=False))
                offset += BYTES_PER_CIPHER_INT
            seed.append(row)
        seeds.append(seed)
    return seeds


def _gen_instance_id() -> str:
    return os.urandom(16).hex()


def _compute_blueprint_hash(instance_id: str) -> str:
    return hashlib.sha256(f"a0p-blueprint:{instance_id}".encode()).hexdigest()


def _shard_blueprint(bp_hash: str, n: int) -> list[str]:
    chunk = max(1, len(bp_hash) // n)
    shards: list[str] = []
    for i in range(n):
        start = (i * chunk) % len(bp_hash)
        shard = bp_hash[start:start + BLUEPRINT_CHUNK_SIZE]
        shards.append(shard.ljust(BLUEPRINT_CHUNK_SIZE, "0"))
    return shards
# 255:43
