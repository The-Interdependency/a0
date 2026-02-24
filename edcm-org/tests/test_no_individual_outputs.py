"""
Spec compliance test: no individual-level outputs.

This test suite is specifically designed to catch any code path that could
produce individual-level EDCM outputs. It is a hard build gate.
"""

import json
import pytest
from edcm_org.governance.privacy import EDCMPrivacyGuard, PrivacyConfig, ConsentError
from edcm_org.types import OutputEnvelope, Metrics, Params
from edcm_org.spec_version import SPEC_VERSION
from edcm_org.eval.protocol import check_spec_compliance


def make_envelope(aggregation="department") -> OutputEnvelope:
    return OutputEnvelope(
        spec_version=SPEC_VERSION,
        org="test-org",
        window_id="w001",
        aggregation=aggregation,
        metrics=Metrics(
            C=0.3, R=0.2, F=0.2, E=0.2, D=0.3, N=0.4,
            I=0.2, O=0.1, L=0.2, P=0.5,
        ),
        params=Params(alpha=0.5, delta_max=0.45, complexity=0.4),
        basin="UNCLASSIFIED",
        basin_confidence=0.5,
    )


class TestNoIndividualOutputs:

    def test_privacy_guard_blocks_individual(self):
        guard = EDCMPrivacyGuard(PrivacyConfig())
        with pytest.raises(ConsentError):
            guard.enforce({"aggregation": "individual"})

    def test_output_envelope_validate_blocks_individual(self):
        envelope = make_envelope(aggregation="individual")
        errors = envelope.validate()
        assert any("individual" in e for e in errors)

    def test_spec_compliance_check_blocks_individual(self):
        envelope = make_envelope(aggregation="individual")
        result = check_spec_compliance(envelope)
        assert not result.passed
        assert any("individual" in e for e in result.errors)

    def test_valid_department_output_passes(self):
        envelope = make_envelope(aggregation="department")
        result = check_spec_compliance(envelope)
        assert result.passed, f"Expected pass, got errors: {result.errors}"

    def test_valid_team_output_passes(self):
        envelope = make_envelope(aggregation="team")
        result = check_spec_compliance(envelope)
        assert result.passed, f"Expected pass, got errors: {result.errors}"

    def test_valid_organization_output_passes(self):
        envelope = make_envelope(aggregation="organization")
        result = check_spec_compliance(envelope)
        assert result.passed, f"Expected pass, got errors: {result.errors}"

    def test_spec_version_enforced(self):
        envelope = make_envelope()
        envelope.spec_version = "edcm-org-v99.0.0"
        result = check_spec_compliance(envelope)
        assert not result.passed
        assert any("spec_version" in e for e in result.errors)

    def test_all_metric_ranges_enforced(self):
        """Each metric out of range should produce a compliance error."""
        test_cases = [
            ("C", 1.5), ("R", -0.1), ("F", 1.1), ("O", -1.5), ("O", 1.5),
        ]
        for metric_name, bad_value in test_cases:
            envelope = make_envelope()
            setattr(envelope.metrics, metric_name, bad_value)
            result = check_spec_compliance(envelope)
            assert not result.passed, (
                f"Expected failure for {metric_name}={bad_value}"
            )
            assert any(metric_name in e for e in result.errors), (
                f"Error message should reference metric {metric_name}"
            )
