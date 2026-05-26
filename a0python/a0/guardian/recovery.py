# 26:4 0:0 0:0
"""Guardian recovery and quarantine shell.

Containment is preferred to collapse (Law 6).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List


class QuarantineReason(Enum):
    INVARIANT_VIOLATION = "invariant_violation"
    SENTINEL_FAILURE = "sentinel_failure"
    EXTERNAL_EFFECT_BLOCKED = "external_effect_blocked"
    TIER_PROMOTION_BLOCKED = "tier_promotion_blocked"
    CONFLICT_UNRESOLVED = "conflict_unresolved"


@dataclass
class QuarantineRecord:
    reason: QuarantineReason
    detail: str
    payload: Any = None


class RecoveryShell:
    """Recovery shell — containment is preferred to collapse."""

    def __init__(self) -> None:
        self._quarantine: List[QuarantineRecord] = []

    def quarantine(self, reason: QuarantineReason, detail: str, payload: Any = None) -> None:
        self._quarantine.append(QuarantineRecord(reason, detail, payload))

    def is_quarantined(self) -> bool:
        return len(self._quarantine) > 0

    def quarantine_log(self) -> List[QuarantineRecord]:
        return list(self._quarantine)

    def clear(self) -> None:
        self._quarantine.clear()
# 26:4 0:0 0:0
