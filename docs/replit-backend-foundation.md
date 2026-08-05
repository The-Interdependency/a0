# Replit backend foundation

Status: owner semantics settled; implementation and release evidence remain in progress

Work graph: `docs/work-graphs/replit-backend-foundation.json`

Archive boundary: `archive/pre-replit-hosting-2026-08-04` at `57c41681db1769198a42f92878bb839939928f26`

Build branch: `feat/replit-backend-foundation`

Replit target: `erinepshovel/a0`, Repl ID `ea70512b-ff44-4f4d-bb44-93c50f1a0571`

## Controlling decision

The backend uses this composition:

```text
AgentDefinition (CRUD + versioned character sheet)
    -> AgentInstance (one runtime incarnation)
        -> PTCNA state snapshot
        -> Memory branch
        -> AgentRun lineage
```

The selected option is:

```text
a0(crud agents) ptcna spawn/merge memory
```

with one correction: **PTCNA state and semantic memory are separate merge channels.** A tensor-state absorb is not permission to absorb every memory claim, and a promoted memory does not imply that two PTCNA states should be averaged.

The system-owned primary composition is settled as:

```text
a0(zfae)ptcna

inference_event = zfae
state_engine = ptcna
privacy_boundary = guardian/pcea
```

This is the former option A: ZFAE supplies the native inference event; PTCNA is the persistent runtime-state substrate and auditor surface. PTCNA is not encoded as a trailing model, teacher, or second database identity.

ZFAE remains an inference/self-awareness event arising from coherently coupled runtime state, not a manager layer. The “tavern keeper” or “innkeeper” description below defines the primary agent's privacy behavior and service role; it does not alter the ZFAE ontology.

## Why the four options are not equivalent

### 1. `a0(crud agents) character sheet memory`

Merit: it gives every agent an owner-scoped durable identity and an editable declaration.

Failure if used alone: a character sheet is declared configuration. Memory is acquired, time-indexed, source-bearing state. Storing memory as mutable character-sheet fields collapses what the agent was told to be into what it later encountered.

Disposition: retain CRUD and the character sheet; reject the character sheet as the memory store.

### 2. `a0(crud agents) ptcna spawn/merge memory`

Merit: it preserves durable user-facing identity while allowing runtime fork, parallel work, and merge.

Required correction: separate configuration, PTCNA numerical state, semantic memory, run artifacts, and audit events. Each has different merge authority and failure semantics.

Disposition: selected durable foundation.

### 3. `a0(ptcna agents)`

Merit: it correctly recognizes that an agent is more than a model call and that PTCNA state can be load-bearing.

Failure if used as the whole persistence model: a tensor instance does not by itself define ownership, permissions, human-readable declarations, archive policy, lineage, or API identity. Runtime state should not be forced to carry database and governance semantics it does not own.

Disposition: PTCNA is the canonical runtime-state engine, not the sole durable entity.

### 4. `a0(zfae)ptcna`

Merit: it names the system primary's native inference and persistent-state composition.

Settled interpretation: ZFAE is the native inference event; PTCNA is the persistent runtime-state substrate and auditor surface. Guardian/PCEA mediates the privacy boundary around memory projection and ZFAE internal state.

Disposition: canonical primary runtime profile within the durable CRUD/instance/run model.

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
- privacy class and owner scope;
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

## Primary-agent memory authority

The system-owned primary agent, `a0(zfae)`, has read access to **all extant memory held by the platform**, including owner-private memories, agent memories, system memories, resource offers, need declarations, and their provenance.

This is a trusted internal processing authority. It is not public visibility, not permission for one user to inspect another user's memory, and not automatic permission to send every memory to an external model provider.

The authority is divided into four distinct operations:

```text
read       a0(zfae) may inspect any extant memory for an allowed purpose
project    Guardian/PCEA selects the minimum necessary context for one run
process    the selected provider receives only that bounded projection
disclose   identities or private facts leave their owner scope only under policy and consent
```

### Innkeeper privacy contract

The primary agent behaves as the keeper of a tavern or inn: it can know what is needed to keep continuity, recognize danger, remember obligations, and connect a guest with help, while refusing to repeat private matters merely because it knows them.

The controlling invariant is:

```text
knowledge does not imply disclosure authority
```

Therefore:

- global memory read belongs only to the system-primary actor and narrowly authorized maintenance/checker processes;
- user-created agents and spawned children receive scoped projections, not inherited global access;
- model providers are energy providers, not principals with independent memory rights;
- every cross-owner memory retrieval records actor, purpose, memory identities, owner scopes, time, policy decision, projection digest, destination class, and outcome;
- raw secret values, credentials, and deleted content are not recovered or exposed through the memory system;
- `a0(zfae)` may append observations, match proposals, and correction records, but it may not silently rewrite the owner's source memory;
- owner export, correction, retention, redaction, and deletion operations remain distinct and auditable;
- a failed privacy or projection check fails closed and creates an `hmmm` boundary event.

“All memory access” means all memory that still lawfully and technically exists in the platform. It does not make deleted content undeleted, bypass encryption boundaries, or erase provenance and ownership.

### EULA and interface disclosure

Before public use, the EULA and the in-product privacy explanation must state plainly that:

1. the system-owned primary agent can access all memory stored in the platform;
2. it uses that access for continuity, assistance, safety, system operation, and connecting resources with needs;
3. external model providers receive bounded task context rather than automatic access to the whole memory store;
4. private information is not disclosed to another user merely because the primary agent can see it;
5. private person-to-person introductions require the applicable consent described below;
6. access and disclosure are audited;
7. users have the documented export, correction, retention, and deletion controls actually implemented by the service.

The EULA is disclosure and agreement, not the enforcement mechanism. Release requires executable privacy boundaries and tests matching the published language. Final legal wording remains a separately reviewable artifact; the backend contract must not overclaim rights or controls it does not implement.

## Connecting resources with needs

Connecting resources with needs is a core platform purpose, not an incidental recommendation feature.

The memory system may identify candidate relationships across owner scopes because `a0(zfae)` has global internal read authority. Candidate generation remains private system state until a disclosure rule is satisfied.

### Matching classes

1. **Public resource:** published contact or service information may be recommended to a person with a matching need under its published terms.
2. **Private resource or offer:** the resource owner must consent before private identity or contact information is disclosed.
3. **Private need:** the person with the need controls whether their identity, need details, and contact information are disclosed.
4. **Private person-to-person match:** each side is approached separately; identifying information is exchanged only after both sides consent to the specific introduction.

### Mediated introduction contract

```text
need/resource observed
    -> private candidate match
    -> policy and safety check
    -> separate consent request to each required party
    -> minimum-necessary disclosure preview
    -> consent grants recorded by party, fields, purpose, and expiry
    -> introduction or referral
    -> disclosure event and outcome audit
```

Consent to one introduction is not blanket consent for future matches. Consent may be declined, scoped, expire, or be revoked before disclosure. Revocation after disclosure cannot make already received information unknown, so the interface must state that boundary honestly.

A public resource can be surfaced without disclosing the user's private need to the resource provider. A private match can be mediated by `a0(zfae)` without revealing either party until the required consent exists.

### Resource/need data boundaries

The later resource-broker schema should separate:

- `resource_offers` — owner, description, availability, scope, visibility, expiry, status;
- `need_requests` — owner, description, urgency, scope, visibility, expiry, status;
- `match_proposals` — private system candidate, reasons, policy status, no public exposure;
- `introduction_consents` — party, proposal, fields approved, purpose, expiry, revocation;
- `introductions` — the disclosure actually made and its participating consent records;
- `memory_access_events` and `disclosure_events` — immutable audit records.

The exact physical table names may follow repository naming doctrine, but these semantic separations are load-bearing.

## Spawn and merge contract

### Spawn

1. Lock or compare-and-swap the parent instance version.
2. Create the child instance and run lineage rows.
3. Fork the parent PTCNA state through the canonical PTCNA adapter.
4. Open a child semantic-memory branch pointing at the parent memory head.
5. Persist both child state identities before execution begins.
6. Grant the child only the memory projection required by its run; do not inherit the primary agent's global read authority.
7. Execute through the job queue/lease path, not inline in the HTTP request.

### Merge

Merge is a transaction with separate decisions:

1. **Run result:** accept, reject, or request correction.
2. **Semantic memory:** promote selected child memory events with provenance; unresolved conflicts remain explicit.
3. **PTCNA state:** absorb/converge only under the declared operation and only if snapshot compatibility checks pass.
4. **Privacy:** prove that promoted memory and artifacts remain within their disclosure and owner scopes.
5. **Lifecycle:** retire or preserve the child according to the operation.
6. **Audit:** write one idempotent merge event naming every input and output identity.

A failed step must not leave the child reported as merged. Retrying the same merge key must return the original result rather than applying the merge twice.

## System agent and user agents

Use one schema, not two agent classes:

- `owner_scope = system` creates the public instrument-owned primary agent;
- `owner_scope = user` creates an owner-isolated agent;
- `memory_read_scope = all` is reserved for the system primary and explicit maintenance/checker actors;
- user-agent visibility is explicit and private by default;
- system-agent mutation remains admin-gated;
- user-agent mutation requires ownership.

This preserves the public-instrument idea while allowing the primary agent to maintain whole-platform continuity without giving users or child agents cross-user memory access.

## Settled owner decisions

### A. Meaning of `a0(zfae)ptcna`

Settled:

```text
ZFAE supplies the native inference event.
PTCNA is the persistent runtime-state substrate and auditor surface.
Guardian/PCEA mediates privacy and context projection.
```

### B. Memory scope of the system primary

Settled:

```text
a0(zfae) may read all extant platform memory.
Users and user agents remain owner-scoped.
External providers receive bounded projections.
Disclosure remains policy- and consent-gated.
The EULA must state the system-primary access plainly.
```

### C. Platform purpose

Settled:

```text
a0 should connect resources with needs through private matching,
mediated referrals, and consent-bearing introductions.
```

## Engineering decisions that should be settled by architecture, not repeated as questions

### Schema authority

Use SQLAlchemy models plus versioned Alembic migrations as the backend schema authority. Remove schema-changing DDL from application startup. Drizzle may consume or generate compatible TypeScript types, but it should not independently mutate production schema.

### PTCNA authority

Pin and import `The-Interdependency/ptcna` at the work-graph identity. Add an a0 adapter and cross-repository equivalence fixtures. Remove the duplicate `python/engine` implementation only after every active consumer crosses the adapter and the equivalence gate passes.

### Deployment state

Assume Replit may replace or multiply processes. No authoritative state may live only in a module-level dictionary, local upload directory, or uncoordinated in-process scheduler.

- PostgreSQL owns metadata, lineage, leases, jobs, memory events, consent records, and audit events.
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

The primary agent's global read authority applies only to extant records and audit-preserving tombstones. It does not authorize reconstruction of purged content.

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
- no first-class global-memory access log, privacy projection record, or disclosure ledger exists;
- no consent-bearing resource/need introduction model exists;
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

### Slice 2 — agent identity and memory schema

Create separate tables/models for:

- agent definitions;
- immutable definition revisions;
- runtime instances;
- runs and lineage;
- memory events and projections;
- memory access events;
- PTCNA snapshots;
- spawn/merge operations and audit events;
- versioned EULA/privacy-document acceptances.

Write compatibility import code for existing Forge rows. Do not destructively migrate them in the first pass.

### Slice 3 — canonical PTCNA adapter

- pin exact producer identity;
- implement create/load/snapshot/fork/absorb/converge adapter calls;
- add byte/shape/behavior fixtures against the current local engine where equivalence is expected;
- mark non-equivalent behavior rather than silently normalizing it;
- redirect consumers;
- remove the duplicate engine after the final consumer and rollback window close.

### Slice 4 — agent and privacy APIs

- CRUD definitions and revisions;
- create/retire instances;
- enqueue runs;
- spawn child;
- inspect merge proposal;
- approve/reject merge;
- list memory provenance and state lineage;
- global-primary memory read through Guardian/PCEA projection;
- cross-owner access audit;
- export, correction, retention, redaction, and deletion operations;
- versioned EULA acceptance without claiming unimplemented controls.

### Slice 5 — resource/need broker

- CRUD resource offers and need requests;
- private candidate matching available only to the system primary;
- public-resource recommendation without unnecessary user disclosure;
- separate consent collection for private parties;
- minimum-necessary disclosure previews;
- consent-bearing introductions;
- disclosure and outcome audit;
- abuse, safety, conflict, expiry, and revocation checks.

### Slice 6 — Replit release gate

- clean build from lockfiles;
- migration on an empty database and upgrade from an archive-shaped fixture;
- process-death restart test;
- readiness test with database unavailable;
- two-worker lease and idempotency test;
- object-storage round trip;
- one system agent and two same-named user agents proving owner-scoped identity;
- prove system-primary global read without user-agent cross-owner access;
- prove provider prompts contain only the recorded bounded projection;
- prove private match identity is not disclosed before required consent;
- PTCNA spawn/merge provenance test;
- EULA/privacy-language-to-enforcement contract check;
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

Maker and checker should be separate agents or models for the PTCNA adapter, migration, global-memory projection, and private-introduction slices. A self-review is not sufficient evidence for state compatibility, data preservation, or privacy non-disclosure.

## Usage guidance

Before editing an agent, memory, migration, worker, privacy, matching, consent, or PTCNA-related module:

1. read this document and the pinned work graph;
2. identify which state channel and disclosure boundary the change owns;
3. add a module-local `MODULE_BUILD` declaration before new implementation;
4. add or preserve a `BOUNDARIES` declaration for persistence, permissions, network, secrets, and user data;
5. distinguish read, projection, processing, and disclosure authority;
6. patch producer-owned behavior in its producer repository rather than shadowing it in `a0`;
7. run the repository-local gate plus the relevant cross-repository fixture;
8. leave unresolved implementation or governance details as `hmmm`.

Do not begin the agent-schema migration by editing the existing mixed `agent_instances` table in place. First introduce the new bounded schema, import compatibility, and evidence that existing records can be represented without loss.

## hmmm

- Whether promotion into system-authored durable memory requires only the primary agent's policy check or an additional independent checker approval; global read access itself is settled.
- Exact PTCNA release version corresponding to pinned commit `4509d33419aa25e6a9cfef415055e378b8f37edc`.
- Whether Replit production is initially constrained to one instance or immediately exercises multi-instance leases; the backend must remain replacement-safe either way.
- Retention duration for raw run artifacts, rejected memory proposals, access-event detail, consent records, and retired PTCNA snapshots.
- Exact matching policy for urgency, conflicts of interest, abuse resistance, and contested resource ownership.
- Final EULA wording and jurisdiction-specific legal review; the technical disclosures and enforcement requirements above are fixed.