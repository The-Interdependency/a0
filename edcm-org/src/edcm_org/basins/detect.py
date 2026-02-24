"""
EDCM Basin Detection — spec-compliant classifier.

Returns (BasinName, confidence, explanation_block) for a given metric state.

Human-only basins (COMPLIANCE_STASIS, SCAPEGOAT_DISCHARGE) are evaluated first
because they can masquerade as stable or productive states.

Explanation blocks are non-optional per v0.1 design goal:
  - which thresholds fired
  - what would change the basin
This keeps the diagnostic non-punitive and useful.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from ..types import BasinName, Metrics


ExplanationBlock = Dict[str, object]


def detect_basin(
    m: Metrics,
    s_t: float,
    c_reduction: float,
    delta_work: float,
    blame_density: float,
) -> Tuple[BasinName, float, ExplanationBlock]:
    """
    Classify the current metric state into a basin.

    Parameters
    ----------
    m            : Metrics dataclass (all primaries populated)
    s_t          : Strain trajectory — current constraint strain relative to baseline.
                   s_t > 0.6 means strain is elevated.
    c_reduction  : Fractional constraint reduction this window (0 = no reduction).
    delta_work   : Work output delta this window (0 = no new work produced).
    blame_density: Proportion of sentences containing blame-assignment language.

    Returns
    -------
    (basin_name, confidence, explanation_block)
    """

    # ------------------------------------------------------------------
    # Human-only basins — evaluated first (can masquerade as good states)
    # ------------------------------------------------------------------

    compliance_index = (m.P_artifacts / (c_reduction + 1e-6)) if m.P_artifacts > 0 else 0.0
    if (
        m.P_artifacts >= 0.8
        and c_reduction < 0.2
        and s_t > 0.6
        and m.E < 0.3
        and compliance_index > 2.5
    ):
        explanation = {
            "fired": [
                f"P_artifacts={m.P_artifacts:.2f} >= 0.8",
                f"c_reduction={c_reduction:.2f} < 0.2",
                f"s_t={s_t:.2f} > 0.6",
                f"E={m.E:.2f} < 0.3",
                f"compliance_index={compliance_index:.2f} > 2.5",
            ],
            "would_change_if": [
                "c_reduction rises above 0.2 (constraints actually resolved)",
                "P_artifacts drops or maps to resolved constraints",
                "s_t falls below 0.6 (strain reduced)",
            ],
        }
        return "COMPLIANCE_STASIS", 0.85, explanation

    discharge_event = (
        s_t < 0.6
        and delta_work < 0.1
        and blame_density > 0.3
        and m.I > 0.6
    )
    if discharge_event:
        explanation = {
            "fired": [
                f"s_t={s_t:.2f} < 0.6",
                f"delta_work={delta_work:.2f} < 0.1",
                f"blame_density={blame_density:.2f} > 0.3",
                f"I={m.I:.2f} > 0.6",
            ],
            "would_change_if": [
                "blame_density drops below 0.3",
                "integration failure (I) resolved",
                "delta_work rises (productive output returns)",
            ],
        }
        return "SCAPEGOAT_DISCHARGE", 0.80, explanation

    # ------------------------------------------------------------------
    # Standard basins
    # ------------------------------------------------------------------

    if m.R > 0.7 and m.F > 0.6:
        explanation = {
            "fired": [f"R={m.R:.2f} > 0.7", f"F={m.F:.2f} > 0.6"],
            "would_change_if": [
                "R drops below 0.7 (fewer refusals per constraint statement)",
                "F drops below 0.6 (constraint engagement diversifies)",
            ],
        }
        return "REFUSAL_FIXATION", 0.90, explanation

    if m.N > 0.7 and m.P < 0.3:
        explanation = {
            "fired": [f"N={m.N:.2f} > 0.7", f"P={m.P:.2f} < 0.3"],
            "would_change_if": [
                "N drops below 0.7 (more resolution actions per constraint token)",
                "P rises above 0.3 (decisions/artifacts start completing)",
            ],
        }
        return "DISSIPATIVE_NOISE", 0.80, explanation

    if m.I > 0.6 and 0.4 <= m.F <= 0.8:
        explanation = {
            "fired": [f"I={m.I:.2f} > 0.6", f"F={m.F:.2f} in [0.4, 0.8]"],
            "would_change_if": [
                "I drops below 0.6 (corrections start integrating)",
                "F exits [0.4, 0.8] range",
            ],
        }
        return "INTEGRATION_OSCILLATION", 0.70, explanation

    if m.O > 0.7 and m.E > 0.6:
        explanation = {
            "fired": [f"O={m.O:.2f} > 0.7", f"E={m.E:.2f} > 0.6"],
            "would_change_if": [
                "O drops below 0.7 (certainty calibrated to evidence)",
                "E drops below 0.6 (commitment velocity decreases)",
            ],
        }
        return "CONFIDENCE_RUNAWAY", 0.85, explanation

    if m.D > 0.7 and 0.2 <= m.P <= 0.4:
        explanation = {
            "fired": [f"D={m.D:.2f} > 0.7", f"P={m.P:.2f} in [0.2, 0.4]"],
            "would_change_if": [
                "D drops below 0.7 (more output directed at constraints)",
                "P exits [0.2, 0.4] range",
            ],
        }
        return "DEFLECTIVE_STASIS", 0.70, explanation

    explanation = {
        "fired": [],
        "would_change_if": [
            "R > 0.7 + F > 0.6 -> REFUSAL_FIXATION",
            "N > 0.7 + P < 0.3 -> DISSIPATIVE_NOISE",
            "I > 0.6 + F in [0.4, 0.8] -> INTEGRATION_OSCILLATION",
            "O > 0.7 + E > 0.6 -> CONFIDENCE_RUNAWAY",
            "D > 0.7 + P in [0.2, 0.4] -> DEFLECTIVE_STASIS",
        ],
    }
    return "UNCLASSIFIED", 0.50, explanation
