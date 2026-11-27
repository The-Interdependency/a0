---
name: interdependent-work-graph
description: Cross-repository coordination for The Interdependency. Load this when a task spans, consumes, compares, publishes to, or can change the contract between two or more repositories; when an agent is about to choose one repo as its workspace for a stack-level problem; when exact producer, evidence-source, skill, semantic, mathematical, or measurement identities must travel together; or when creating a shared stack manifest, multi-repo handoff, coordinated release, or cross-repo validation plan.
---

# interdependent-work-graph — coordinate the problem, not the folder

Repository boundaries preserve authority, provenance, permissions, and release history.

## Core contract

```text
repository boundary != agent boundary
repository boundary == authority and provenance boundary
```

- Resolve the complete participating graph before choosing where to edit.
- Record exact commits, not only branch names or package availability.
- State what authority each repository or evidence source owns.
- Let one agent coordinate the graph, or let several agents consume the same deterministic graph record.
- Transfer no semantic authority, theorem status, certification status, measurement validity, or empirical status merely because repositories are connected.
- Preserve unresolved mappings and authentication questions as `hmmm`.

## Non-trigger

Do not load this skill merely because a repository has ordinary runtime dependencies. A self-contained patch whose correctness, authority, and validation all remain inside one repository does not require a shared work graph.

Load it when crossing a boundary changes what must be known, preserved, validated, published, or refused.

## Authority model

A participant declares an authority role and a work relation. Common examples:

```text
METAPAT    semantic authority
UCNS       mathematical representation and its own proof/status evidence
EDCM       measurement, projection, and result contracts
skill-lib  reusable build and evidence discipline
corpus     bounded external source evidence
website    publication and presentation consumer
```

These are examples, not a universal fixed list. Read the participating repositories before assigning roles.

## Workflow

1. **Discover the graph.** Identify every repository, package, corpus, schema, workflow, or publication surface whose exact state can change the answer.
2. **Resolve identity.** Pin an exact commit, immutable artifact digest, versioned schema, or explicit `hmmm` for each participant. Moving branch names are navigation aids, not evidence identities.
3. **Assign authority.** State what each participant may define and what it merely consumes.
4. **Declare relations.** Record producer, consumer, evidence source, build-doctrine source, publication target, compatibility peer, or other precise relation.
5. **Declare non-transfer boundaries.** At minimum consider authority, proof status, certification, measurement validity, empirical validity, and user-data permissions.
6. **Choose edit locations.** Patch each claim at its owning source. Do not repair a producer defect by shadowing its schema in a consumer.
7. **Coordinate execution.** Prefer one shared identity record, fixture, or manifest that all agents and workflows consume over separate repo-local reconstructions.
8. **Validate the graph.** Run repository-local gates plus at least one cross-repository fixture or identity check proving that the connected surfaces remain distinct and compatible.
9. **Publish bounded results.** Each PR describes its local changes and cites the shared graph identity. Do not merge dependent consumers before required producers are available.
10. **Carry hmmm forward.** Unknown semantic mappings, signatures, release ordering, or governance choices remain explicit boundary objects.

## Stack-manifest reference contract

The first executable reference shape is:

```json
{
  "schema": "the-interdependency.stack-manifest",
  "version": "1.0.0",
  "work_graph_sha256": "<sha256>",
  "repositories": [
    {
      "repository": "owner/name",
      "commit": "<40-hex commit>",
      "authority": "what this participant may define",
      "relation": "how it participates in this work"
    }
  ],
  "boundaries": {
    "authority_transfer": false,
    "proof_status_transfer": false,
    "measurement_status_transfer": false,
    "semantic_mapping": "external-provenance|declared mapping|hmmm",
    "agent_scope": "cross-repository-work-graph",
    "hmmm": [
      "No unresolved boundary in this graph; further uncertainty belongs to a later revision."
    ]
  }
}
```

The digest is SHA-256 over canonical JSON containing exactly `repositories` and `boundaries`, sorted by key with compact separators. In version 1.0.0 the order of the `repositories` array is itself part of the hashed identity: an emitter lists participants in a declared, stable order, and the same participants in a different order produce a different digest. Key sorting does not reorder arrays, so two agents rebuilding the same graph must consume the emitter's declared order rather than re-discovering it. Consuming implementations may add versioned fields only through an explicit schema revision.

Version 1.0.0 also requires `boundaries.hmmm` to remain a visible boundary object: it is a non-empty list of non-empty strings. Record each material unresolved constraint there. When no material unresolved constraint remains, do not collapse the field to `[]`; carry a brief explicit closure note so later readers can distinguish "considered and currently empty" from "boundary silently omitted." The closure note does not invent uncertainty and may be replaced when a real unresolved constraint appears.

The 1.0.0 `boundaries` block is the minimal machine-carried set. Certification-status and empirical-validity non-transfer are binding obligations of this skill (workflow step 5) even where a 1.0.0 manifest carries no explicit fields for them; explicit `certification_status_transfer` and `empirical_status_transfer` fields arrive through the next schema revision, not through ad-hoc emitter extensions. Non-repository participants (corpus, package, schema, workflow, or publication surfaces) are encoded in 1.0.0 as `repositories` entries whose `authority` and `relation` describe the evidence source; typed participant records are likewise deferred to a schema revision.

A manifest is identity and coordination evidence. It is not cryptographic producer authentication unless a separate signature contract exists.

## Workflow separation

For expensive or generated cross-repository work:

- Pull requests validate read-only whenever possible.
- Materialization is an explicit operation with narrow write permission and a named non-default target branch.
- Generated evidence is sealed once and reused by later agents or workflows rather than independently reconstructed.
- A write-back workflow must not patch source code immediately before claiming to validate that source.
- Repository-specific artifacts include the shared graph identity when their interpretation depends on the graph.

## Output shape

When this skill is active, produce or maintain:

```markdown
## Work graph
- participant: exact identity — authority — relation

## Edit ownership
- repository/path: change and why it belongs there

## Cross-repository boundaries
- no-transfer statements
- permission boundaries
- hmmm

## Validation
- local gates
- shared fixture or manifest check
- release/materialization order
```

For machine-consumed work, also emit the versioned stack manifest or an explicitly named equivalent.

## Repository plan reports and overall portfolio plan

When the question is not one bounded work graph but **what part of the overall effort each self-contained repository owns**, use the repository-report projection rather than inventing a centralized plan document.

Each participating repository owns:

```text
docs/work-graphs/repository-plan-report.json
```

That report states its exact source commit, authority and non-transfer boundaries, portfolio role, current claim, delivered surfaces, active frontier, next actions, blockers, cross-repository relations, machine entrypoints, and `hmmm`.

The frozen input contract is:

```text
interdependent-work-graph/repository-plan-report.schema.json
schema:   the-interdependency.repository-plan-report
version:  1.0.0
blob SHA: 9b347b2dff7692054b571602f30ee6d00c2e7265
```

The deterministic reference aggregator is:

```text
interdependent-work-graph/portfolio_plan.py
```

Its output contract is:

```text
interdependent-work-graph/portfolio-plan.schema.json
schema:  the-interdependency.portfolio-plan
version: 1.0.0
```

Read `interdependent-work-graph/PORTFOLIO_PLAN.md` before producing or changing this projection.

The portfolio plan is a **derived index of repo-owned claims**. It owns no repository canon. Missing or stale repo reports remain visible `hmmm`; do not reconstruct them from memory, package metadata, a neighboring repository, or the aggregator itself. Local checkout paths are excluded from the portfolio identity so the same report set hashes identically across machines.

A repository plan report and a stack manifest are complementary:

```text
repository plan report -> what this repository owns and where its work stands
stack manifest          -> exact identities in one bounded cross-repository work graph
portfolio plan          -> deterministic projection across supplied repo reports
```

## Validation

A successful application demonstrates:

- every participant has an exact or visibly unresolved identity;
- every participant has one stated authority role and work relation;
- no consumer shadows a producer-owned schema or algebra;
- no theorem, semantic, certification, measurement, or empirical status transfers silently;
- the work-graph digest recomputes deterministically;
- repository-local tests pass;
- at least one cross-repository fixture, import, adapter, artifact, or workflow proves the connected path;
- later agents can resume from the graph record without guessing which commits were used.

For the portfolio projection specifically, also require:

- every supplied report validates against the frozen report contract;
- every report pins a source commit and the exact schema blob identity;
- duplicate repository reports fail closed;
- every cross-repository relation carries `authority_transfer: false`;
- report order does not change the derived portfolio identity;
- the portfolio digest excludes machine-local checkout paths;
- missing portfolio members are reported as incompletion rather than synthesized.

## Anti-patterns

- Assigning one AI to one repository when the task's truth conditions span several.
- Treating the currently open repository as the source of every term it imports.
- Installing “latest” dependencies during evidence-producing runs.
- Reimplementing a producer schema or algebra inside a consumer.
- Letting several agents rebuild incompatible local versions of the same evidence.
- Using a digest as though it were a signature.
- Hiding unresolved mappings behind constructor defaults.
- Emitting `"hmmm": []` and thereby erasing whether the boundary was considered; use a non-empty unresolved item or explicit closure note.
- Allowing validation workflows to mutate the source they are validating.
- Copying repo canon into the portfolio plan instead of deriving a report from the owning repository.
- Treating repository discovery or GitHub visibility as automatic portfolio membership.

## Minimal example

A corpus-to-measurement run may bind:

```text
corpus commit     evidence source
skill-lib commit  build/evidence doctrine
METAPAT commit    semantic authority
UCNS commit       mathematical producer
EDCM commit       measurement/artifact producer
```

One agent can follow the complete path. Separate agents can work on different participants if each consumes the same manifest and respects edit ownership.

## hmmm

- The organization-wide persistent service or user interface for live work graphs is not yet selected.
- Content identities do not yet provide cryptographic producer or transport authentication.
- Whether the stack-manifest schema remains a procedural-skill reference contract or later becomes its own metadata-block/schema skill.
- The next stack-manifest schema revision is expected to add explicit `certification_status_transfer` and `empirical_status_transfer` boundary fields, a canonical `repositories` ordering (for example by `repository` then `commit`) in place of declared-order identity, typed non-repository participants with digest/version/schema identities, and an explicit hashed edge list (`from`, `to`, `relation_type`) so distinct work graphs over the same participants cannot share one digest. Version 1.0.0 stays as sealed by the EDCM OEWN 2025 run.
- Cross-repository merge orchestration remains repository-host dependent; the skill defines order and evidence, not a universal transaction mechanism.
- Automatic organization-wide portfolio discovery remains deliberately unselected; explicit report sets preserve intentional membership and visible incompletion.
