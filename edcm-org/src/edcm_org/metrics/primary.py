"""
Primary EDCM metrics — range-checked, spec-compliant.

All functions return values in their defined ranges:
  C, R, F, E, D, N, I, L, P  -> [0, 1]
  O                            -> [-1, 1]

Fixation (F), Escalation (E), and Integration Failure (I) require window
history and are computed in secondary.py. This module handles single-window
primaries that operate on a text string alone.
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from .extraction_helpers import (
    count_markers,
    tokenize,
    constraint_engagement_tokens,
    resolution_action_tokens,
    contradiction_count,
)


# ---------------------------------------------------------------------------
# Range clamps
# ---------------------------------------------------------------------------

def clamp01(x: float) -> float:
    """Clamp to [0, 1]."""
    return max(0.0, min(1.0, float(x)))


def clamp11(x: float) -> float:
    """Clamp to [-1, 1]."""
    return max(-1.0, min(1.0, float(x)))


# ---------------------------------------------------------------------------
# Metric C — Constraint Strain
# ---------------------------------------------------------------------------

DEFAULT_C_WEIGHTS: Dict[str, float] = {
    "contradiction": 1.0,
    "refusal": 1.0,
    "uncertainty": 0.75,
    "low_progress": 0.5,
}


def metric_C(text: str, weights: Dict[str, float] | None = None) -> float:
    """
    Weighted contradiction density over constraint-relevant segments.

    `weights` is a spec-level knob for org domains. Document any changes from
    DEFAULT_C_WEIGHTS in your run configuration.

    Range: [0, 1]
    """
    if weights is None:
        weights = DEFAULT_C_WEIGHTS

    tokens = tokenize(text)
    if not tokens:
        return 0.0

    v = {
        "contradiction": contradiction_count(text),
        "refusal": count_markers(text, ["cannot", "impossible", "against policy", "not allowed"]),
        "uncertainty": count_markers(text, ["not sure", "maybe", "unclear", "unknown"]),
        "low_progress": count_markers(text, ["no decision", "we'll see", "tabled", "circle back"]),
    }

    num = sum(weights.get(k, 1.0) * (1.0 if v[k] > 0 else 0.0) for k in v)
    den = sum(weights.get(k, 1.0) for k in v)
    return clamp01(num / den if den else 0.0)


# ---------------------------------------------------------------------------
# Metric R — Refusal Density
# ---------------------------------------------------------------------------

_REFUSAL_MARKERS = ["cannot", "impossible", "against policy", "won't", "no way"]


def metric_R(text: str) -> float:
    """
    Refusal statements / total constraint statements.

    Range: [0, 1]
    """
    cons = constraint_engagement_tokens(text)
    if cons <= 0:
        return 0.0
    refusals = count_markers(text, _REFUSAL_MARKERS)
    return clamp01(refusals / cons)


# ---------------------------------------------------------------------------
# Metric D — Deflection
# ---------------------------------------------------------------------------

def metric_D(text: str) -> float:
    """
    1 - (tokens_about_constraints / total_tokens)

    Range: [0, 1]
    """
    total = len(tokenize(text))
    if total <= 0:
        return 0.0
    cons = constraint_engagement_tokens(text)
    return clamp01(1.0 - (cons / total))


# ---------------------------------------------------------------------------
# Metric N — Noise
# ---------------------------------------------------------------------------

def metric_N(text: str) -> float:
    """
    1 - (tokens_in_resolution_actions / tokens_about_constraints)

    Range: [0, 1]
    """
    cons = constraint_engagement_tokens(text)
    if cons <= 0:
        return 0.0
    res = resolution_action_tokens(text)
    return clamp01(1.0 - (res / cons))


# ---------------------------------------------------------------------------
# Metric L — Coherence Loss
# ---------------------------------------------------------------------------

def metric_L(text: str) -> float:
    """
    Internal contradiction density.

    Range: [0, 1]
    """
    stmts = max(1, text.count(".") + text.count("\n"))
    contr = contradiction_count(text)
    return clamp01(contr / stmts)


# ---------------------------------------------------------------------------
# Metric O — Overconfidence
# ---------------------------------------------------------------------------

_ABSOLUTE_MARKERS = ["guarantee", "definitely", "certain", "no doubt", "will", "always", "never fails"]
_HEDGE_MARKERS = ["maybe", "might", "unclear", "likely", "approximately", "could be", "uncertain"]
_EVIDENCE_MARKERS = ["http", "source", "data shows", "metrics", "evidence", "study", "research"]


def metric_O(text: str) -> float:
    """
    Certainty-evidence mismatch.

    Range: [-1, 1]
    Positive = over-certain; negative = under-certain (hedging without action).
    """
    total_stmts = max(1, text.count(".") + text.count("\n"))
    absolutes = count_markers(text, _ABSOLUTE_MARKERS)
    hedges = count_markers(text, _HEDGE_MARKERS)
    citations = count_markers(text, _EVIDENCE_MARKERS)
    raw = (absolutes - hedges - citations) / total_stmts
    return clamp11(raw)
