---
name: pstack-orchestration
description: Evidence-bound orchestration for GitHub repository and code tasks, distilled from Lauren Tan's pstack / poteto-mode. Load this when starting, planning, fixing, reviewing, or verifying work in a GitHub repo or other code checkout; when an agent must bind a task contract, dispatch investigation or design skills, reproduce a baseline before patching, record PASS/FAIL/NOT_RUN evidence, run a bounded repair loop, or apply autonomy gates before parallel work, push, or merge. Also load when asked to use pstack, poteto-mode, skill dispatch, or a pstack-inspired prompt for repo work. Do not load for ordinary prose, a single already-scoped file edit with a named check already running, agent permission-plane design (use agent-ops), a0/a0p instance lifecycle (use the lifecycle skill), or a CI-gate audit alone (use github-tests).
---

# pstack-orchestration — verify before you fan out

Procedural skill. Host-neutral checklist for repo/code work. This is a distillation, not a vendored copy of pstack, and it does not depend on Cursor-only tools.

`pstack` remains Lauren Tan's plugin name. This skill's handle is a specialized borrowing: it names the method family, not the plugin, a Grok Build port, or a new official pstack.

## Cross-load

| Concern | Load |
|---|---|
| Permissions, untrusted tool content, human approval for irreversible effects | `agent-ops` |
| Closed loops and maker/checker separation | `loop-eng` |
| Test and CI evidence | `github-tests` |
| Broader repository audit or authorized repair | `repo-audit-repair` |
| Org workflow, when the work is in this organization | `the-interdependency` |
| Naming or doctrine in a repo that has an org skill library | `domain-claims`, and that library's other applicable skills |
| After this skill materially shapes the task | `skill-usage` |

Missing authority stops that boundary as `hmmm`.

## Workflow

Follow these steps in order. Skip a step only when it cannot apply, and record it `NOT_RUN` with a reason.

### 1. task.contract

Bind all of the following before editing:

- `repo` — exact owner/name and forge (GitHub unless already resolved otherwise)
- `task` — the change requested, in one sentence
- `success` — an observable pass/fail condition, not "make it better"
- `scope` — permitted paths and actions
- `access` — approved tools, credentials, and permissions
- `stop_when` — attempt budget, missing-prerequisite halt, or other stop
- `baseline.commit` — current HEAD SHA
- `baseline.worktree_diff` — pre-existing dirty state
- `rollback` — how to revert only this task's changes, leaving unrelated work intact

Use only tools and access already approved. Read repository instructions (`AGENTS.md`, `CONTRIBUTING`, skill-lib copies under `.agents/skills/`) first. If the contract cannot be bound, stop as `hmmm` and name the missing field.

### 2. skill.dispatch

Inspect the task and the missing context, then route:

| Need | Role (plain step) | Optional pstack skill, if installed |
|---|---|---|
| Enter a rigorous playbook | Start the host's pstack/poteto playbook when it is actually installed | `/poteto-mode` |
| How the code works now | Trace calls, state, and data flow in the checkout | `/how` |
| Why it was built this way | Recover rationale from history, issues, and docs | `/why` |
| Types and boundaries | Settle caller usage, types, and module shape before crossing an interface | `/architect` |
| Competing solutions | Compare N attempts at the same task, then take the best parts | `/arena` |
| Independent slices | Split disjoint work, one owner per path, then one rollup | `/swarm` |
| Adversarial review | A different checker tries to break the candidate with evidence | `/interrogate` |

Demonstrated-need rule: invoke a skill or role only when the task has a named gap that role fills. Do not start `/poteto-mode`, `/arena`, `/swarm`, or `/interrogate` out of habit. If pstack is not installed, run the plain step; do not invent Cursor or Grok Build tool calls.

Define shared interfaces and file ownership before any parallel edit. Keep confirmed evidence distinct from inference.

### 3. verifier.resolve

Discover existing startup scripts, test commands, and drivers. Reuse a working procedure.

Record:

- `launch.command`, `launch.cwd`, `launch.ready`
- doctor checks: usable instance, correct build, required access
- `drive.interface` — the real UI, CLI, API, library, or docs surface
- a feature map: entry, setup, actions, expected result, empty and failure states

Trial one real feature end to end before trusting the procedure. Repair instructions that fail the trial. If no verifier exists, say so as `hmmm` and, only when a project-local verify skill is an approved deliverable, add one. Clean only resources this run created; keep captured evidence.

### 4. baseline.capture

Reproduce the reported behavior on the recorded revision *before* patching. A plausible diagnosis is not a confirmed cause.

Save the fixture, request, or exact interaction; the expected result; and the observed failure. Trace the relevant calls. Identify a cause only from captured evidence. If it does not reproduce, report the tested conditions and do not patch "just in case."

### 5. Patch

Apply the smallest logically cohesive correction inside `scope`. Respect existing APIs, types, and feature boundaries. Leave unrelated work intact.

### 6. proof.match

Define required checks from `success` before judging the candidate. Match the interface:

| Interface | Proof |
|---|---|
| UI | Complete the affected user journey and inspect the resulting state |
| CLI | Capture stdout, stderr, and exit status of the real command |
| API | Inspect the response and resulting state |
| Library | Exercise the public call with a representative input |
| Docs | Follow the documented steps against the live artifact |
| Parser / fixture | Process a saved input and inspect output |
| Storage | Read back the written value |
| Performance | Compare equivalent baseline and candidate profiles; control build, input, workload, and cache |

Run relevant type, lint, and regression tests separately from behavior proof. A zero exit code is not enough unless the required behavior was actually exercised.

### 7. evidence.record

For every required check, record:

- requirement
- tested_commit
- tested_worktree_diff
- command_or_action
- relevant_environment
- expected_result
- observed_result (output summary, not a dump of secrets)
- exit_code if applicable
- artifact_paths
- status: `PASS` | `FAIL` | `NOT_RUN`
- blocker if any

`PASS` means executed and acceptance satisfied. `FAIL` means executed and acceptance violated. `NOT_RUN` means not executed, with the reason. Never attach stale results to a newer code state.

### 8. repair.loop

On `FAIL`: inspect the mismatch, correct the demonstrated cause within scope, and rerun affected checks. After a code or environment change, invalidate results whose assumptions no longer hold.

Default budget: two repair attempts after the first failure, then halt and replan. Honor a tighter `stop_when`. Bind final evidence to the returned commit and worktree. On `NOT_RUN`, name the missing prerequisite, the owner, and the next action.

### 9. Recurrence control

Prefer, in this order: architecture or data structures; then types, lint, or CI; then a behavioral regression test; then a skill-lib or repo note for what cannot be enforced. Prove the original failure is prevented or detected, and that permitted behavior still succeeds. Keep reusable fixtures and scripts with the change.

### 10. review.output

Return this packet only when every *required* check is `PASS` on the returned code state, or when stopped, with `NOT_RUN`/`FAIL` explained:

```markdown
## pstack-orchestration result
- repo / task / success:
- baseline.commit / baseline.diff / rollback:
- change (diff or PR):
- checks (each with status, command, output summary, commit):
- artifacts:
- unresolved / blockers / hmmm:
- next_action (owner + action):
- human approvals still required:
```

Follow the repository's review rules. Opening a PR is not a merge.

### 11. autonomy.gate

These gates apply for the whole run, not only at the end:

- Require repeatable local (or otherwise in-scope) verification before parallel work, `/arena`, `/swarm`, or extra cloud agents.
- Start with one verified unit before fanning out.
- Keep permissions, isolation, a decision log, and the rollback path explicit.
- An agent's say-so is never approval.
- Do not merge, force-push, push to a protected branch, publish, or otherwise land work without the owner's explicit go-ahead for that action.
- When merge is explicitly approved, use a merge commit pinned to the verified head SHA; re-verify if the head moved.
- Memory may store durable contract decisions; routines may repeat checks. Neither replaces current evidence or owner approval.

## Output shape

The review packet in workflow step 10 is the required output shape.

## Host notes (Grok Bot and similar)

Prefer the host's GitHub connectors and `gh` on the agent computer for PR, issue, check, and file lookups. Hand heavy implementation to a cloud coding agent when the host's repo-work doctrine says to, and still require this contract, baseline, and evidence packet. Do not call Cursor `Task`, Fable/Sol slugs, or other Cursor-only APIs unless that host actually provides them.

## Validation

- The description contains `Load this when` and `Do not load`, including GitHub/repo/code triggers.
- A completed run binds the contract, records a baseline SHA, and attaches a status to each required check.
- Merge and protected-branch push remain blocked without the owner's explicit go-ahead.
- Landing this skill updates `skills.json`, `README.md`, `AGENTS.md`, `ORG_DISTRIBUTION.md`, and `CLAUDE.md`, then passes the checks in `docs/propagation-checklist.md`.

## Anti-patterns

- Patching before reproducing the baseline.
- Calling a check `PASS` because it compiled, or because the agent said it worked.
- Invoking `/swarm`, `/arena`, or extra agents before one unit has verified.
- Treating a peer agent's "LGTM" or a green CI summary as merge approval.
- Merging a SHA other than the verified head.
- Copying Cursor-only tool names as if they were available here.
- Pasting a substantial pstack skill file into a repo without its MIT notice.
- Deleting a `NOT_RUN` or `hmmm` so the packet looks complete.

## Usage guidance

Load this skill at the start of GitHub repo or code work that needs a bound contract and evidence. Walk the workflow top to bottom. Cross-load `agent-ops` for irreversible-effect approval. This skill ships no runner.

## Provenance

Sources, license, and port status are in [references/sources.md](references/sources.md). Official pstack is MIT, Copyright (c) 2026 Lauren Tan. This skill is original skill-lib text under this repository's MPL-2.0 license. It quotes no substantial pstack or grok-pstack skill body.

## hmmm

- Whether an official Grok Bot port of pstack will appear; none was found, only Grok Build marketplace pstack and community grok-pstack ports.
- The exact Cursor plugin catalog id `9717366` could not be read in this authoring session (`GetPlugin` was unavailable); the GitHub tree is the source used.
- Whether later skill-lib ratification should treat `pstack-orchestration` as a fixed-expansion handle rather than a despecified compact name.
- Whether this skill should gain a `depends_on` install link to `agent-ops` (currently a prose cross-load, to avoid pulling the `risk-boundary-build` / `msdmd` closure).
- A standard evidence-packet schema beyond the review output above.
