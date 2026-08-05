# 111:62 0:0 0:0
"""Migration-foundation contract checks.

Filename exception: pytest imports test modules by Python module name, so the
period-bearing PCEA version suffix is not importable under the repository's
default pytest mode. This conventional `test_*.py` name is a documented tool
boundary; migration scripts and artifacts retain PCEA names.
"""
from __future__ import annotations

# === CHECKS ===
# id: check_schema_inventory_three_authorities
#   proves: schema_inventory_reports_three_authorities
#   call: self::test_repository_inventory_exposes_legacy_drift
#   requires: python3, pytest
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_schema_inventory_mutation_sites
#   proves: schema_inventory_reports_mutation_sites, schema_inventory_check_fails_on_unreviewed_mutation_site
#   call: self::test_inventory_detects_and_checks_mutation_sites
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: pytest_tmp_path
#
# id: check_live_schema_capture_read_only
#   proves: live_schema_capture_is_read_only, live_schema_capture_redacts_connection
#   call: self::test_capture_uses_read_only_pg_dump_flags_and_redacts_failure
#   requires: python3, pytest
#   timeout: 20
#   mutates: process_mock
#   cleanup: monkeypatch_restore
#
# id: check_live_schema_capture_deterministic
#   proves: live_schema_capture_is_deterministic
#   call: self::test_normalize_dump_removes_volatile_lines
#   requires: python3, pytest
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_schema_migration_status_exact_match
#   proves: schema_migration_status_exact_set_match
#   call: self::test_schema_status_requires_exact_nonempty_match
#   requires: python3, pytest, alembic
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_alembic_control_plane_loads
#   proves: alembic_environment_migration_boundary
#   call: self::test_alembic_configuration_loads_without_database
#   requires: python3, pytest, alembic
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import importlib.util
import subprocess
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory

ROOT = Path(__file__).resolve().parents[2]


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


inventory = _load(
    ROOT / "scripts" / "sche_invt_repo_v0.0.0alpha.py", "a0_schema_inventory"
)
capture = _load(
    ROOT / "scripts" / "sche_capt_live_v0.0.0alpha.py", "a0_schema_capture"
)
status = _load(
    ROOT / "scripts" / "sche_migr_stat_v0.0.0alpha.py", "a0_schema_status"
)


def test_repository_inventory_exposes_legacy_drift() -> None:
    if not (ROOT / "shared" / "schema.ts").exists():
        pytest.skip("synthetic local workspace has no repository schema")
    report = inventory.collect_inventory(ROOT)
    assert "agent_instances" in report["authorities"]["drizzle"]
    assert "conversations" in report["authorities"]["sqlalchemy"]
    assert "security_probes" in report["authorities"]["executable_sql"]
    assert "agent_instances" in report["drift"]["drizzle_only"]
    assert "security_probes" in report["drift"]["executable_sql_only"]
    assert len(report["sha256"]) == 64


def test_inventory_detects_and_checks_mutation_sites(tmp_path: Path) -> None:
    (tmp_path / "shared").mkdir()
    (tmp_path / "python").mkdir()
    (tmp_path / "server").mkdir()
    (tmp_path / "shared" / "schema.ts").write_text(
        'export const alpha = pgTable("alpha", {});', encoding="utf-8"
    )
    (tmp_path / "python" / "models.py").write_text(
        'class Beta:\n    __tablename__ = "beta"\n', encoding="utf-8"
    )
    ddl = "CREATE " + "TABLE IF NOT EXISTS gamma (id INTEGER);"
    (tmp_path / "server" / "new_boot.ts").write_text(ddl, encoding="utf-8")

    report = inventory.collect_inventory(tmp_path)
    assert report["authorities"]["drizzle"] == ["alpha"]
    assert report["authorities"]["sqlalchemy"] == ["beta"]
    assert report["authorities"]["executable_sql"] == ["gamma"]
    assert inventory._unreviewed_sites(report) == ["server/new_boot.ts"]


def test_normalize_dump_removes_volatile_lines() -> None:
    raw = """-- Dumped from database version 17.1
-- Dumped by pg_dump version 17.2
SET statement_timeout = 0;

CREATE TABLE public.alpha (id integer);

-- Completed on 2026-08-05 12:00:00
"""
    assert capture.normalize_dump(raw) == "CREATE TABLE public.alpha (id integer);\n"


def test_capture_uses_read_only_pg_dump_flags_and_redacts_failure(monkeypatch) -> None:
    recorded: dict = {}

    def fake_which(name: str) -> str:
        assert name == "pg_dump"
        return "/usr/bin/pg_dump"

    def fake_run(command, **kwargs):
        recorded["command"] = command
        return subprocess.CompletedProcess(command, 7, stdout="", stderr="secret-url")

    monkeypatch.setattr(capture.shutil, "which", fake_which)
    monkeypatch.setattr(capture.subprocess, "run", fake_run)
    secret = "postgresql://user:password@example.invalid/a0"
    with pytest.raises(RuntimeError, match="exit code 7") as exc:
        capture.capture_schema(secret)
    assert secret not in str(exc.value)
    command = recorded["command"]
    assert "--schema-only" in command
    assert "--no-owner" in command
    assert "--no-privileges" in command
    assert "--quote-all-identifiers" in command


def test_schema_status_requires_exact_nonempty_match() -> None:
    assert status.build_status([], ["legacy"])["at_head"] is False
    assert status.build_status(["head"], [])["at_head"] is False
    assert status.build_status(["head"], ["head"])["at_head"] is True
    assert status.build_status(["a", "b"], ["a"])["at_head"] is False


def test_alembic_configuration_loads_without_database() -> None:
    config_path = ROOT / "albm_conf_file_v0.0.0alpha.ini"
    config = Config(str(config_path))
    script = ScriptDirectory.from_config(config)
    assert Path(script.dir).resolve() == (ROOT / "migrations").resolve()
    assert script.get_heads() == []
    env_text = (ROOT / "migrations" / "env.py").read_text(encoding="utf-8")
    assert "target_metadata = None" in env_text
    assert "autogenerate is disabled" in env_text
# 111:62 0:0 0:0
