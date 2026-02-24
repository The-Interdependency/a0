"""
EDCM-Org Privacy Guard — spec v0.1 enforcement.

Governance rules (non-negotiable):
  - Default aggregation: department-level.
  - No individual scoring absent explicit consent + safety protocol.
  - No punitive automation.
  - No PII in processed payloads.

Any attempt to produce individual-level output raises ConsentError.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Literal

AggregationLevel = Literal["department", "team", "organization"]

_PII_KEYS = {"email", "phone", "name", "employee_id", "address", "ssn", "dob", "ip_address"}


class ConsentError(Exception):
    """Raised when individual-level output is attempted without explicit consent."""


@dataclass
class PrivacyConfig:
    aggregation: AggregationLevel = "department"
    consent_required_for_individual: bool = True
    retain_months: int = 6


class EDCMPrivacyGuard:
    """
    Enforces EDCM spec governance rules on output payloads.

    Usage::

        guard = EDCMPrivacyGuard(PrivacyConfig(aggregation="department"))
        safe_payload = guard.enforce(raw_output)
    """

    def __init__(self, cfg: PrivacyConfig) -> None:
        self.cfg = cfg

    def enforce(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enforce spec governance rules.

        Raises
        ------
        ConsentError
            If payload.aggregation == 'individual'.

        Returns
        -------
        Dict[str, Any]
            Payload with PII stripped and aggregation validated.
        """
        if payload.get("aggregation") == "individual":
            raise ConsentError(
                "Individual-level outputs are prohibited by EDCM spec v0.1. "
                "Default aggregation is 'department'. "
                "Individual scoring requires explicit consent + safety protocol."
            )

        return self._scrub(payload)

    def _scrub(self, obj: Any) -> Any:
        """Recursively strip PII fields from dicts and lists."""
        if isinstance(obj, dict):
            return {k: self._scrub(v) for k, v in obj.items() if k not in _PII_KEYS}
        if isinstance(obj, list):
            return [self._scrub(x) for x in obj]
        return obj

    def validate_retention(self, data_age_months: float) -> bool:
        """
        Check whether retained data is within the configured retention window.

        Returns True if within window, False if data should be purged.
        """
        return data_age_months <= self.cfg.retain_months
