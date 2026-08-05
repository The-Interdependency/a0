# Schema migration foundation

Status: control plane implemented; captured legacy baseline pending a read-only run against the archive-shaped Replit PostgreSQL database.

Stack base: `feat/replit-backend-foundation@f8dda5c9c7ca529b53d50c0e5414bd1048ad8976`

## Purpose

Move a0 from opportunistic schema repair during application startup to explicit, versioned, transactional PostgreSQL migrations without losing tables or data that exist under any of the three legacy schema authorities.

## Existing authority conflict

At the stack base, schema ownership is split among:

1. `shared/schema.ts` and `shared/models/auth.ts` — Drizzle declarations and `db:push`;
2. `python/models.py` — incomplete SQLAlchemy metadata consumed by Python storage code;
3. executable SQL and command surfaces — deployment, startup, request-path, and post-merge mutation in:
   - `.github/workflows/deploy.yml`;
   - `package.json` (`db:push` command definition);
   - `python/main.py`;
   - `server/auth/setup.ts`;
   - `python/routes/billing.py`;
   - `scripts/post-merge.sh`.

These sources do not describe the same database.

Examples:

- `agent_instances` is declared by Drizzle but not by SQLAlchemy metadata;
- `transcript_explanations` and `explanation_credits` are declared by SQLAlchemy and startup SQL but not by Drizzle;
- `security_probes` exists only as Express startup SQL;
- `agent_runs` has worker-supervision columns in startup SQL that are absent from the Drizzle declaration;
- `messages` and `conversations` have columns added during startup that are absent from the current SQLAlchemy models;
- `bandit_arms` is declared by Drizzle and recreated by the post-merge script while Python comments describe it as removed.

|∆|The first migration authority must preserve the union before choosing the final model authority.|∆|

## This slice

This branch introduces:

- an Alembic environment with transactional PostgreSQL DDL;
- an explicit refusal to autogenerate against incomplete SQLAlchemy metadata;
- a repository schema inventory that exposes table and mutation-site drift;
- a read-only `pg_dump` capture tool with deterministic normalization and digest output;
- child-only libpq environment decomposition so database credentials do not appear in `pg_dump` arguments;
- a bounded migration-status probe;
- contract checks that require every known mutation site and prove the capture/status boundaries.

This slice does **not** yet:

- claim that the legacy schema has been captured;
- add a baseline revision;
- stamp or mutate any database;
- remove existing startup DDL;
- run `drizzle-kit push`;
- alter existing agent records.

## File plan

| path | change | purpose | risk | required evidence |
|---|---|---|---|---|
| `albm_conf_file_v0.0.0alpha.ini` | create | Alembic configuration without a committed credential | wrong script path | Alembic ScriptDirectory load |
| `migrations/env.py` | create | transactional migration execution and autogenerate refusal | tool-standard filename exception; database mutation when invoked | config load; explicit operator invocation |
| `migrations/script.py.mako` | create | bounded future revision template | generated revision missing local declarations | review before first revision |
| `scripts/sche_invt_repo_v0.0.0alpha.py` | create | expose legacy authority and mutation drift | syntactic parser misses dynamic SQL | repository inventory plus manual review |
| `scripts/sche_capt_live_v0.0.0alpha.py` | create | capture schema-only PostgreSQL evidence | credential leakage or volatile output | mocked flags, redaction and deterministic-normalization checks |
| `scripts/sche_migr_stat_v0.0.0alpha.py` | create | compare database revisions with repository heads | false readiness | exact nonempty set-match check |
| `python/tests/test_schema_migration_foundation.py` | create | executable evidence for this slice | pytest filename exception | complete test pass |

## Tool-mandated filename exceptions

Two tooling constraints conflict with the period-bearing PCEA filename suffix:

- Alembic requires `migrations/env.py` and conventionally consumes `script.py.mako` from the script directory.
- Pytest's default importer cannot collect a Python test filename containing the PCEA suffix `v0.0.0alpha`; it attempts to import the segments after each period as packages.

Therefore:

- Alembic-mandated filenames are retained and declared as explicit exceptions in their owning documentation.
- The test module uses the conventional importable name `test_schema_migration_foundation.py`.
- Operator scripts and generated evidence retain PCEA filenames.

This is not silent noncompliance. It is a language/tool boundary that the PCEA naming doctrine must eventually encode.

## Executed non-mutating gate

The connected Replit workspace was inspected at migration commit `4d0376e755fbc09689bddb5b42c5501e8301b594` with a clean detached worktree. No branch, source file, schema or persistent row was changed.

Results:

- `npm run check`: pass, zero TypeScript errors;
- `npm run build`: pass, client and server production bundles created;
- focused readiness and migration suite: 10 passed;
- contract runner: 45 pass, 0 fail, 0 error;
- console-tab regression guard: 18 tabs checked, no missing or orphan renderer;
- PostgreSQL server: 16.10;
- path-default `psql`: 16.10;
- path-default `pg_dump`: 16.10.

The former PostgreSQL 15 client conflict is therefore resolved. The refreshed stack merge replaces that checkout's transitional contract runner with the parent branch's stricter source-CONTRACTS/test-CHECKS graph and retains only the eight migration-specific files. A final refreshed-head gate remains required before merge.

## Baseline capture protocol

The next database operation is read-only:

```bash
python scripts/sche_invt_repo_v0.0.0alpha.py \
  --output docs/schema-inventory.json \
  --check

python scripts/sche_capt_live_v0.0.0alpha.py \
  --output migrations/sql/lega_schm_base_v0.0.0alpha.sql
```

Before capture:

1. verify the target is the current a0 PostgreSQL database;
2. record a database backup or snapshot identifier;
3. record PostgreSQL server and `pg_dump` major versions;
4. verify the application branch and commit;
5. stop if the database is actively undergoing an unrelated migration.

The capture tool uses `pg_dump --schema-only --no-owner --no-privileges --no-comments --quote-all-identifiers`. It decomposes `DATABASE_URL` into child-only libpq environment fields, writes SQL and an adjacent SHA-256 file, and executes no SQL.

## Baseline review gate

The captured SQL becomes a baseline revision only after review proves:

- every live table, sequence, constraint, index, default, extension, function and trigger is represented;
- no data rows, owners, grants, passwords, connection strings or deployment-specific hostnames are present;
- the inventory explains every source declaration absent from the live database and every live object absent from source declarations;
- an empty temporary PostgreSQL database can apply the baseline;
- applying the baseline-equivalent revision to an archive-shaped fixture preserves representative rows and identifiers;
- a second `upgrade head` is a no-op;
- downgrade behavior is explicitly declared rather than guessed.

Only then should a revision be added under `migrations/versions/`.

## Cutover sequence

### A. Preservation

- capture and review the archive-shaped schema;
- create the immutable baseline revision and digest;
- prove empty-database creation and archive-shaped upgrade;
- stamp only after schema equivalence is proven.

### B. Reconciliation

- move `security_probes`, recovery, Stripe idempotency, fleet, transcript, instance and run schema into revisions;
- reconcile Drizzle and SQLAlchemy declarations against the reviewed database shape;
- select one complete SQLAlchemy metadata authority for future Alembic revisions;
- preserve TypeScript types without retaining an independent production DDL writer.

### C. Cutover

- replace `npm run db:push` in operational paths with `alembic upgrade head`;
- set `connect-pg-simple.createTableIfMissing` to false after sessions are migrated;
- remove schema mutation from `.github/workflows/deploy.yml`, `python/main.py`, `server/auth/setup.ts`, `python/routes/billing.py` and `scripts/post-merge.sh`;
- make deployment readiness require an exact nonempty Alembic head match;
- fail startup before accepting traffic when the database is behind or migration fails.

## Commands after baseline exists

```bash
alembic -c albm_conf_file_v0.0.0alpha.ini heads
alembic -c albm_conf_file_v0.0.0alpha.ini current
alembic -c albm_conf_file_v0.0.0alpha.ini upgrade head
python scripts/sche_migr_stat_v0.0.0alpha.py
```

## Rollback

Before a baseline revision is added, rollback is deletion of this control-plane slice; no database state has changed.

After migrations begin:

- each release records the pre-migration backup identifier;
- application rollback must declare the compatible schema revision range;
- destructive downgrade is forbidden unless a reviewed data-restoration path exists;
- a failed migration leaves the service unready and must not be bypassed by startup repair SQL.

## hmmm

- Exact live schema SQL, digest and backup identifier remain pending capture.
- Whether the current database contains historical objects no longer mentioned by any source remains unknown until capture.
- The final complete SQLAlchemy metadata module does not yet exist; Alembic autogeneration therefore remains disabled.
- The PCEA naming doctrine needs an explicit Python-import/tool-mandated filename exception.
- Retention and backup policy for production database snapshots remains to be settled before destructive migrations.
- The refreshed head must repeat the non-mutating gate before this draft may merge.