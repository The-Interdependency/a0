# skill-build authoring record — agent-ops

Recorded for skill-lib intake. Doctrine pin: `The-Interdependency/skill-lib` `main` @ `6a16302f0b7ad6e2ed5331ee1423fcc0939e1d57`. Kind: procedural. Slug: `agent-ops`.

## Domain claim

- Surface form: agent-ops
- Term id: skill-lib.procedural.agent-ops
- Claiming domain: skill-lib procedural practice for tool-using agents
- Claimed sense: the checklist for permissions, approvals, untrusted content, lifecycle and idempotency, evals, memory partitions, redacted logs, tool allowlists, and preflight
- Scope: load and execution of this skill
- Claim type: provisional specialized procedure; security wording is borrowed from the external sources in `sources.md`
- Status: proposed until maintainers merge this branch
- Handle identity: despecified. "Agent operations" is an instance expansion for this file, not a ratified fixed expansion
- Included: design, review, hardening, and implementation of tool-using agent controls
- Excluded: ordinary single-shot answers; a0 and a0p instance surgery; CI gate audits owned by `github-tests`; website journal entries; loop-stage doctrine owned by `loop-eng`; module `BOUNDARIES` syntax owned by `risk-boundary-build`
- Neighboring terms: `loop-eng` (cycle), `agent-instantiation` (a0 lifecycle), `a0p-instancing` (a0p lifecycle), `risk-boundary-build` (declarations)
- Collision check: clear. The surface word "agent" overlaps those skills, and the descriptions disambiguate the scopes
- Downstream authorization: provisional for this skill text only. No ontology, schema, or METAPAT encoding is authorized

## Questions

1. **Trigger.** Designing, reviewing, hardening, or implementing permissions, approvals, untrusted tool or retrieval content, run lifecycle and idempotency, capability and abuse evals, memory write rules, redacted logging, tool allowlists, or budget and routine preflight.
2. **Non-trigger.** An ordinary single-shot answer with no tools or durable state. a0 or a0p spawn, fork, or merge (`agent-instantiation`, `a0p-instancing`). A CI test-gate audit (`github-tests`). interdependentway.org file edits (`website-builder-journal`). Deciding canon (`canon`).
3. **Kind.** Procedural. No new metadata block in this version.
4. **Source of truth.** Skill-lib siblings cited in `SKILL.md` for organization mechanics. External security and reliability documents in `references/sources.md` for recommended controls. Those documents stay external.
5. **Inputs.** Tool inventory, permission map, approval rule, memory stores, log sinks, budget and quota limits, threat notes, and exact repo commits when the work is org-specific.
6. **Workflow.** The twelve steps in `SKILL.md`. Steps 1–10 are mandatory for a control-plane review. Step 11 applies when the work is iterative. Step 12 always records residuals.
7. **Outputs.** The Agent-ops review shape: blast-radius table, approval map, fences, lifecycle, eval plan, memory rules, redaction, preflight, cross-loads, `hmmm`, and remaining human approvals.
8. **Validation.** Frontmatter triggers, workflow and output headings, a named failure mode, index sync, and the propagation-checklist commands. `tests/test_agent_ops_skill.py` checks the activation and index contract.
9. **Failure modes.** Treating retrieved content as instructions. Equating `BOUNDARIES` text with enforcement. Generalizing a0 APIs. Embedding a private diary or personal usage record. Logging secrets. Starting a run that cannot finish. Retrying a side effect without an idempotency key.
10. **Degree of freedom.** Constrained checklist. No deterministic runner in this version.
11. **Progressive disclosure.** `SKILL.md` holds activation, controls, workflow, output, validation, anti-patterns, usage guidance, and `hmmm`. Source verification, these answers, and the overlap decision stay in `references/`.
12. **Security / safety / permissions.** Yes. Tools, credentials, approvals, data egress, and injection are in scope. The skill withholds authority to merge, publish, or move money.
13. **Accessibility / usability.** The output shape is a copy-pasteable review. Approval prompts name actor, action, and payload in plain language.
14. **Canon boundary.** Cross-load rules restate declared skill-lib doctrine. The eight controls are proposed procedure inside this skill. External documents are recommendations. Operator-specific budget diaries are out of scope.
15. **Maintenance.** On accept, keep `skills.json`, `README.md`, `AGENTS.md`, `ORG_DISTRIBUTION.md`, `CLAUDE.md`, and the Codex adapter in sync. Regenerate `llms.txt` only when an `LLMS` block changes. Propagation PRs cite the source commit. Record `skill-usage` after material invocations, outside the canonical tree.

## Fit check

- Correct / correction: new procedural skill. A thin extension inside `loop-eng` was rejected in `references/overlap.md`.
- Skill kind: procedural
- Validation: `tests/test_agent_ops_skill.py` plus the repo checks named in `docs/propagation-checklist.md`
- hmmm: see `SKILL.md` and `references/intake.md`
- Approval needed: skill-lib maintainers decide merge. This branch does not merge or open a pull request.

## Individualized checks

- Activation: the description lists load triggers and non-triggers.
- Structure: workflow, output shape, validation, anti-patterns, usage guidance, and `hmmm` are present.
- Example: one `send_email` blast-radius and approval row.
- Negative: a haiku, or a pytest fix for a known failure, does not match the description.
- Failure mode: retry without idempotency, and instructions inside tool results.
- hmmm: enforcement verification, log schema, and any future metadata block stay visible.
- Human approval: irreversible external actions stay gated by a recorded human artifact.
