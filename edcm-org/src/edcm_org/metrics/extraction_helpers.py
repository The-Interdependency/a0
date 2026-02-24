"""
Low-level text extraction utilities for EDCM metric computation.

All functions operate on plain text strings. No NLP models are required —
EDCM v0.1 uses keyword/pattern matching to remain auditable and fast.

Extend these helpers (not the metric functions) when adding domain-specific
vocabulary.
"""

from __future__ import annotations

import re
from typing import List

# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"\b\w+\b")

CONSTRAINT_KEYWORDS: List[str] = [
    # Statements of impossibility / constraint violation
    "cannot", "can't", "impossible", "against policy", "not allowed", "prohibited",
    "won't", "will not", "no way", "blocked", "forbidden",
    # Uncertainty signals
    "not sure", "maybe", "unclear", "unknown", "unsure", "uncertain",
    # Deferral / tabling
    "circle back", "tabled", "defer", "postpone", "later", "pending",
    # Constraint acknowledgment
    "constraint", "requirement", "must", "should", "need to", "have to",
    "obligated", "mandate", "deadline",
]

RESOLUTION_KEYWORDS: List[str] = [
    "decided", "decision", "agreed", "approved", "resolved", "completed",
    "done", "shipped", "deployed", "closed", "fixed", "implemented",
    "committed", "signed off", "confirmed", "finalized",
]

CONTRADICTION_PATTERNS: List[tuple[str, str]] = [
    # (marker_a, marker_b) — if both appear in same text window it's a contradiction signal
    ("yes", "no"),
    ("will", "won't"),
    ("can", "cannot"),
    ("approved", "rejected"),
    ("agreed", "disagreed"),
    ("always", "never"),
    ("increase", "decrease"),
    ("add", "remove"),
]


def tokenize(text: str) -> List[str]:
    """Return lowercased word tokens from text."""
    return _TOKEN_RE.findall(text.lower())


def count_markers(text: str, markers: List[str]) -> int:
    """
    Count how many of the given phrase markers appear in text (case-insensitive).
    Each marker is counted as a binary presence (not frequency) per call.
    """
    lower = text.lower()
    return sum(1 for m in markers if m.lower() in lower)


def constraint_engagement_tokens(text: str) -> int:
    """
    Estimate the number of tokens that engage with constraints.
    Uses heuristic: count tokens in sentences that contain a constraint keyword.
    """
    sentences = re.split(r"[.!?\n]+", text)
    total = 0
    for sent in sentences:
        lower = sent.lower()
        if any(kw in lower for kw in CONSTRAINT_KEYWORDS):
            total += len(_TOKEN_RE.findall(sent))
    return total


def resolution_action_tokens(text: str) -> int:
    """
    Estimate the number of tokens in resolution-action sentences.
    """
    sentences = re.split(r"[.!?\n]+", text)
    total = 0
    for sent in sentences:
        lower = sent.lower()
        if any(kw in lower for kw in RESOLUTION_KEYWORDS):
            total += len(_TOKEN_RE.findall(sent))
    return total


def contradiction_count(text: str) -> int:
    """
    Count how many contradictory keyword pairs both appear in the text.
    This is a conservative lower bound — does not require the markers to
    appear in the same sentence.
    """
    lower = text.lower()
    count = 0
    for a, b in CONTRADICTION_PATTERNS:
        if a in lower and b in lower:
            count += 1
    return count


def blame_density(text: str) -> float:
    """
    Estimate proportion of sentences containing blame-assignment language.
    Used for SCAPEGOAT_DISCHARGE basin detection.
    """
    blame_markers = [
        "fault", "blame", "responsible for failure", "caused this",
        "their fault", "his fault", "her fault", "should have",
        "failed to", "didn't do", "never did", "dropped the ball",
    ]
    sentences = re.split(r"[.!?\n]+", text)
    if not sentences:
        return 0.0
    blame_sents = sum(
        1 for s in sentences
        if any(m in s.lower() for m in blame_markers)
    )
    return blame_sents / max(1, len(sentences))
