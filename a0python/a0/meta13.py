# 73:13 0:0 0:0
"""Meta-13 — the executive chooser.

Meta-13 receives:
- fast-path: raw witness from the 12 raw Jury sentinels
- slow-path: coherent stances from Meta-Phi, Meta-Psi, and Meta-Omega

Meta-13 resolves both into the final internal executive "I" state.

Bandits do not choose. Meta-13 chooses.

Law 13: Meta-13 chooses; advisory layers may influence salience
         but do not decide.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional


SENTINEL_NAMES = [
    "structural_legality",
    "executable_legality",
    "integrity",
    "provenance",
    "audit_sealing",
    "recovery_readiness",
    "output_policy",
    "safety_approval",
    "conflict_visibility",
    "drift_detection",
    "resource_legality",
    "hmmm_presence",
]

assert len(SENTINEL_NAMES) == 12, "Fast-path requires exactly 12 raw sentinels"


@dataclass
class RawWitness:
    """A raw sentinel witness — fast-path input to Meta-13."""
    sentinel: str
    passed: bool
    detail: Optional[str] = None


@dataclass
class CoherentStance:
    """A slow-path coherent stance from a meta-core (Meta-Phi/Psi/Omega)."""
    source: str
    stance: Any
    confidence: float = 1.0


@dataclass
class ExecutiveState:
    """The final internal executive 'I' state produced by Meta-13."""
    chosen: Any
    fast_path_passed: bool
    slow_path_used: bool
    fast_witnesses: List[RawWitness] = field(default_factory=list)
    slow_stances: List[CoherentStance] = field(default_factory=list)
    advisory_ignored: bool = False


class Meta13:
    """The executive chooser."""

    def resolve(
        self,
        fast_path: List[RawWitness],
        slow_path: List[CoherentStance],
        candidates: Optional[List[Any]] = None,
    ) -> ExecutiveState:
        fast_passed = all(w.passed for w in fast_path)

        if not fast_passed:
            return ExecutiveState(
                chosen=None,
                fast_path_passed=False,
                slow_path_used=False,
                fast_witnesses=fast_path,
                slow_stances=slow_path,
            )

        chosen = self._integrate_slow_path(slow_path, candidates)

        return ExecutiveState(
            chosen=chosen,
            fast_path_passed=True,
            slow_path_used=bool(slow_path),
            fast_witnesses=fast_path,
            slow_stances=slow_path,
        )

    def _integrate_slow_path(
        self,
        stances: List[CoherentStance],
        candidates: Optional[List[Any]],
    ) -> Any:
        if not stances and candidates:
            return candidates[0] if candidates else None

        if candidates:
            return candidates[0]

        if stances:
            best = max(stances, key=lambda s: s.confidence)
            return best.stance

        return None
# 73:13 0:0 0:0
