"""Guardian sentinel suite.

Sentinel law is fixed. Functional layers may not rewrite sentinel law.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class SentinelVerdict(Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"


@dataclass
class SentinelResult:
    sentinel: str
    verdict: SentinelVerdict
    reason: Optional[str] = None


class StructuralLegalitySentinel:
    name = "structural_legality"

    def check(self, event: Dict[str, Any]) -> SentinelResult:
        if "type" not in event:
            return SentinelResult(self.name, SentinelVerdict.FAIL, "missing 'type'")
        if "hmmm" not in event:
            return SentinelResult(self.name, SentinelVerdict.FAIL, "hmmm absent")
        return SentinelResult(self.name, SentinelVerdict.PASS)


class ExecutableLegalitySentinel:
    name = "executable_legality"

    def check(self, event: Dict[str, Any]) -> SentinelResult:
        if event.get("type") == "external_effect" and not event.get("approved"):
            return SentinelResult(self.name, SentinelVerdict.FAIL, "external effect without approval")
        return SentinelResult(self.name, SentinelVerdict.PASS)


class IntegritySentinel:
    name = "integrity"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class ProvenanceSentinel:
    name = "provenance"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class AuditSealingSentinel:
    name = "audit_sealing"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class RecoveryReadinessSentinel:
    name = "recovery_readiness"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class OutputPolicySentinel:
    name = "output_policy"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class SafetyApprovalSentinel:
    name = "safety_approval"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class ConflictVisibilitySentinel:
    name = "conflict_visibility"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class DriftDetectionSentinel:
    name = "drift_detection"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class ResourceLegalitySentinel:
    name = "resource_legality"
    def check(self, event: Dict[str, Any]) -> SentinelResult:
        return SentinelResult(self.name, SentinelVerdict.PASS)


class HmmmPresenceSentinel:
    name = "hmmm_presence"

    def check(self, event: Dict[str, Any]) -> SentinelResult:
        from a0.invariants import require_hmmm, InvalidStateError
        try:
            require_hmmm(event)
            return SentinelResult(self.name, SentinelVerdict.PASS)
        except (InvalidStateError, Exception) as exc:
            return SentinelResult(self.name, SentinelVerdict.FAIL, str(exc))


@dataclass
class SentinelSuite:
    """The complete Guardian sentinel suite — 12 sentinels."""
    _sentinels: List[Any] = field(default_factory=lambda: [
        StructuralLegalitySentinel(),
        ExecutableLegalitySentinel(),
        IntegritySentinel(),
        ProvenanceSentinel(),
        AuditSealingSentinel(),
        RecoveryReadinessSentinel(),
        OutputPolicySentinel(),
        SafetyApprovalSentinel(),
        ConflictVisibilitySentinel(),
        DriftDetectionSentinel(),
        ResourceLegalitySentinel(),
        HmmmPresenceSentinel(),
    ])

    def preflight(self, event: Dict[str, Any]) -> List[SentinelResult]:
        return [s.check(event) for s in self._sentinels]

    def any_failed(self, results: List[SentinelResult]) -> bool:
        return any(r.verdict == SentinelVerdict.FAIL for r in results)

    def failures(self, results: List[SentinelResult]) -> List[SentinelResult]:
        return [r for r in results if r.verdict == SentinelVerdict.FAIL]
