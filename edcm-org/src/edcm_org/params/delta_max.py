"""
delta_max parameter estimation.

delta_max is the complexity-bounded throughput ceiling:
  delta_max ≈ P90(median(resolution_rate | complexity_bucket))

It represents the maximum rate at which a system can resolve constraints
given its current complexity load. If a system is operating near delta_max
and constraint input is still rising, overload is imminent.

In v0.1, delta_max is estimated from observed resolution rates bucketed by
complexity. With insufficient history, a conservative default is used.
"""

from __future__ import annotations

import statistics
from typing import Dict, List, Optional

from .complexity import bucket as complexity_bucket

# Default delta_max values per complexity bucket (from reference calibration)
# These are conservative baselines; update from empirical data in production.
_DEFAULT_DELTA_MAX: Dict[str, float] = {
    "low": 0.7,
    "medium": 0.45,
    "high": 0.25,
}


def estimate_delta_max(
    resolution_rates: List[float],
    complexities: List[float],
    bucket_override: Optional[str] = None,
) -> float:
    """
    Estimate delta_max from observed resolution rates and complexities.

    Parameters
    ----------
    resolution_rates : List[float]
        Resolution rate for each historical window (0..1).
        resolution_rate = resolved_constraints / total_constraints_that_window
    complexities : List[float]
        Complexity score for each corresponding window.
    bucket_override : str, optional
        Force a specific complexity bucket ('low', 'medium', 'high').
        Used when you know the current context type.

    Returns
    -------
    float
        delta_max estimate in [0, 1].
    """
    if not resolution_rates or not complexities:
        # Fall back to medium bucket default
        return _DEFAULT_DELTA_MAX["medium"]

    if len(resolution_rates) != len(complexities):
        raise ValueError("resolution_rates and complexities must have the same length.")

    # Group resolution rates by complexity bucket
    bucketed: Dict[str, List[float]] = {"low": [], "medium": [], "high": []}
    for rate, comp in zip(resolution_rates, complexities):
        b = bucket_override if bucket_override else complexity_bucket(comp)
        bucketed[b].append(rate)

    # Determine current bucket (from most recent complexity, or override)
    current_bucket = bucket_override if bucket_override else complexity_bucket(complexities[-1])

    group = bucketed.get(current_bucket, [])
    if len(group) < 3:
        return _DEFAULT_DELTA_MAX[current_bucket]

    # P90 of median resolution rate within bucket
    median_rate = statistics.median(group)
    # P90 approximation: sort and take index at 90th percentile
    sorted_group = sorted(group)
    p90_idx = int(len(sorted_group) * 0.9)
    p90 = sorted_group[min(p90_idx, len(sorted_group) - 1)]

    # delta_max = P90 of the median estimate (conservative)
    return max(0.0, min(1.0, (median_rate + p90) / 2.0))
