"""
EDCM Metric Gaming Detection — always computed, non-optional.

Gaming occurs when a system (human or AI) produces outputs designed to score
well on EDCM metrics without actually resolving constraints.

The most prominent gaming pattern for organizational contexts is
COMPLIANCE_STASIS: high artifact output with zero constraint reduction.

Detection is heuristic and confidence-weighted. Gaming alerts are included in
every OutputEnvelope.gaming_alerts field.
"""

from __future__ import annotations

from typing import List

from ..types import Metrics


def detect_gaming_alerts(
    m: Metrics,
    c_reduction: float,
    window_count: int,
) -> List[str]:
    """
    Detect potential metric gaming and return a list of alert strings.

    Parameters
    ----------
    m             : Current Metrics
    c_reduction   : Fractional constraint reduction this window
    window_count  : Number of windows analyzed so far

    Returns
    -------
    List[str]
        Human-readable alert descriptions. Empty = no alerts detected.
    """
    alerts: List[str] = []

    # --- Artifact inflation without resolution ---
    if m.P_artifacts > 0.7 and c_reduction < 0.1:
        alerts.append(
            f"ARTIFACT_INFLATION: P_artifacts={m.P_artifacts:.2f} but "
            f"c_reduction={c_reduction:.2f}. "
            "Artifacts produced without constraint reduction — possible compliance theater."
        )

    # --- Suppressed escalation masking unresolved strain ---
    if m.C > 0.6 and m.E < 0.15 and m.P < 0.3:
        alerts.append(
            f"SUPPRESSED_ESCALATION: C={m.C:.2f} with E={m.E:.2f} and P={m.P:.2f}. "
            "High strain with low escalation and low progress — possible suppression of signals."
        )

    # --- Resolution token inflation (resolution markers without constraint engagement) ---
    if m.N < 0.15 and m.D > 0.6:
        alerts.append(
            f"RESOLUTION_TOKEN_INFLATION: N={m.N:.2f} with D={m.D:.2f}. "
            "Resolution markers present but constraint engagement is low — "
            "possible resolution language without resolution actions."
        )

    # --- Overconfidence plus low coherence ---
    if m.O > 0.6 and m.L > 0.5:
        alerts.append(
            f"OVERCONFIDENCE_INCOHERENCE: O={m.O:.2f} and L={m.L:.2f}. "
            "High certainty combined with high internal contradiction — "
            "possible manufactured confidence."
        )

    # --- Fixation camouflage: F high but P also high ---
    # (appears to be making progress while looping on the same constraints)
    if m.F > 0.7 and m.P > 0.6:
        alerts.append(
            f"FIXATION_CAMOUFLAGE: F={m.F:.2f} and P={m.P:.2f}. "
            "High fixation coinciding with high progress — verify that progress "
            "sub-components map to distinct constraints, not the same one repeatedly."
        )

    return alerts
