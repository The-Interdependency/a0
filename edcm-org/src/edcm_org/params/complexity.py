"""
Complexity parameter estimation.

Complexity captures the cognitive/structural load of a text window.
It is used to bucket resolution rates for delta_max estimation.

Complexity is estimated from:
  - vocabulary diversity (type-token ratio)
  - sentence length distribution
  - nested clause markers
  - technical/domain term density (pluggable vocabulary)
"""

from __future__ import annotations

from typing import List, Optional

from ..metrics.extraction_helpers import tokenize


_CLAUSE_MARKERS = [
    "however", "whereas", "although", "unless", "provided that",
    "on the other hand", "despite", "notwithstanding", "in contrast",
    "except", "regardless",
]


def estimate_complexity(
    text: str,
    domain_terms: Optional[List[str]] = None,
) -> float:
    """
    Estimate complexity of a text window.

    Parameters
    ----------
    text : str
        The window text.
    domain_terms : List[str], optional
        Additional domain-specific technical terms to count.

    Returns
    -------
    float
        Complexity score in [0, 1].
    """
    tokens = tokenize(text)
    if not tokens:
        return 0.0

    # 1. Type-token ratio (vocabulary diversity)
    ttr = len(set(tokens)) / len(tokens)

    # 2. Mean sentence length (longer sentences = harder)
    sentences = [s.strip() for s in text.replace("\n", ".").split(".") if s.strip()]
    if sentences:
        mean_sent_len = sum(len(tokenize(s)) for s in sentences) / len(sentences)
        sent_complexity = min(1.0, mean_sent_len / 30.0)  # 30 tokens/sentence => 1.0
    else:
        sent_complexity = 0.0

    # 3. Clause marker density
    clause_hits = sum(1 for m in _CLAUSE_MARKERS if m in text.lower())
    clause_density = min(1.0, clause_hits / max(1, len(sentences)))

    # 4. Domain term density (optional)
    if domain_terms:
        dt_hits = sum(1 for t in domain_terms if t.lower() in text.lower())
        dt_density = min(1.0, dt_hits / max(1, len(tokens)) * 10)
    else:
        dt_density = 0.0

    # Weighted combination
    complexity = (
        0.3 * ttr
        + 0.35 * sent_complexity
        + 0.25 * clause_density
        + 0.1 * dt_density
    )
    return max(0.0, min(1.0, complexity))


def bucket(complexity: float) -> str:
    """
    Assign a complexity bucket label for delta_max estimation.

    Returns one of: 'low', 'medium', 'high'
    """
    if complexity < 0.33:
        return "low"
    if complexity < 0.66:
        return "medium"
    return "high"
