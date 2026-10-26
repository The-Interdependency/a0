# 28:19 0:0 6:0
"""Base class for private cognitive cores.

Private cores:
- think, do not emit outward directly
- may not write to Guardian emitter directly
- may not write to Tier 2 without Jury adjudication
- health sensing observes structural variance only, not content

Law 1: Private process is not public output.
Law 7: Health sensing does not require content access.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class CoreHealthSignal:
    """Structural health information only — no content.

    Law 7: Health sensing does not require content access.
    Health sensing may observe structural variance only.
    """
    core_name: str
    cycle_count: int
    is_active: bool
    structural_variance: float


class PrivateCore:
    """Base for private cognitive cores.

    Cores think privately. They do not emit outward directly.
    Output must be routed through Guardian.
    """

    name: str = "base"

    def __init__(self) -> None:
        self._cycle_count = 0
        self._last_result: Optional[Any] = None

    def think(self, stimulus: Any) -> Any:
        """Process stimulus privately. Result is internal only."""
        self._cycle_count += 1
        result = self._process(stimulus)
        self._last_result = result
        return result

    def _process(self, stimulus: Any) -> Any:
        raise NotImplementedError

    def health(self) -> CoreHealthSignal:
        """Return structural health signal — no content exposed."""
        return CoreHealthSignal(
            core_name=self.name,
            cycle_count=self._cycle_count,
            is_active=True,
            structural_variance=0.0,
        )
# 28:19 0:0 6:0
