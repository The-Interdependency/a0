# Schema migration foundation

Status: migration control plane and captured-schema review gate implemented; live schema capture, baseline revision, and database cutover remain pending.

Stack base: `feat/replit-backend-foundation@d73a70a0395019968bf9258af345cd17b7ebfb8b`

## Purpose

Move a0 from opportunistic schema repair during application startup to explicit, versioned, transactional PostgreSQL migrations without losing tables or data owned by any of the three legacy schema authorities.

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
- a captured-schema reviewer that verifies digest integrity, rejects data/role/privilege-bearing SQL, inventories PostgreSQL objects, and preserves live-versus-source drift;
- contract checks that prove the inventory, capture, status, and review boundaries.

This slice does **not** yet:

- claim that the live legacy schema has been captured;
- add a baseline revision;
- stamp or mutate any database;
- remove existing startup DDL;
- run `drizzle-kit push`;
- alter existing agent records.

## File plan

| path | purpose | risk | required evidence |
|---|---|---|---|
| `albm_conf_file_v0.0.0alpha.ini` | Alembic configuration without a committed credential | wrong script path | Alembic `ScriptDirectory` load |
| `migrations/env.py` | transactional migration execution and autogenerate refusal | tool-standard filename exception; database mutation when invoked | config load; operator-only boundary |
| `migrations/script.py.mako` | bounded future revision template | incomplete generated revision | review before first revision |
| `scripts/sche_invt_repo_v0.0.0alpha.py` | expose legacy authority and mutation drift | syntactic parser misses dynamic SQL | repository inventory plus manual review |
| `scripts/sche_capt_live_v0.0.0alpha.py` | capture schema-only PostgreSQL evidence | credential leakage or volatile output | mocked flags, redaction, libpq decomposition, deterministic normalization |
| `scripts/sche_migr_stat_v0.0.0alpha.py` | compare database revisions with repository heads | false readiness | exact nonempty set-match check |
| `scripts/sche_revw_base_v0.0.0alpha.py` | reject unsafe captures and expose object/source drift before revision authoring | false confidence from syntactic review | digest, unsafe-class, function-body, object and drift tests |
| `python/tests/test_schema_migration_foundation.py` | executable evidence for control-plane behavior | pytest filename exception | focused test pass |
| `python/tests/test_schema_baseline_review.py` | executable evidence for captured-schema review | parser blind spots | focused test pass plus later PostgreSQL fixture comparison |
| `docs/sche_migr_foun_v0.0.0alpha.md` | preservation and cutover protocol | false completion claim | explicit pending boundaries |

## Tool-mandated filename exceptions

Two tooling constraints conflict with the period-bearing PCEA filename suffix:

- Alembic requires `migrations/env.py` and conventionally consumes `script.py.mako` from the script directory.
- Pytest's default importer cannot collect a Python test filename containing the PCEA suffix `v0.0.0alpha`; it attempts to import segments after each period as packages.

Therefore:

- Alembic-mandated filenames are retained and declared as explicit exceptions.
- Test modules use conventional importable `test_*.py` names.
- Operator scripts and generated evidence retain PCEA filenames.

This is not silent noncompliance. It is a language/tool boundary that the PCEA naming doctrine must eventually encode.

## Executed non-mutating gates

### Parent contract graph

Parent commit `d73a70a0395019968bf9258af345cd17b7ebfb8b` was validated in a disposable Replit checkout:

- all seven evidence-graph repair files compiled;
- 39 source contracts and 40 test-owned CHECKS;
- zero evidence-graph gaps;
- contract-runner unit suite: 5 passed;
- no executable DB-writing contract checks were run;
- live database and original app checkout remained unchanged.

### Migration head before captured-schema reviewer

Disposable validation of migration commit `f2966d7e0b6247dd199708057d77021ff3306523` reported:

- Python compilation passed for migration and parent repair files;
- focused pytest: 12 passed;
- schema inventory `--check`: pass; all six legacy mutation paths classified;
- graph-only audit: 50 contracts, 47 CHECKS, 0 gaps, 0 warnings;
- `npm run check`: pass;
- `npm run build`: pass;
- original app checkout and live database unchanged.

PostgreSQL server, path-default `psql`, and path-default `pg_dump` are all version 16.10. The former PostgreSQL 15 client conflict is resolved.

### Captured-schema reviewer

The isolated reviewer suite passes 8 tests covering digest mismatch, unsafe statement classes, function-body DML masking, object inventory, and visible drift. The complete current-head Replit gate remains required because the connected Replit Agent is still occupied with the disposable production-runtime validation.

## Capture and review protocol

The next live database operation is read-only:

```bash
python scripts/sche_invt_repo_v0.0.0alpha.py \
  --output docs/schema-inventory.json \
  --check

python scripts/sche_capt_live_v0.0.0alpha.py \
  --output migrations/sql/lega_schm_base_v0.0.0alpha.sql

python scripts/sche_revw_base_v0.0.0alpha.py \
  --sql migrations/sql/lega_schm_base_v0.0.0alpha.sql \
  --inventory docs/schema-inventory.json \
  --output docs/schema-baseline-review.json
```

Before capture:

1. verify the target is the current a0 PostgreSQL database;
2. record PostgreSQL server and `pg_dump` major versions;
3. verify the application branch and commit;
4. verify no unrelated migration is active;
5. record a backup, restore-point, or checkpoint identifier before any later apply/stamp operation. The read-only capture itself does not require database mutation.

The capture tool uses `pg_dump --schema-only --no-owner --no-privileges --no-comments --quote-all-identifiers`. It decomposes `DATABASE_URL` into child-only libpq environment fields, writes SQL and adjacent SHA-256 evidence, and executes no SQL.

The reviewer then:

- requires the SQL bytes to match the recorded SHA-256;
- rejects top-level data movement, role/database creation, owner changes, grants/revokes, psql connection commands, and embedded PostgreSQL URLs;
- masks dollar-quoted function bodies before checking for top-level data mutation;
- inventories tables, sequences, indexes, types, extensions, functions, triggers, and constraints;
- reports `live_only` and `source_only` tables rather than silently resolving the disagreement.

|∆|`safe_for_baseline_authoring` means the capture is reviewable; it does not prove that applying it preserves data or recreates equivalent PostgreSQL semantics.|∆|

## Baseline revision gate

Captured SQL becomes a baseline revision only after review and fixture evidence prove:

- every intended live table, sequence, constraint, index, default, extension, function, and trigger is represented;
- no data rows, owners, grants, passwords, connection strings, or deployment-specific hostnames are present;
- every source declaration absent from the live database and every live object absent from source declarations remains visible and adjudicated;
- an empty temporary PostgreSQL database can apply the baseline;
- an archive-shaped fixture can be stamped or upgraded without changing representative rows, identifiers, counts, constraints, or application-visible behavior;
- a second `upgrade head` is a no-op;
- downgrade behavior is explicitly declared rather than guessed.

Only then should a revision be added under `migrations/versions/`.

## Cutover sequence

### A. Preservation

- capture and review the archive-shaped schema;
- create the immutable baseline revision and digest;
- prove empty-database creation and archive-shaped preservation;
- stamp only after schema equivalence is proven.

### B. Reconciliation

- move `security_probes`, recovery, Stripe idempotency, fleet, transcript, instance, and run schema into revisions;
- reconcile Drizzle and SQLAlchemy declarations against the reviewed database shape;
- select one complete SQLAlchemy metadata authority for future Alembic revisions;
- preserve TypeScript types without retaining an independent production DDL writer.

### C. Cutover

- replace operational `npm run db:push` paths with `alembic upgrade head`;
- set `connect-pg-simple.createTableIfMissing` to false after sessions are migrated;
- remove schema mutation from `.github/workflows/deploy.yml`, `python/main.py`, `server/auth/setup.ts`, `python/routes/billing.py`, and `scripts/post-merge.sh`;
- make deployment readiness require an exact nonempty Alembic head match;
- fail startup before accepting traffic when the database is behind or migration fails.

## Commands after a baseline revision exists

```bash
alembic -c albm_conf_file_v0.0.0alpha.ini heads
alembic -c albm_conf_file_v0.0.0alpha.ini current
alembic -c albm_conf_file_v0.0.0alpha.ini upgrade head
python scripts/sche_migr_stat_v0.0.0alpha.py
```

## Rollback

Before a baseline revision is added, rollback is deletion of this control-plane slice; no database state has changed.

After migrations begin:

- each release records its pre-migration restore point;
- application rollback declares its compatible schema revision range;
- destructive downgrade is forbidden unless a reviewed data-restoration path exists;
- a failed migration leaves the service unready and cannot be bypassed by startup repair SQL.

## hmmm

- Exact live schema SQL, digest, object inventory, and drift report remain pending capture.
- A production restore-point identifier is required before any apply, stamp, or destructive operation.
- Historical live objects absent from all source declarations remain unknown until capture.
- The final complete SQLAlchemy metadata module does not yet exist; Alembic autogeneration remains disabled.
- PCEA naming doctrine needs an explicit exception for Python-import and tool-mandated filenames.
- Production snapshot retention and destructive-migration backup policy remain unsettled.
- The disposable production-runtime supervision gate and complete current-head non-mutating gate remain pending while Replit Agent is occupied.