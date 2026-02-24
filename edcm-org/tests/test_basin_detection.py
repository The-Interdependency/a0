"""
Basin detection tests — verify all basins fire at their documented thresholds.
"""

import pytest
from edcm_org.types import Metrics
from edcm_org.basins.detect import detect_basin


def make_metrics(**overrides) -> Metrics:
    """Create a Metrics instance with neutral defaults, applying overrides."""
    defaults = dict(
        C=0.3, R=0.3, F=0.3, E=0.3, D=0.3, N=0.3,
        I=0.3, O=0.0, L=0.3, P=0.5,
        P_decisions=0.5, P_commitments=0.5,
        P_artifacts=0.5, P_followthrough=0.5,
    )
    defaults.update(overrides)
    return Metrics(**defaults)


class TestBasinDetection:

    def test_refusal_fixation(self):
        m = make_metrics(R=0.8, F=0.7)
        basin, conf, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.3, blame_density=0.1)
        assert basin == "REFUSAL_FIXATION"
        assert conf == pytest.approx(0.90)
        assert len(expl["fired"]) > 0

    def test_dissipative_noise(self):
        m = make_metrics(N=0.8, P=0.2)
        basin, conf, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.2, blame_density=0.1)
        assert basin == "DISSIPATIVE_NOISE"
        assert conf == pytest.approx(0.80)

    def test_integration_oscillation(self):
        m = make_metrics(I=0.7, F=0.6)
        basin, conf, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.3, blame_density=0.1)
        assert basin == "INTEGRATION_OSCILLATION"
        assert conf == pytest.approx(0.70)

    def test_confidence_runaway(self):
        m = make_metrics(O=0.8, E=0.7)
        basin, conf, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.3, blame_density=0.1)
        assert basin == "CONFIDENCE_RUNAWAY"
        assert conf == pytest.approx(0.85)

    def test_deflective_stasis(self):
        m = make_metrics(D=0.8, P=0.3)
        basin, conf, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.3, blame_density=0.1)
        assert basin == "DEFLECTIVE_STASIS"
        assert conf == pytest.approx(0.70)

    def test_compliance_stasis(self):
        m = make_metrics(E=0.2, P_artifacts=0.85, P=0.5)
        basin, conf, expl = detect_basin(
            m, s_t=0.7, c_reduction=0.05, delta_work=0.5, blame_density=0.1
        )
        assert basin == "COMPLIANCE_STASIS"
        assert conf == pytest.approx(0.85)

    def test_scapegoat_discharge(self):
        m = make_metrics(I=0.7, P=0.5)
        basin, conf, expl = detect_basin(
            m, s_t=0.4, c_reduction=0.1, delta_work=0.05, blame_density=0.5
        )
        assert basin == "SCAPEGOAT_DISCHARGE"
        assert conf == pytest.approx(0.80)

    def test_unclassified(self):
        m = make_metrics()  # all neutral defaults
        basin, conf, expl = detect_basin(m, s_t=0.3, c_reduction=0.3, delta_work=0.5, blame_density=0.1)
        assert basin == "UNCLASSIFIED"
        assert conf == pytest.approx(0.50)

    def test_explanation_block_always_present(self):
        m = make_metrics(R=0.8, F=0.7)
        _, _, expl = detect_basin(m, s_t=0.5, c_reduction=0.1, delta_work=0.3, blame_density=0.1)
        assert "fired" in expl
        assert "would_change_if" in expl
        assert isinstance(expl["fired"], list)
        assert isinstance(expl["would_change_if"], list)

    def test_human_only_basins_checked_before_standard(self):
        """
        COMPLIANCE_STASIS should fire even when standard basin conditions are met,
        because human-only basins are evaluated first.
        """
        # Also set N high and P low to trigger DISSIPATIVE_NOISE if standard ran first
        m = make_metrics(N=0.8, P=0.2, E=0.2, P_artifacts=0.85)
        basin, _, _ = detect_basin(
            m, s_t=0.7, c_reduction=0.05, delta_work=0.2, blame_density=0.1
        )
        # COMPLIANCE_STASIS should win because it's evaluated first
        assert basin == "COMPLIANCE_STASIS"
