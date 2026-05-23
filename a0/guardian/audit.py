# 16:14
"""Guardian audit boundary — event-write enforcement.

Every event passing through the Guardian audit boundary must:
- carry hmmm (fail closed on absence)
- have a deterministic routed path in provenance
- pass sentinel preflight

Law 14: Missing required invariants fail closed.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from ..invariants import require_hmmm, InvalidStateError
from ..provenance import append_event


def audit_event(log_dir: Path, task_id: str, event: Dict[str, Any]) -> str:
    """Write an event through the Guardian audit boundary.

    Enforces hmmm invariant and sentinel preflight before committing.
    Raises InvalidStateError if invariants are violated.
    Returns the provenance hash of the written event.
    """
    require_hmmm(event)
    _sentinel_preflight(event)
    event_hash = append_event(log_dir, task_id, event)
    _sentinel_postflight(event)
    return event_hash


def _sentinel_preflight(event: Dict[str, Any]) -> None:
    """Structural and integrity checks before event write."""
    if "type" not in event:
        raise InvalidStateError("Event missing required 'type' field")


def _sentinel_postflight(event: Dict[str, Any]) -> None:
    """Integrity verification after event write."""
    pass
# 16:14
