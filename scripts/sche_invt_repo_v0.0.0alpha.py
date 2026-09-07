# 154:70 0:0 0:0
"""Inventory a0 schema declarations and schema-mutating runtime paths.

Usage:
    python scripts/sche_invt_repo_v0.0.0alpha.py
    python scripts/sche_invt_repo_v0.0.0alpha.py --check
    python scripts/sche_invt_repo_v0.0.0alpha.py --output schema-inventory.json

The inventory is deliberately syntactic. It does not declare any source to be
canonical; it makes disagreement among Drizzle, SQLAlchemy, and executable SQL
visible before Alembic becomes authoritative.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_schema_inventory
#   module_name: schema_inventory
#   module_kind: script
#   summary: Inventories table declarations and schema-mutating code paths across the three legacy schema authorities.
#   owner: Erin Spencer
#   public_surface: command line JSON report
#   internal_surface: collect_inventory, parse_drizzle_tables, parse_sqlalchemy_tables, parse_sql_mutations
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_schema_migration_foundation.py
#   rollout: invoked explicitly and by the migration-foundation gate
#   rollback: remove this script; it mutates no source or database state
#   requires: none
#   since: 2026-08-05
#   unresolved: parser is intentionally syntactic and does not interpret dynamically assembled SQL
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: schema_inventory_read_only_boundary
#   summary: Reads repository text and reports schema declarations without opening a database or executing source.
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   pii: none
#   secrets: none
#   side_effects: writes only the explicitly requested report file
#   review_required: platform-runtime
#   owner: platform-runtime
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: schema_inventory_reports_three_authorities
#   given: Drizzle declarations, SQLAlchemy models, and executable SQL exist in the repository
#   then: the report lists each authority separately and exposes pairwise and runtime-only table drift
#   class: correctness
#   since: 2026-08-05
#
# id: schema_inventory_reports_mutation_sites
#   given: a first-party source file contains CREATE TABLE, ALTER TABLE, CREATE INDEX, DROP TABLE, createTableIfMissing, or db:push
#   then: the file and mutation kinds appear in runtime_mutation_sites
#   class: correctness
#   since: 2026-08-05
#
# id: schema_inventory_check_fails_on_unreviewed_mutation_site
#   given: --check and a schema-mutating path exists outside the reviewed legacy allowlist or migrations directory
#   then: the process exits nonzero and names the unreviewed path
#   class: safety
#   since: 2026-08-05
#
# id: schema_inventory_excludes_environment_vendor_trees
#   given: Replit or Python dependency trees such as .cache, .pythonlibs, node_modules, or site-packages contain schema-like text
#   then: inventory walks only declared first-party source roots and none of those vendor paths appear in authorities or mutation sites
#   class: safety
#   since: 2026-08-05
# === END CONTRACTS ===

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Iterable

SOURCE_ROOTS = ("python", "server", "scripts", "shared", "client", "script", ".github")
SOURCE_SUFFIXES = {
    ".py", ".ts", ".tsx", ".js", ".mjs", ".sh", ".sql", ".yml", ".yaml",
}
SKIP_PARTS = {
    ".git", ".cache", ".pythonlibs", ".local", ".upm", ".nix", ".direnv",
    "node_modules", "site-packages", "dist", "build", "target", "__pycache__",
    ".pytest_cache", ".agents", "attached_assets",
}
NON_RUNTIME_MUTATION_PATHS = {
    "scripts/sche_invt_repo_v0.0.0alpha.py",
    "scripts/sche_capt_live_v0.0.0alpha.py",
}
REVIEWED_LEGACY_MUTATION_PATHS = {
    ".github/workflows/deploy.yml",
    "package.json",
    "python/main.py",
    "python/routes/billing.py",
    "server/auth/setup.ts",
    "scripts/post-merge.sh",
}

_DRIZZLE_RE = re.compile(r"pgTable\(\s*[\"']([^\"']+)[\"']")
_SQLA_RE = re.compile(r"__tablename__\s*=\s*[\"']([^\"']+)[\"']")
_CREATE_TABLE_RE = re.compile(
    r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"(?:(?:[\"']?)[A-Za-z_][A-Za-z0-9_]*(?:[\"']?)\.)?"
    r"(?:[\"']?)([A-Za-z_][A-Za-z0-9_]*)",
    re.IGNORECASE,
)
_MUTATION_PATTERNS = {
    "create_table": re.compile(r"\bCREATE\s+TABLE\b", re.IGNORECASE),
    "alter_table": re.compile(r"\bALTER\s+TABLE\b", re.IGNORECASE),
    "create_index": re.compile(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\b", re.IGNORECASE),
    "drop_table": re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE),
    "connect_pg_create": re.compile(r"createTableIfMissing\s*:\s*true"),
    "drizzle_push": re.compile(r"\bdb:push\b|drizzle-kit\s+push"),
}


def _source_files(root: Path) -> Iterable[Path]:
    """Yield first-party source files only; never walk the whole Replit tree."""
    for source_root in SOURCE_ROOTS:
        base = root / source_root
        if not base.exists():
            continue
        candidates = [base] if base.is_file() else base.rglob("*")
        for path in candidates:
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            relative_parts = path.relative_to(root).parts
            if any(part in SKIP_PARTS for part in relative_parts):
                continue
            yield path


def parse_drizzle_tables(text: str) -> set[str]:
    return set(_DRIZZLE_RE.findall(text))


def parse_sqlalchemy_tables(text: str) -> set[str]:
    return set(_SQLA_RE.findall(text))


def parse_sql_created_tables(text: str) -> set[str]:
    return {match.group(1) for match in _CREATE_TABLE_RE.finditer(text)}


def parse_sql_mutations(text: str) -> list[str]:
    return sorted(name for name, pattern in _MUTATION_PATTERNS.items() if pattern.search(text))


def _digest(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def collect_inventory(root: Path) -> dict:
    drizzle: set[str] = set()
    sqlalchemy: set[str] = set()
    executable_sql: set[str] = set()
    mutation_sites: list[dict] = []

    for path in _source_files(root):
        rel = path.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        if rel.startswith("shared/"):
            drizzle.update(parse_drizzle_tables(text))
        if rel == "python/models.py" or rel.startswith("python/models/"):
            sqlalchemy.update(parse_sqlalchemy_tables(text))
        if not rel.startswith("python/tests/") and rel not in NON_RUNTIME_MUTATION_PATHS:
            executable_sql.update(parse_sql_created_tables(text))
        kinds = parse_sql_mutations(text)
        if (
            kinds
            and not rel.startswith("migrations/")
            and not rel.startswith("python/tests/")
            and rel not in NON_RUNTIME_MUTATION_PATHS
        ):
            mutation_sites.append({"path": rel, "kinds": kinds})

    package_json = root / "package.json"
    if package_json.exists():
        package_kinds = parse_sql_mutations(
            package_json.read_text(encoding="utf-8", errors="replace")
        )
        if package_kinds:
            mutation_sites.append({"path": "package.json", "kinds": package_kinds})

    mutation_sites.sort(key=lambda item: item["path"])
    authorities = {
        "drizzle": sorted(drizzle),
        "sqlalchemy": sorted(sqlalchemy),
        "executable_sql": sorted(executable_sql),
    }
    union = drizzle | sqlalchemy | executable_sql
    payload = {
        "schema": "a0.schema-inventory",
        "version": "1.0.0",
        "authorities": authorities,
        "drift": {
            "drizzle_only": sorted(drizzle - sqlalchemy - executable_sql),
            "sqlalchemy_only": sorted(sqlalchemy - drizzle - executable_sql),
            "executable_sql_only": sorted(executable_sql - drizzle - sqlalchemy),
            "missing_from_drizzle": sorted(union - drizzle),
            "missing_from_sqlalchemy": sorted(union - sqlalchemy),
        },
        "runtime_mutation_sites": mutation_sites,
        "reviewed_legacy_mutation_paths": sorted(REVIEWED_LEGACY_MUTATION_PATHS),
        "hmmm": [
            "dynamic SQL assembled without a literal mutation token may require manual review",
            "table presence does not prove column, default, constraint, index, or type equivalence",
        ],
    }
    payload["sha256"] = _digest(payload)
    return payload


def _unreviewed_sites(report: dict) -> list[str]:
    return [
        item["path"]
        for item in report["runtime_mutation_sites"]
        if item["path"] not in REVIEWED_LEGACY_MUTATION_PATHS
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    report = collect_inventory(args.root.resolve())
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")

    if args.check:
        unreviewed = _unreviewed_sites(report)
        if unreviewed:
            print("unreviewed schema mutation paths: " + ", ".join(unreviewed))
            return 2
        if not all(report["authorities"].values()):
            print("one or more legacy schema authorities were not discovered")
            return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 154:70 0:0 0:0
