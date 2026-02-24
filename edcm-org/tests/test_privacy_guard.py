"""
Privacy guard tests — enforce spec v0.1 governance rules.
"""

import pytest
from edcm_org.governance.privacy import EDCMPrivacyGuard, PrivacyConfig, ConsentError


@pytest.fixture
def guard():
    return EDCMPrivacyGuard(PrivacyConfig(aggregation="department"))


class TestPrivacyGuard:

    def test_department_aggregation_passes(self, guard):
        payload = {"aggregation": "department", "org": "ACME", "metrics": {}}
        result = guard.enforce(payload)
        assert result["aggregation"] == "department"

    def test_team_aggregation_passes(self, guard):
        payload = {"aggregation": "team", "org": "ACME"}
        result = guard.enforce(payload)
        assert result["aggregation"] == "team"

    def test_organization_aggregation_passes(self, guard):
        payload = {"aggregation": "organization", "org": "ACME"}
        result = guard.enforce(payload)
        assert result["aggregation"] == "organization"

    def test_individual_aggregation_raises(self, guard):
        payload = {"aggregation": "individual", "org": "ACME"}
        with pytest.raises(ConsentError):
            guard.enforce(payload)

    def test_pii_email_stripped(self, guard):
        payload = {
            "aggregation": "department",
            "email": "user@example.com",
            "org": "ACME",
        }
        result = guard.enforce(payload)
        assert "email" not in result

    def test_pii_name_stripped(self, guard):
        payload = {"aggregation": "department", "name": "John Doe", "data": "ok"}
        result = guard.enforce(payload)
        assert "name" not in result
        assert result["data"] == "ok"

    def test_pii_nested_stripped(self, guard):
        payload = {
            "aggregation": "department",
            "nested": {"email": "x@y.com", "value": 42},
        }
        result = guard.enforce(payload)
        assert "email" not in result["nested"]
        assert result["nested"]["value"] == 42

    def test_pii_in_list_stripped(self, guard):
        payload = {
            "aggregation": "department",
            "items": [{"email": "x@y.com", "id": 1}, {"id": 2}],
        }
        result = guard.enforce(payload)
        assert "email" not in result["items"][0]
        assert result["items"][0]["id"] == 1

    def test_retention_within_window(self, guard):
        assert guard.validate_retention(3.0) is True

    def test_retention_at_boundary(self, guard):
        assert guard.validate_retention(6.0) is True

    def test_retention_beyond_window(self, guard):
        assert guard.validate_retention(7.0) is False

    def test_all_pii_keys_stripped(self, guard):
        pii_fields = {"email", "phone", "name", "employee_id", "address", "ssn", "dob", "ip_address"}
        payload = {"aggregation": "department"}
        for field in pii_fields:
            payload[field] = "sensitive"
        result = guard.enforce(payload)
        for field in pii_fields:
            assert field not in result, f"PII field {field!r} was not stripped"
