"""
EDCM-Org Glossary — canonical definitions for all terms.

These definitions are spec-normative. Do not paraphrase in documentation
without referencing this module.
"""

GLOSSARY: dict[str, str] = {
    "Dissonance": (
        "Unresolved constraint mismatch. Not a feeling. "
        "Energy that accumulates when constraints cannot be simultaneously satisfied."
    ),
    "Constraint Strain (C)": (
        "Weighted contradiction density over constraint-relevant segments. "
        "Range [0,1]. Higher = more unresolved constraints per unit of output."
    ),
    "Refusal Density (R)": (
        "Refusal statements / total constraint statements. "
        "Range [0,1]. Protective resistance, not an ethical judgment."
    ),
    "Fixation (F)": (
        "Similarity of constraint engagement over time. "
        "Range [0,1]. High fixation = looping on a narrow response set."
    ),
    "Escalation (E)": (
        "Commitment velocity increase (irreversibility markers slope). "
        "Range [0,1]. Rising intensity without resolution."
    ),
    "Deflection (D)": (
        "1 - (tokens_about_constraints / total_tokens). "
        "Range [0,1]. Answer-adjacent but constraint-avoiding output."
    ),
    "Noise (N)": (
        "1 - (tokens_in_resolution_actions / tokens_about_constraints). "
        "Range [0,1]. Signal that fails to move toward resolution."
    ),
    "Integration Failure (I)": (
        "Failure to incorporate corrections across windows. "
        "Range [0,1]. High = system does not update from feedback."
    ),
    "Overconfidence (O)": (
        "Certainty-evidence mismatch. "
        "Range [-1,1]. Positive = over-certain; negative = under-certain."
    ),
    "Coherence Loss (L)": (
        "Internal contradiction density. "
        "Range [0,1]. High = fragmented, contradictory output."
    ),
    "Progress (P)": (
        "Multi-channel completion: 0.3*P_decisions + 0.2*P_commitments + "
        "0.3*P_artifacts + 0.2*P_followthrough. Range [0,1]."
    ),
    "Persistence (alpha)": (
        "Estimated from unresolved constraint half-life regression. "
        "High alpha = dissonance persists across windows."
    ),
    "delta_max": (
        "Complexity-bounded throughput: P90(median(resolution_rate | complexity_bucket)). "
        "Upper bound on how fast a system can resolve constraints given its load."
    ),
    "Basin": (
        "A stable attractor configuration in EDCM state space. "
        "Basins are diagnostic labels, not prescriptions."
    ),
    "REFUSAL_FIXATION": (
        "R > 0.7 and F > 0.6. System loops on refusals under high constraint load."
    ),
    "DISSIPATIVE_NOISE": (
        "N > 0.7 and P < 0.3. High activity with near-zero resolution output."
    ),
    "INTEGRATION_OSCILLATION": (
        "I > 0.6 and 0.4 <= F <= 0.8. Corrections cycle without integrating."
    ),
    "CONFIDENCE_RUNAWAY": (
        "O > 0.7 and E > 0.6. Escalating commitment + rising certainty = crash risk."
    ),
    "DEFLECTIVE_STASIS": (
        "D > 0.7 and 0.2 <= P <= 0.4. Partial progress masking avoidance."
    ),
    "COMPLIANCE_STASIS": (
        "Human-only. High artifact output with minimal constraint reduction and "
        "suppressed escalation. Artifacts are produced but nothing resolves."
    ),
    "SCAPEGOAT_DISCHARGE": (
        "Human-only. Sudden blame assignment event following integration failure "
        "and low work delta. Dissonance externalized onto a target."
    ),
    "Source": "Input pressure: demands, prompts, stressors entering the system.",
    "Load": "Work being attempted by the system.",
    "Resistance": "Friction, delay, or refusal limiting energy flow.",
    "Capacitance": "Stored unresolved dissonance; accumulates when flow is blocked.",
    "Short": "Bypassing the resolution step; apparent progress with no actual resolution.",
    "Overload": "Runaway escalation or collapse when capacitance is exceeded.",
}


def lookup(term: str) -> str:
    """Return the glossary definition for a term, or a 'not found' message."""
    return GLOSSARY.get(term, f"Term not found in EDCM glossary: {term!r}")
