"""Glossary — canonical term definitions across the system."""

GLOSSARY = {
    # PTCA terms
    "hmmm": (
        "Unresolved-constraint / review / exception register. "
        "Hard invariant — must be present on every event and response. "
        "Absence is invalid state."
    ),
    "tier_1": (
        "Volatile. Transient, scratch, cycle-local. "
        "No persistence authority. Core ↔ Phonon only."
    ),
    "tier_2": (
        "Committed continuity. Persistent, identity-relevant. "
        "Requires Jury mediation. Core → Jury → Memory."
    ),
    "jury_token": (
        "A credential issued by Jury after successful adjudication. "
        "Required for any Tier 2 write to Memory."
    ),
    "phonon": (
        "Internal transport-only resonance field. "
        "Carries adjacency, phase, spin. Not display. Not audit content."
    ),
    "guardian": (
        "The complete microkernel operating shell. "
        "Sole outward human-readable emitter. "
        "Owns CLI, UI, OS integration, audit boundary, recovery, quarantine."
    ),
    "meta_13": (
        "The executive chooser. Receives fast-path (12 sentinel witnesses) "
        "and slow-path (Meta-Phi, Meta-Psi, Meta-Omega stances). "
        "Produces the final internal executive 'I' state. "
        "Bandits do not choose. Meta-13 chooses."
    ),
    "bandit": (
        "Bounded advisory salience machinery. "
        "May modulate exploration and bias candidates. "
        "May not make final selections or authorize Tier 2 persistence."
    ),
    "provenance": (
        "Hash-chain event history. events.jsonl is event truth after seal. "
        "provenance.json carries hash-chain / version material."
    ),
    # EDCM terms
    "dissonance": (
        "Unresolved constraint mismatch. Not a feeling. "
        "Observable in behavioral outputs, not inferred from internal states."
    ),
    "constraint_strain": (
        "C metric [0,1]. Weighted contradiction density across signal types."
    ),
    "basin": (
        "A stable attractor configuration in EDCM state space. "
        "A diagnostic label, not a judgment."
    ),
}
