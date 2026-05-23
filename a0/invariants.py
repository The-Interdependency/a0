# 15:6
from __future__ import annotations

from typing import Any


class InvalidStateError(Exception):
    """Raised when a required invariant is absent or violated."""


def require_hmmm(obj: Any) -> None:
    """Fail closed if hmmm is absent from an event dict or response object.

    Law: absence of hmmm is invalid state.
    Invalid state blocks event commit and outbound emission.
    """
    if isinstance(obj, dict):
        if "hmmm" not in obj:
            raise InvalidStateError(
                "hmmm is absent from event — invalid state blocks commit"
            )
    elif hasattr(obj, "hmmm"):
        # dataclass / object form: field must exist (it does if declared)
        pass
    else:
        raise InvalidStateError(
            "hmmm is absent from object — invalid state blocks emission"
        )
# 15:6
