"""hmmm — the hard invariant.

Source: PTCA/PCTA/PCNA/Jury/Guardian Thread-Integrated Core Compression v1.3.2
"""

HMMM_INVARIANT = {
    "minimum_law": [
        "present even when empty",
        "never silently omitted",
        "functions as unresolved_constraint / review / exception register",
    ],
    "fail_closed_law": [
        "absence of hmmm is invalid state",
        "invalid state blocks event commit",
        "invalid state blocks outbound emission",
    ],
    "enforcement_boundary": [
        "event_write_enforcement at Guardian audit / provenance boundary",
        "output_enforcement at Guardian display / emission boundary",
    ],
}
