---
name: github-tests
description: Design and audit behavioral tests and GitHub Actions evidence, including discovery, required gates, reproducible package checks, flaky tests, security, and resource cost. Load this when asked for GitHub testing best practices, a test-suite audit, test strategy, or a CI test-gate repair. Do not load for a routine test invocation whose scope and acceptance criteria are already fixed.
---

# GitHub tests — evidence that notices breakage

Use repository contracts to choose tests and current primary documentation to
choose GitHub mechanics. Read [sources](references/sources.md) when researching
or changing platform behavior. This procedural skill ships no universal test
discovery runner and defines no metadata schema.

## Workflow

1. **Freeze scope.** Resolve account, repository, default branch, exact commit,
   instructions, and lifecycle. Enumerate and paginate the organization first,
   then personally owned repos. Disclose inaccessible scopes. Separate active
   source, archives, vendored tests, upstream forks, generated fixtures, and
   documentation-only projects; retain every repo in the inventory.
2. **Trace execution.** Read workflows, package scripts, discovery configuration,
   custom runners, and representative assertions. Follow umbrella commands to
   their targets and working directories. Compare tracked tests with discovery,
   filters, skips, and package exclusions. File counts are inventory heuristics;
   only collection/run evidence supplies case counts. Collection executes code
   through imports and plugins, so it is not a static inspection.
3. **Inspect current evidence.** Bind each result to workflow, event, attempt,
   tested SHA, runtime, and logs/annotations. Distinguish PR head, synthetic merge,
   default head, and installed artifact. Check failed jobs before classifying them:
   billing, permissions, network, or dependency failures may prevent tests from
   starting. Old green evidence does not certify a new revision.
4. **Map claims to failures.** For important behaviors identify input, independent
   expected result, assertion, and a defect it would catch. Cover boundaries and
   rejected inputs. Select unit, integration, property, differential, browser,
   security, and release tests from actual exposure. For consequential claims,
   demonstrate sensitivity using an isolated seeded fault or historical
   regression; report surviving faults without promising universal coverage.
5. **Audit gates.** Apply the rules below. Read effective protection/rulesets,
   expected check sources, and merge-queue policy separately from YAML. An
   inaccessible settings API leaves enforcement unknown. Preserve empty discovery,
   runner errors, skipped work, flaky outcomes, and missing artifacts in results.
6. **Fit resources.** Preflight dependencies, credentials, network, CPU, memory,
   disk, cost, and durability. Use inexpensive isolated PR checks; justify broader
   compatibility, corpus, mutation, and live-service lanes separately. Select
   supported runtime matrices, locked inputs, lock/runtime-keyed caches, and
   concurrency that fits capacity. Shard after measuring. Do not start work
   unlikely to finish or cancel healthy research for convenience. Use timeouts
   for real hang protection or declared external limits; report interruption.
7. **Act within scope.** Inspect test side effects before isolated execution.
   Audits do not authorize product patches, policy changes, production acceptance
   runs, or revival of retired suites. When repair is authorized, reproduce the
   fault, repair its owning layer, and verify the relevant final-revision gate.
8. **Deliver reproducible findings.** Preserve identities, commands, run links,
   sampling depth, limitations, and prioritized actions. State inspection, local
   execution, CI execution, merge enforcement, release, and deployment separately.

## Gate rules

- Give each lane a documented entry point. Fail on required assertion failures,
  runner errors, unexpected empty discovery, and unavailable required checks.
  Declare optional/manual cases explicitly; blocked cases cannot imply complete
  acceptance merely because a custom summary exits zero. Keep distinct obligations
  under unique case identities; a later unrelated pass must not replace a failure.
- Validate applicable PR and default-branch changes; add `merge_group` when the
  merge queue requires checks. Include shared helpers, manifests, fixtures, and
  workflows in change selection. Path filtering is a dependency decision.
- Use stable distinct check names. Required aggregate jobs must run after failed
  dependencies (`if: always()` with `needs`) and assert every required result
  succeeded; handle cancellation and allowed skips explicitly. GitHub may accept
  skipped/neutral jobs, while path/branch-skipped workflows can leave checks
  pending. Neither establishes test execution.
- Preserve exit status through pipelines and wrappers. Inspect
  `continue-on-error`, `|| true`, empty-suite options, swallowed exceptions,
  and summaries in context: tolerating a cache miss differs from ignoring a test.
- Pin source/dependency identities. For distributed Python packages, test built
  wheels/sdists in clean environments outside the checkout, verify import origins
  and resources, and retain hashes. Exercise the producer revision actually
  promised by each consumer contract.
- Isolate clocks, randomness, files, databases, ports, and services. Retain seeds
  and minimized counterexamples. Mock external boundaries while asserting
  behavior at real interfaces; do not duplicate implementation logic as an oracle.
  Live credentials require an authorized lane and cleanup.
- Keep first failures visible across retries. Give quarantined flaky tests an
  owner, reproduction evidence, and review/expiry condition. Track retry
  dependence; rerun-to-green does not establish reliability.
- Retain command/runtime identity, collected/passed/failed/skipped counts, JUnit
  or equivalent, and relevant browser traces. Upload diagnostics after failure,
  redact secrets, and set retention. Use coverage to locate unexamined behavior;
  no universal percentage substitutes for meaningful assertions.
- Give validation minimum token permissions, normally `contents: read`; grant
  release privileges only to the jobs needing them. Pin actions to verified
  immutable identities using supported platform mechanisms and maintain updates.
  Never execute untrusted PR code with privileged `pull_request_target` or
  `workflow_run` credentials. Inspect expression injection and cache/artifact
  trust boundaries.

## Evidence boundaries

Use `repo-audit-repair` for finding classes when available: `DEFECT`,
`ENVIRONMENT`, `EXTERNAL`, `POLICY`, and `HMMM`. Otherwise explain these
distinctions plainly. Positive evidence applies only to its verified scope.

Software execution, empirical support, and mathematical proof are separate
claims. Encoding round trips establish recovery for tested inputs; security
requires a stated attacker model and relevant negative experiments. Corpus size
and challenge-file counts are not test counts. Repository links transfer no
proof, semantic, or measurement authority.

For MSDMD linkage, load `test-build`; do not invent `proves` edges or require
duplicate metadata merely because a native reader is unavailable.

## Output shape

Lead with the most consequential supported finding. Include:

`repository@commit | active suite/claim | invoked gate | observed evidence |
classification/limitation | next action`

Label heuristic file counts and sampling depth. Include source/run links,
confirmed strengths, reproducible commands, and `hmmm`. Rank by consequence
and ability to resolve the actual blocker, rather than quantity or badge color.

## Usage guidance

- “Audit my repos, org first”: inspect and report; preserve product and policy.
- “Fix this test gate”: reproduce and verify within the authorized repair scope.
- “Add tests for this behavior”: identify the contract and independent oracle,
  add tests that reject plausible defects, and integrate the declared lane.
- Documentation-only work needs proportionate link/schema/render checks when
  those claims matter; do not manufacture application tests.

## Validation

Use raw fixtures or real artifacts to verify that the skill catches echo-only
CI, swallowed exits, omitted required suites, checkout-shadowed package tests,
and successful aggregates after failed dependencies. It must recognize billing
non-execution, preserve deliberate archival exclusions, and mark unreadable
branch rules unknown. Text-presence tests alone do not validate these judgments.

## Anti-patterns

- Certifying from green badges, filenames, or coverage alone.
- Presenting syntax, type checking, or import smoke as full behavior testing.
- Patching code to compensate for quota or runner failure.
- Counting embedded/archived suites as successor protection.
- Importing test modules during a supposedly static audit.
- Expanding audit into production, billing, or policy changes.

## hmmm

Discovery completeness, oracle independence, mutation sensitivity, and effective
merge enforcement need repository-specific evidence. Preserve each unknown with
its decisive next observation. This skill does not certify unexecuted suites.
