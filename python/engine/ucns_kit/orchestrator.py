# 37:39 0:0 1:1
"""
Orchestrator — six-step UCNS-kit pipeline.

Steps: encode → pool/intern → inject → propagate → measure → reward.
Operates entirely on Category 2 protocol interfaces; no frame-specific code.

Frame × Reward compatibility:
  Frame A (tensor of UCNS objects)       × R1, R2, R3: valid
  Frame B (ring as one UCNS object)      × R1, R2, R3: valid
  Frame C (parallel tensor + UCNS audit) × R1, R3: valid
  Frame C × R2: INVALID — no anchors to promote in primary state

hmmm: frame/reward type detection not yet implemented.
      _check_compatibility is nominal until Frame and Reward implementations
      land and can be introspected by type.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_engine_ucns_kit_orchestrator
#   module_name: orchestrator
#   module_kind: engine
#   summary: Orchestrator — six-step UCNS-kit pipeline (encode → pool/intern → inject → propagate → measure → reward) operating over frame-independent Category 2 protocol interfaces.
#   owner: Erin Spencer
#   public_surface: Orchestrator
#   internal_surface: _check_compatibility
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; pipeline operates on protocol interfaces with no persistent state.
#   requires: a0_engine_ucns_kit_pool
#   since: 2026-06-02
#   unresolved: frame/reward type detection not implemented; _check_compatibility is nominal until Frame and Reward implementations land.
# === END MODULE_BUILD ===

from .pool import UCNSPool


class Orchestrator:
    """Six-step UCNS pipeline orchestrator."""

    def __init__(
        self,
        ring_state,
        propagation_rule,
        coherence_measure,
        reward_mechanism,
        serializer,
        pool: UCNSPool | None = None,
    ) -> None:
        self._check_compatibility(ring_state, reward_mechanism)
        self.ring = ring_state
        self.rule = propagation_rule
        self.measure = coherence_measure
        self.reward = reward_mechanism
        self.serial = serializer
        self.pool = pool or UCNSPool()

    def run(self, text: str) -> dict:
        """Run the six-step pipeline on text; return metrics dict."""
        tokens = self.pool.encode_text(text)            # steps 1 + 2
        self.ring.inject(tokens)                         # step 3
        self.ring.apply_rule(self.rule)                  # step 4
        score = self.measure.measure(self.ring)          # step 5
        self.reward.apply_reward(self.ring, score)       # step 6
        return {
            "coherence": score,
            "token_count": len(tokens),
            "bone_count": sum(1 for t in tokens if t is not None),
        }

    def checkpoint(self) -> bytes:
        """Serialize ring state via the injected Serializer."""
        return self.serial.to_bytes(self.ring)

    def restore(self, data: bytes) -> None:
        """Restore ring state from bytes."""
        self.ring = self.serial.from_bytes(data)

    @staticmethod
    def _check_compatibility(ring_state, reward_mechanism) -> None:
        # hmmm: Frame C × R2 invalid (no anchors to promote in primary state).
        # Nominal until Frame/Reward implementations are identifiable by type.
        pass
# 37:39 0:0 1:1
