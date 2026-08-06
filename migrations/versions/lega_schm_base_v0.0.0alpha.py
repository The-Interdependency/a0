# 76:57 0:0 0:0
"""Apply the reviewed legacy schema baseline.

This is the first Alembic revision for a0. It applies the full pg_dump
schema that was captured, reviewed, and digested before any Alembic history
existed. Subsequent revisions build on top of this frozen baseline.

Downgrade is intentionally closed: dropping the full schema cannot be safely
automated. Recover from a pre-migration restore point.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_legacy_schema_baseline_revision
#   module_name: legacy_schema_baseline_revision
#   module_kind: migration
#   summary: First Alembic revision; applies the reviewed, digest-locked pg_dump baseline to an empty database with no downgrade path.
#   owner: Erin Spencer
#   public_surface: alembic upgrade head
#   internal_surface: upgrade, downgrade, _CAPTURE_SHA256, _SQL_PATH
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: internal
#   user_data_boundary: write
#   admin_only: true
#   tests: python/tests/test_schema_baseline_revision.py
#   rollout: alembic upgrade head against an empty or archive-stamped database
#   rollback: restore-point recovery only; downgrade() is intentionally closed
#   requires: a0_alembic_environment, a0_live_schema_capture, a0_schema_baseline_review
#   since: 2026-08-05
#   unresolved: live apply blocked until a restore-point identifier is recorded
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: legacy_schema_baseline_revision_boundary
#   summary: Reads the committed SQL artifact, verifies its digest, and issues multi-statement DDL through the Alembic-managed connection; never reads table data, writes rows, or drops objects.
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: internal
#   user_data_boundary: write
#   admin_only: true
#   pii: none
#   secrets: none
#   side_effects: creates all legacy schema objects in the target database
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

# === CONTRACTS ===
# id: legacy_schema_baseline_digest_locked
#   given: the SQL artifact on disk
#   then: upgrade() verifies SHA-256 matches the value pinned at review time and raises RuntimeError on any mismatch before touching the database
#   class: safety
#   since: 2026-08-05
#
# id: legacy_schema_baseline_empty_apply
#   given: an empty PostgreSQL database with no prior schema
#   then: upgrade() creates the full reviewed object set and leaves no orphan psql metacommands in the executed SQL
#   class: correctness
#   since: 2026-08-05
#
# id: legacy_schema_baseline_downgrade_closed
#   given: any caller invoking downgrade()
#   then: NotImplementedError is raised immediately and no DDL is executed
#   class: safety
#   since: 2026-08-05
# === END CONTRACTS ===

import hashlib
import pathlib

from alembic import op

revision = "lega_schm_base_v0_0_0alpha"
down_revision = None
branch_labels = None
depends_on = None

_CAPTURE_SHA256 = (
    "a37c91fda92ada79003e55c4c8a28b9d193d37ae84f427768423bc608b3a134a"
)
_SQL_PATH = (
    pathlib.Path(__file__).parent.parent
    / "sql"
    / "lega_schm_base_v0.0.0alpha.sql"
)


def upgrade() -> None:
    """Verify digest then apply the full reviewed legacy schema baseline."""
    sql_bytes = _SQL_PATH.read_bytes()
    actual = hashlib.sha256(sql_bytes).hexdigest()
    if actual != _CAPTURE_SHA256:
        raise RuntimeError(
            f"lega_schm_base digest mismatch — "
            f"expected {_CAPTURE_SHA256!r}, got {actual!r}. "
            "Re-run the capture and review cycle before applying."
        )
    # Strip psql client-side metacommands (lines starting with backslash).
    # These are not valid SQL and must not reach the server.
    clean = "\n".join(
        line
        for line in sql_bytes.decode("utf-8").splitlines()
        if not line.startswith("\\")
    )
    # PoolProxiedConnection.cursor() returns a raw psycopg2 cursor.
    # cursor.execute() without parameters uses the simple-query protocol,
    # which supports multi-statement schema-only scripts.
    conn = op.get_bind().connection
    cur = conn.cursor()
    cur.execute(clean)
    # The legacy pg_dump SQL sets search_path='' (non-local) to prevent
    # schema ambiguity during DDL. Reset it so Alembic can locate its own
    # alembic_version table for the post-migration stamp insert.
    cur.execute("RESET search_path")


def downgrade() -> None:
    """Downgrade is intentionally closed for the legacy schema baseline.

    Dropping the full schema cannot be automated safely. To revert, restore
    from the pre-migration restore point recorded before upgrade was applied.
    """
    raise NotImplementedError(
        "downgrade() is disabled for the legacy schema baseline revision. "
        "Restore from a restore point to revert."
    )
# 76:57 0:0 0:0
