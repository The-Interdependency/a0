# 9:32
# DOC module: tests.test_compute_transcript_full
# DOC label: EDCMBONE transcript rollup
# DOC description: Locks the contract of edcm.compute_transcript_full —
# return shape, honest errors on bad input, no silent fallback.
import pytest

from python.services import edcm as edcm_svc


SAMPLE = """
User: I want to build a research instrument for transcript analysis.
Assistant: Got it. What kinds of transcripts will you be feeding it?
User: ChatGPT exports, plain text, PDFs of conversations.
Assistant: We can normalize all of those into a single message stream.
User: Make sure it scores risk_loop and risk_fixation per round.
Assistant: Both are computed pairwise across adjacent rounds.
""".strip()


def test_compute_transcript_full_returns_canonical_shape():
    out = edcm_svc.compute_transcript_full(SAMPLE)
    assert isinstance(out, dict)
    assert out["edcmbone_version"] == edcm_svc.EDCMBONE_VERSION
    assert out["message_count"] >= 1
    # Averages renamed: avg_int_val -> avg_int (storage column name)
    assert "avg_int" in out
    assert "avg_int_val" not in out
    for name in edcm_svc.METRIC_NAMES:
        if name == "int_val":
            continue
        assert f"avg_{name}" in out, f"missing avg_{name}"
    # Peak metric present
    assert "peak_metric" in out
    assert "peak_metric_name" in out
    assert 0.0 <= out["peak_metric"] <= 1.0


def test_compute_transcript_full_empty_raises():
    with pytest.raises(ValueError, match="empty text"):
        edcm_svc.compute_transcript_full("")
    with pytest.raises(ValueError, match="empty text"):
        edcm_svc.compute_transcript_full("   \n\t  ")


def test_compute_transcript_full_single_message_returns_one_round():
    # Even a one-token transcript is a valid (degenerate) round; the contract
    # is "raise only on empty / zero-round input, never silently zero out."
    out = edcm_svc.compute_transcript_full("x")
    assert out["message_count"] == 1
    assert out["edcmbone_version"] == edcm_svc.EDCMBONE_VERSION
# 9:32
