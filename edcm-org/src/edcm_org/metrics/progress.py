"""
Progress (P) metric computation.

P = 0.3*P_decisions + 0.2*P_commitments + 0.3*P_artifacts + 0.2*P_followthrough

Each sub-component is estimated from keyword/pattern matching. These are
conservative lower-bound estimates; supplement with structured data (ticket
status, artifact counts) via the io/ loaders for higher fidelity.
"""

from __future__ import annotations

from typing import Optional

from .extraction_helpers import count_markers, tokenize
from .primary import clamp01

# ---------------------------------------------------------------------------
# Sub-component keyword sets
# ---------------------------------------------------------------------------

_DECISION_MARKERS = [
    "decided", "decision made", "agreed on", "we will", "going with",
    "approved", "selected", "chosen", "voted", "resolved to",
]

_COMMITMENT_MARKERS = [
    "committed", "i will", "we will", "by next", "by friday", "owner:",
    "assigned to", "responsible", "taking on", "on me", "my action item",
]

_ARTIFACT_MARKERS = [
    "pr merged", "pull request", "ticket closed", "deployed", "shipped",
    "document updated", "spec written", "design finalized", "completed",
    "merged", "released",
]

_FOLLOWTHROUGH_MARKERS = [
    "done", "finished", "as promised", "per last meeting", "following up",
    "update:", "status:", "completed as planned", "delivered",
]


def _sub_score(text: str, markers: list, scale: float = 0.2) -> float:
    """
    Simple sub-score: count marker hits, normalize by total sentence count.
    scale controls sensitivity. Returns [0, 1].
    """
    sentences = [s.strip() for s in text.replace("\n", ".").split(".") if s.strip()]
    if not sentences:
        return 0.0
    hits = count_markers(text, markers)
    # One hit per scale*N sentences = 1.0
    normalized = hits / max(1, len(sentences) * scale)
    return clamp01(normalized)


def compute_progress(
    text: str,
    p_decisions_override: Optional[float] = None,
    p_commitments_override: Optional[float] = None,
    p_artifacts_override: Optional[float] = None,
    p_followthrough_override: Optional[float] = None,
) -> tuple[float, float, float, float, float]:
    """
    Compute P and its four sub-components.

    Overrides allow structured data sources (e.g., ticket counts) to replace
    the text-heuristic estimate for individual sub-components.

    Returns: (P, P_decisions, P_commitments, P_artifacts, P_followthrough)
    """
    P_decisions = (
        p_decisions_override
        if p_decisions_override is not None
        else _sub_score(text, _DECISION_MARKERS)
    )
    P_commitments = (
        p_commitments_override
        if p_commitments_override is not None
        else _sub_score(text, _COMMITMENT_MARKERS)
    )
    P_artifacts = (
        p_artifacts_override
        if p_artifacts_override is not None
        else _sub_score(text, _ARTIFACT_MARKERS)
    )
    P_followthrough = (
        p_followthrough_override
        if p_followthrough_override is not None
        else _sub_score(text, _FOLLOWTHROUGH_MARKERS)
    )

    P = clamp01(
        0.3 * P_decisions
        + 0.2 * P_commitments
        + 0.3 * P_artifacts
        + 0.2 * P_followthrough
    )

    return P, P_decisions, P_commitments, P_artifacts, P_followthrough
