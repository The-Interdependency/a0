"""a0-owned durable adapter over the exact producer-owned PTCNA runtime.

Usage::

    state = PTCNAState(state_path="/var/lib/a0/platonic-ptcna.json")
    await state.load_checkpoint()
    receipt = state.infer("bounded input")
    await state.save_checkpoint()

The target backend is always the default. Fallback requires ``backend="fallback"``
or ``fallback_on_error=True`` and remains separately attributed by PTCNA. a0
owns persistence and Platonic-Agent binding; it does not reimplement PTCNA
algebra or UCNS receipt validation.
"""
from __future__ import annotations

from hashlib import sha256
import json
import os
from pathlib import Path
import time
from typing import Any, Mapping

import numpy as np
from interdependent_lib import build_pair_receipt, validate_installed_pair
from ptcna import PTCNARuntime
from ptcna.neural import PCNAEngine as ProducerNeuralEngine
from ptcna.neural.merge import InstanceMerge as ProducerInstanceMerge

# === MODULE_BUILD ===
# id: a0_platonic_ptcna_state
#   module_name: ptcna_state
#   module_kind: adapter
#   summary: binds the exact UCNS/PTCNA pair into the Platonic Agent and durably persists producer state, receipts, and explicit routing history
#   owner: Erin Spencer
#   public_surface: PTCNAState, PTCNAStateTamperError, PTCNAStateMerge
#   internal_surface: _canonical_bytes, _state_arrays, _restore_arrays
#   auth_boundary: none
#   storage_boundary: read, write
#   network_boundary: none
#   user_data_boundary: write
#   admin_only: false
#   tests: python/tests/test_ptcna_state.py
#   rollout: replaces local PCNA/PTCA algebra after exact producer-pair validation
#   rollback: reinstall the prior a0 release; producer checkpoint files remain isolated by schema
#   requires: interdependent_lib_ptcna_pair, ptcna_runtime_boundary, platonic_agent_object
#   since: 2026-08-17
#   unresolved: continuous seven-fold geometry, representative efficacy, production privacy
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: a0_ptcna_uses_exact_pair
#   given: PTCNAState is constructed
#   then: the installed interdependent-lib pair validates before producer runtime construction
#   class: evidence
#
# id: a0_ptcna_routing_is_explicit
#   given: target, requested fallback, or explicitly enabled failover inference
#   then: the producer receipt and durable routing state identify the requested and actual backend
#   class: safety
#
# id: a0_ptcna_restart_round_trip
#   given: producer tensors, counters, receipts, and routing state are saved then loaded into a fresh adapter
#   then: the fresh adapter recovers the exact persisted identities and numerical state
#   class: correctness
#
# id: a0_ptcna_binds_platonic_region
#   given: the active PTCNA state is projected into the Platonic Agent
#   then: all declared ptcna_runtime_state dimensions are explicitly bound without collapsing memory or inference regions
#   class: correctness
#
# id: a0_ptcna_tamper_fails_closed
#   given: either state blob or authority-bearing receipt is modified
#   then: reload raises PTCNAStateTamperError before applying any persisted state
#   class: safety
# === END CONTRACTS ===

# === BOUNDARIES ===
# id: a0_ptcna_persistence_boundary
#   summary: atomically writes and reads local PTCNA numerical state plus non-secret routing and producer receipts
#   auth_boundary: none
#   storage_boundary: read, write
#   network_boundary: none
#   user_data_boundary: write
#   admin_only: false
#   pii: caller inputs are not persisted; only numerical state, counters, routing identities, and digests are stored
#   secrets: none
#   owner: Erin Spencer
#   since: 2026-08-17
# === END BOUNDARIES ===

STATE_SCHEMA = "a0.platonic-ptcna-state"
STATE_VERSION = "1.0.0"
_RING_NAMES = ("phi", "psi", "omega", "theta", "memory_l", "memory_s")


class PTCNAStateTamperError(RuntimeError):
    """Raised when a persisted receipt or state blob fails identity checks."""


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


class PTCNAState:
    """Platonic-Agent runtime-state binding around canonical PTCNA."""

    def __init__(self, phases: int = 7, state_path: str | Path | None = None) -> None:
        self.pair_receipt = validate_installed_pair()
        self.runtime = PTCNARuntime()
        if phases != 7:
            self.runtime.target = type(self.runtime.target)(phases=phases)
        self.phases = phases
        configured = state_path or os.getenv("A0_PTCNA_STATE_PATH")
        self.state_path = Path(configured) if configured else Path(".state/platonic-ptcna.json")
        self.blob_path = self.state_path.with_suffix(".npz")
        self.routing_state: dict[str, Any] = {
            "inference_count": 0,
            "fallback_count": 0,
            "last_requested_backend": None,
            "last_backend_used": None,
            "last_routing_reason": None,
            "last_receipt_sha256": None,
        }
        self._last_inference: dict[str, Any] | None = None

    @property
    def neural(self) -> ProducerNeuralEngine:
        return self.runtime.target.neural

    def __getattr__(self, name: str) -> Any:
        if name in {"phi", "psi", "omega", "theta", "memory_l", "memory_s"}:
            return getattr(self.neural, name)
        if name in {
            "infer_count", "reward_count", "last_coherence", "last_winner",
            "blueprint_hash", "created_at", "checkpoint_at", "checkpoint_ring_means",
        }:
            return getattr(self.neural, name)
        raise AttributeError(name)

    def infer(
        self,
        text: str,
        *,
        backend: str = "ptcna",
        fallback_on_error: bool = False,
    ) -> dict[str, Any]:
        receipt = self.runtime.infer(
            text, backend=backend, fallback_on_error=fallback_on_error
        )
        identity = sha256(_canonical_bytes(receipt)).hexdigest()
        self.routing_state.update(
            {
                "inference_count": self.routing_state["inference_count"] + 1,
                "fallback_count": self.routing_state["fallback_count"]
                + int(receipt["fallback_used"]),
                "last_requested_backend": receipt["requested_backend"],
                "last_backend_used": receipt["backend_used"],
                "last_routing_reason": receipt["routing_reason"],
                "last_receipt_sha256": identity,
            }
        )
        receipt["a0_receipt_sha256"] = identity
        self._last_inference = receipt
        return receipt

    def reward(self, winner: str, outcome: float) -> dict[str, Any]:
        if self._last_inference is None:
            raise RuntimeError("reward requires a prior attributed inference receipt")
        if self._last_inference.get("winner") != winner:
            raise ValueError("winner differs from the prior inference receipt")
        return self.runtime.reward(self._last_inference, outcome)

    def _state_arrays(self) -> dict[str, np.ndarray]:
        arrays: dict[str, np.ndarray] = {}
        for name in _RING_NAMES:
            ring = getattr(self.neural, name)
            arrays[f"{name}_tensor"] = np.asarray(ring.tensor)
            if hasattr(ring, "velocities"):
                arrays[f"{name}_velocities"] = np.asarray(ring.velocities)
        arrays["theta_circle_count"] = np.asarray(self.neural.theta.circle_count)
        return arrays

    def _payload(self, blob_sha256: str) -> dict[str, Any]:
        return {
            "schema": STATE_SCHEMA,
            "version": STATE_VERSION,
            "saved_at": time.time(),
            "phases": self.phases,
            "state_blob_sha256": blob_sha256,
            "pair_receipt": self.pair_receipt,
            "ucns_profile": self.runtime.target.core.ucns_status.producer_profile,
            "routing_state": dict(self.routing_state),
            "engine": {
                "instance_id": self.neural.theta.instance_id,
                "blueprint_hash": self.neural.theta.blueprint_hash,
                "blueprint_shards": list(self.neural.theta.blueprint_shards),
                "infer_count": self.neural.infer_count,
                "reward_count": self.neural.reward_count,
                "last_coherence": self.neural.last_coherence,
                "last_winner": self.neural.last_winner,
            },
        }

    async def save_checkpoint(self) -> dict[str, Any]:
        """Atomically persist producer tensors and the bound routing receipt."""

        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        blob_tmp = self.blob_path.with_suffix(".npz.tmp")
        with blob_tmp.open("wb") as stream:
            np.savez(stream, **self._state_arrays())
        blob_sha = sha256(blob_tmp.read_bytes()).hexdigest()
        payload = self._payload(blob_sha)
        receipt = {**payload, "receipt_sha256": sha256(_canonical_bytes(payload)).hexdigest()}
        receipt_tmp = self.state_path.with_suffix(".json.tmp")
        receipt_tmp.write_bytes(_canonical_bytes(receipt))
        blob_tmp.replace(self.blob_path)
        receipt_tmp.replace(self.state_path)
        self.neural.checkpoint_at = receipt["saved_at"]
        return receipt

    async def load_checkpoint(self) -> bool:
        """Fail closed on tamper; otherwise restore state before serving traffic."""

        if not self.state_path.exists() and not self.blob_path.exists():
            return False
        if not self.state_path.is_file() or not self.blob_path.is_file():
            raise PTCNAStateTamperError("checkpoint receipt/blob pair is incomplete")
        try:
            receipt = json.loads(self.state_path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise PTCNAStateTamperError("checkpoint receipt is unreadable") from exc
        claimed = receipt.pop("receipt_sha256", None)
        if claimed != sha256(_canonical_bytes(receipt)).hexdigest():
            raise PTCNAStateTamperError("checkpoint receipt digest mismatch")
        if receipt.get("schema") != STATE_SCHEMA or receipt.get("version") != STATE_VERSION:
            raise PTCNAStateTamperError("checkpoint schema/version mismatch")
        if receipt.get("pair_receipt") != build_pair_receipt():
            raise PTCNAStateTamperError("checkpoint producer pair mismatch")
        blob = self.blob_path.read_bytes()
        if receipt.get("state_blob_sha256") != sha256(blob).hexdigest():
            raise PTCNAStateTamperError("checkpoint state blob digest mismatch")
        if receipt.get("phases") != self.phases:
            raise PTCNAStateTamperError("checkpoint phase count mismatch")
        with np.load(self.blob_path, allow_pickle=False) as arrays:
            expected = self._state_arrays()
            if set(arrays.files) != set(expected):
                raise PTCNAStateTamperError("checkpoint tensor key mismatch")
            for key, target in expected.items():
                value = arrays[key]
                if value.shape != target.shape or value.dtype != target.dtype:
                    raise PTCNAStateTamperError(f"checkpoint tensor contract mismatch: {key}")
            for name in _RING_NAMES:
                ring = getattr(self.neural, name)
                ring.tensor = arrays[f"{name}_tensor"].copy()
                velocity_key = f"{name}_velocities"
                if velocity_key in arrays.files:
                    ring.velocities = arrays[velocity_key].copy()
                if hasattr(ring, "_recompute_coherence"):
                    ring._recompute_coherence()
                elif hasattr(ring, "_recompute_hub_avg"):
                    ring._recompute_hub_avg()
            self.neural.theta.circle_count = arrays["theta_circle_count"].copy()
        engine = receipt["engine"]
        self.neural.theta.instance_id = engine["instance_id"]
        self.neural.theta.blueprint_hash = engine["blueprint_hash"]
        self.neural.theta.blueprint_shards = list(engine["blueprint_shards"])
        self.neural.blueprint_hash = engine["blueprint_hash"]
        self.neural.infer_count = engine["infer_count"]
        self.neural.reward_count = engine["reward_count"]
        self.neural.last_coherence = engine["last_coherence"]
        self.neural.last_winner = engine["last_winner"]
        self.neural.checkpoint_at = receipt["saved_at"]
        self.routing_state = dict(receipt["routing_state"])
        return True

    def platonic_projection(self):
        """Bind this runtime to the declared Platonic-Agent PTCNA region."""

        from ..agents import candidate_platonic_agent

        return candidate_platonic_agent().project_region(
            "ptcna_runtime_state",
            {
                "state_transition": dict(self.routing_state),
                "embodiment": "ptcna.experimental.v1",
                "provenance": self.pair_receipt,
                "relations": {
                    "ucns_candidate": self.runtime.target.core.ucns_status.producer_profile,
                    "semantic_memory_merge_authorized": False,
                },
                "boundaries": {
                    "fallback_requires_explicit_route": True,
                    "usefulness_established": False,
                },
            },
        )

    def state(self) -> dict[str, Any]:
        state = dict(self.neural.state())
        state.update(
            {
                "engine": "ptcna",
                "ptcna": self.runtime.target.state(),
                "pair_receipt": self.pair_receipt,
                "routing_state": dict(self.routing_state),
                "platonic_agent": self.platonic_projection().as_dict(),
            }
        )
        return state


class PTCNAStateMerge:
    """a0 lifecycle wrapper around producer-owned merge algebra."""

    @staticmethod
    def fork(parent: PTCNAState) -> tuple[PTCNAState, dict[str, Any]]:
        neural, receipt = ProducerInstanceMerge.fork(parent.neural)
        child = PTCNAState(phases=parent.phases)
        child.runtime.target.neural = neural
        return child, receipt

    @staticmethod
    def absorb(dominant: PTCNAState, donor: PTCNAState) -> dict[str, Any]:
        return ProducerInstanceMerge.absorb(dominant.neural, donor.neural)

    @staticmethod
    def converge(
        left: PTCNAState, right: PTCNAState, alpha: float = 0.5
    ) -> dict[str, Any]:
        return ProducerInstanceMerge.converge(left.neural, right.neural, alpha)


__all__ = ["PTCNAState", "PTCNAStateMerge", "PTCNAStateTamperError"]
