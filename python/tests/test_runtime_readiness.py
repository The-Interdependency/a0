# 54:31 0:0 0:0
"""Contract checks for runtime readiness.

Usage:
    pytest -q python/tests/test_runtime_readiness.py

The checks patch environment and dependency probes only; they do not require a
database, network access, or a running heartbeat loop.
"""

import os
from unittest.mock import patch

import pytest

from python.services import runtime_readiness as subject

# === CHECKS ===
# id: check_runtime_readiness_all_dependencies
#   proves: runtime_readiness_requires_every_dependency
#   call: self::test_readiness_requires_all_dependencies
#   requires: python3, pytest
#   timeout: 10
#   mutates: environment
#   cleanup: patch_dict_restore
#
# id: check_runtime_readiness_redacts_configuration_values
#   proves: runtime_readiness_redacts_sensitive_values
#   call: self::test_readiness_reports_missing_config_without_values
#   requires: python3, pytest
#   timeout: 10
#   mutates: environment
#   cleanup: patch_dict_restore
#
# id: check_runtime_readiness_database_fail_closed
#   proves: runtime_readiness_requires_every_dependency, runtime_readiness_redacts_sensitive_values
#   call: self::test_readiness_fails_closed_when_database_probe_fails
#   requires: python3, pytest
#   timeout: 10
#   mutates: environment
#   cleanup: patch_dict_restore
# === END CHECKS ===


async def _database_ok(_timeout_s: float) -> dict:
    return {"ok": True, "latency_ms": 0.1}


def _heartbeat_ok() -> dict:
    return {
        "ok": True,
        "running": True,
        "tick_count": 1,
        "last_tick": 1.0,
        "recent_error_count": 0,
    }


@pytest.mark.asyncio
async def test_readiness_requires_all_dependencies() -> None:
    configured = {name: "configured" for name in subject.REQUIRED_CONFIG}
    with (
        patch.dict(os.environ, configured, clear=True),
        patch.object(subject, "_check_database", _database_ok),
        patch.object(subject, "_check_heartbeat", _heartbeat_ok),
    ):
        report = await subject.build_readiness_report()

    assert report["ready"] is True
    assert report["status"] == "ready"
    assert set(report["checks"]) == {"config", "database", "heartbeat"}


@pytest.mark.asyncio
async def test_readiness_reports_missing_config_without_values() -> None:
    with (
        patch.dict(os.environ, {"DATABASE_URL": "secret-database-url"}, clear=True),
        patch.object(subject, "_check_database", _database_ok),
        patch.object(subject, "_check_heartbeat", _heartbeat_ok),
    ):
        report = await subject.build_readiness_report()

    assert report["ready"] is False
    assert report["checks"]["config"]["missing"] == [
        "INTERNAL_API_SECRET",
        "SESSION_SECRET",
    ]
    assert "secret-database-url" not in str(report)


@pytest.mark.asyncio
async def test_readiness_fails_closed_when_database_probe_fails() -> None:
    async def database_failed(_timeout_s: float) -> dict:
        return {"ok": False, "latency_ms": 0.1, "error_type": "TimeoutError"}

    configured = {name: "configured" for name in subject.REQUIRED_CONFIG}
    with (
        patch.dict(os.environ, configured, clear=True),
        patch.object(subject, "_check_database", database_failed),
        patch.object(subject, "_check_heartbeat", _heartbeat_ok),
    ):
        report = await subject.build_readiness_report()

    assert report["ready"] is False
    assert report["status"] == "not_ready"
    assert report["checks"]["database"]["error_type"] == "TimeoutError"
# 54:31 0:0 0:0
