# Replit backend foundation

Status: frozen starting boundary with two owner-semantic questions still marked `hmmm`

Work graph: `docs/work-graphs/replit-backend-foundation.json`

Archive boundary: `archive/pre-replit-hosting-2026-08-04` at `57c41681db1769198a42f92878bb839939928f26`

Build branch: `feat/replit-backend-foundation`

Replit target: `erinepshovel/a0`, Repl ID `ea70512b-ff44-4f4d-bb44-93c50f1a0571`

## Controlling decision

The backend should use this composition:

```text
AgentDefinition (CRUD + versioned character sheet)
    -> AgentInstance (one runtime incarnation)
        -> PTCNA state snapshot
        -> Memory branch
        -> AgentRun lineage
```

The closest option from the proposed set is:

```text
a0(crud agents) ptcna spawn/merge memory
```

with one correction: **PTCNA state and semantic memory are separate merge channels.** A tensor-state absorb is not permission to absorb every memory claim, and a promoted memory does not imply that two PTCNA states should be averaged.

`a0(zfae)ptcna` is therefore represented as a runtime composition/profile inside this model, not as a second persistence model. Until its naming semantics are settled, the database should carry explicit fields rather than reverse-engineering meaning from a display name:

```text
inference_source = zfae
state_engine = ptcna
auditor = hmmm
```

## Why the four options are not equivalent

### 1. `a0(crud agents) character sheet memory`

Merit: it gives every agent an owner-scoped durable identity and an editable declaration.

Failure if used alone: a character sheet is declared configuration. Memory is acquired, time-indexed, source-bearing state. Storing memory as mutable character-sheet fields collapses what the agent was told to be into what it later encountered.

Disposition: retain CRUD and the character sheet; reject the character sheet as the memory store.

### 2. `a0(crud agents) ptcna spawn/merge memory`

Merit: it preserves durable user-facing identity while allowing runtime fork, parallel work, and merge.

Required correction: separate configuration, PTCNA numerical state, semantic memory, run artifacts, and audit events. Each has different merge authority and failure semantics.

Disposition: selected foundation.

### 3. `a0(ptcna agents)`

Merit: it correctly recognizes that an agent is more than a model call and that PTCNA state can be load-bearing.

Failure if used as the whole persistence model: a tensor instance does not by itself define ownership, permissions, human-readable declarations, archive policy, lineage, or API identity. Runtime state should not be forced to carry database and governance semantics it does not own.

Disposition: PTCNA is the canonical runtime-state engine, not the sole durable entity.

### 4. `a0(zfae)ptcna`

Merit: it names a meaningful inference/state composition.

Unresolved: the canonical agent grammar currently treats a trailing token as auditor, teacher, or other special access, while PTCNA is an architecture rather than an ordinary model. Encoding this string before deciding whether PTCNA is body, substrate, auditor, or teacher would freeze ambiguity into identity.

Disposition: support it through explicit composition fields; defer the final rendered name.

## Three identities that must remain distinct

1. **Definition identity** — stable UUID for the durable agent entity, scoped to an owner. Its name and character sheet may be revised without changing the UUID.
2. **Instance identity** — UUID for one runtime incarnation bound to one definition revision and one PTCNA snapshot.
3. **Run identity** — UUID plus `parent_run_id`, `root_run_id`, and depth for one bounded execution.

A display name is not any of these. A model/provider identifier is not any of these. A PTCNA theta instance identifier may be recorded as runtime provenance, but it does not replace the backend instance UUID.

## State channels

### Character sheet

Versioned, owner-authored declaration:

- name and description;
- inference composition;
- system directives and boundaries;
- enabled tools;
- memory policy;
- sentinel or approval policy;
- visibility and ownership scope.

Edits create a new revision. Existing runs remain bound to the revision they started with.

### Semantic memory

Append-only memory events with:

- source run and source message/artifact;
- author or producing instance;
- content or object-storage reference;
- epistemic status;
- confidence supplied by the producing process, not silently upgraded;
- parent memory event when revised;
- promotion status and approving authority;
- tombstone/redaction state where required.

Materialized summaries are rebuildable projections, not the source of truth.

### PTCNA runtime state

A versioned snapshot produced and consumed through an adapter to the canonical `The-Interdependency/ptcna` package. `a0` must not maintain a second implementation of PTCNA algebra after adapter equivalence is established.

Each snapshot records:

- producing PTCNA package identity;
- shape/schema version;
- content digest;
- object-storage location or bounded database payload;
- parent snapshot;
- producing instance and run;
- merge operation and source snapshots, where applicable.

### Run artifacts

Prompts, responses, tool calls, usage, checker findings, and final outputs remain run records/artifacts. They are not promoted into memory merely because they exist.

## Spawn and merge contract

### Spawn

1. Lock or compare-and-swap the parent instance version.
2. Create the child instance and run lineage rows.
3. Fork the parent PTCNA state through the canonical PTCNA adapter.
4. Open a child semantic-memory branch pointing at the parent memory head.
5. Persist both child state identities before execution begins.
6. Execute through the job queue/lease path, not inline in the HTTP request.

### Merge

Merge is a transaction with separate decisions:

1. **Run result:** accept, reject, or request correction.
2. **Semantic memory:** promote selected child memory events with provenance; unresolved conflicts remain explicit.
3. **PTCNA state:** absorb/converge only under the declared operation and only if snapshot compatibility checks pass.
4. **Lifecycle:** retire or preserve the child according to the operation.
5. **Audit:** write one idempotent merge event naming every input and output identity.

A failed step must not leave the child reported as merged. Retrying the same merge key must return the original result rather than applying the merge twice.

## System agent and user agents

Use one schema, not two agent classes:

- `owner_scope = system` creates the public instrument-owned primary agent;
- `owner_scope = user` creates an owner-isolated agent;
- visibility is explicit and private by default;
- system-agent mutation remains admin-gated;
- user-agent mutation requires ownership.

This preserves the existing public-instrument idea without forcing every user-created agent to share one mutable global state.

## Questions requiring owner settlement

Only two questions block final naming or public behavior. Neither blocks the deployment-foundation work.

### A. What exactly does `a0(zfae)ptcna` assert?

Recommended provisional reading:

```text
ZFAE supplies native inference; PTCNA is the persistent runtime-state substrate and auditor surface.
```

Alternative reading:

```text
PTCNA is the trailing auditor/teacher in the canonical display-name grammar.
```

These are not identical. The backend will preserve separate fields until the intended relation is stated.

### B. Is the system-owned primary agent's conversation memory globally shared?

Recommended default:

```text
Public state and aggregate instrument readouts may be shared;
raw user conversation memory remains owner-isolated unless explicitly promoted.
```

A single globally shared raw memory would let one user's interaction alter another user's context without a consent-bearing promotion boundary.

## Engineering decisions that should be settled by architecture, not repeated as questions

### Schema authority

Use SQLAlchemy models plus versioned Alembic migrations as the backend schema authority. Remove schema-changing DDL from application startup. Drizzle may consume or generate compatible TypeScript types, but it should not independently mutate production schema.

### PTCNA authority

Pin and import `The-Interdependency/ptcna` at the work-graph identity. Add an a0 adapter and cross-repository equivalence fixtures. Remove the duplicate `python/engine` implementation only after every active consumer crosses the adapter and the equivalence gate passes.

### Deployment state

Assume Replit may replace or multiply processes. No authoritative state may live only in a module-level dictionary, local upload directory, or uncoordinated in-process scheduler.

- PostgreSQL owns metadata, lineage, leases, jobs, and memory events.
- Replit Object Storage owns larger immutable artifacts and PTCNA snapshots.
- Per-agent state mutation uses an advisory lock or optimistic version check.
- Background work requires a database lease so only one worker performs each singleton duty.

### Process supervision

Keep one public port. While Express remains the authentication gateway, the deployment supervisor must terminate the whole service when either Express or FastAPI exits so Replit can restart a complete unit. A public readiness response must depend on Python and database readiness, not merely an open Express socket.

### Authentication

Retain Replit authentication for the first hosted release. Persist its stable user identifier as `owner_id`. Do not store provider credentials per user in the first foundation slice; use deployment secrets until an encryption and deletion contract exists.

### Deletion

Separate operations:

- archive definition — reversible visibility/lifecycle change;
- retire instance — terminal runtime state;
- redact/delete user data — explicit privacy operation with audit tombstones;
- purge binary snapshot — retention operation after references are removed.

## Current repository conflicts to remove

At the archive commit:

- `agent_instances` mixes singleton runtime state, Forge definitions, ownership, PTCNA-like seeds, and unused game fields in one table;
- names are globally unique rather than owner-scoped;
- character-sheet CRUD and singleton fork/merge coexist without one identity contract;
- sub-agent runtime authority is an in-memory dictionary;
- PTCNA logic is duplicated under `python/engine` rather than imported from the canonical PTCNA repository;
- production startup performs schema creation and alteration;
- every Autoscale process can start the same heartbeat and worker loops;
- local uploads and in-process tensor state are not multi-instance durable;
- the shell supervisor can leave Express running when FastAPI dies.

These are architectural conflicts, not isolated bugs.

## Build sequence

### Slice 1 — hosting substrate

- add liveness and dependency-aware readiness;
- make sibling-process failure terminate the deployment unit;
- introduce versioned migration commands;
- move startup DDL into a baseline migration without changing data semantics;
- add database-backed worker/leader leases;
- move local binary uploads behind object-storage abstraction.

### Slice 2 — agent identity schema

Create separate tables/models for:

- agent definitions;
- immutable definition revisions;
- runtime instances;
- runs and lineage;
- memory events and projections;
- PTCNA snapshots;
- spawn/merge operations and audit events.

Write compatibility import code for existing Forge rows. Do not destructively migrate them in the first pass.

### Slice 3 — canonical PTCNA adapter

- pin exact producer identity;
- implement create/load/snapshot/fork/absorb/converge adapter calls;
- add byte/shape/behavior fixtures against the current local engine where equivalence is expected;
- mark non-equivalent behavior rather than silently normalizing it;
- redirect consumers;
- remove the duplicate engine after the final consumer and rollback window close.

### Slice 4 — agent APIs

- CRUD definitions and revisions;
- create/retire instances;
- enqueue runs;
- spawn child;
- inspect merge proposal;
- approve/reject merge;
- list memory provenance and state lineage.

### Slice 5 — Replit release gate

- clean build from lockfiles;
- migration on an empty database and upgrade from an archive-shaped fixture;
- process-death restart test;
- readiness test with database unavailable;
- two-worker lease and idempotency test;
- object-storage round trip;
- one system agent and two same-named user agents proving owner-scoped identity;
- PTCNA spawn/merge provenance test;
- rollback drill.

## Closed-loop build contract

```text
Discover -> pin graph and inspect existing authority
Plan     -> MODULE_BUILD + BOUNDARIES + file plan
Execute  -> one bounded slice
Verify   -> local contracts + migration fixture + cross-repo adapter fixture
Iterate  -> repair only failed obligations, then rerun
Stop     -> slice gate passes and rollback is demonstrated
```

Maker and checker should be separate agents or models for the PTCNA adapter and migration slices. A self-review is not sufficient evidence for state compatibility or data preservation.

## Usage guidance

Before editing an agent, memory, migration, worker, or PTCNA-related module:

1. read this document and the pinned work graph;
2. identify which state channel the change owns;
3. add a module-local `MODULE_BUILD` declaration before new implementation;
4. add or preserve a `BOUNDARIES` declaration for persistence, permissions, network, secrets, and user data;
5. patch producer-owned behavior in its producer repository rather than shadowing it in `a0`;
6. run the repository-local gate plus the relevant cross-repository fixture;
7. leave unresolved semantics as `hmmm`.

Do not begin the agent-schema migration by editing the existing mixed `agent_instances` table in place. First introduce the new bounded schema, import compatibility, and evidence that existing records can be represented without loss.

## hmmm

- Exact semantic relation represented by the trailing `ptcna` in `a0(zfae)ptcna`.
- Whether public aggregate memory promotion requires only owner approval or owner plus system-agent checker approval.
- Exact PTCNA release version corresponding to pinned commit `4509d33419aa25e6a9cfef415055e378b8f37edc`.
- Whether Replit production is initially constrained to one instance or immediately exercises multi-instance leases; the backend must remain replacement-safe either way.
- Retention duration for raw run artifacts, rejected memory proposals, and retired PTCNA snapshots.
