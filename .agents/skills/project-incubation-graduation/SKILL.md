---
name: project-incubation-graduation
description: Project incubation and graduation doctrine for emergent components born inside an integration, stack, laboratory, or incubator repository. Load this when several existing projects compose into a new candidate capability; when assessing whether that candidate should remain incubated or become its own repository/package; when extracting it with provenance; when establishing a new implementation authority boundary; when publishing the extracted project through a registry such as PyPI; or when making the former incubator consume the released artifact instead of its local copy. Do not load for an ordinary new repository with no incubation history or for a routine package release whose authority boundary is already established.
---

# project-incubation-graduation — let the forge survive its products

The skill governs the transition from **candidate inside a forge** to **independent project with its own implementation and public-contract authority**. It does not decide scientific truth, semantic canon, theorem status, proof status, certification, measurement validity, or empirical validity.

## Core contract

```text
composition may create a candidate
candidate != independent project
qualification != authorization to mutate external systems
graduation creates a scoped implementation/public-contract authority transition
stable publication follows compatibility proof for the exact candidate bytes
graduation is complete only after the forge reconsumes the immutable released artifact
```

- Incubation is a legitimate ownership state, not architectural debt by definition.
- A candidate remains owned by its forge until graduation completes.
- Extraction alone is not graduation.
- Publishing alone is not graduation.
- A human-readable version is not an immutable artifact identity.
- The former forge must successfully consume the registry/release artifact by immutable identity before graduation is complete.
- Once graduated, the independent repository owns the candidate's implementation and public contract; the forge becomes a consumer.
- No semantic, theorem, proof, certification, measurement, empirical, or domain-validity status transfers merely because implementation authority moves.
- Unknown non-blocking facts remain `hmmm`. Unknown license/distribution rights, release ownership, required authorization, or artifact identity are blocking and may not be promoted through a gate.

## Non-trigger

Do not load this skill for:

- creating an ordinary repository that was independent from inception;
- splitting a repository only for size, permissions, or team organization when no emergent candidate is being graduated;
- publishing a routine new version of an already-independent package;
- vendoring or mirroring code where authority does not change;
- a cross-repository task that only needs coordination; use `interdependent-work-graph` for that.

When graduation crosses repository boundaries, load `interdependent-work-graph` with this skill and use its exact identity, provenance, relation, and non-transfer discipline.

## Assessment versus execution

Assessment is read-only unless the user or owning authority explicitly authorizes mutation.

```text
assess / stabilize / qualify        -> may be read-only
create repository                  -> explicit authorization required
reserve or publish package name    -> explicit authorization required
mutate forge dependency/imports    -> explicit authorization required
sever incubated implementation     -> explicit authorization required
transfer implementation authority  -> explicit authorization required
```

A request such as “is this ready to graduate?” does not authorize repository creation, registry publication, consumer mutation, deletion, or authority transfer. Record missing authorization as a blocking `hmmm`; do not infer it from readiness.

## Lifecycle

Use these states. Do not skip a state by renaming an unfinished candidate.

```text
incubating
    -> stabilizing
    -> qualified
    -> extracted
    -> released
    -> reconsumed
    -> graduated
```

The `released` gate contains a mandatory pre-publication candidate verification sequence; public stable publication is the end of that gate, not its beginning.

### `incubating`

The candidate is legitimately implemented inside the forge. Its API may change. The forge owns implementation authority.

Require:

- candidate name or temporary identifier;
- originating composition and participating projects;
- current owning repository/path;
- purpose and scope;
- unresolved `hmmm`.

### `stabilizing`

The candidate has a coherent purpose and is being separated from incidental forge structure.

Require:

- explicit public surface;
- explicit forge-private surface;
- permitted upstream dependencies;
- forbidden dependencies or cycles;
- provenance of originating inputs and decisions;
- stated compatibility expectations;
- independent purpose that survives removal from the forge.

### `qualified`

The candidate has earned extraction readiness. Qualification is still read-only unless execution is separately authorized.

Require evidence that:

- its public API is explicit enough to version;
- tests run without importing forge-private modules;
- a clean environment can build/install it;
- permitted upstream dependencies resolve through public contracts;
- no hidden path, checkout, editable-install, environment-variable, or local-fixture dependency is required unless deliberately part of the contract;
- **license and redistribution rights are resolved and permit the intended extraction/distribution**;
- **ownership/release authority is resolved for the intended repository and distribution surface**;
- security and release boundaries are explicit;
- at least one downstream fixture demonstrates intended value independently of source-folder location.

`license_distribution_rights` and `release_ownership_authority` are hard gates: `hmmm` means **not qualified**. Other `hmmm` may survive only when explicitly non-blocking to the transition being attempted.

Qualification does **not** transfer authority. The forge remains authoritative until graduation completes.

### `extracted`

External mutation begins here, so explicit authorization is required before creating the independent repository.

Preserve:

- relevant history when practical;
- exact source commit and source path used for extraction;
- provenance for copied or transformed material;
- license obligations;
- dependency identities;
- unresolved non-blocking issues and `hmmm`;
- a migration note stating that the new repository is not yet graduated.

The new repository is the intended future authority, not yet the completed authority transition.

### `released`

A stable public release must not be the first forge-compatibility test.

Required sequence:

1. Build the release candidate from the independent repository.
2. Record an immutable artifact identity: SHA-256, registry-provided immutable digest, or equivalent byte identity. A version/tag alone is insufficient.
3. Install **that exact candidate artifact** in a clean environment and run project tests.
4. Install **that same exact candidate artifact** in the forge and run the relevant integration suite before stable publication.
5. If compatibility fails, do not publish it as a stable public release. Repair and rebuild a new candidate, or use an explicitly staging/prerelease channel.
6. Publish the already-verified candidate bytes through the declared distribution surface.
7. Record the published artifact's immutable registry/file identity and prove it is the verified candidate bytes. For registries that transform artifacts, record the registry's immutable identity plus the explicit mapping from candidate to published object.

For Python, normally require `pyproject.toml`, wheel/sdist checks, built-artifact tests, a version/release note, and the immutable hash of each artifact actually consumed. PyPI is an example distribution surface, not universal doctrine.

### `reconsumed`

The forge proves the separation is real by replacing its local implementation path with the published artifact.

Require:

- the forge dependency points at the released version **and immutable artifact identity** where the ecosystem supports pinning/verification;
- the recorded registry/file digest matches the artifact verified before publication;
- local/source-tree imports of the candidate implementation are removed from the consuming path;
- integration tests run against the published artifact, not a local checkout or editable install;
- cross-repository behavior remains compatible;
- rollback is defined if the published artifact cannot reproduce the verified behavior.

Post-publication reconsumption is a terminal smoke/integration check on the public distribution path. It does not substitute for the pre-publication forge verification required by the `released` gate.

### `graduated`

Graduation is earned only when all prior gates are evidenced and authority transfer is explicitly authorized.

Then:

```text
implementation/public-contract authority: independent repository
forge relation: consumer/integration forge
ordinary downstream consumption: released immutable artifact
incubated implementation: removed, archived as provenance, or mechanically unreachable from production/import paths
```

The independent project may continue to depend on its originating projects. Independence means an independent authority and release boundary, not dependencylessness.

## Authority boundary and transition receipt

`interdependent-work-graph` snapshots keep their existing non-transfer invariant. Do **not** encode this graduation by setting an existing work-graph `authority_transfer` field to true.

Instead, use two exact graph identities plus a separate scoped transition receipt:

```yaml
schema: the-interdependency.project-graduation-transition
version: 1.0.0
candidate: <name>
before:
  work_graph_sha256: <exact digest>
  implementation_public_contract_authority: <forge repo@commit:path>
after:
  work_graph_sha256: <exact digest>
  implementation_public_contract_authority: <new repo@commit>
transition:
  implementation_public_contract_authority_transfer: true
  semantic_authority_transfer: false
  theorem_status_transfer: false
  proof_status_transfer: false
  certification_status_transfer: false
  measurement_status_transfer: false
  empirical_status_transfer: false
authorization:
  authority_transfer: authorized
artifact:
  version: <human-readable version>
  immutable_identity: <sha256-or-registry-immutable-id>
hmmm: []
```

The receipt describes the authorized transition **between** two valid graph snapshots. Each snapshot still records its own ordinary non-transfer boundaries. The transition does not rewrite upstream authorities.

Before graduation:

```text
forge owns candidate implementation
candidate consumes upstream authorities
```

After graduation:

```text
new repository owns candidate implementation and public contract
forge consumes candidate through its released interface
upstream repositories retain their own authorities
```

Never infer semantic/proof/measurement promotion from repository or package graduation.

## Graduation record

Maintain a small machine- or human-readable record in the forge or extraction PR. Minimum shape:

```yaml
candidate: <name>
state: <incubating|stabilizing|qualified|extracted|released|reconsumed|graduated>
mode: <assessment|execution>
authorization:
  external_mutation: <authorized|not-authorized>
  authority_transfer: <authorized|not-authorized>
forge:
  repository: <owner/name>
  source_commit: <immutable commit>
  source_path: <path>
future_authority:
  repository: <owner/name|hmmm>
distribution:
  kind: <pypi|registry|release-asset|other|hmmm>
  artifact: <name>
  version: <version|hmmm>
  candidate_immutable_identity: <sha256-or-equivalent|hmmm>
  published_immutable_identity: <sha256-or-equivalent|hmmm>
  published_matches_verified_candidate: <pass|fail|hmmm>
upstream:
  - repository: <owner/name>
    relation: <what is consumed>
    authority_transfer: false
gates:
  public_api: <pass|fail|hmmm>
  independent_tests: <pass|fail|hmmm>
  clean_build_install: <pass|fail|hmmm>
  license_distribution_rights: <pass|fail>
  release_ownership_authority: <pass|fail>
  provenance_preserved: <pass|fail|hmmm>
  exact_candidate_forge_verification: <pass|fail|hmmm>
  stable_release: <pass|fail|hmmm>
  downstream_reconsumption: <pass|fail|hmmm>
transition_receipt: <path-or-id|hmmm>
hmmm: []
```

A graduation record may cite a shared work graph, but the scoped transition receipt remains distinct because it records a lifecycle event rather than pretending one work-graph snapshot transferred all authority.

## Workflow

1. **Identify the forge and candidate.** State why the candidate is legitimately incubated there and what composition produced it.
2. **Resolve authorities.** Load `interdependent-work-graph` once multiple repositories participate. Pin exact identities and preserve non-transfer boundaries.
3. **Classify lifecycle state.** Choose the highest state for which evidence already exists; do not classify by aspiration.
4. **Stabilize the seam.** Separate public candidate contracts from forge-private conveniences. Declare allowed upstream dependencies and prohibited cycles.
5. **Run qualification gates.** Test independent purpose, public API, clean build/install, independent tests, provenance, downstream fixture behavior, license/distribution rights, and release ownership. Blocking unknowns stop at `qualified`.
6. **Check authorization before mutation.** If repository creation, namespace reservation, publication, consumer mutation, severance, or authority transfer is not explicitly authorized, stop that action boundary as `hmmm` while retaining the completed assessment.
7. **Extract with provenance.** Create the independent repository from the qualified source while preserving origin and exact extraction identity.
8. **Build and identify the candidate.** Build the would-be release artifact and record its immutable identity.
9. **Verify before stable publication.** Test the exact candidate in a clean environment and in the forge. A failure returns to repair/rebuild; it does not publish a known-bad stable release.
10. **Publish verified bytes.** Publish the verified candidate through the declared distribution surface and record the immutable published identity.
11. **Reconsume the publication.** Replace local forge consumption with the published artifact and rerun integration evidence.
12. **Sever the old implementation path.** Remove or mechanically disable ordinary consumption of the incubated copy while retaining provenance where useful.
13. **Record and authorize the transition.** Emit the scoped before/after authority-transition receipt, update ownership/dependency records, and only then declare graduation.
14. **Carry `hmmm`.** Non-blocking unresolveds remain visible; blocking unresolveds do not masquerade as passed gates.

## Output shape

When this skill is active, report:

```markdown
## Candidate
- name:
- forge:
- current state:
- intended independent authority:
- mode: assessment | execution

## Composition and authority
- upstream: exact identity — authority — relation
- non-transfer boundaries:

## Graduation gates
- public API:
- independent tests:
- clean build/install:
- license/distribution rights:
- release ownership:
- exact candidate identity:
- pre-publication forge verification:
- published immutable identity:
- reconsumption:

## Authorization
- external mutation:
- authority transfer:

## Actions
- delivered/read-only:
- authorized mutation:
- blocked:

## hmmm
- ...
```

## Validation

A successful graduation demonstrates all of the following:

- the candidate's origin and source identity are preserved;
- the candidate has an independently coherent public contract;
- tests and clean installation succeed outside forge-private paths;
- license/distribution rights and release ownership are resolved, not `hmmm`;
- upstream dependencies are explicit and semantic/proof/measurement authority does not silently transfer;
- external mutations and authority transfer were explicitly authorized;
- the independent repository builds an immutable candidate artifact;
- the exact candidate passes forge integration **before** stable public publication;
- the published immutable identity is bound to those verified candidate bytes;
- a clean consumer can install the exact published artifact;
- the forge reconsumes that published artifact successfully;
- ordinary local imports of the incubated implementation no longer determine runtime behavior;
- the scoped transition receipt binds exact before/after graph identities without changing the work-graph non-transfer invariant;
- rollback and remaining non-blocking `hmmm` stay visible;
- the new repository is the sole implementation/public-contract authority after graduation.

For Python/PyPI graduation, terminal evidence should resemble:

```text
build wheel/sdist
-> hash candidate artifact
-> clean-install exact candidate + run project tests
-> install exact candidate in forge + run integration tests
-> publish those verified bytes
-> verify registry/file digest
-> install published immutable artifact in forge
-> rerun integration smoke
-> sever local implementation path
-> record authorized authority transition
```

## Anti-patterns

- Treating creation of a new repository as proof of graduation.
- Publishing a stable artifact before the exact candidate has passed forge integration.
- Publishing an artifact while the forge still imports its local copy.
- Calling a version/tag immutable evidence without an artifact digest or equivalent registry identity.
- Copying code without preserving source commit/path provenance.
- Freezing an unstable API merely to satisfy a calendar date.
- Allowing unresolved license/distribution rights or release ownership through qualification.
- Treating a readiness assessment as permission to create repositories, publish packages, mutate consumers, or transfer authority.
- Requiring an independent project to have zero dependencies.
- Allowing the graduated package to import forge-private modules.
- Maintaining two writable implementations after graduation with no declared synchronization authority.
- Setting an existing work-graph `authority_transfer` field true to represent this lifecycle event.
- Calling an editable install, local path dependency, unreleased branch, or mutable tag a released consumption path.
- Letting package/repository graduation imply semantic, theorem, proof, measurement, certification, or empirical promotion.
- Deleting unresolved migration problems instead of recording `hmmm`.

## Minimal example

```text
metapat + ucns + edcm
        |
        v
stack/incubator/epac
        |
        | read-only qualification gates pass
        | explicit mutation authorization
        v
The-Interdependency/epac
        |
        | build candidate + immutable digest
        | stack integration-tests exact candidate
        v
publish verified EPAC artifact
        |
        | stack installs published immutable artifact
        v
sever local EPAC path + authorized transition receipt
        |
        v
EPAC graduated; stack resumes its role as forge/consumer
```

The example describes implementation lifecycle only. METAPAT, UCNS, EDCM, and EPAC each retain the authority and evidentiary status of their own domains.

## hmmm

- Whether repeated real graduations justify promoting the graduation record and transition receipt into versioned schema/helper files rather than keeping them as procedural reference contracts.
- Whether history extraction should become deterministic tooling; repository histories differ enough that the skill currently requires provenance preservation without mandating one Git surgery.
- Whether package publication should later split into a separate ecosystem-specific release skill after repeated use proves substantial independent complexity.
- A forge that cannot let go of its products is a warehouse with sparks; a product that cannot survive leaving the forge is still hot metal.
