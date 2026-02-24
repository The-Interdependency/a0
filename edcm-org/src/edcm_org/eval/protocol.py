"""
EDCM-Org Evaluation Protocol — spec compliance and diagnostic harness.

This module provides:
  1. Spec compliance checks (fail the build if metrics drift out of range)
  2. Secondary modifier cap enforcement
  3. Batch evaluation over multiple windows
  4. A structured evaluation report
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from ..spec_version import SPEC_VERSION
from ..types import Metrics, OutputEnvelope

# ---------------------------------------------------------------------------
# Spec compliance checks
# ---------------------------------------------------------------------------

# Secondary modifier caps (from spec)
SECONDARY_MODIFIER_CAPS: Dict[str, Tuple[str, float]] = {
    "sentiment_slope": ("escalation_confidence", 0.20),
    "urgency": ("escalation_confidence", 0.15),
    "filler_ratio": ("noise_confidence", 0.25),
    "topic_drift": ("deflection_confidence", 0.30),
}


@dataclass
class ComplianceResult:
    passed: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


def check_spec_compliance(envelope: OutputEnvelope) -> ComplianceResult:
    """
    Validate an OutputEnvelope against spec requirements.

    Checks:
      - All metric values within defined ranges
      - spec_version matches current spec
      - aggregation is not 'individual'
      - Output includes all required fields (non-None)

    This is designed to be called in CI/CD to prevent spec drift.
    """
    errors: List[str] = []
    warnings: List[str] = []

    # Metric range checks
    metric_errors = envelope.validate()
    errors.extend(metric_errors)

    # Required fields
    if not envelope.spec_version:
        errors.append("Missing spec_version in output.")
    elif envelope.spec_version != SPEC_VERSION:
        errors.append(
            f"spec_version mismatch: got {envelope.spec_version!r}, "
            f"expected {SPEC_VERSION!r}"
        )

    if not envelope.org:
        errors.append("Missing org identifier in output.")
    if not envelope.window_id:
        errors.append("Missing window_id in output.")
    if not envelope.aggregation:
        errors.append("Missing aggregation level in output.")

    # Progress sub-components should be auditable if P is non-zero
    m = envelope.metrics
    if m.P > 0.01:
        sub_sum = 0.3 * m.P_decisions + 0.2 * m.P_commitments + 0.3 * m.P_artifacts + 0.2 * m.P_followthrough
        if abs(sub_sum - m.P) > 0.01:
            warnings.append(
                f"Progress sub-components do not sum to P: "
                f"computed={sub_sum:.4f}, P={m.P:.4f}. "
                "Verify P sub-components are populated."
            )

    return ComplianceResult(passed=len(errors) == 0, errors=errors, warnings=warnings)


def check_secondary_modifier_caps(
    modifier_name: str,
    modifier_value: float,
    applied_confidence_delta: float,
) -> List[str]:
    """
    Verify that a secondary modifier does not exceed its spec cap.

    Returns a list of violations (empty = compliant).
    """
    violations: List[str] = []
    if modifier_name in SECONDARY_MODIFIER_CAPS:
        _, cap = SECONDARY_MODIFIER_CAPS[modifier_name]
        if abs(applied_confidence_delta) > cap:
            violations.append(
                f"Secondary modifier {modifier_name!r} applied "
                f"confidence delta {applied_confidence_delta:.3f} "
                f"exceeds spec cap {cap:.3f}."
            )
    return violations


# ---------------------------------------------------------------------------
# Batch evaluation
# ---------------------------------------------------------------------------

@dataclass
class EvalReport:
    windows_evaluated: int
    compliance_results: List[ComplianceResult]
    all_passed: bool
    total_errors: int
    total_warnings: int
    summary: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "windows_evaluated": self.windows_evaluated,
            "all_passed": self.all_passed,
            "total_errors": self.total_errors,
            "total_warnings": self.total_warnings,
            "summary": self.summary,
            "details": [
                {
                    "window": i,
                    "passed": r.passed,
                    "errors": r.errors,
                    "warnings": r.warnings,
                }
                for i, r in enumerate(self.compliance_results)
            ],
        }


def evaluate_batch(envelopes: List[OutputEnvelope]) -> EvalReport:
    """
    Run spec compliance checks over a batch of output envelopes.

    Returns an EvalReport suitable for CI/CD integration.
    """
    results = [check_spec_compliance(e) for e in envelopes]
    total_errors = sum(len(r.errors) for r in results)
    total_warnings = sum(len(r.warnings) for r in results)
    all_passed = all(r.passed for r in results)

    if all_passed:
        summary = f"All {len(envelopes)} window(s) passed spec compliance."
    else:
        failed = sum(1 for r in results if not r.passed)
        summary = (
            f"{failed}/{len(envelopes)} window(s) failed spec compliance. "
            f"{total_errors} error(s), {total_warnings} warning(s)."
        )

    return EvalReport(
        windows_evaluated=len(envelopes),
        compliance_results=results,
        all_passed=all_passed,
        total_errors=total_errors,
        total_warnings=total_warnings,
        summary=summary,
    )
