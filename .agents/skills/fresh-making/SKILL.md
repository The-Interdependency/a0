---
name: fresh-making
description: Deterministic restoration of derived-artifact consistency after authoritative inputs change. Load this when deciding whether generated or derived outputs are current; when regenerating MSDMD collections, documentation, projections, package indexes, calibration artifacts, or other outputs from exact source identities; when computing the minimum affected rebuild closure; when designing retryable regeneration across unreliable executors; or when a system needs to make artifacts provably fresh rather than merely recently rebuilt. Do not load for ordinary one-shot builds whose inputs and outputs have no persistent freshness contract.
---

# fresh-making — restore derivation consistency

It does not own the source canon, the generator's domain semantics, or the executor. It owns the **freshness decision and restoration discipline** connecting them.

## Core contract

```text
fresh != recent
fresh == provably consistent with declared current inputs
```

A target is **fresh** only when all of the following are true:

1. every required input has an exact current identity;
2. the receipt records those same input identities;
3. the generator identity and generation contract match the current declaration;
4. every declared output exists and matches its recorded content digest;
5. the verifier passes against the current output;
6. no required relation is unresolved as `hmmm`.

A timestamp may aid operations and audit. It never proves freshness.

## Load this when

- A source commit, schema, package version, corpus digest, skill, generator, or configuration changes and derived outputs may need regeneration.
- A user asks whether an artifact is stale/current/fresh, or asks to make it fresh.
- Computing which MSDMD collections, organization aggregations, website projections, generated docs, package surfaces, calibration products, or reports must rebuild after a change.
- Building a durable regeneration backend that must survive failed, missing, or unreliable GitHub Actions runs.
- Designing executor-independent retries, leases, receipts, verification, or dependency ordering for derived work.
- A cross-repository work graph has exact identities but still needs a deterministic derivation/freshness layer.

When the derivation crosses authority boundaries, load `interdependent-work-graph` as well. When designing a continuing automated feedback cycle around make-fresh operations, load `loop-eng` as well.

## Non-trigger

Do not load this skill merely because code is being compiled, tests are being run, or a user says "rebuild" once.

It is unnecessary when:

- the build has no persistent derived artifact;
- no later consumer needs to know whether an existing artifact remains valid;
- the operation is already completely owned by a repository-local deterministic build with no stored freshness decision;
- the question is only about scheduling or queue implementation rather than derivation correctness.

Fresh-making may use a scheduler or queue, but it is not queue doctrine.

## Authority boundary

Fresh-making never promotes a derived consumer into the authority for its inputs.

```text
producer authority -> exact input identity
                          |
                          v
                  fresh-making decision
                          |
                          v
                  derived artifact + receipt
```

- A UCNS-derived artifact does not become UCNS canon because it was regenerated successfully.
- An organization projection does not become authority for repository-owned MSDMD declarations.
- A backend may trigger an owning repository's generator; it must not silently substitute its own interpretation of that repository's canon.
- Successful regeneration proves derivation consistency under the declared contract, not theorem status, empirical validity, semantic correctness, certification, or publication approval unless those are separately verified by their owning authorities.

## State model

Use these target states:

```text
fresh
making-fresh
blocked
hmmm
```

`stale` is a **diagnosis**, not a durable workflow state. It means a known freshness predicate is false and therefore induces make-fresh work.

Keep execution attempt state separate from target freshness state. A useful attempt state machine is:

```text
requested
-> ready
-> leased
-> running
-> verifying
-> succeeded

          \-> failed
          \-> cancelled
          \-> hmmm
```

Important distinctions:

- a target can be not fresh even when no attempt has failed;
- an attempt can fail while the previously published target remains valid for its older declared inputs;
- a successful process exit is not a fresh result until verification and receipt publication succeed;
- unknown identity, ambiguous authority, or unverifiable output is `hmmm`, not fresh and not fabricated failure evidence.

## Derivation specification

Every make-fresh target needs a declared derivation specification. The minimal conceptual shape is:

```json
{
  "schema": "the-interdependency.fresh-making-spec",
  "version": "1.0.0",
  "target": "org-msdmd",
  "inputs": [
    {"name": "ucns", "identity": "git:<40-hex-sha>"},
    {"name": "edcm", "identity": "git:<40-hex-sha>"}
  ],
  "generator": {
    "identity": "git:<generator-repo>@<40-hex-sha>",
    "command": "python -m ..."
  },
  "outputs": [
    {"path": "generated/example.ts"}
  ],
  "verifier": {
    "identity": "git:<verifier-repo>@<40-hex-sha>|builtin:<version>",
    "command": "python ... --check"
  },
  "depends_on": []
}
```

The strings are reference shapes, not a universal transport format. A consuming implementation may use structured identities, but it must preserve the same information and version its schema.

### Input identity rules

Prefer immutable identities:

- Git commit SHA for repository state;
- content digest for files, corpora, or sealed artifacts;
- package name + immutable version + artifact digest when package bytes matter;
- schema identifier + version + digest when interpretation depends on a schema;
- explicit `hmmm` when the authoritative identity cannot be resolved.

Never use `main`, `latest`, filesystem modification time, successful workflow name, or "generated today" as freshness evidence.

## Freshness key

A consuming implementation should compute a deterministic **freshness key** from the identity-bearing parts of the derivation specification.

At minimum the key binds:

```text
target
ordered/resolved input identities
generator identity + generation contract
verifier identity + verification contract
declared outputs
dependency identities where they affect interpretation
schema version
```

Recommended reference algorithm:

```text
freshness_key_sha256 = SHA256(canonical_json(identity_bearing_spec))
```

Use sorted object keys and an explicitly declared array ordering. Do not include observation timestamps, retry counters, hostnames, temporary paths, executor choice, or other incidental runtime state unless they genuinely change the derivation semantics.

## Receipt contract

A successful make-fresh operation emits a receipt. Minimal reference shape:

```json
{
  "schema": "the-interdependency.fresh-making-receipt",
  "version": "1.0.0",
  "target": "org-msdmd",
  "freshness_key_sha256": "<64-hex>",
  "inputs": [
    {"name": "ucns", "identity": "git:<40-hex-sha>"}
  ],
  "generator": {
    "identity": "git:<repo>@<40-hex-sha>",
    "command": "python -m ..."
  },
  "outputs": [
    {"path": "generated/example.ts", "sha256": "<64-hex>"}
  ],
  "verification": {
    "verifier_identity": "git:<repo>@<40-hex-sha>|builtin:<version>",
    "result": "pass"
  },
  "executor": {
    "kind": "vm|github-actions|local|other",
    "attempt_id": "<opaque-id>"
  },
  "made_fresh_at": "<audit timestamp>",
  "hmmm": []
}
```

`executor` and `made_fresh_at` are audit fields. They do not determine freshness unless the derivation specification explicitly says executor environment is semantically relevant.

A receipt is evidence of one derivation result. It is not producer authentication unless separately signed under a declared signature contract.

## Freshness predicate

Given a current derivation specification and the latest accepted receipt:

```text
fresh(target) iff
  current freshness key == receipt freshness key
  AND every declared output exists
  AND every output digest == receipt output digest
  AND current verifier passes
  AND required dependencies are fresh
  AND no required identity/verification relation is hmmm
```

If the key differs, the target is diagnosed as stale and enters make-fresh planning.

If the key matches but output bytes differ, the target is not fresh even if timestamps look new.

If the output bytes match but the verifier cannot run or its required identity is unknown, return `hmmm` unless another declared verifier contract proves equivalence.

## Make-fresh workflow

1. **Resolve authority and identities.** Identify each authoritative input and resolve its exact immutable identity. Cross-repository jobs use `interdependent-work-graph` rather than rediscovering authority ad hoc.
2. **Load the derivation specification.** Resolve target, inputs, generator, outputs, verifier, and dependency edges.
3. **Evaluate freshness.** Recompute the current freshness key, verify output digests, run the verifier where required, and classify the target as `fresh`, known-not-fresh, `blocked`, or `hmmm`.
4. **Compute affected closure.** Starting from changed identities or explicitly requested targets, traverse the derivation graph and select only targets whose freshness predicate can have changed. Include dependencies before consumers.
5. **Minimize work.** Before scheduling generation, re-check each selected target. Do not rebuild a target already proven fresh under the same key.
6. **Create idempotent jobs.** Job identity binds target + freshness key + operation. Repeated requests for the same logical transition converge on one job/result rather than multiplying work.
7. **Lease one attempt.** Exactly one executor owns an active attempt. Record lease expiry/heartbeat so dead workers can be recovered without permanent `running` state.
8. **Execute through an adapter.** Prefer a directly controlled VM/local executor for the reference path when available; GitHub Actions or another hosted runner may be an executor but never the sole source of orchestration truth.
9. **Verify independently of executor success.** Recompute output digests and run the declared verifier. Treat "workflow succeeded" or exit code zero as attempt evidence only.
10. **Publish atomically.** Make verified outputs and their receipt visible as one logical transition, or preserve the previously accepted receipt/output as current for its older key while reporting the new transition failure.
11. **Propagate freshness.** Only after dependencies are verified fresh may dependent targets become candidates for fresh status.
12. **Report closure.** Return what was already fresh, what was made fresh, what failed, what is blocked, and every surviving `hmmm`.

## Affected-closure algorithm

The scheduler should be boring:

```text
changed identities
-> reverse dependency traversal
-> candidate targets
-> topological order
-> freshness re-check
-> enqueue only known-not-fresh targets
-> verify each result
-> unlock consumers
```

Do not "rebuild all" merely because invalidation logic is inconvenient. Full rebuild remains an explicit recovery or audit operation, not the normal freshness strategy.

Cycles in the derivation graph are `blocked` unless the specification declares a bounded fixed-point protocol with an explicit convergence verifier.

## Durable orchestration contract

Fresh-making is backend-agnostic, but a durable implementation should preserve:

- persistent job and attempt identity;
- transactional state transitions;
- lease owner and lease expiry;
- heartbeat or equivalent abandoned-attempt recovery;
- retry count and complete previous-attempt evidence;
- dependency edges;
- desired freshness key;
- accepted receipt identity;
- failure and `hmmm` reason;
- executor adapter and bounded executor-specific metadata.

SQLite with transactional leases is sufficient for a single-machine or modest-volume reference implementation. Do not introduce a distributed queue merely to simulate scale that does not exist.

Executor adapters should expose one conceptual interface:

```text
start(job) -> attempt
observe(attempt) -> running | terminal | hmmm
cancel(attempt) -> result
collect(attempt) -> candidate outputs + execution evidence
```

Verification and receipt acceptance remain outside the executor adapter.

## MSDMD application

For MSDMD regeneration, a typical dependency chain is:

```text
repo source identity
    -> repo-owned <repo>_msdmd.ts
    -> organization aggregation
    -> website/public projection
```

A change to a repository's relevant source invalidates that repository collection and every downstream projection that binds its digest.

A change to the MSDMD generator contract invalidates every collection whose freshness key binds that generator identity, even when repository source commits did not change.

Each repository remains authority for its own declarations and generator invocation. A stack-level backend may discover, trigger, retry, verify, and aggregate those operations; it must not silently fabricate repo-owned MSDMD content when the owning regeneration path fails.

## CLI/output surface

A consuming control plane may expose commands such as:

```text
fresh status [target]
fresh make <target>
fresh make --affected
fresh make --all
fresh explain <target>
fresh retry <job-id>
fresh cancel <job-id>
```

`explain` should answer with evidence, not a boolean alone:

```text
target: org-msdmd
state: making-fresh
reason: ucns input identity changed
old key: ...
new key: ...
blocked_by: []
active_attempt: ...
hmmm: []
```

## Validation

A successful implementation must demonstrate at least these cases:

1. **No-op:** unchanged identities + matching digests + passing verifier schedule no regeneration.
2. **Input change:** one upstream identity change selects that target and its downstream closure, not unrelated targets.
3. **Generator change:** a generator identity/contract change invalidates all bound targets even when source inputs are unchanged.
4. **Tamper:** matching receipt key but changed output bytes is detected as not fresh.
5. **Dead worker:** an expired lease can be recovered without two active attempts owning the same job.
6. **Executor failure:** one executor may fail and a later adapter may retry without losing earlier attempt evidence.
7. **False green:** executor reports success but verifier fails; no fresh receipt is accepted.
8. **Dependency block:** a failed prerequisite prevents a consumer from being declared fresh.
9. **Unknown identity:** unresolved required input becomes `hmmm`, not a guessed identity and not a fresh result.
10. **Idempotency:** repeated make-fresh requests for the same target/key converge on the same logical job/result.
11. **Minimal closure:** unrelated fresh targets are not rebuilt.
12. **Receipt replay:** a second agent/process can reproduce the freshness decision from the spec, identities, outputs, and receipt without relying on hidden scheduler memory.

For this skill repository itself, run the normal skill-lib drift and compliance checks after adding or changing the skill.

## Anti-patterns

- Using modification time, build time, "latest", or workflow recency as freshness evidence.
- Treating every source change as justification for rebuilding every artifact.
- Regenerating before resolving which exact source identities should govern the result.
- Letting an executor mark work fresh merely because it exited successfully.
- Storing job state only in GitHub Actions, a terminal session, or process memory.
- Running the same attempt simultaneously on several executors as an accidental retry strategy.
- Deleting failed attempt history when retrying.
- Publishing an updated receipt before output verification completes.
- Overwriting the last accepted artifact with an unverified candidate.
- Reconstructing producer-owned metadata in the orchestrator when the producer regeneration path is unavailable.
- Making timestamps part of derivation identity without a semantic reason.
- Calling a target `failed` when no regeneration attempt occurred; diagnose it as known-not-fresh instead.
- Calling a target `fresh` when required evidence is `hmmm`.

## Output shape when this skill is active

```markdown
## Freshness target
- target: ...
- current state: fresh | making-fresh | blocked | hmmm
- desired freshness key: ...
- accepted receipt: ...

## Cause / affected closure
- changed identity: ...
- selected targets in dependency order: ...
- skipped because already fresh: ...

## Execution
- job/attempt: ...
- executor: ...
- retry/lease state: ...

## Verification
- output digests: ...
- verifier: pass | fail | hmmm
- resulting receipt: ...

## hmmm
- ...
```

## Relationship to neighboring skills

```text
interdependent-work-graph
  owns: participant identities, authorities, cross-repository relations

fresh-making
  owns: derivation consistency, affected closure, restoration, receipts

loop-eng
  owns: repeated feedback-cycle design and stopping/escalation structure

repo-audit-repair
  owns: broader evidence-led repository defect finding and repair

msdmd application skills
  own: domain-specific declaration/generation contracts
```

Fresh-making should consume those contracts rather than absorbing them.

## hmmm

- The first production derivation-spec storage location and schema implementation in `stack` are not yet selected.
- Atomic publication semantics differ for local files, Git commits, package registries, and remote publication targets; consuming implementations must make the acceptance boundary explicit rather than pretending one universal filesystem rename solves all cases.
- Cryptographic producer authentication is not provided by content digests or Git identities alone; signed receipts may become a separate contract if threat models require them.
- Fixed-point derivations are intentionally unsupported by the baseline workflow until a concrete bounded convergence case earns the complexity.
- A generator that regenerates itself is either a carefully versioned bootstrap problem or a small machine eating its own instruction manual. Treat it as `hmmm` until the bootstrap boundary is explicit.