"""
Persistence parameter (alpha) estimation.

alpha is estimated from the unresolved constraint half-life across windows:
  - Track constraint strain C(t) over time.
  - Fit an exponential decay: C(t) = C0 * exp(-lambda * t)
  - alpha = 1 - lambda  (so high alpha means slow decay = high persistence)

If fewer than 3 data points are available, alpha defaults to 0.5 (neutral).
"""

from __future__ import annotations

import math
from typing import List


def estimate_alpha(c_series: List[float]) -> float:
    """
    Estimate persistence alpha from a time series of Constraint Strain values.

    Parameters
    ----------
    c_series : List[float]
        Constraint Strain (C) values for consecutive windows. Length >= 3
        recommended for reliable estimation. Values must be in [0, 1].

    Returns
    -------
    float
        alpha in [0, 1]. Higher = dissonance persists longer across windows.
    """
    n = len(c_series)
    if n < 2:
        return 0.5  # neutral default

    # Filter out zeros to avoid log(0)
    valid = [(i, c) for i, c in enumerate(c_series) if c > 0]
    if len(valid) < 2:
        return 0.0  # C went to zero quickly -> low persistence

    # Fit log(C) ~ -lambda * t via ordinary least squares
    log_c = [(i, math.log(c)) for i, c in valid]
    xs = [p[0] for p in log_c]
    ys = [p[1] for p in log_c]
    n_fit = len(xs)
    mean_x = sum(xs) / n_fit
    mean_y = sum(ys) / n_fit

    num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n_fit))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n_fit))
    if den == 0:
        return 0.5

    lam = -num / den  # decay rate; negate because slope is negative for decay
    alpha = 1.0 - max(0.0, min(1.0, lam))
    return max(0.0, min(1.0, alpha))
