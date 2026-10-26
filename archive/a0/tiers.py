# 29:20 0:0 2:1
"""Tier system — volatile vs. committed continuity.

Tier 1 (Volatile): Core ↔ Phonon
- transient, scratch, cycle-local, non-authoritative
- requires no Jury mediation
- may NOT silently become Tier 2
- does not carry persistence authority

Tier 2 (Commit): Core → Jury → Memory
- continuity-bearing, persistent, identity-relevant, explicitly committed
- requires Jury mediation
- may not be unilaterally performed by a core
- may not arise from silent promotion of Tier 1

Law 3: Volatile state is not committed continuity.
Law 4: Persistence requires adjudication.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from .invariants import InvalidStateError


class TierLevel(Enum):
    VOLATILE = 1
    COMMIT = 2


@dataclass
class Tier1:
    """Volatile — transient, scratch, cycle-local, non-authoritative."""
    content: Any
    level: TierLevel = field(default=TierLevel.VOLATILE, init=False)

    def promote(self) -> None:
        """Silent promotion from Tier1 to Tier2 is forbidden.

        Promotion requires Jury mediation — call Jury.adjudicate() instead.
        """
        raise InvalidStateError(
            "Silent promotion from Tier 1 (volatile) to Tier 2 (commit) is forbidden. "
            "Tier 2 writes require Jury mediation."
        )


@dataclass
class Tier2:
    """Committed continuity — persistent, identity-relevant, adjudicated."""
    content: Any
    jury_token: str
    level: TierLevel = field(default=TierLevel.COMMIT, init=False)

    @classmethod
    def from_jury(cls, content: Any, jury_token: str) -> "Tier2":
        """Create a Tier2 object only via a Jury-issued token."""
        if not jury_token:
            raise InvalidStateError(
                "Tier 2 write requires a Jury token — cannot commit without adjudication."
            )
        return cls(content=content, jury_token=jury_token)
# 29:20 0:0 2:1
