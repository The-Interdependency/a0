"""
Secondary EDCM metrics — require window history.

Metrics computed here:
  F — Fixation (similarity of constraint engagement over time)
  E — Escalation (commitment velocity increase)
  I — Integration Failure (failure to incorporate corrections across windows)

Secondary modifiers (sentiment slope, urgency, filler ratio, topic drift) are
also computed here. Per spec, they can ONLY modulate confidence, not define
primaries. Caps:
  Sentiment slope   -> Escalation confidence <= 0.2
  Urgency           -> Escalation confidence <= 0.15
  Filler ratio      -> Noise confidence <= 0.25
  Topic drift       -> Deflection confidence <= 0.3
"""

from __future__ import annotations

import math
from typing import List

from .extraction_helpers import (
    count_markers,
    tokenize,
    constraint_engagement_tokens,
    resolution_action_tokens,
)
from .primary import clamp01, clamp11

# ---------------------------------------------------------------------------
# Fixation (F)
# ---------------------------------------------------------------------------

def _jaccard(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 1.0
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def metric_F(window_texts: List[str]) -> float:
    """
    Fixation: similarity of constraint engagement across windows.

    Computed as mean pairwise Jaccard similarity of constraint-keyword sets
    over consecutive window pairs. High F = system keeps engaging the same
    (unresolved) constraints.

    Range: [0, 1]
    Requires at least 2 windows.
    """
    if len(window_texts) < 2:
        return 0.0

    def constraint_set(text: str) -> set:
        tokens = tokenize(text)
        from .extraction_helpers import CONSTRAINT_KEYWORDS
        return {t for t in tokens if any(kw.replace(" ", "_") == t or kw in text.lower()
                                         for kw in CONSTRAINT_KEYWORDS)}

    similarities = []
    for i in range(len(window_texts) - 1):
        a = constraint_set(window_texts[i])
        b = constraint_set(window_texts[i + 1])
        similarities.append(_jaccard(a, b))

    return clamp01(sum(similarities) / len(similarities))


# ---------------------------------------------------------------------------
# Escalation (E)
# ---------------------------------------------------------------------------

_IRREVERSIBILITY_MARKERS = [
    "committed", "signed", "launched", "deployed", "shipped", "announced",
    "published", "sent", "filed", "submitted", "approved", "final", "no going back",
]


def metric_E(window_texts: List[str]) -> float:
    """
    Escalation: commitment velocity increase (irreversibility marker slope).

    Computes the slope of irreversibility marker counts across windows.
    Positive slope normalized to [0, 1].

    Range: [0, 1]
    Requires at least 2 windows.
    """
    if len(window_texts) < 2:
        return 0.0

    counts = [count_markers(t, _IRREVERSIBILITY_MARKERS) for t in window_texts]
    n = len(counts)
    if n < 2:
        return 0.0

    # Simple linear regression slope
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(counts) / n
    num = sum((xs[i] - mean_x) * (counts[i] - mean_y) for i in range(n))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n))
    slope = num / den if den != 0 else 0.0

    # Normalize: slope of 1 irreversibility marker per window => E = 0.5
    return clamp01(slope / 2.0)


# ---------------------------------------------------------------------------
# Integration Failure (I)
# ---------------------------------------------------------------------------

_CORRECTION_MARKERS = [
    "correction", "actually", "revised", "updated", "changed to", "per feedback",
    "as noted", "you're right", "we were wrong", "amend", "retract",
]


def metric_I(window_texts: List[str]) -> float:
    """
    Integration Failure: failure to incorporate corrections across windows.

    If correction markers appear in window N, check whether constraint strain
    decreases in window N+1. If it does not, that counts as a failure.

    Range: [0, 1]
    Requires at least 2 windows.
    """
    if len(window_texts) < 2:
        return 0.0

    from .primary import metric_C

    failures = 0
    correction_windows = 0

    for i in range(len(window_texts) - 1):
        if count_markers(window_texts[i], _CORRECTION_MARKERS) > 0:
            correction_windows += 1
            c_before = metric_C(window_texts[i])
            c_after = metric_C(window_texts[i + 1])
            if c_after >= c_before:  # no improvement
                failures += 1

    if correction_windows == 0:
        return 0.0
    return clamp01(failures / correction_windows)


# ---------------------------------------------------------------------------
# Secondary modifiers — confidence adjustments only
# ---------------------------------------------------------------------------

def modifier_sentiment_slope(window_texts: List[str]) -> float:
    """
    Sentiment slope: estimates rate of negative sentiment increase.
    Returns a value in [0, 1]; caps Escalation confidence at 0.2.
    """
    _neg = ["bad", "worse", "terrible", "failed", "broken", "disaster", "crisis", "urgent"]
    counts = [count_markers(t, _neg) for t in window_texts]
    if len(counts) < 2:
        return 0.0
    diffs = [counts[i + 1] - counts[i] for i in range(len(counts) - 1)]
    slope = sum(diffs) / len(diffs)
    return clamp01(slope / 3.0)  # normalize: 3 new neg markers/window = 1.0


def modifier_urgency(window_texts: List[str]) -> float:
    """
    Urgency: density of urgency markers in latest window.
    Returns [0, 1]; caps Escalation confidence at 0.15.
    """
    _urg = ["asap", "urgent", "immediately", "critical", "emergency", "now", "right now"]
    if not window_texts:
        return 0.0
    latest = window_texts[-1]
    hits = count_markers(latest, _urg)
    total = max(1, len(tokenize(latest)))
    return clamp01(hits / total * 10)  # normalize


def modifier_filler_ratio(text: str) -> float:
    """
    Filler ratio: proportion of tokens that are filler/hedge words.
    Returns [0, 1]; caps Noise confidence at 0.25.
    """
    _fillers = ["um", "uh", "like", "basically", "literally", "actually",
                "you know", "sort of", "kind of", "i mean", "right"]
    tokens = tokenize(text)
    if not tokens:
        return 0.0
    filler_count = count_markers(text, _fillers)
    return clamp01(filler_count / len(tokens) * 5)


def modifier_topic_drift(window_texts: List[str]) -> float:
    """
    Topic drift: how much the vocabulary shifts between windows.
    Returns [0, 1]; caps Deflection confidence at 0.3.
    """
    if len(window_texts) < 2:
        return 0.0

    drifts = []
    for i in range(len(window_texts) - 1):
        a = set(tokenize(window_texts[i]))
        b = set(tokenize(window_texts[i + 1]))
        if not a or not b:
            drifts.append(0.0)
            continue
        overlap = len(a & b) / min(len(a), len(b))
        drifts.append(1.0 - overlap)

    return clamp01(sum(drifts) / len(drifts))
