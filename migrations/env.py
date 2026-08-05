# 59:60 0:0 0:0
"""Alembic environment for a0's PostgreSQL schema.

`env.py` is an Alembic-mandated filename and therefore a documented exception
to a0's PCEA filename rule. Migration revisions remain explicitly named and
reviewed. Autogeneration is disabled until the legacy Drizzle, SQLAlchemy, and
runtime-SQL schemas have been reconciled into one complete metadata authority.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_alembic_environment
#   module_name: alembic_environment
#   module_kind: migration
#   summary: Configures transactional PostgreSQL migrations while refusing unsafe autogeneration against incomplete legacy metadata.
#   owner: Erin Spencer
#   public_surface: alembic offline and online migration execution
#   internal_surface: _database_url, run_migrations_offline, run_migrations_online
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: internal
#   user_data_boundary: write
#   admin_only: true
#   tests: python/tests/test_schema_migration_foundation.py
#   rollout: invoked with alembic -c albm_conf_file_v0.0.0alpha.ini
#   rollback: remove the Alembic environment before any revision is applied
#   requires: a0_schema_inventory, a0_live_schema_capture
#   since: 2026-08-05
#   unresolved: complete target_metadata is intentionally absent until the captured legacy baseline is reconciled
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: alembic_environment_migration_boundary
#   summary: Opens the configured PostgreSQL database only for explicit Alembic commands and wraps supported DDL in transactions.
#   auth_boundary: admin
#   storage_boundary: migration
#   network_boundary: internal
#   user_data_boundary: write
#   admin_only: true
#   pii: possible
#   secrets: read
#   side_effects: explicit migration commands only
#   review_required: database-owner
#   owner: database-owner
#   since: 2026-08-05
# === END BOUNDARIES ===

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import make_url

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

# No autogeneration against python.models.Base yet: it is incomplete relative
# to Drizzle and executable startup SQL. Revisions are captured/reviewed SQL
# until one complete SQLAlchemy metadata authority is established.
target_metadata = None


def _database_url() -> str:
    raw = os.environ.get("DATABASE_URL")
    if not raw:
        raise RuntimeError("DATABASE_URL must be set for Alembic")
    url = make_url(raw)
    if url.drivername in {
        "postgres",
        "postgresql",
        "postgresql+asyncpg",
        "postgresql+psycopg",
    }:
        url = url.set(drivername="postgresql+psycopg2")
    return url.render_as_string(hide_password=False)


def _reject_autogenerate() -> None:
    opts = getattr(config, "cmd_opts", None)
    if getattr(opts, "autogenerate", False):
        raise RuntimeError(
            "Alembic autogenerate is disabled until a0 has one complete metadata authority"
        )


def run_migrations_offline() -> None:
    _reject_autogenerate()
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        transactional_ddl=True,
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    _reject_autogenerate()
    section = config.get_section(config.config_ini_section) or {}
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            transactional_ddl=True,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
# 59:60 0:0 0:0
