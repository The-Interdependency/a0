# 24:33
"""UCNS-kit protocol interfaces. No implementations — frame-independent contracts."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_protocols
#   module_name: protocols
#   module_kind: engine
#   summary: UCNS-kit protocol interfaces — frame-independent contracts (RingState, PropagationRule, CoherenceMeasure, RewardMechanism, Serializer) with no implementations.
#   owner: Erin Spencer
#   public_surface: RingState, PropagationRule, CoherenceMeasure, RewardMechanism, Serializer
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; pure typing.Protocol contracts with no runtime behavior.
#   requires: none
#   since: 2026-06-02
#   unresolved: Frame choice (A/B/C node semantics) is upstream of these interfaces and not yet pinned.
# === END MODULE_BUILD ===

from typing import Protocol, Iterable


class RingState(Protocol):
    """A ring of N coherence-prime nodes.

    Frame-bound implementations decide what a 'node' is.
    hmmm: Frame A = UCNS cell per node; Frame B = entire ring as one
          UCNSObject; Frame C = parallel tensor + UCNS audit.
          Frame choice is upstream of this interface.
    """

    n: int

    def inject(self, signal) -> None: ...

    def nodes(self) -> Iterable: ...

    def apply_rule(self, rule: "PropagationRule") -> None: ...

    def serialize(self) -> bytes: ...

    @classmethod
    def restore(cls, data: bytes) -> "RingState": ...


class PropagationRule(Protocol):
    def apply(self, node, neighbors) -> object:
        pass


class CoherenceMeasure(Protocol):
    def measure(self, ring: RingState) -> float:
        pass


class RewardMechanism(Protocol):
    """Apply a reward signal to a ring state.

    hmmm: R1 = bandit-over-UCNS-arms; R2 = discrete anchor promotion
          (invalid with Frame C — no anchors in primary state);
          R3 = separate numerical control plane.
          Mechanism choice is upstream of this interface.
    """

    def apply_reward(self, state, outcome: float) -> None:
        pass


class Serializer(Protocol):
    def to_bytes(self, state) -> bytes:
        pass

    def from_bytes(self, data: bytes):
        pass
# 24:33
