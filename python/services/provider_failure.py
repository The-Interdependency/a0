# 21:28 0:0 0:0
"""Typed, string-compatible provider failure markers.

Provider adapters historically return sanitized failure text so existing UI and
direct callers can display a safe error without exposing upstream secrets.
ProviderFailureText preserves that contract while giving the A0 harness an
in-process type boundary that cannot be forged by ordinary model text.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_provider_failure
#   module_name: provider_failure
#   module_kind: service
#   summary: Carries sanitized provider failures as string-compatible typed markers so the harness can route failures without parsing assistant text.
#   owner: Erin Spencer
#   public_surface: ProviderFailureText, ProviderCallFailure, mark_provider_failure
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_work_harness_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Revert marker wrapping; provider adapters return ordinary sanitized strings.
#   requires: none
#   since: 2026-09-23
#   unresolved: none
# === END MODULE_BUILD ===

from typing import Any


class ProviderFailureText(str):
    """A safe display string carrying only non-secret routing metadata."""

    provider: str
    error_type: str

    def __new__(cls, text: str, provider: str, error_type: str):
        obj = str.__new__(cls, text)
        obj.provider = provider
        obj.error_type = error_type
        return obj


class ProviderCallFailure(RuntimeError):
    """Harness-internal exception built from a sanitized provider marker."""

    def __init__(self, content: ProviderFailureText, usage: dict[str, Any] | None = None):
        super().__init__(f"{content.provider} provider call failed ({content.error_type})")
        self.provider = content.provider
        self.error_type = content.error_type
        self.safe_text = str(content)
        self.usage = dict(usage or {})


def mark_provider_failure(
    text: str, provider: str, exc: BaseException
) -> ProviderFailureText:
    return ProviderFailureText(text, provider, type(exc).__name__)
# 21:28 0:0 0:0
