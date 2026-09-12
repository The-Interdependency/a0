# 35:17 0:0 0:1
# === MODULE_BUILD ===
# id: test_a0_public_provider_policy
#   module_name: public provider policy tests
#   module_kind: experiment
#   summary: Proves the free-tier provider allowlist and multi-provider lane cap without touching network or storage.
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
#   rollback: Remove this test with the public provider policy.
# === END MODULE_BUILD ===
import pytest

from python.services import public_access_policy


def test_public_allows_economical_single_provider(monkeypatch):
    monkeypatch.delenv("PUBLIC_PROVIDER_ALLOWLIST", raising=False)
    public_access_policy.enforce_public_provider_policy("free", "single", ["deepseek"])


def test_public_allows_two_economical_lanes(monkeypatch):
    monkeypatch.delenv("PUBLIC_MAX_PROVIDER_LANES", raising=False)
    public_access_policy.enforce_public_provider_policy(
        "free", "fan_out", ["deepseek", "gemini-lite"]
    )


def test_public_denies_premium_provider(monkeypatch):
    monkeypatch.delenv("PUBLIC_PROVIDER_ALLOWLIST", raising=False)
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_provider_policy(
            "free", "single", ["openai-5.5-pro"]
        )


def test_public_denies_excess_lanes(monkeypatch):
    monkeypatch.setenv("PUBLIC_MAX_PROVIDER_LANES", "2")
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_provider_policy(
            "free", "council", ["deepseek", "gemini-lite", "openai-nano"]
        )


def test_public_fleet_counts_calls_across_contestants(monkeypatch):
    monkeypatch.setenv("PUBLIC_MAX_PROVIDER_LANES", "2")
    contestants = [
        {"provider_id": "deepseek", "orchestration_mode": "single"},
        {"provider_id": "deepseek", "orchestration_mode": "single"},
        {"provider_id": "deepseek", "orchestration_mode": "single"},
    ]
    with pytest.raises(public_access_policy.PublicAccessDenied):
        public_access_policy.enforce_public_fleet_policy("free", contestants)


def test_ws_tier_is_not_subject_to_public_boundary():
    public_access_policy.enforce_public_provider_policy(
        "ws", "council", ["openai-5.5-pro"] * 6
    )
# 35:17 0:0 0:1
