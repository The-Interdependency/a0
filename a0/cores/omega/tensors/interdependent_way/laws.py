"""Core laws, tier law, and bandit influence law.

Source: PTCA/PCTA/PCNA/Jury/Guardian Thread-Integrated Core Compression v1.3.2
"""

CORE_LAWS = [
    (1,  "Private process is not public output."),
    (2,  "Transport is not display."),
    (3,  "Volatile state is not committed continuity."),
    (4,  "Persistence requires adjudication."),
    (5,  "Conflict must remain visible when unresolved."),
    (6,  "Containment is preferred to collapse."),
    (7,  "Health sensing does not require content access."),
    (8,  "Capability does not equal authority."),
    (9,  "Guardian alone owns human-readable outward emission."),
    (10, "Guardian alone owns CLI, UI, OS integration, and outward operational presentation."),
    (11, "Logs belong to event history, not continuity itself."),
    (12, "External execution requires approval beyond rendering capability."),
    (13, "Meta-13 chooses; advisory layers may influence salience but do not decide."),
    (14, "Missing required invariants fail closed."),
]

TIER_LAW = {
    "tier_1": {
        "name": "volatile",
        "path": "core <-> phonon",
        "properties": ["transient", "scratch", "cycle_local", "non_authoritative"],
        "requires_jury_mediation": False,
        "may_silently_become_tier_2": False,
        "carries_persistence_authority": False,
    },
    "tier_2": {
        "name": "commit",
        "path": "core -> jury -> memory",
        "properties": [
            "continuity_bearing",
            "persistent",
            "identity_relevant",
            "explicitly_committed",
        ],
        "writes_require_jury_mediation": True,
        "may_be_unilateral_by_core": False,
        "may_arise_from_silent_tier_1_promotion": False,
    },
}

BANDIT_INFLUENCE_LAW = {
    "bandits_do_not_choose": True,
    "meta_13_chooses": True,
    "bandit_may": [
        "modulate_exploration",
        "bias_salience",
        "weight_candidates",
        "reorder_candidates",
        "influence_probe_emphasis",
        "allocate_bounded_attention_under_uncertainty",
    ],
    "bandit_may_not": [
        "determine_truth",
        "make_final_selections",
        "authorize_tier_2_persistence",
        "override_jury",
        "override_meta_13",
        "override_guardian_sentinel_law",
        "erase_contested_state",
    ],
    "summary": "Bandits bias attention upstream. Meta-13 decides.",
}
