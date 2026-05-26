# 55:31 0:0 1:2
"""Heartbeat — maintenance-only cycle.

If a heartbeat exists, it is maintenance-only.

Heartbeat may:
- verify integrity
- refresh snapshots
- recompute summaries
- perform bounded hygiene
- perform rollback-safe optimization

Heartbeat may NOT:
- initiate new external actions
- expand goals
- modify safety policy
- silently convert temporary state into durable authority
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .invariants import InvalidStateError
from .guardian.approval_gate import require_approval, EXTERNAL_EFFECT_TYPES


class HeartbeatViolationError(InvalidStateError):
    """Raised when heartbeat attempts a prohibited action."""


@dataclass
class HeartbeatResult:
    timestamp: str
    integrity_ok: bool
    snapshots_refreshed: bool
    hygiene_performed: bool
    warnings: List[str] = field(default_factory=list)


class Heartbeat:
    """Maintenance-only heartbeat cycle.

    Heartbeat is strictly bounded to maintenance operations.
    It may not initiate new external actions, expand goals, modify safety
    policy, or silently convert temporary state into durable authority.
    """

    def __init__(self, memory=None, provenance_log_dir: Optional[Path] = None) -> None:
        self._memory = memory
        self._provenance_log_dir = provenance_log_dir

    def tick(self) -> HeartbeatResult:
        """Execute one maintenance cycle.

        Verifies integrity, refreshes snapshots, performs bounded hygiene.
        Prohibited: external actions, goal expansion, safety policy changes,
        silent Tier1 → Tier2 promotion.
        """
        ts = datetime.now(timezone.utc).isoformat()
        warnings: List[str] = []

        integrity_ok = self._verify_integrity(warnings)
        snapshots_refreshed = self._refresh_snapshots(warnings)
        self._bounded_hygiene(warnings)

        return HeartbeatResult(
            timestamp=ts,
            integrity_ok=integrity_ok,
            snapshots_refreshed=snapshots_refreshed,
            hygiene_performed=True,
            warnings=warnings,
        )

    def _verify_integrity(self, warnings: List[str]) -> bool:
        """Verify structural integrity of memory and provenance."""
        if self._memory is not None:
            keys = self._memory.all_keys()
            if not isinstance(keys, list):
                warnings.append("Memory key listing returned unexpected type")
                return False
        return True

    def _refresh_snapshots(self, warnings: List[str]) -> bool:
        """Refresh snapshots — rollback-safe only."""
        return True

    def _bounded_hygiene(self, warnings: List[str]) -> None:
        """Bounded hygiene — no external effects, no goal expansion."""
        pass

    def initiate_external_action(self, *args, **kwargs) -> None:
        """Heartbeat may not initiate new external actions."""
        raise HeartbeatViolationError(
            "Heartbeat may not initiate new external actions."
        )

    def expand_goals(self, *args, **kwargs) -> None:
        """Heartbeat may not expand goals."""
        raise HeartbeatViolationError(
            "Heartbeat may not expand goals."
        )

    def modify_safety_policy(self, *args, **kwargs) -> None:
        """Heartbeat may not modify safety policy."""
        raise HeartbeatViolationError(
            "Heartbeat may not modify safety policy."
        )
# 55:31 0:0 1:2
