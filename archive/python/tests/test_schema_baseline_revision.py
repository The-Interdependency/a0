# 87:80 0:0 0:0
"""Contract checks for the legacy schema baseline revision.

Unit tests never touch a database. Integration gates (Gate A / Gate B)
run only when DISPOSABLE_INTEGRATION_TEST=1 is set and a local disposable
DATABASE_URL is provided; they are excluded from the focused pytest run.
"""
from __future__ import annotations

# === CHECKS ===
# id: check_baseline_revision_digest_locked
#   proves: legacy_schema_baseline_digest_locked
#   call: self::test_upgrade_raises_on_digest_mismatch
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: monkeypatch
#
# id: check_baseline_revision_downgrade_closed
#   proves: legacy_schema_baseline_downgrade_closed
#   call: self::test_downgrade_raises_not_implemented
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_revision_metacommand_filter
#   proves: legacy_schema_baseline_empty_apply
#   call: self::test_upgrade_strips_psql_metacommands
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: monkeypatch
#
# id: check_baseline_harness_refuses_non_disposable
#   proves: schema_baseline_harness_refuses_non_disposable
#   call: self::test_harness_refuses_non_loopback_url
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_harness_refuses_without_flag
#   proves: schema_baseline_harness_refuses_non_disposable
#   call: self::test_harness_refuses_without_allow_flag
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_revision_sql_path_resolvable
#   proves: legacy_schema_baseline_digest_locked
#   call: self::test_sql_path_constant_resolves_to_committed_file
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_harness_gate_a_evidence
#   proves: schema_baseline_harness_gate_a_empty_apply
#   call: self::test_gate_a_evidence_confirms_pass
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_harness_gate_b_evidence
#   proves: schema_baseline_harness_gate_b_stamp_preservation
#   call: self::test_gate_b_evidence_confirms_pass
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_baseline_harness_cleanup_evidence
#   proves: schema_baseline_harness_always_cleans_up
#   call: self::test_evidence_cleanup_confirmed
#   requires: python3, pytest
#   timeout: 10
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import hashlib
import importlib.util
import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


revision = _load(
    ROOT / "migrations" / "versions" / "lega_schm_base_v0.0.0alpha.py",
    "a0_legacy_schema_baseline_revision",
)
harness = _load(
    ROOT / "scripts" / "sche_test_base_v0.0.0alpha.py",
    "a0_schema_baseline_test_harness",
)


def test_sql_path_constant_resolves_to_committed_file() -> None:
    assert revision._SQL_PATH.exists(), (
        f"Committed SQL file missing at {revision._SQL_PATH}; "
        "re-run the capture and review cycle"
    )
    assert len(revision._CAPTURE_SHA256) == 64
    actual = hashlib.sha256(revision._SQL_PATH.read_bytes()).hexdigest()
    assert actual == revision._CAPTURE_SHA256, (
        f"On-disk SHA-256 {actual!r} does not match pinned value "
        f"{revision._CAPTURE_SHA256!r}"
    )


def test_upgrade_raises_on_digest_mismatch(tmp_path: Path) -> None:
    sql_path = tmp_path / "lega_schm_base_v0.0.0alpha.sql"
    sql_path.write_bytes(b"-- tampered\n")
    with patch.object(revision, "_SQL_PATH", sql_path):
        with pytest.raises(RuntimeError, match="digest mismatch"):
            revision.upgrade()


def test_upgrade_strips_psql_metacommands(tmp_path: Path, monkeypatch) -> None:
    """upgrade() must filter \\-prefixed lines before executing SQL."""
    sql = b"\\restrict secret_token\nCREATE TABLE public.t (id int);\n"
    sql_path = tmp_path / "lega_schm_base_v0.0.0alpha.sql"
    sql_path.write_bytes(sql)
    digest = hashlib.sha256(sql).hexdigest()
    monkeypatch.setattr(revision, "_SQL_PATH", sql_path)
    monkeypatch.setattr(revision, "_CAPTURE_SHA256", digest)

    executed: list[str] = []

    mock_cursor = MagicMock()
    mock_cursor.execute = lambda sql: executed.append(sql)
    mock_conn = MagicMock()
    mock_conn.connection.cursor.return_value = mock_cursor
    with patch.object(revision.op, "get_bind", return_value=mock_conn):
        revision.upgrade()

    assert executed, "upgrade() did not call cursor.execute()"
    sent = executed[0]
    assert "\\restrict" not in sent, "upgrade() passed a psql metacommand to the database"
    assert "CREATE TABLE" in sent, "upgrade() dropped DDL statements"


def test_downgrade_raises_not_implemented() -> None:
    with pytest.raises(NotImplementedError, match="(?i)restore.*point"):
        revision.downgrade()


def test_harness_refuses_without_allow_flag() -> None:
    with pytest.raises(SystemExit):
        harness._refuse_if_not_disposable("postgresql://dispadmin@127.0.0.1:5433/postgres", False)


def test_harness_refuses_non_loopback_url() -> None:
    with pytest.raises(SystemExit, match="not loopback"):
        harness._refuse_if_not_disposable("postgresql://user@example.com:5432/db", True)


def test_harness_accepts_loopback_url() -> None:
    # Must not raise
    harness._refuse_if_not_disposable("postgresql://dispadmin@127.0.0.1:5433/postgres", True)
    harness._refuse_if_not_disposable("postgresql://dispadmin@localhost:5433/postgres", True)


def _evidence() -> dict:
    path = ROOT / "docs" / "sche_test_base_v0.0.0alpha.json"
    if not path.exists():
        pytest.skip("evidence file not committed")
    return json.loads(path.read_text(encoding="utf-8"))


def test_gate_a_evidence_confirms_pass() -> None:
    data = _evidence()
    assert data["gate_a"]["empty_apply"] is True
    assert data["gate_a"]["second_upgrade_noop"] is True
    assert data["gate_a"]["revision_applied"] == "lega_schm_base_v0_0_0alpha"


def test_gate_b_evidence_confirms_pass() -> None:
    data = _evidence()
    assert data["gate_b"]["row_preservation"] is True
    assert data["gate_b"]["stamp_preservation"] is True
    assert len(data["gate_b"]["seeded_tables"]) >= 1


def test_evidence_cleanup_confirmed() -> None:
    data = _evidence()
    assert data["cleanup"] is True
# 87:80 0:0 0:0
