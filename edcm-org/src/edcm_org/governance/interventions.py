"""
EDCM Non-Punitive Intervention Recommendations.

Interventions are load-management suggestions, not blame assignments.
They are generated from basin + metric state and are always framed as
system-level recommendations, never individual-level judgments.

Per spec: no punitive automation. Interventions are advisory only.
"""

from __future__ import annotations

from typing import List

from ..types import BasinName, Metrics


def recommend_interventions(basin: BasinName, m: Metrics) -> List[str]:
    """
    Generate non-punitive, system-level intervention recommendations.

    Parameters
    ----------
    basin : BasinName
        The detected basin for the current window.
    m     : Metrics
        Current metric state.

    Returns
    -------
    List[str]
        Ordered list of recommended interventions. Advisory only.
    """
    recs: List[str] = []

    if basin == "REFUSAL_FIXATION":
        recs.append(
            "Reduce constraint load: identify which input demands are irreconcilable "
            "and either remove them or separate them into distinct workflows."
        )
        recs.append(
            "Introduce a resolution pathway: ensure refusal outputs include a "
            "'what would resolve this' response to prevent energy accumulation."
        )

    elif basin == "DISSIPATIVE_NOISE":
        recs.append(
            "Introduce structured decision gates: require a defined decision or "
            "artifact at the end of each work session."
        )
        recs.append(
            "Reduce meeting frequency and increase resolution accountability: "
            "assign a resolution owner per constraint."
        )

    elif basin == "INTEGRATION_OSCILLATION":
        recs.append(
            "Audit correction pathways: verify that feedback reaches decision-makers "
            "and that a mechanism exists to update behavior."
        )
        recs.append(
            "Introduce an integration checkpoint: before each new window, review "
            "whether corrections from the prior window changed outputs."
        )

    elif basin == "CONFIDENCE_RUNAWAY":
        recs.append(
            "Require external validation before next commitment step. "
            "Pause escalation until evidence citations are provided."
        )
        recs.append(
            "Introduce a dissent channel: allow minority views to be recorded "
            "without requiring consensus before action."
        )

    elif basin == "DEFLECTIVE_STASIS":
        recs.append(
            "Audit resource allocation against the constraint list: "
            "verify that effort is directed at actual constraints, not adjacent work."
        )
        recs.append(
            "Surface the avoided constraint explicitly and assign ownership."
        )

    elif basin == "COMPLIANCE_STASIS":
        recs.append(
            "Audit whether artifacts produced map to actual constraint resolution. "
            "Ask: what constraint does this deliverable close?"
        )
        recs.append(
            "Redesign process metrics to track constraint reduction, not artifact count."
        )
        recs.append(
            "Check for structural incentives that reward artifact production "
            "independent of resolution outcomes."
        )

    elif basin == "SCAPEGOAT_DISCHARGE":
        recs.append(
            "Do not treat personnel action as resolution. "
            "Identify and document the original unresolved constraint "
            "that preceded the discharge event."
        )
        recs.append(
            "Introduce systemic post-mortem: examine what constraints were "
            "unresolved and why integration failed."
        )

    else:  # UNCLASSIFIED
        recs.append(
            "Continue monitoring. Collect additional windows before classifying. "
            "No intervention indicated at this confidence level."
        )

    # Cross-cutting recommendations based on metric values
    if m.I > 0.7:
        recs.append(
            "CROSS-CUTTING: Integration Failure is high (I={:.2f}). "
            "Verify feedback loops are structurally intact regardless of basin.".format(m.I)
        )

    if m.O > 0.8:
        recs.append(
            "CROSS-CUTTING: Overconfidence is high (O={:.2f}). "
            "Require evidence citations for all high-certainty claims.".format(m.O)
        )

    return recs
