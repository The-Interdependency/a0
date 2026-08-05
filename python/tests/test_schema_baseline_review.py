# 59:58 0:0 0:0
"""Contract checks for captured-schema baseline review.

The conventional pytest filename is a documented import-tool exception; the
production script retains its PCEA filename.
"""
from __future__ import annotations

# === CHECKS ===
# id: check_schema_baseline_review_digest
#   proves: schema_baseline_review_requires_matching_digest
#   call: self::test_review_requires_matching_digest
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: pytest_tmp_path
#
# id: check_schema_baseline_review_safety
#   proves: schema_baseline_review_rejects_data_and_authority_statements
#   call: self::test_review_rejects_unsafe_statement_classes
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: pytest_tmp_path
#
# id: check_schema_baseline_review_inventory
#   proves: schema_baseline_review_reports_object_inventory, schema_baseline_review_preserves_drift
#   call: self::test_review_reports_objects_and_preserves_drift
#   requires: python3, pytest
#   timeout: 20
#   mutates: temporary_files
#   cleanup: pytest_tmp_path
# === END CHECKS ===

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "sche_revw_base_v0.0.0alpha.py"


def _load():
    spec = importlib.util.spec_from_file_location("a0_schema_baseline_review", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


subject = _load()


def _capture(tmp_path: Path, sql: str) -> tuple[Path, Path]:
    sql_path = tmp_path / "capture.sql"
    sql_path.write_text(sql, encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    digest_path = tmp_path / "capture.sql.sha256"
    digest_path.write_text(f"{digest}  capture.sql\n", encoding="utf-8")
    return sql_path, digest_path


def test_review_requires_matching_digest(tmp_path: Path) -> None:
    sql_path, digest_path = _capture(tmp_path, "CREATE TABLE public.alpha (id integer);\n")
    assert subject.verify_digest(sql_path.read_bytes(), digest_path) == hashlib.sha256(sql_path.read_bytes()).hexdigest()
    digest_path.write_text("0" * 64 + "  capture.sql\n", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        subject.review_capture(sql_path, digest_path)


@pytest.mark.parametrize(
    "fragment, expected",
    [
        ("COPY public.alpha FROM stdin;", "copy_data"),
        ("INSERT INTO alpha VALUES (1);", "insert_data"),
        ("GRANT SELECT ON alpha TO public;", "grant_privilege"),
        ("ALTER TABLE alpha OWNER TO admin;", "owner_change"),
        ("postgresql://user:secret@example.invalid/a0", "database_url"),
    ],
)
def test_review_rejects_unsafe_statement_classes(tmp_path: Path, fragment: str, expected: str) -> None:
    sql_path, digest_path = _capture(tmp_path, fragment + "\n")
    with pytest.raises(ValueError, match=expected):
        subject.review_capture(sql_path, digest_path)


def test_function_body_dml_is_not_mistaken_for_dumped_data(tmp_path: Path) -> None:
    sql = """
CREATE TABLE public.alpha (id integer);
CREATE FUNCTION public.touch_alpha() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.alpha SET id = id WHERE id = NEW.id;
  RETURN NEW;
END
$$;
""".lstrip()
    sql_path, digest_path = _capture(tmp_path, sql)
    report = subject.review_capture(sql_path, digest_path)
    assert report["objects"]["functions"] == ["public.touch_alpha"]


def test_review_reports_objects_and_preserves_drift(tmp_path: Path) -> None:
    sql = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE public.run_state AS ENUM ('queued', 'done');
CREATE TABLE public.alpha (id integer);
CREATE TABLE "public"."live_only" (id integer);
CREATE SEQUENCE public.alpha_id_seq;
CREATE UNIQUE INDEX alpha_idx ON public.alpha (id);
ALTER TABLE ONLY public.alpha ADD CONSTRAINT alpha_pk PRIMARY KEY (id);
CREATE FUNCTION public.touch_alpha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER alpha_touch BEFORE UPDATE ON public.alpha FOR EACH ROW EXECUTE FUNCTION public.touch_alpha();
""".lstrip()
    sql_path, digest_path = _capture(tmp_path, sql)
    inventory_path = tmp_path / "inventory.json"
    inventory_path.write_text(
        json.dumps({
            "authorities": {
                "drizzle": ["alpha", "source_only"],
                "sqlalchemy": ["alpha"],
                "executable_sql": [],
            }
        }),
        encoding="utf-8",
    )

    report = subject.review_capture(sql_path, digest_path, inventory_path)
    assert report["objects"]["tables"] == ["public.alpha", "public.live_only"]
    assert report["objects"]["indexes"] == ["alpha_idx"]
    assert report["objects"]["functions"] == ["public.touch_alpha"]
    assert report["objects"]["triggers"] == ["alpha_touch"]
    assert report["table_drift"] == {
        "live_only": ["live_only"],
        "source_only": ["source_only"],
    }
    assert report["safe_for_baseline_authoring"] is True
# 59:58 0:0 0:0
