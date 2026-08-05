# 61:55 0:0 1:2
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

# === MODULE_BUILD ===
# id: a0_runtime_readiness
#   module_name: runtime_readiness
#   module_kind: service
#   summary: Produces dependency-aware readiness reports for the complete a0 deployment unit without mutating runtime state.
#   owner: Erin Spencer
#   public_surface: build_readiness_report
#   internal_surface: _check_database, _check_heartbeat, _check_required_config
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: python.tests.test_runtime_readiness
#   rollout: consumed by the runtime readiness route
#   rollback: unregister the readiness route and remove this service
#   requires: a0_service_heartbeat
#   since: 2026-08-04
#   unresolved: worker-leader lease is not yet part of readiness
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: runtime_readiness_dependency_probe
#   summary: Reads deployment configuration, probes PostgreSQL, and reads heartbeat status without returning secrets or user data.
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   pii: none
#   secrets: read
#   side_effects: none
#   review_required: platform-runtime
#   owner: platform-runtime
#   since: 2026-08-04
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: runtime_readiness_requires_every_dependency
#   given: deployment configuration, PostgreSQL, and the heartbeat service are probed
#   then: ready is true if and only if every declared dependency reports ok
#   class: correctness
#   since: 2026-08-04
#
# id: runtime_readiness_redacts_sensitive_values
#   given: configuration is missing or an internal dependency probe fails
#   then: the report contains dependency names and exception types but no secret values, database details, exception messages, provider credentials, or user data
#   class: security
#   since: 2026-08-04
# === END CONTRACTS ===

REQUIRED_CONFIG = (
    "DATABASE_URL",
    "INTERNAL_API_SECRET",
    "SESSION_SECRET",
)


def _check_required_config() -> dict[str, Any]:
    missing = [name for name in REQUIRED_CONFIG if not os.environ.get(name)]
    return {
        "ok": not missing,
        "missing": missing,
    }


async def _check_database(timeout_s: float) -> dict[str, Any]:
    async def probe() -> None:
        from sqlalchemy import text

        from ..database import get_session

        async with get_session() as session:
            value = (await session.execute(text("SELECT 1"))).scalar_one()
            if value != 1:
                raise RuntimeError("unexpected database probe result")

    started = time.perf_counter()
    try:
        await asyncio.wait_for(probe(), timeout=timeout_s)
    except Exception as exc:
        return {
            "ok": False,
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "error_type": type(exc).__name__,
        }
    return {
        "ok": True,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }


def _check_heartbeat() -> dict[str, Any]:
    from .heartbeat import heartbeat_service

    status = heartbeat_service.status()
    return {
        "ok": bool(status.get("running")),
        "running": bool(status.get("running")),
        "tick_count": int(status.get("tick_count") or 0),
        "last_tick": float(status.get("last_tick") or 0),
        "recent_error_count": len(status.get("recent_errors") or []),
    }


async def build_readiness_report(timeout_s: float = 2.0) -> dict[str, Any]:
    """Return a bounded readiness report for Express and Replit health checks.

    Usage:
        report = await build_readiness_report()
        status_code = 200 if report["ready"] else 503

    The report intentionally exposes no environment values, database details,
    exception messages, user data, or provider credentials.
    """
    started = time.perf_counter()
    checks = {
        "config": _check_required_config(),
        "database": await _check_database(timeout_s),
        "heartbeat": _check_heartbeat(),
    }
    ready = all(check.get("ok") is True for check in checks.values())
    return {
        "ready": ready,
        "status": "ready" if ready else "not_ready",
        "checks": checks,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
    }
# 61:55 0:0 1:2
