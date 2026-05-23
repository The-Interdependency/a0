# 25:10
"""Guardian emitter — the sole outward human-readable emitter.

Law 9: Guardian alone owns human-readable outward emission.
Law 10: Guardian alone owns CLI, UI, OS integration, and outward operational presentation.

No component outside Guardian may write human-readable output directly.
"""
from __future__ import annotations

import json
import sys
from typing import Any

from ..invariants import require_hmmm


def emit(obj: Any, *, stream=None) -> None:
    """Emit a response object as JSON to the output stream.

    Enforces hmmm invariant before emission — fail closed.
    """
    require_hmmm(obj)
    if stream is None:
        stream = sys.stdout
    if hasattr(obj, "__dict__"):
        payload = obj.__dict__
    else:
        payload = obj
    stream.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    stream.flush()


def emit_warning(message: str, *, stream=None) -> None:
    """Emit a Guardian-domain warning to stderr."""
    if stream is None:
        stream = sys.stderr
    stream.write(f"[GUARDIAN WARNING] {message}\n")
    stream.flush()


def emit_error(message: str, *, stream=None) -> None:
    """Emit a Guardian-domain error to stderr."""
    if stream is None:
        stream = sys.stderr
    stream.write(f"[GUARDIAN ERROR] {message}\n")
    stream.flush()
# 25:10
