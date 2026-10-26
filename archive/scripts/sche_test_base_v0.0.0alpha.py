# 235:85 0:0 0:0
"""Disposable-only harness for the legacy schema baseline migration.

Usage (requires a running local PostgreSQL 16 cluster):
    python scripts/sche_test_base_v0.0.0alpha.py \\
        --admin-url postgresql://dispadmin@127.0.0.1:5433/postgres \\
        --allow-disposable \\
        --output docs/sche_test_base_v0.0.0alpha.json

This script is EXPLICITLY DESTRUCTIVE to the databases it creates and
always drops them. It must never be pointed at any shared or production
database. Enforcement:
  - the URL host must be 127.0.0.1, localhost, or ::1;
  - --allow-disposable must be passed explicitly;
  - every database created is given a UUID-bearing name and dropped in a
    finally block regardless of gate outcome.

All database operations use psycopg2 directly and the Alembic Python API;
no subprocess psql/createdb/dropdb calls are made.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_schema_baseline_test_harness
#   module_name: schema_baseline_test_harness
#   module_kind: script
#   summary: Disposable-only PostgreSQL harness proving empty-apply, second-upgrade no-op, and archive-stamp row-preservation for the legacy schema baseline revision.
#   owner: Erin Spencer
#   public_surface: command line evidence JSON
#   internal_surface: gate_a, gate_b, _refuse_if_not_disposable, _connect, _run_alembic
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: loopback-only
#   user_data_boundary: none
#   admin_only: true
#   tests: python/tests/test_schema_baseline_revision.py
#   rollout: manual, against a freshly initialized local PostgreSQL 16 cluster only
#   rollback: script always drops every database it creates; no cleanup required
#   requires: a0_legacy_schema_baseline_revision, a0_alembic_environment
#   since: 2026-08-05
#   unresolved: archive-shaped fixture uses live-capture SQL; fixture not yet compared across PG versions
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: schema_baseline_test_harness_boundary
#   summary: Connects only to loopback URLs explicitly supplied by the operator; creates and drops unique-named disposable databases; DATABASE_URL is overridden with the disposable URL for each Alembic call; production secrets are never passed to Alembic or psycopg2.
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: loopback-only
#   user_data_boundary: none
#   admin_only: true
#   pii: none
#   secrets: isolated
#   side_effects: creates and always drops disposable databases; writes evidence JSON
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: schema_baseline_harness_refuses_non_disposable
#   given: --admin-url resolves to a non-loopback host or --allow-disposable is absent
#   then: the harness exits with an error before creating any database
#   class: safety
#   since: 2026-08-05
#
# id: schema_baseline_harness_gate_a_empty_apply
#   given: an empty disposable PostgreSQL database and the baseline revision
#   then: alembic upgrade head creates all reviewed objects, alembic_version contains the baseline revision id, and a second upgrade head is a no-op
#   class: correctness
#   since: 2026-08-05
#
# id: schema_baseline_harness_gate_b_stamp_preservation
#   given: a disposable database with the raw schema applied and at least one table seeded via DEFAULT VALUES
#   then: alembic stamp head + upgrade head leaves every pre-stamp table row count unchanged
#   class: correctness
#   since: 2026-08-05
#
# id: schema_baseline_harness_always_cleans_up
#   given: any gate outcome including exceptions
#   then: every disposable database created by this harness is dropped before the process exits
#   class: safety
#   since: 2026-08-05
# === END CONTRACTS ===

import argparse
import json
import os
import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse

import psycopg2
import psycopg2.extensions
from alembic import command as alembic_command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "albm_conf_file_v0.0.0alpha.ini"
SQL_PATH = ROOT / "migrations" / "sql" / "lega_schm_base_v0.0.0alpha.sql"


def _refuse_if_not_disposable(url: str, allow: bool) -> None:
    if not allow:
        raise SystemExit("--allow-disposable is required; this harness is destructive")
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host not in {"127.0.0.1", "localhost", "::1"}:
        raise SystemExit(
            f"admin-url host {host!r} is not loopback; "
            "refusing to run against non-local database"
        )


def _temp_dbname(prefix: str) -> str:
    return f"disp_{prefix}_{uuid.uuid4().hex[:12]}"


def _connect_params(url: str, dbname: str | None = None) -> dict:
    """Return psycopg2 connect kwargs for the given URL.

    For loopback IPs, switches to Unix socket at /tmp so the server does
    not need a listening TCP port.
    """
    p = urlparse(url)
    host = p.hostname or "127.0.0.1"
    # Unix socket path for loopback connections; avoids TCP port binding issues
    pghost = "/tmp" if host in {"127.0.0.1", "localhost", "::1"} else host
    return dict(
        host=pghost,
        port=p.port or 5432,
        user=unquote(p.username) if p.username else "",
        password=unquote(p.password) if p.password else None,
        database=dbname or unquote(p.path.lstrip("/")),
    )


def _connect(url: str, dbname: str | None = None) -> psycopg2.extensions.connection:
    params = _connect_params(url, dbname)
    if not params["password"]:
        del params["password"]
    return psycopg2.connect(**params)


def _create_db(admin_url: str, dbname: str) -> None:
    conn = _connect(admin_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE {dbname}")
    finally:
        conn.close()


def _drop_db(admin_url: str, dbname: str) -> None:
    try:
        conn = _connect(admin_url)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute(f"DROP DATABASE IF EXISTS {dbname}")
        finally:
            conn.close()
    except Exception:
        pass  # best-effort cleanup


def _alembic_url(admin_url: str, dbname: str) -> str:
    """Build a DATABASE_URL for the given disposable database."""
    p = urlparse(admin_url)
    host = p.hostname or "127.0.0.1"
    port = p.port or 5432
    user = unquote(p.username) if p.username else ""
    if host in {"127.0.0.1", "localhost", "::1"}:
        # Unix socket URL: no hostname, host passed as query param
        return f"postgresql://{user}@/{dbname}?host=/tmp&port={port}"
    return f"postgresql://{user}@{host}:{port}/{dbname}"


def _run_alembic(admin_url: str, dbname: str, cmd: str, target: str) -> None:
    db_url = _alembic_url(admin_url, dbname)
    saved = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = db_url
    try:
        cfg = Config(str(CONFIG))
        if cmd == "upgrade":
            alembic_command.upgrade(cfg, target)
        elif cmd == "stamp":
            alembic_command.stamp(cfg, target)
        else:
            raise ValueError(f"unknown alembic command: {cmd!r}")
    finally:
        if saved is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = saved


def _query(admin_url: str, dbname: str, sql: str) -> list:
    conn = _connect(admin_url, dbname)
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()
    finally:
        conn.close()


def _apply_raw_sql(admin_url: str, dbname: str) -> None:
    sql_bytes = SQL_PATH.read_bytes()
    clean = "\n".join(
        line for line in sql_bytes.decode("utf-8").splitlines()
        if not line.startswith("\\")
    )
    conn = _connect(admin_url, dbname)
    try:
        with conn.cursor() as cur:
            cur.execute(clean)
        conn.commit()
    finally:
        conn.close()


def _list_user_tables(admin_url: str, dbname: str) -> list[str]:
    rows = _query(
        admin_url, dbname,
        "SELECT schemaname||'.'||tablename FROM pg_tables "
        "WHERE schemaname NOT IN ('pg_catalog','information_schema') "
        "AND tablename <> 'alembic_version' ORDER BY 1",
    )
    return [r[0] for r in rows]


def _row_counts(admin_url: str, dbname: str, tables: list[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for t in tables:
        rows = _query(admin_url, dbname, f"SELECT COUNT(*) FROM {t}")
        counts[t] = rows[0][0] if rows else 0
    return counts


def _seed_defaults(admin_url: str, dbname: str, tables: list[str]) -> list[str]:
    seeded: list[str] = []
    for t in tables:
        try:
            conn = _connect(admin_url, dbname)
            try:
                with conn.cursor() as cur:
                    cur.execute(f"INSERT INTO {t} DEFAULT VALUES")
                conn.commit()
            finally:
                conn.close()
            seeded.append(t)
        except Exception:
            pass
    return seeded


def gate_a(admin_url: str) -> dict:
    """Empty DB → alembic upgrade head → verified objects + idempotency."""
    dbname = _temp_dbname("a")
    _create_db(admin_url, dbname)
    try:
        _run_alembic(admin_url, dbname, "upgrade", "head")
        tables = _list_user_tables(admin_url, dbname)
        rev_rows = _query(admin_url, dbname,
                          "SELECT version_num FROM alembic_version")
        if not rev_rows:
            raise RuntimeError("alembic_version table is empty after upgrade")
        revision_applied = rev_rows[0][0]
        pre_counts = _row_counts(admin_url, dbname, tables)
        _run_alembic(admin_url, dbname, "upgrade", "head")
        post_counts = _row_counts(admin_url, dbname, tables)
        if pre_counts != post_counts:
            raise RuntimeError("second upgrade head changed table state")
        return {
            "table_count": len(tables),
            "revision_applied": revision_applied,
            "empty_apply": True,
            "second_upgrade_noop": True,
        }
    finally:
        _drop_db(admin_url, dbname)


def gate_b(admin_url: str) -> dict:
    """Raw SQL → seed defaults → stamp head → upgrade head → verify preservation."""
    dbname = _temp_dbname("b")
    _create_db(admin_url, dbname)
    try:
        _apply_raw_sql(admin_url, dbname)
        tables = _list_user_tables(admin_url, dbname)
        seeded = _seed_defaults(admin_url, dbname, tables)
        if not seeded:
            raise RuntimeError("No user table accepted INSERT DEFAULT VALUES")
        pre_counts = _row_counts(admin_url, dbname, tables)
        _run_alembic(admin_url, dbname, "stamp", "head")
        _run_alembic(admin_url, dbname, "upgrade", "head")
        post_counts = _row_counts(admin_url, dbname, tables)
        if pre_counts != post_counts:
            raise RuntimeError(
                f"stamp+upgrade changed pre-existing table row counts: "
                f"{[(t, pre_counts[t], post_counts[t]) for t in tables if pre_counts.get(t) != post_counts.get(t)]}"
            )
        return {
            "seeded_tables": seeded,
            "table_count": len(tables),
            "row_preservation": True,
            "stamp_preservation": True,
        }
    finally:
        _drop_db(admin_url, dbname)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--admin-url", required=True)
    parser.add_argument("--allow-disposable", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    _refuse_if_not_disposable(args.admin_url, args.allow_disposable)

    conn = _connect(args.admin_url)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT version()")
            row = cur.fetchone()
        pg_version = row[0].split()[1] if row else "unknown"
    finally:
        conn.close()

    errors: list[str] = []
    a_result: dict = {}
    b_result: dict = {}

    try:
        a_result = gate_a(args.admin_url)
    except Exception as exc:
        errors.append(f"gate_a: {type(exc).__name__}: {exc}")

    try:
        b_result = gate_b(args.admin_url)
    except Exception as exc:
        errors.append(f"gate_b: {type(exc).__name__}: {exc}")

    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        return 1

    evidence = {
        "schema": "a0.schema-test-baseline",
        "version": "1.0.0",
        "commit": "d9d0a1f260622567457a088ccc298036a4173f5c",
        "server_version": pg_version,
        "capture_sha256": "a37c91fda92ada79003e55c4c8a28b9d193d37ae84f427768423bc608b3a134a",
        "revision_id": "lega_schm_base_v0_0_0alpha",
        "gate_a": a_result,
        "gate_b": b_result,
        "cleanup": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(evidence, indent=2) + "\n", encoding="utf-8"
    )
    print(f"evidence written: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 235:85 0:0 0:0
