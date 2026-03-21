"""The interdependent way.

The relational framework governing the PTCA architecture.
Author: Erin Spencer + AI council context.

The interdependent way holds:
- the architectural center (what the system IS)
- the core laws (what the system MUST do)
- the tier law (how state moves through the system)
- the bandit influence law (what advisory layers may and may not do)
- the hmmm invariant (the unresolved-constraint register)
"""
from .architecture import ARCHITECTURAL_CENTER, FROZEN_CORE_STATEMENT
from .laws import CORE_LAWS, TIER_LAW, BANDIT_INFLUENCE_LAW
from .hmmm import HMMM_INVARIANT

THE_INTERDEPENDENT_WAY = {
    "architectural_center": ARCHITECTURAL_CENTER,
    "frozen_core_statement": FROZEN_CORE_STATEMENT,
    "core_laws": CORE_LAWS,
    "tier_law": TIER_LAW,
    "bandit_influence_law": BANDIT_INFLUENCE_LAW,
    "hmmm_invariant": HMMM_INVARIANT,
}

__all__ = [
    "THE_INTERDEPENDENT_WAY",
    "ARCHITECTURAL_CENTER",
    "FROZEN_CORE_STATEMENT",
    "CORE_LAWS",
    "TIER_LAW",
    "BANDIT_INFLUENCE_LAW",
    "HMMM_INVARIANT",
]
