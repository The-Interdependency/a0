"""Spec catalog — canonical reference specifications.

Each entry names a specification, its version, and its scope.
Omega uses this to orient synthesis across layers.
"""

SPECS = {
    "ptca": {
        "name": "PTCA/PCTA/PCNA/Jury/Guardian Thread-Integrated Core Compression",
        "version": "1.3.2",
        "scope": "core_architecture",
        "author": "Erin Spencer + AI council context",
        "layers": [
            "phi", "psi", "omega", "phonon",
            "jury", "memory", "meta_13", "guardian",
        ],
    },
    "edcm": {
        "name": "Energy-Dissonance Circuit Model",
        "version": "edcm-org-v0.1.0",
        "scope": "organizational_diagnostics",
        "metrics": ["C", "R", "F", "E", "D", "N", "I", "O", "L", "P"],
        "basins": [
            "REFUSAL_FIXATION",
            "DISSIPATIVE_NOISE",
            "INTEGRATION_OSCILLATION",
            "CONFIDENCE_RUNAWAY",
            "DEFLECTIVE_STASIS",
            "COMPLIANCE_STASIS",
            "SCAPEGOAT_DISCHARGE",
            "UNCLASSIFIED",
        ],
    },
    "a0": {
        "name": "a0 Routing and Adapter Framework",
        "version": "0.1.0",
        "scope": "semantic_routing_layer",
        "resides_in": "psi_tensors",
    },
}
