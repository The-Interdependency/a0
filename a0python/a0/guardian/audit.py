# 16:4 0:0 2:2
"""Guardian audit boundary — event-write enforcement.

Law 14: Missing required invariants fail closed.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from ..invariants import require_hmmm, InvalidStateError
from ..provenance import append_event


def audit_event(log_dir: Path, task_id: str, event: Dict[str, Any]) -> str:
    """Write an event through the Guardian audit boundary."""
    require_hmmm(event)
    _sentinel_preflight(event)
    event_hash = append_event(log_dir, task_id, event)
    _sentinel_postflight(event)
    return event_hash


def _sentinel_preflight(event: Dict[str, Any]) -> None:
    if "type" not in event:
        raise InvalidStateError("Event missing required 'type' field")


def _sentinel_postflight(event: Dict[str, Any]) -> None:
    pass
# 16:4 0:0 2:2
