"""
Typed state and output envelope for EDCM-Org v0.1.

All fields are spec-defined. Do not add fields without a spec amendment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Literal, Optional

BasinName = Literal[
    "REFUSAL_FIXATION",
    "DISSIPATIVE_NOISE",
    "INTEGRATION_OSCILLATION",
    "CONFIDENCE_RUNAWAY",
    "DEFLECTIVE_STASIS",
    "COMPLIANCE_STASIS",
    "SCAPEGOAT_DISCHARGE",
    "UNCLASSIFIED",
]

AggregationLevel = Literal["department", "team", "organization"]


@dataclass
class Metrics:
    """
    Primary EDCM metrics. All ranges validated at output time.

    C: Constraint Strain         [0, 1]
    R: Refusal Density           [0, 1]
    F: Fixation                  [0, 1]
    E: Escalation                [0, 1]
    D: Deflection                [0, 1]
    N: Noise                     [0, 1]
    I: Integration Failure       [0, 1]
    O: Overconfidence            [-1, 1]
    L: Coherence Loss            [0, 1]
    P: Progress                  [0, 1]
    """

    C: float  # constraint strain
    R: float  # refusal density
    F: float  # fixation
    E: float  # escalation
    D: float  # deflection
    N: float  # noise
    I: float  # integration failure
    O: float  # overconfidence [-1, 1]
    L: float  # coherence loss
    P: float  # progress

    # Optional Progress sub-components (auditable)
    P_decisions: float = 0.0
    P_commitments: float = 0.0
    P_artifacts: float = 0.0
    P_followthrough: float = 0.0

    # Per-primary confidence scores (0..1); secondary modifiers are capped per spec
    conf: Dict[str, float] = field(default_factory=dict)


@dataclass
class Params:
    """
    Estimated system parameters.

    alpha:      Persistence — estimated from unresolved constraint half-life regression.
    delta_max:  Complexity-bounded throughput — P90(median(resolution_rate | complexity_bucket)).
    complexity: Complexity bucket value for the current window.
    """

    alpha: float
    delta_max: float
    complexity: float


@dataclass
class OutputEnvelope:
    """
    Canonical EDCM output. Every output MUST include all fields.
    Validated before serialization.
    """

    spec_version: str
    org: str
    window_id: str
    aggregation: AggregationLevel
    metrics: Metrics
    params: Params
    basin: BasinName
    basin_confidence: float
    gaming_alerts: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def validate(self) -> List[str]:
        """
        Returns a list of validation errors. Empty list means valid.
        """
        errors: List[str] = []
        m = self.metrics

        def chk(name: str, val: float, lo: float, hi: float) -> None:
            if not (lo <= val <= hi):
                errors.append(f"Metric {name}={val:.4f} out of range [{lo}, {hi}]")

        chk("C", m.C, 0.0, 1.0)
        chk("R", m.R, 0.0, 1.0)
        chk("F", m.F, 0.0, 1.0)
        chk("E", m.E, 0.0, 1.0)
        chk("D", m.D, 0.0, 1.0)
        chk("N", m.N, 0.0, 1.0)
        chk("I", m.I, 0.0, 1.0)
        chk("O", m.O, -1.0, 1.0)
        chk("L", m.L, 0.0, 1.0)
        chk("P", m.P, 0.0, 1.0)

        if self.aggregation == "individual":
            errors.append("aggregation='individual' is prohibited by spec v0.1")

        if self.spec_version != "edcm-org-v0.1.0":
            errors.append(f"Unknown spec_version: {self.spec_version!r}")

        return errors
