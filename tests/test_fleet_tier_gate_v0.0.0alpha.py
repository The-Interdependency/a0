# === MODULE_BUILD ===
# id: test_a0_fleet_tier_gate
#   module_name: Fleet provider tier gate regression
#   module_kind: experiment
#   summary: Proves retained supporter accounts cannot invoke ws-only providers through multi-model Fleet while ws callers retain access.
#   owner: Erin Spencer
#   public_surface: none
#   internal_surface: test functions
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: self
#   rollout: CI
#   rollback: Remove this test with the Fleet provider tier gate.
# === END MODULE_BUILD ===
"""Usage: uv run pytest -q tests/test_fleet_tier_gate_v0.0.0alpha.py"""

import pytest

from python.services import public_access_policy


def _premium_council():
    return [{
        "provider_id": "openai-5.5-pro",
        "providers": ["openai-5.5-pro"],
        "orchestration_mode": "council",
    }]


def test_supporter_cannot_bypass_ws_provider_gate_through_fleet():
    with pytest.raises(public_access_policy.PublicAccessDenied, match="requires tier"):
        public_access_policy.enforce_public_fleet_policy("supporter", _premium_council())


def test_ws_retains_access_to_ws_provider_through_fleet():
    public_access_policy.enforce_public_fleet_policy("ws", _premium_council())
