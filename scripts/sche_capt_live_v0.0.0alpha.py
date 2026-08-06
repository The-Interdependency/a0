# 108:130 0:0 0:0
"""Capture the live PostgreSQL schema without reading table data.

Usage:
    python scripts/sche_capt_live_v0.0.0alpha.py \
        --output migrations/sql/lega_schm_base_v0.0.0alpha.sql

`pg_dump --schema-only` performs a read-only catalog export. The connection URL
is decomposed into child-only libpq environment variables so it never appears
in the process argument list. The pg_dump child receives only those libpq
fields and a small process-environment allowlist; provider, Stripe, session,
and unrelated deployment secrets never cross the capture boundary.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_live_schema_capture
#   module_name: live_schema_capture
#   module_kind: script
#   summary: Captures deterministic schema-only PostgreSQL SQL and SHA-256 evidence without reading table rows or exposing the connection URL in process arguments.
#   owner: Erin Spencer
#   public_surface: command line schema SQL and adjacent SHA-256 evidence
#   internal_surface: capture_schema, normalize_dump, _connection_env
#   auth_boundary: admin
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: true
#   tests: python/tests/test_schema_migration_foundation.py
#   rollout: invoked manually after backup identity and client/server versions are recorded
#   rollback: delete generated capture artifacts; database state is unchanged
#   requires: a0_schema_inventory
#   since: 2026-08-05
#   unresolved: live capture has not yet been run against the archive-shaped production database
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: live_schema_capture_database_boundary
#   summary: Connects to PostgreSQL through pg_dump in schema-only mode; writes local SQL and digest artifacts and executes no SQL.
#   auth_boundary: admin
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: true
#   pii: none
#   secrets: read
#   side_effects: local capture files only
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: live_schema_capture_is_read_only
#   given: a valid PostgreSQL DATABASE_URL
#   then: pg_dump is invoked with --schema-only, --no-owner, --no-privileges and no data-export option; no SQL is executed
#   class: safety
#   since: 2026-08-05
#
# id: live_schema_capture_redacts_connection
#   given: DATABASE_URL contains user, password, host and query parameters plus unrelated deployment secrets
#   then: the URL is absent from argv/output, only required libpq fields and allowlisted process variables reach the child, and failures expose only the pg_dump exit code
#   class: security
#   since: 2026-08-05
#
# id: live_schema_capture_is_deterministic
#   given: equivalent pg_dump schema output with volatile header/completion lines
#   then: normalized SQL and its SHA-256 digest are stable
#   class: correctness
#   since: 2026-08-05
#
# id: live_schema_capture_decomposes_postgres_url
#   given: a PostgreSQL URL with explicit host, port, credentials, database, sslmode, and channel_binding
#   then: the child receives equivalent PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE, and PGCHANNELBINDING values without the URL appearing in argv
#   class: correctness
#   since: 2026-08-05
# === END CONTRACTS ===

import argparse
import hashlib
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

_VOLATILE_LINE = re.compile(
    r"^-- (?:Dumped from database version|Dumped by pg_dump version|Started on|Completed on).*$",
    re.MULTILINE,
)
_PASSTHROUGH_ENV = (
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
    "TEMP",
    "TMP",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "SYSTEMROOT",
)


def normalize_dump(raw: str) -> str:
    text = raw.replace("\r\n", "\n")
    text = _VOLATILE_LINE.sub("", text)
    lines = [line.rstrip() for line in text.splitlines()]
    while lines and not lines[0]:
        lines.pop(0)
    while lines and not lines[-1]:
        lines.pop()
    compact: list[str] = []
    previous_blank = False
    for line in lines:
        blank = not line
        if blank and previous_blank:
            continue
        compact.append(line)
        previous_blank = blank
    return "\n".join(compact) + "\n"


def _connection_env(database_url: str) -> dict[str, str]:
    parsed = urlparse(database_url)
    if parsed.scheme not in {"postgres", "postgresql", "postgresql+asyncpg", "postgresql+psycopg2"}:
        raise ValueError("DATABASE_URL must be PostgreSQL")
    if not parsed.hostname or not parsed.path.lstrip("/"):
        raise ValueError("DATABASE_URL must include host and database name")

    env = {
        key: os.environ[key]
        for key in _PASSTHROUGH_ENV
        if os.environ.get(key)
    }
    env.update({
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
    })
    if parsed.username is not None:
        env["PGUSER"] = unquote(parsed.username)
    if parsed.password is not None:
        env["PGPASSWORD"] = unquote(parsed.password)

    query = parse_qs(parsed.query, keep_blank_values=False)
    if query.get("sslmode"):
        env["PGSSLMODE"] = query["sslmode"][-1]
    if query.get("channel_binding"):
        env["PGCHANNELBINDING"] = query["channel_binding"][-1]
    return env


def capture_schema(database_url: str) -> str:
    pg_dump = shutil.which("pg_dump")
    if not pg_dump:
        raise RuntimeError("pg_dump is required for live schema capture")
    command = [
        pg_dump,
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--quote-all-identifiers",
    ]
    result = subprocess.run(
        command,
        env=_connection_env(database_url),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump schema capture failed with exit code {result.returncode}")
    normalized = normalize_dump(result.stdout)
    if not normalized.strip():
        raise RuntimeError("pg_dump returned an empty schema")
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL must be set")
        return 2

    try:
        sql = capture_schema(database_url)
    except Exception as exc:
        print(f"schema capture failed: {type(exc).__name__}: {exc}")
        return 3

    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(sql, encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    digest_path = output.with_suffix(output.suffix + ".sha256")
    digest_path.write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    print(f"captured schema: {output}")
    print(f"sha256: {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 108:130 0:0 0:0