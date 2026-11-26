---
name: repo-audit-repair
description: Evidence-led repository audit and repair from exact repository identity through authoritative verification. Use this when asked to audit, assess, harden, clean up, or audit and repair an existing code repository; when a green build may conceal placeholder gates, deprecated paths, or partial publication; or when repair must distinguish repository defects from environment, external-service, policy, and unresolved conditions. Do not load for an ordinary fixed-scope edit, a narrow review, or diagnosis of one already-localized failure unless the user requests a broader repository audit.
---

# repo-audit-repair — green must mean what it says

Audit establishes what is true. Repair changes only evidenced repository-owned
faults. A successful command, merged change, and healthy deployed product are
different claims and require different evidence.

## Core contract

```text
exact repository identity -> reproducible baseline -> applicable audit surfaces
-> classified findings -> authorized repair -> repeated verification
-> authoritative terminal state
```

- Resolve the repository, default branch, exact starting commit, governing
  instructions, dirty state, and release/deployment model before judging it.
- Treat audit-only requests as read-only. An `audit and repair` request permits
  necessary repository changes, not unrelated cleanup, policy changes,
  destructive data operations, credential acquisition, or broader publication.
- A green check is evidence only for what it actually executes. Placeholder,
  skipped, pending, empty, or non-asserting gates remain gaps.
- Distinguish repository defects from host-environment failures, external
  service failures, deliberate owner policy, and insufficient evidence.
- Repair the owning layer. Do not rewrite an upstream source to conceal a
  consumer renderer, workflow, packaging, or deployment defect.
- Remove demonstrated deprecated paths and replace any still-needed capability
  in the same repair boundary. Dead parallel architectures are not harmless.
- Re-run the relevant full gate after repairs. If merge, release, or deployment
  is within scope, verify that terminal surface before calling the work complete.
- Carry unresolved constraints as `hmmm`; do not turn incomplete verification
  into success prose.

This skill owns audit closure. Load security, publication, accessibility,
language, framework, hosting, or organization skills only when their own
triggers apply; their domain doctrine remains theirs.

## Finding classes

Split compound failures into separate findings first. Every material finding
then receives exactly one standing class until new evidence changes it:

| Class | Meaning | Permitted response |
|---|---|---|
| `DEFECT` | Reproducible repository-owned behavior violates a declared or necessary contract. | Repair in the owning layer and prove the repair. |
| `ENVIRONMENT` | The current host cannot execute the check or reproduce the product. | Repair the environment when authorized, relocate the check, or retain `hmmm`; do not patch product code to satisfy the host. |
| `EXTERNAL` | A remote service, source, registry, or network boundary failed independently of repository logic. | Retry only within declared bounds; use explicit fallback where authorized; do not call partial data complete. |
| `POLICY` | The behavior is an explicit owner decision rather than an implementation fault. | Preserve it or present a separate policy decision; do not silently "repair" it. |
| `HMMM` | Available evidence cannot yet distinguish the classes above. | Preserve the uncertainty and name the decisive next observation. |

Passing evidence may be recorded as `HEALTHY`, but absence of a finding is not
proof that an unexamined surface is healthy.

## Applicability gate

Do not impose one universal checklist. Select surfaces from repository claims
and actual exposure:

| Surface | Apply when |
|---|---|
| Build and tests | The repository declares a runnable product, package, generator, or test suite. |
| CI truthfulness | Workflows claim validation, release readiness, security, publication, or deployment. |
| Dependencies and security | The repository consumes dependencies, handles untrusted input, secrets, auth, network, or privileged operations. |
| Deprecated architecture | More than one implementation path, stale scaffold, removed dependencies, or superseded routes remain. |
| Links and provenance | The product publishes, indexes, renders, or retrieves source-owned material. |
| Performance | The repository exposes a latency-, size-, memory-, or browser-sensitive product and a defensible budget exists. |
| Browser and accessibility | A human-facing web interface is part of the product. |
| Release and deployment | The task or repository workflow ships artifacts or a live service. |

For every selected surface, identify the claim, executable witness, and terminal
condition. For every omitted surface, the reason should be obvious from scope or
recorded briefly; do not manufacture tests merely to populate the table.

## Workflow

### 1. Resolve identity and authority

- Confirm the exact repository instead of guessing from a generic project name.
- Record the starting commit and branch; preserve unrelated user changes.
- Read repository instructions and applicable skills before acting.
- Identify which repository or system owns source content, rendering, tests,
  workflow, packaging, deployment, and policy decisions.
- Inspect current release/deployment status when it is part of the product.

If repository identity or governing authority cannot be resolved, stop that
boundary as `hmmm`.

### 2. Establish a clean baseline

- Run declared checks from the pinned starting state with an environment capable
  of hosting them.
- Separate dependency-install, browser/runtime, permission, network, and quota
  failures from product failures before editing source.
- Inspect recent authoritative CI/release results where available, but do not
  substitute status color for understanding what each job proves.
- Preserve generated snapshots, traces, caches, and refresh output as audit
  evidence outside the intended patch when possible.

### 3. Audit claims, not filenames

- Trace each declared release or quality claim to an executable assertion.
- Open scripts behind umbrella commands; reject checks that merely print
  `pending`, tolerate all failures, or never inspect the built artifact.
- Search for stale parallel implementations, imports without dependencies,
  dead entry points, obsolete workflow versions, and superseded configuration.
- For remote-input builds, compare requested/discovered inputs with resolved and
  published inputs. Partial retrieval must fail closed or become explicit,
  identity-bearing fallback; it may not silently shrink the product.
- Inspect artifact behavior, not only source syntax: generated links, routes,
  manifests, package contents, browser behavior, and deployment identity as
  applicable.

### 4. Classify before repairing

For each finding, record:

```text
claim -> evidence -> class -> owner -> proposed action -> verification
```

Do not repair `ENVIRONMENT`, `EXTERNAL`, or `POLICY` findings as if they were
repository defects. Reclassify only when new evidence supports the change.

### 5. Repair the smallest complete boundary

- Change only evidenced faults and the tests/contracts necessary to prevent
  recurrence.
- Place the fix where the broken responsibility lives. For example, a
  publication consumer that mis-resolves source-relative links fixes its
  renderer; it does not edit the source repository's valid prose.
- Replace placeholder gates with bounded checks over actual outputs.
- Remove obsolete implementations once their replacement is proven.
- Keep dependency and lockfile changes exact and attributable.
- Use `repo_loto` when available to declare intent, mutation scope, and test
  evidence; its presence is useful instrumentation, not a prerequisite for this
  skill.

### 6. Verify through the authorized terminal state

- Re-run the same full applicable gate from a clean repaired state.
- Run focused regression checks plus the repository's broader release gate.
- Remove or restore audit-generated side effects so the patch contains only
  intentional changes.
- Let authoritative CI test the branch where local infrastructure cannot.
- If CI exposes a real incompatibility, repair the same branch and repeat rather
  than reporting a merely open pull request as completion.
- If merge is authorized, treat merge admission as a conjunctive exact-revision
  gate, not an impression from green CI. Before invoking merge, record the
  current PR head SHA and base SHA, or an immutable validated merge-candidate
  identity that binds both, and verify all of the following against that same
  revision pair: scope is unambiguous; the required checks are complete and
  successful; every applicable drift/contract gate passes; no unresolved
  merge-blocking finding (including P0/P1/P2 under that severity scheme) and no
  unresolved review thread remains; governing authority is present; and the PR
  is mergeable. A terminal review required by repository or task policy must be
  anchored to the current head and current base rather than an earlier revision
  pair. When policy requires approval, require the complete effective,
  non-dismissed `APPROVED` review set required by that policy, including every
  mandated approval count, reviewer role, and eligibility constraint; a
  `COMMENTED` or `CHANGES_REQUESTED` submission is not approval. Any head or
  base movement invalidates the admission receipt and requires
  re-verification/re-review.
- Use the provider's strongest guarded merge path. Server-side enforcement
  must cover every repository policy the provider declares required at merge
  time, including protected-branch checks, approvals, conversation resolution,
  merge-queue policy, or equivalent controls when configured. Do not bypass
  those controls.
- Treat task-local admission evidence that the provider does not model — scope
  judgment, audit severity findings, local drift/contract gates, and advisory
  checks or reviews — as part of the exact-revision receipt rather than
  pretending the provider can atomically enforce it. Re-read that receipt
  immediately before merge and abort on any change. Use an expected-head/SHA
  precondition whenever the provider exposes one. Where no expected-base guard
  exists, require the current base SHA or validated merge candidate to match the
  receipt at the final pre-merge read and require provider mergeability to be
  recomputed against that same base; the provider's merge transaction is then
  authoritative for the final base integration. Base movement invalidates the
  receipt and requires re-verification. Never merge first and reconstruct
  exact-revision evidence afterward.
- If deployment or release follows and is in scope, verify the public artifact,
  version, route, or service identity afterward.
- State `reviewed-at-head`, `merged`, `released`, and `deployed`
  separately. Never infer one from another.

## Output shape

For audit-only work:

```markdown
## Baseline
- repository, starting commit, governing instructions, environment

## Findings
- claim — evidence — class — owner — decisive next action

## Verified healthy
- only surfaces with positive evidence

## hmmm
- unresolved or unexecutable boundaries
```

For audit-and-repair work, add:

```markdown
## Repairs
- owning fault — changed files — regression protection

## Verification
- reviewed-at-head — exact head SHA + base SHA/validated merge candidate + review state
- local checks — CI — merge — release/deployment, each with exact status
```

Lead with the achieved state. Include commands only when they help another
operator reproduce or continue the work.

## Usage guidance

- `Audit this repository` activates read-only classification and reporting.
- `Audit and repair this repository` authorizes necessary in-repo repairs and
  their verification within the existing repository workflow.
- `Fix this failing unit test` is a narrow repair and does not activate the
  broad audit unless wider repository health is requested or the localized
  premise is disproven.
- For a distributed publication, load `interdependent-work-graph` and
  `distributed-publication`; this skill then owns the enclosing audit/repair
  lifecycle, not source authority.

## Validation

A correct use demonstrates:

- exact starting identity and governing authority;
- explicit applicability decisions;
- findings classified before mutation;
- no product patch justified solely by an environment failure;
- no green placeholder represented as verification;
- repair at the owning layer;
- deprecated paths removed when replacement is proven;
- clean repeated gates and artifact hygiene;
- exact-revision merge admission when merge is authorized, including head/base
  binding, terminal current-revision review when required, the complete
  policy-mandated effective `APPROVED` review set when approval is required,
  provider enforcement of configured repository policy, and immediate
  revalidation of task-local admission evidence;
- distinct PR, review-at-head, merge, release, and deployment claims; and
- visible `hmmm` for every unfinished boundary.

## Anti-patterns

- Guessing which repository the user meant.
- Treating a failed local installation as a source defect.
- Treating recent green CI as proof without opening the claimed gates.
- Adding fashionable checks unrelated to repository claims.
- Repairing upstream content to compensate for consumer behavior.
- Leaving invalid deprecated scaffolding because the active build ignores it.
- Publishing a partial remote-source graph while claiming current completeness.
- Mixing generated audit artifacts into the repair diff.
- Opening a pull request and calling the repository repaired before its
  authoritative checks settle.
- Merging from green CI alone when review is required, accepting review bound
  to an earlier head/base pair, accepting an incomplete approval set, treating
  `COMMENTED` as required approval, merging with any merge-blocking finding or
  unresolved review thread outstanding, bypassing configured repository
  protection, or treating task-local admission evidence as provider-enforced.
- Calling a merge a deployment.

## Canon basis

The initial accepted workflow was distilled from the audit and repair of
`The-Interdependency/The-Interdependency.github.io`, merged in
[PR #50](https://github.com/The-Interdependency/The-Interdependency.github.io/pull/50)
at `238595b`. That case supplies implemented evidence for the distinctions
above; it does not make its Eleventy, GitHub Pages, or publication-specific
commands universal.

## hmmm

- A portable executor that discovers repository-specific audit commands across
  ecosystems is not yet selected; this skill governs agent behavior, while each
  repository remains authoritative for its executable gates.
- Manual semantic review can expose false-green checks that static workflow
  inspection misses; the minimum automatable depth remains repository-specific.
