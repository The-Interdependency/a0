# 18:6
"""Omega tensors — the interdependent way and supporting material.

    interdependent_way/   — architectural framework, design philosophy,
                            relational model, and 14 core laws
    supporting/           — specs, glossary, principles, examples
"""
from .interdependent_way.architecture import ARCHITECTURAL_CENTER, FROZEN_CORE_STATEMENT
from .interdependent_way.laws import CORE_LAWS, TIER_LAW, BANDIT_INFLUENCE_LAW
from .interdependent_way.hmmm import HMMM_INVARIANT

__all__ = [
    "ARCHITECTURAL_CENTER",
    "FROZEN_CORE_STATEMENT",
    "CORE_LAWS",
    "TIER_LAW",
    "BANDIT_INFLUENCE_LAW",
    "HMMM_INVARIANT",
]

# The primary export name used in verification
THE_INTERDEPENDENT_WAY = {
    "architecture": ARCHITECTURAL_CENTER,
    "laws": CORE_LAWS,
    "tier_law": TIER_LAW,
    "bandit_influence_law": BANDIT_INFLUENCE_LAW,
    "hmmm_invariant": HMMM_INVARIANT,
}
# 18:6
