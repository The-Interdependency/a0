---
name: stack-update
description: Fail-closed update protocol for The-Interdependency/stack. Load this when a stack change adds, moves, extracts, graduates, renames, removes, or changes the authority, relation, source identity, or placement of a participant, research workspace, libs pin, BASE record, stack manifest entry, or architecture description; when stack-manifest.json, STACK_MANIFEST.md, README.md, or research BASE.json files may drift from one another; or when validating that a structural stack change is complete before commit or merge.
---

# stack-update — change the stack as one coherent transaction

Load the companion skills specified below; this protocol specializes their
contracts for structural Stack changes.

## Core contract

A stack change that alters **identity, ownership, authority, relation, lifecycle,
or placement** is incomplete until every affected authority/provenance projection
agrees and the deterministic stack-consistency checker passes.

```text
structural mutation
  -> classify affected authority and relations
  -> update owning source and stack projections
  -> recompute machine identity
  -> validate local + cross-boundary consistency
  -> commit only when coherent
```

Location never creates authority. A successful move, import, extraction, or test
run does not itself update ownership, canon, proof status, measurement validity,
or graduation standing.

## Trigger / non-trigger

Load this skill when a change touches any of these surfaces or their meaning:

- `libs/<repo>/` pins or imported canonical views;
- `research/<workspace>/` creation, deletion, rename, extraction, or lifecycle;
- `research/*/BASE.json` provenance or authority;
- `stack-manifest.json` / `STACK_MANIFEST.md` participants, authorities, relations,
  boundaries, or work-graph digest;
- root architecture descriptions in `README.md` or `AGENTS.md`;
- an emergent project moving toward or away from independent-repository authority.

Do not load it for an ordinary implementation edit whose owning repository,
workspace, authority, manifest identities, and architecture relations do not change.

## Required companion skills

1. Load `interdependent-work-graph` for every structural stack mutation.
2. Load `project-incubation-graduation` when extraction, release, reconsumption,
   graduation, or implementation-authority transition is involved.
3. Load `the-interdependency` for organization workflow and GitHub hygiene.
4. Consult current METAPAT only when the change requires choosing a new conceptual
   distinction or authority relation rather than implementing an already-fixed one.

## Workflow

1. **Freeze the starting identity.** Record the exact stack commit and every
   producer/source commit whose authority can affect the change.
2. **Classify the mutation.** Mark each affected item as one or more of:
   `identity`, `authority`, `relation`, `placement`, `lifecycle`, `pin`, `projection`.
3. **Resolve edit ownership.** Change a claim at its owning source. Never repair a
   producer-owned defect by shadowing it in a consumer or by editing `libs/`.
4. **Compute the update closure.** Inspect at minimum:
   `stack-manifest.json`, `STACK_MANIFEST.md`, root `README.md`, root `AGENTS.md`,
   the affected `research/*/BASE.json`, relevant local README/docs, and CI/checkers.
   Update every projection whose statement became false because of the mutation.
5. **Remove superseded claims.** A newly separated owner requires the prior owner to
   stop claiming that responsibility in every stack-level authority projection.
   Do not merely add the new owner alongside stale text.
6. **Preserve lifecycle standing.** Extraction is not graduation. Stack-local work
   remains noncanonical until its governing graduation gates complete and stack
   reconsumes the released independent artifact where required.
7. **Recompute machine identity.** Recompute `work_graph_sha256` exactly from the
   versioned manifest contract after any hashed field changes. Never hand-wave or
   copy an old digest.
8. **Run deterministic consistency validation.** In stack, run:

   ```bash
   python tools/check_stack_consistency.py
   ```

   Treat any error as a blocked structural update, not a documentation warning.
9. **Run affected behavioral gates.** Execute repository/workspace-local tests and
   at least one cross-boundary check for changed producer/consumer relations.
10. **Commit the transaction.** The structural mutation and its required projections
    belong in one coherent PR/merge sequence. If a necessary authority is unavailable,
    preserve the boundary as `hmmm`; do not guess it into consistency.

## Deterministic checker contract

A consuming stack checker should fail closed for at least:

- a `work_graph_sha256` that does not reproduce from the declared manifest fields;
- disagreement between machine-readable and human-readable repository authority;
- direct tracked edits to `libs/` presented as stack-owned canon;
- an affected `BASE.json` whose source repository/commit conflicts with the pinned
  source identity it claims to derive from;
- an emergent stack-local component whose authority separation is declared locally
  while stack-level authority text still assigns that responsibility to its former owner;
- lifecycle language that treats extraction as graduation;
- a structural update that changes one required projection but omits another.

The checker validates coherence, not truth of scientific or semantic claims. Those
remain owned by their proper repositories and evidence.

## Output shape

When this skill is active, report:

```markdown
## Stack transaction
- start identity:
- mutation class:
- affected authority / relations:
- files changed:

## Validation
- stack consistency:
- local gates:
- cross-boundary gate:

## Standing
- canon / research / extracted / graduated:
- hmmm:
```

## Usage guidance

Before moving or separating a stack component, run the checker once **before** the
change to establish the current baseline, make the structural edit and all required
projection updates, then run it again. A pre-existing failure is evidence to classify;
it is not permission to add another inconsistency.

Example: moving English Gonol Construction out of EDCM requires the new workspace and
its provenance **and** removal of `text-gonol construction` from EDCM's stack-level
authority statement, corresponding manifest/work-graph updates, digest regeneration,
and the affected English Gonol + EDCM checks.

## Anti-patterns

- Moving code first and treating manifest/docs repair as optional cleanup.
- Updating `stack-manifest.json` but not `STACK_MANIFEST.md`, or vice versa.
- Adding a new authority statement without removing the superseded one.
- Editing `libs/<repo>/` to make a stack-local inconsistency disappear.
- Reusing a stale work-graph digest after changing hashed fields.
- Calling an extracted project graduated because the new repository exists.
- Making CI green by widening `PYTHONPATH` or weakening checks instead of repairing
  ownership/provenance drift.

## hmmm

- The first stack checker is intentionally conservative: it can prove declared
  projections agree, but it cannot infer every semantic responsibility from source code.
- Future schema revisions may carry explicit typed stack-local component records and
  edge lists so more structural obligations can be checked without text comparisons.
- A checklist that never fails a build eventually becomes wall decoration.
