# 65:57 0:0 0:0
"""Report whether the configured PostgreSQL database is at Alembic head.

Usage:
    python scripts/sche_migr_stat_v0.0.0alpha.py

Exit codes:
    0 database is exactly at the declared heads
    2 no migration heads are declared yet
    3 database is reachable but not at head
    4 status probe failed
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_schema_migration_status
#   module_name: schema_migration_status
#   module_kind: script
#   summary: Compares the database Alembic revision set with the repository heads and emits a bounded machine-readable status.
#   owner: Erin Spencer
#   public_surface: command line JSON status and exit code
#   internal_surface: expected_heads, current_heads, build_status
#   auth_boundary: read
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: true
#   tests: python/tests/test_schema_migration_foundation.py
#   rollout: release gate and later runtime readiness dependency
#   rollback: remove this script; it mutates no database state
#   requires: a0_alembic_environment
#   since: 2026-08-05
#   unresolved: runtime readiness integration follows the reviewed baseline revision
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: schema_migration_status_boundary
#   summary: Reads only Alembic revision metadata and reports revision identifiers without exposing the database URL or exception messages.
#   auth_boundary: read
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: true
#   pii: none
#   secrets: read
#   side_effects: none
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: schema_migration_status_exact_set_match
#   given: repository heads and database current revisions
#   then: at_head is true only when both non-empty revision sets are exactly equal
#   class: correctness
#   since: 2026-08-05
#
# id: schema_migration_status_bounds_failures
#   given: configuration or database probing fails
#   then: the report contains only an error type and never a database URL, password, host, or exception message
#   class: security
#   since: 2026-08-05
# === END CONTRACTS ===

import json
import os
from pathlib import Path
from typing import Iterable

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "albm_conf_file_v0.0.0alpha.ini"


def expected_heads(config_path: Path = CONFIG_PATH) -> set[str]:
    config = Config(str(config_path))
    return set(ScriptDirectory.from_config(config).get_heads())


def current_heads(connection) -> set[str]:
    if "alembic_version" not in inspect(connection).get_table_names():
        return set()
    rows = connection.execute(text("SELECT version_num FROM alembic_version"))
    return {str(row[0]) for row in rows if row[0]}


def build_status(expected: Iterable[str], current: Iterable[str]) -> dict:
    expected_set = set(expected)
    current_set = set(current)
    return {
        "initialized": bool(current_set),
        "has_declared_heads": bool(expected_set),
        "expected_heads": sorted(expected_set),
        "current_heads": sorted(current_set),
        "at_head": bool(expected_set) and current_set == expected_set,
    }


def _sync_url(raw: str) -> str:
    url = make_url(raw)
    if url.drivername in {
        "postgres",
        "postgresql",
        "postgresql+asyncpg",
        "postgresql+psycopg",
    }:
        url = url.set(drivername="postgresql+psycopg2")
    return url.render_as_string(hide_password=False)


def main() -> int:
    try:
        expected = expected_heads()
        if not expected:
            status = build_status(expected, [])
            print(json.dumps(status, sort_keys=True))
            return 2
        raw = os.environ.get("DATABASE_URL")
        if not raw:
            raise RuntimeError("DATABASE_URL missing")
        engine = create_engine(_sync_url(raw), pool_pre_ping=True)
        try:
            with engine.connect() as connection:
                current = current_heads(connection)
        finally:
            engine.dispose()
        status = build_status(expected, current)
    except Exception as exc:
        print(json.dumps({"status": "probe_failed", "error_type": type(exc).__name__}))
        return 4

    print(json.dumps(status, sort_keys=True))
    if not status["has_declared_heads"]:
        return 2
    return 0 if status["at_head"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
# 65:57 0:0 0:0
