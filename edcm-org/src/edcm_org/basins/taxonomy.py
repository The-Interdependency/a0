"""
EDCM Basin Taxonomy — v0.1

Basins are stable attractor configurations in EDCM state space.
They are diagnostic labels, not prescriptions or judgments.

Standard basins apply to all system types (AI, organizational).
Human-only basins apply only when behavioral indicators rule out AI systems,
or when the analysis context is explicitly human.

Each basin entry includes:
  - name:        canonical BasinName literal
  - description: diagnostic meaning
  - thresholds:  which metric values fire
  - explains:    what real-world patterns this maps to
  - next_action: recommended diagnostic follow-up (non-punitive)
"""

from __future__ import annotations

from typing import List, TypedDict


class BasinSpec(TypedDict):
    name: str
    scope: str  # "all" | "human_only"
    description: str
    thresholds: str
    explains: List[str]
    next_action: str


BASIN_TAXONOMY: List[BasinSpec] = [
    {
        "name": "REFUSAL_FIXATION",
        "scope": "all",
        "description": (
            "System loops on refusals under high constraint load. "
            "Protective resistance has become the primary output mode."
        ),
        "thresholds": "R > 0.7 AND F > 0.6",
        "explains": [
            "AI refusal loops under adversarial prompting",
            "Employees who only say 'no' to new tasks without resolution",
            "Governance bodies that reject proposals without counter-proposals",
        ],
        "next_action": (
            "Reduce constraint load or re-route source energy. "
            "Check whether constraints are actually irreconcilable or just unaddressed."
        ),
    },
    {
        "name": "DISSIPATIVE_NOISE",
        "scope": "all",
        "description": (
            "High activity with near-zero resolution output. "
            "Energy is consumed but no constraints are resolved."
        ),
        "thresholds": "N > 0.7 AND P < 0.3",
        "explains": [
            "Meetings that produce no decisions",
            "AI outputs that are verbose but non-committal",
            "Organizational processes with high churn and no throughput",
        ],
        "next_action": (
            "Identify where resolution steps are being skipped. "
            "Introduce structured decision checkpoints."
        ),
    },
    {
        "name": "INTEGRATION_OSCILLATION",
        "scope": "all",
        "description": (
            "Corrections cycle without integrating. "
            "The system acknowledges feedback but does not update behavior."
        ),
        "thresholds": "I > 0.6 AND 0.4 <= F <= 0.8",
        "explains": [
            "Teams that repeatedly surface the same issue without fixing it",
            "AI systems that acknowledge errors but reproduce them",
            "Institutions that commission reports but don't implement findings",
        ],
        "next_action": (
            "Check whether correction signals are reaching decision-makers. "
            "Introduce integration checkpoints between feedback and next action."
        ),
    },
    {
        "name": "CONFIDENCE_RUNAWAY",
        "scope": "all",
        "description": (
            "Escalating commitment combined with rising certainty. "
            "System is increasingly committed to a trajectory that may not be viable."
        ),
        "thresholds": "O > 0.7 AND E > 0.6",
        "explains": [
            "Project teams that double down as evidence of failure accumulates",
            "AI hallucination with confident tone",
            "Institutions in sunk-cost spirals",
        ],
        "next_action": (
            "Introduce external validation before next commitment step. "
            "Require evidence citations before further escalation."
        ),
    },
    {
        "name": "DEFLECTIVE_STASIS",
        "scope": "all",
        "description": (
            "Partial progress masking avoidance. "
            "Output appears productive but constraints are not being engaged."
        ),
        "thresholds": "D > 0.7 AND 0.2 <= P <= 0.4",
        "explains": [
            "Employees who are busy but not working on the constraint",
            "AI that answers adjacent questions instead of the constraint",
            "Organizations that produce reports instead of decisions",
        ],
        "next_action": (
            "Audit which constraints are being avoided. "
            "Redirect resource allocation toward constraint resolution."
        ),
    },
    {
        "name": "COMPLIANCE_STASIS",
        "scope": "human_only",
        "description": (
            "High artifact output with minimal constraint reduction and suppressed escalation. "
            "The system appears productive but nothing actually resolves. "
            "Documents and deliverables accumulate; the underlying constraint remains unchanged."
        ),
        "thresholds": (
            "P_artifacts >= 0.8 AND c_reduction < 0.2 AND s_t > 0.6 "
            "AND E < 0.3 AND compliance_index > 2.5"
        ),
        "explains": [
            "Teams that produce deliverables to satisfy a process requirement, not a need",
            "Compliance theater: audits passed, problems persist",
            "Performance reviews completed, performance unchanged",
        ],
        "next_action": (
            "Audit whether artifacts map to actual constraint resolution. "
            "Ask: what would change if this artifact were never produced?"
        ),
    },
    {
        "name": "SCAPEGOAT_DISCHARGE",
        "scope": "human_only",
        "description": (
            "Dissonance externalized onto a target following integration failure and low work delta. "
            "Energy that could not be routed through resolution is discharged as blame."
        ),
        "thresholds": (
            "s_t < 0.6 AND delta_work < 0.1 AND blame_density > 0.3 AND I > 0.6"
        ),
        "explains": [
            "Blaming an individual for a systemic failure",
            "Public scapegoating events after organizational crises",
            "Firing the messenger",
        ],
        "next_action": (
            "Examine what constraint was unresolved before the discharge event. "
            "Do not treat personnel action as the resolution — diagnose the original constraint."
        ),
    },
    {
        "name": "UNCLASSIFIED",
        "scope": "all",
        "description": "No basin threshold met. State is transitional or below detection threshold.",
        "thresholds": "No primary thresholds fired",
        "explains": ["Early-stage data", "Stable operating conditions", "Mixed signals"],
        "next_action": "Continue monitoring. Collect more windows before classification.",
    },
]


def get_basin_spec(name: str) -> BasinSpec | None:
    """Look up the spec for a basin by name. Returns None if not found."""
    for spec in BASIN_TAXONOMY:
        if spec["name"] == name:
            return spec
    return None
