# 158:71 0:0 0:0
"""Review a captured PostgreSQL schema before it becomes an Alembic baseline.

Usage:
    python scripts/sche_revw_base_v0.0.0alpha.py \
      --sql migrations/sql/lega_schm_base_v0.0.0alpha.sql \
      --inventory docs/schema-inventory.json

The reviewer is deliberately conservative. It verifies the capture digest,
rejects data/role/privilege-bearing statements, inventories schema objects,
and reports source/live table drift without pretending drift is an error by
itself. It executes no SQL and opens no database connection.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_schema_baseline_review
#   module_name: schema_baseline_review
#   module_kind: script
#   summary: Verifies captured schema integrity and safety, inventories PostgreSQL objects, and exposes live-versus-source drift before baseline revision authoring.
#   owner: Erin Spencer
#   public_surface: command line JSON review report
#   internal_surface: review_capture, parse_objects, verify_digest, reject_unsafe_sql
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_schema_baseline_review.py
#   rollout: required after schema capture and before a baseline revision is authored
#   rollback: remove this script; it mutates no repository or database state
#   requires: a0_schema_inventory, a0_live_schema_capture
#   since: 2026-08-05
#   unresolved: semantic equivalence of columns, constraints, defaults, and functions still requires PostgreSQL apply-and-compare fixtures
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: schema_baseline_review_read_only_boundary
#   summary: Reads captured SQL, digest evidence, and optional inventory JSON without executing SQL, opening a database, or exposing credentials.
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   pii: none
#   secrets: none
#   side_effects: writes only an explicitly requested local JSON report
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: schema_baseline_review_requires_matching_digest
#   given: captured SQL and adjacent or explicit SHA-256 evidence
#   then: review succeeds only when the evidence digest exactly matches the SQL bytes
#   class: integrity
#   since: 2026-08-05
#
# id: schema_baseline_review_rejects_data_and_authority_statements
#   given: captured SQL contains data movement, role/database creation, ownership, privileges, psql connection commands, or a database URL
#   then: review fails and names only the unsafe statement class, not captured secret text
#   class: security
#   since: 2026-08-05
#
# id: schema_baseline_review_reports_object_inventory
#   given: safe schema-only PostgreSQL SQL
#   then: tables, sequences, indexes, types, extensions, functions, triggers, and constraints are reported deterministically
#   class: correctness
#   since: 2026-08-05
#
# id: schema_baseline_review_preserves_drift
#   given: optional source inventory and captured live tables differ
#   then: live_only and source_only tables remain visible and do not silently fail or disappear
#   class: provenance
#   since: 2026-08-05
# === END CONTRACTS ===

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any

_OBJECT_PATTERNS: dict[str, re.Pattern[str]] = {
    "tables": re.compile(
        r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))?)",
        re.IGNORECASE,
    ),
    "sequences": re.compile(
        r"\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))?)",
        re.IGNORECASE,
    ),
    "indexes": re.compile(
        r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))?)",
        re.IGNORECASE,
    ),
    "types": re.compile(
        r"\bCREATE\s+TYPE\s+(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))?)",
        re.IGNORECASE,
    ),
    "extensions": re.compile(
        r"\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*))",
        re.IGNORECASE,
    ),
    "functions": re.compile(
        r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*)(?:\.(?:\"[^\"]+\"|[A-Za-z_][\w$]*))?)",
        re.IGNORECASE,
    ),
    "triggers": re.compile(
        r"\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\s+(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*))",
        re.IGNORECASE,
    ),
    "constraints": re.compile(
        r"\bADD\s+CONSTRAINT\s+(?P<name>(?:\"[^\"]+\"|[A-Za-z_][\w$]*))",
        re.IGNORECASE,
    ),
}

_UNSAFE_PATTERNS: dict[str, re.Pattern[str]] = {
    "copy_data": re.compile(r"(?mi)^\s*COPY\s+.+\s+FROM\s+stdin\s*;"),
    "insert_data": re.compile(r"(?mi)^\s*INSERT\s+INTO\b"),
    "update_data": re.compile(r'(?mi)^\s*UPDATE\s+(?:ONLY\s+)?[\w".]+\s+SET\b'),
    "delete_data": re.compile(r"(?mi)^\s*DELETE\s+FROM\b"),
    "create_role": re.compile(r"(?mi)^\s*CREATE\s+(?:ROLE|USER)\b"),
    "create_database": re.compile(r"(?mi)^\s*CREATE\s+DATABASE\b"),
    "owner_change": re.compile(r"(?mi)^\s*ALTER\s+.+\s+OWNER\s+TO\b"),
    "grant_privilege": re.compile(r"(?mi)^\s*GRANT\b"),
    "revoke_privilege": re.compile(r"(?mi)^\s*REVOKE\b"),
    "psql_connect": re.compile(r"(?mi)^\s*\\connect\b"),
    "database_url": re.compile(r"\bpostgres(?:ql)?(?:\+[A-Za-z0-9_]+)?://", re.IGNORECASE),
}


def _normalize_identifier(raw: str) -> str:
    parts = [part.strip().strip('"') for part in raw.strip().split(".")]
    return ".".join(parts)


def parse_objects(sql: str) -> dict[str, list[str]]:
    return {
        kind: sorted({_normalize_identifier(match.group("name")) for match in pattern.finditer(sql)})
        for kind, pattern in _OBJECT_PATTERNS.items()
    }


def _mask_dollar_quoted_bodies(sql: str) -> str:
    """Mask function/procedure bodies before top-level DML inspection."""
    out: list[str] = []
    cursor = 0
    opener = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")
    while True:
        match = opener.search(sql, cursor)
        if match is None:
            out.append(sql[cursor:])
            return "".join(out)
        token = match.group(0)
        close = sql.find(token, match.end())
        if close < 0:
            out.append(sql[cursor:])
            return "".join(out)
        out.append(sql[cursor:match.end()])
        out.append("\n" * sql[match.end():close].count("\n"))
        out.append(token)
        cursor = close + len(token)


def reject_unsafe_sql(sql: str) -> None:
    inspected = _mask_dollar_quoted_bodies(sql)
    hits = sorted(
        kind for kind, pattern in _UNSAFE_PATTERNS.items() if pattern.search(inspected)
    )
    if hits:
        raise ValueError("unsafe schema capture classes: " + ", ".join(hits))


def _read_digest(path: Path) -> str:
    first = path.read_text(encoding="utf-8").strip().split()
    if not first or not re.fullmatch(r"[0-9a-fA-F]{64}", first[0]):
        raise ValueError("invalid SHA-256 evidence format")
    return first[0].lower()


def verify_digest(sql_bytes: bytes, evidence_path: Path) -> str:
    expected = _read_digest(evidence_path)
    actual = hashlib.sha256(sql_bytes).hexdigest()
    if actual != expected:
        raise ValueError("schema capture SHA-256 mismatch")
    return actual


def _inventory_tables(payload: dict[str, Any]) -> set[str]:
    authorities = payload.get("authorities") or {}
    tables: set[str] = set()
    for key in ("drizzle", "sqlalchemy", "executable_sql"):
        values = authorities.get(key) or []
        if not isinstance(values, list):
            raise ValueError(f"inventory authority {key!r} must be a list")
        tables.update(str(value) for value in values)
    return tables


def review_capture(sql_path: Path, digest_path: Path, inventory_path: Path | None = None) -> dict[str, Any]:
    sql_bytes = sql_path.read_bytes()
    digest = verify_digest(sql_bytes, digest_path)
    sql = sql_bytes.decode("utf-8")
    reject_unsafe_sql(sql)
    objects = parse_objects(sql)
    if not objects["tables"]:
        raise ValueError("schema capture contains no tables")
    live_tables = {name.rsplit(".", 1)[-1] for name in objects["tables"]}

    source_tables: set[str] = set()
    if inventory_path is not None:
        source_payload = json.loads(inventory_path.read_text(encoding="utf-8"))
        source_tables = _inventory_tables(source_payload)

    return {
        "schema": "a0.schema-baseline-review",
        "version": "1.0.0",
        "capture_sha256": digest,
        "objects": objects,
        "counts": {kind: len(values) for kind, values in objects.items()},
        "table_drift": {
            "live_only": sorted(live_tables - source_tables) if inventory_path else [],
            "source_only": sorted(source_tables - live_tables) if inventory_path else [],
        },
        "safe_for_baseline_authoring": True,
        "hmmm": [
            "safe_for_baseline_authoring does not prove apply equivalence or data preservation",
            "column, constraint, default, function-body, and extension compatibility require PostgreSQL fixtures",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", type=Path, required=True)
    parser.add_argument("--sha256", type=Path)
    parser.add_argument("--inventory", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    digest_path = args.sha256 or args.sql.with_suffix(args.sql.suffix + ".sha256")
    try:
        report = review_capture(args.sql, digest_path, args.inventory)
    except Exception as exc:
        print(json.dumps({"status": "review_failed", "error_type": type(exc).__name__, "detail": str(exc)}))
        return 2

    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 158:71 0:0 0:0
