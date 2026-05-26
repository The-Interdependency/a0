# 63:36 0:0 0:0
"""Jury — legality and conflict-preservation adjudication layer.

Jury:
- mediates continuity-bearing persistence
- preserves unresolved conflict as conflict
- prevents silent promotion from volatile state into committed state
- establishes operative standards where definitions are absent or contested

Law 4: Persistence requires adjudication.
Law 5: Conflict must remain visible when unresolved.
Law 3: Volatile state is not committed continuity.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class AdjudicationVerdict(Enum):
    COMMITTED = "committed"
    CONFLICT = "conflict"
    BLOCKED = "blocked"


@dataclass
class ConflictRecord:
    """An unresolved conflict preserved by Jury.

    Law 5: Conflict must remain visible when unresolved.
    Conflicts are never silently merged or discarded.
    """
    conflict_id: str
    event_a: Any
    event_b: Any
    reason: str


@dataclass
class AdjudicationResult:
    verdict: AdjudicationVerdict
    jury_token: Optional[str]
    conflict: Optional[ConflictRecord] = None
    reason: Optional[str] = None


class Jury:
    """The legality and conflict-preservation adjudication layer.

    Tier 2 writes require a Jury token.
    Jury does not silently promote Tier 1 volatiles to Tier 2.
    Conflicts are preserved as conflicts until resolved.
    """

    def __init__(self) -> None:
        self._conflicts: List[ConflictRecord] = []
        self._committed: List[str] = []

    def adjudicate(self, event: Any, prior: Optional[Any] = None) -> AdjudicationResult:
        """Adjudicate an event for Tier 2 commitment.

        If a conflict is detected against `prior`, the conflict is preserved
        (not silently merged) and a CONFLICT verdict is returned.

        A committed event receives a unique jury_token required for Tier2 creation.
        """
        if self._is_conflict(event, prior):
            conflict_id = f"conflict_{uuid.uuid4().hex[:8]}"
            record = ConflictRecord(
                conflict_id=conflict_id,
                event_a=prior,
                event_b=event,
                reason="conflicting state detected",
            )
            self._conflicts.append(record)
            return AdjudicationResult(
                verdict=AdjudicationVerdict.CONFLICT,
                jury_token=None,
                conflict=record,
                reason="Conflict preserved — unresolved conflict may not be silently promoted.",
            )

        jury_token = f"jury_{uuid.uuid4().hex}"
        self._committed.append(jury_token)
        return AdjudicationResult(
            verdict=AdjudicationVerdict.COMMITTED,
            jury_token=jury_token,
        )

    def _is_conflict(self, event: Any, prior: Optional[Any]) -> bool:
        """Detect conflict between event and prior state.

        Extendable — default checks for explicit conflict markers.
        """
        if prior is None:
            return False
        if isinstance(event, dict) and isinstance(prior, dict):
            return event.get("_conflict_with") == id(prior)
        return False

    def unresolved_conflicts(self) -> List[ConflictRecord]:
        """Return all unresolved conflicts.

        Law 5: Conflict must remain visible when unresolved.
        """
        return list(self._conflicts)

    def resolve_conflict(self, conflict_id: str) -> bool:
        """Mark a conflict as resolved and remove it from the unresolved list.

        Returns True if found and resolved, False if not found.
        """
        before = len(self._conflicts)
        self._conflicts = [c for c in self._conflicts if c.conflict_id != conflict_id]
        return len(self._conflicts) < before

    def establish_standard(self, domain: str, standard: Dict[str, Any]) -> str:
        """Establish an operative standard where definitions are absent or contested.

        Returns a jury token for the standard.
        """
        jury_token = f"jury_std_{uuid.uuid4().hex}"
        self._committed.append(jury_token)
        return jury_token
# 63:36 0:0 0:0
