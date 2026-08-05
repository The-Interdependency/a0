# 151:89 0:0 0:0
"""Capture a deterministic, schema-only PostgreSQL baseline with pg_dump.

Usage:
    python scripts/sche_capt_live_v0.0.0alpha.py --output migrations/sql/lega_schm_base_v0.0.0alpha.sql

The command reads DATABASE_URL, invokes pg_dump in schema-only mode, removes
volatile dump headers and environment SET statements, and writes an adjacent
SHA-256 file. It never executes SQL against the database.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_live_schema_capture
#   module_name: live_schema_capture
#   module_kind: script
#   summary: Captures and normalizes the live PostgreSQL schema as reviewable baseline evidence without mutating the database.
#   owner: Erin Spencer
#   public_surface: command line SQL and SHA-256 output
#   internal_surface: capture_schema, normalize_dump, libpq_environment
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_schema_migration_foundation.py
#   rollout: explicit operator command against a backed-up archive-shaped database
#   rollback: delete generated files; capture changes no database state
#   requires: a0_schema_inventory
#   since: 2026-08-05
#   unresolved: multi-host PostgreSQL URLs are not yet supported
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: live_schema_capture_boundary
#   summary: Decomposes database credentials into child-only libpq environment variables, reads catalog metadata through pg_dump, and never emits the connection URL.
#   auth_boundary: read
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: true
#   pii: none
#   secrets: read
#   side_effects: writes only explicit local SQL and digest files
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: live_schema_capture_is_read_only
#   given: DATABASE_URL and an output path
#   then: pg_dump is invoked with schema-only, no-owner, and no-privileges flags and no SQL is executed against the database
#   class: safety
#   since: 2026-08-05
#
# id: live_schema_capture_is_deterministic
#   given: equivalent pg_dump schema output with differing volatile headers or SET statements
#   then: normalize_dump produces byte-identical SQL ending with one newline
#   class: reproducibility
#   since: 2026-08-05
#
# id: live_schema_capture_redacts_connection
#   given: pg_dump fails
#   then: the raised error names the failure class and exit code without including DATABASE_URL, password, argv credentials, or pg_dump stderr
#   class: security
#   since: 2026-08-05
#
# id: live_schema_capture_decomposes_postgres_url
#   given: a PostgreSQL URL containing host, port, database, user, password, and supported libpq query options
#   then: the child receives corresponding PG* environment variables while argv contains no connection string
#   class: correctness
#   since: 2026-08-05
# === END CONTRACTS ===

import argparse
import hashlib
import os
import shutil
import subprocess
from pathlib import Path
from typing import Mapping

from sqlalchemy.engine import make_url

_VOLATILE_PREFIXES = (
    "-- Dumped from database version",
    "-- Dumped by pg_dump version",
    "-- Started on ",
    "-- Completed on ",
    "SET statement_timeout",
    "SET lock_timeout",
    "SET idle_in_transaction_session_timeout",
    "SET transaction_timeout",
    "SET client_encoding",
    "SET standard_conforming_strings",
    "SELECT pg_catalog.set_config",
    "SET check_function_bodies",
    "SET xmloption",
    "SET client_min_messages",
    "SET row_security",
)
_QUERY_TO_ENV = {
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "sslcert": "PGSSLCERT",
    "sslkey": "PGSSLKEY",
    "channel_binding": "PGCHANNELBINDING",
    "target_session_attrs": "PGTARGETSESSIONATTRS",
    "connect_timeout": "PGCONNECT_TIMEOUT",
    "options": "PGOPTIONS",
    "application_name": "PGAPPNAME",
}


def normalize_dump(raw: str) -> str:
    kept: list[str] = []
    blank = False
    for line in raw.replace("\r\n", "\n").split("\n"):
        stripped = line.strip()
        if any(stripped.startswith(prefix) for prefix in _VOLATILE_PREFIXES):
            continue
        if stripped in {"--", ""}:
            if kept and not blank:
                kept.append("")
                blank = True
            continue
        kept.append(line.rstrip())
        blank = False
    while kept and kept[-1] == "":
        kept.pop()
    return "\n".join(kept) + "\n"


def libpq_environment(
    database_url: str,
    base: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Convert one PostgreSQL URL into child-only libpq environment fields."""
    url = make_url(database_url)
    if not url.drivername.startswith("postgresql") and url.drivername != "postgres":
        raise ValueError("DATABASE_URL must use PostgreSQL")
    if not url.database:
        raise ValueError("DATABASE_URL must name a database")

    child_env = dict(base or os.environ)
    for key in list(child_env):
        if key == "DATABASE_URL" or key.startswith("PG"):
            child_env.pop(key, None)

    child_env["PGDATABASE"] = url.database
    if url.host:
        child_env["PGHOST"] = url.host
    if url.port is not None:
        child_env["PGPORT"] = str(url.port)
    if url.username:
        child_env["PGUSER"] = url.username
    if url.password is not None:
        child_env["PGPASSWORD"] = url.password

    for query_key, env_key in _QUERY_TO_ENV.items():
        value = url.query.get(query_key)
        if value is not None:
            child_env[env_key] = str(value)
    return child_env


def capture_schema(database_url: str, pg_dump: str = "pg_dump") -> str:
    executable = shutil.which(pg_dump)
    if not executable:
        raise RuntimeError("pg_dump executable not found")
    command = [
        executable,
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--quote-all-identifiers",
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        env=libpq_environment(database_url),
    )
    if completed.returncode != 0:
        raise RuntimeError(f"pg_dump failed with exit code {completed.returncode}")
    return normalize_dump(completed.stdout)


def write_capture(output: Path, sql: str) -> str:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(sql, encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    output.with_suffix(output.suffix + ".sha256").write_text(
        f"{digest}  {output.name}\n", encoding="utf-8"
    )
    return digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pg-dump", default="pg_dump")
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL must be set")
    sql = capture_schema(database_url, args.pg_dump)
    digest = write_capture(args.output, sql)
    print(f"captured schema sha256={digest} path={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 151:89 0:0 0:0
