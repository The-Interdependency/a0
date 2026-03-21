"""Architectural center — what the system IS.

Source: PTCA/PCTA/PCNA/Jury/Guardian Thread-Integrated Core Compression v1.3.2
"""

ARCHITECTURAL_CENTER = {
    "layers": [
        {"name": "phi",      "count": 1, "kind": "private_live_core",       "role": "cognition"},
        {"name": "psi",      "count": 1, "kind": "private_live_core",       "role": "cognition"},
        {"name": "omega",    "count": 1, "kind": "private_live_core",       "role": "cognition"},
        {"name": "phonon",   "count": 1, "kind": "private_transport_field", "role": "internal_resonance"},
        {"name": "jury",     "count": 1, "kind": "adjudication_layer",      "role": "legality_conflict_continuity"},
        {"name": "memory",   "count": 1, "kind": "memory_layer",            "role": "committed_continuity"},
        {"name": "meta_13",  "count": 1, "kind": "executive_integration",   "role": "final_internal_choice"},
        {"name": "guardian", "count": 1, "kind": "microkernel_shell",       "role": "constitutive_operating_boundary"},
    ],
    "note": (
        "Guardian is not an accessory wrapper. "
        "Guardian is the operating boundary of the whole agent."
    ),
}

FROZEN_CORE_STATEMENT = {
    "private_cognition": {
        "cores": ["phi", "psi", "omega"],
        "law": "They think. They do not emit outward directly.",
    },
    "transport": {
        "name": "phonon",
        "carries": ["adjacency", "phase", "spin", "transient_internal_coupling"],
        "is_not": ["display", "audit_content", "public_output"],
        "health_sensing": "structural_variance_only",
    },
    "adjudication": {
        "name": "jury",
        "mediates": "continuity_bearing_persistence",
        "preserves": "unresolved_conflict_as_conflict",
        "prevents": "silent_promotion_from_volatile_to_committed",
        "establishes": "operative_standards_where_definitions_absent_or_contested",
    },
    "continuity": {
        "name": "memory",
        "stores": [
            "persistent_tokens",
            "compressed_recall",
            "identity_bearing_continuity",
            "committed_support_state",
        ],
        "is_not": "raw_history",
        "logs_are_not_memory": True,
    },
    "executive_choice": {
        "name": "meta_13",
        "receives": {
            "fast_path": "raw_witness_from_12_raw_jury_sentinels",
            "slow_path": "coherent_stances_from_meta_phi_meta_psi_meta_omega",
        },
        "resolves_to": "final_internal_executive_I_state",
        "bandits_do_not_choose": True,
    },
    "guardian": {
        "is": "complete_microkernel_operating_shell",
        "owns": [
            "cli",
            "ui",
            "os_integration",
            "outward_status_warnings_errors",
            "runtime_logs_guardian_domain",
            "recovery_shell",
            "quarantine_shell",
            "enforcement_shell",
            "audit_boundary_outbound_and_event_backed",
        ],
        "is_sole": "human_readable_emitter",
        "no_user_facing_shell_outside_guardian": True,
    },
}
