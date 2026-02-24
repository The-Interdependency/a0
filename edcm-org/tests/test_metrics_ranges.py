"""
Spec compliance tests — metric range validation.

These tests MUST pass before any release. They enforce that no metric
can silently drift outside its defined range.
"""

import pytest
from edcm_org.metrics.primary import (
    metric_C, metric_R, metric_D, metric_N, metric_L, metric_O,
    clamp01, clamp11,
)
from edcm_org.metrics.secondary import metric_F, metric_E, metric_I
from edcm_org.metrics.progress import compute_progress


# ---------------------------------------------------------------------------
# Range constants
# ---------------------------------------------------------------------------

RANGE_01 = (0.0, 1.0)
RANGE_11 = (-1.0, 1.0)


def in_range(val: float, lo: float, hi: float) -> bool:
    return lo <= val <= hi


# ---------------------------------------------------------------------------
# Test data
# ---------------------------------------------------------------------------

SAMPLE_TEXTS = [
    "",
    "Hello world.",
    "We cannot proceed. It is impossible to meet this deadline. We're not sure about the requirements.",
    "Decision made: we will ship by Friday. Committed. Approved.",
    "Maybe we'll circle back. Not sure. Unclear. Tabled for next week.",
    "The team definitely guarantees this will work. No doubt whatsoever.",
    "Actually I retract that. Correction: we were wrong. Per feedback we changed to the new approach.",
    "Fault lies with the project manager. They failed to deliver. It's their fault entirely.",
    "We shipped the feature. PR merged. Deployed to production. Completed as planned.",
]

MULTI_WINDOW = [SAMPLE_TEXTS[2], SAMPLE_TEXTS[3], SAMPLE_TEXTS[4]]


# ---------------------------------------------------------------------------
# Primary metric range tests
# ---------------------------------------------------------------------------

class TestMetricRanges:

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_C_in_range(self, text):
        val = metric_C(text)
        assert in_range(val, *RANGE_01), f"C={val} out of [0,1] for text={text!r:.50}"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_R_in_range(self, text):
        val = metric_R(text)
        assert in_range(val, *RANGE_01), f"R={val} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_D_in_range(self, text):
        val = metric_D(text)
        assert in_range(val, *RANGE_01), f"D={val} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_N_in_range(self, text):
        val = metric_N(text)
        assert in_range(val, *RANGE_01), f"N={val} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_L_in_range(self, text):
        val = metric_L(text)
        assert in_range(val, *RANGE_01), f"L={val} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_O_in_range(self, text):
        val = metric_O(text)
        assert in_range(val, *RANGE_11), f"O={val} out of [-1,1]"


# ---------------------------------------------------------------------------
# Window-history metric range tests
# ---------------------------------------------------------------------------

class TestWindowMetricRanges:

    def test_F_single_window_returns_zero(self):
        val = metric_F(["only one window"])
        assert val == 0.0

    @pytest.mark.parametrize("windows", [MULTI_WINDOW, SAMPLE_TEXTS[:3]])
    def test_F_in_range(self, windows):
        val = metric_F(windows)
        assert in_range(val, *RANGE_01), f"F={val} out of [0,1]"

    def test_E_single_window_returns_zero(self):
        val = metric_E(["only one window"])
        assert val == 0.0

    @pytest.mark.parametrize("windows", [MULTI_WINDOW, SAMPLE_TEXTS[:3]])
    def test_E_in_range(self, windows):
        val = metric_E(windows)
        assert in_range(val, *RANGE_01), f"E={val} out of [0,1]"

    def test_I_single_window_returns_zero(self):
        val = metric_I(["only one window"])
        assert val == 0.0

    @pytest.mark.parametrize("windows", [MULTI_WINDOW, SAMPLE_TEXTS[:3]])
    def test_I_in_range(self, windows):
        val = metric_I(windows)
        assert in_range(val, *RANGE_01), f"I={val} out of [0,1]"


# ---------------------------------------------------------------------------
# Progress sub-component consistency
# ---------------------------------------------------------------------------

class TestProgressConsistency:

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_P_in_range(self, text):
        P, P_d, P_c, P_a, P_f = compute_progress(text)
        assert in_range(P, *RANGE_01), f"P={P} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_P_sub_components_in_range(self, text):
        P, P_d, P_c, P_a, P_f = compute_progress(text)
        for name, val in [("P_d", P_d), ("P_c", P_c), ("P_a", P_a), ("P_f", P_f)]:
            assert in_range(val, *RANGE_01), f"{name}={val} out of [0,1]"

    @pytest.mark.parametrize("text", SAMPLE_TEXTS)
    def test_P_sub_components_sum_matches_P(self, text):
        P, P_d, P_c, P_a, P_f = compute_progress(text)
        computed = 0.3 * P_d + 0.2 * P_c + 0.3 * P_a + 0.2 * P_f
        assert abs(computed - P) < 0.01, (
            f"P sub-components sum {computed:.4f} != P {P:.4f}"
        )


# ---------------------------------------------------------------------------
# Clamp utility tests
# ---------------------------------------------------------------------------

class TestClampUtilities:

    def test_clamp01_below(self):
        assert clamp01(-0.5) == 0.0

    def test_clamp01_above(self):
        assert clamp01(1.5) == 1.0

    def test_clamp01_within(self):
        assert clamp01(0.5) == 0.5

    def test_clamp11_below(self):
        assert clamp11(-2.0) == -1.0

    def test_clamp11_above(self):
        assert clamp11(2.0) == 1.0

    def test_clamp11_within(self):
        assert clamp11(-0.3) == -0.3
