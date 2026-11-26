---
name: skill-build
description: Skill authoring and skill compliance workflow for The Interdependency skill-lib. Load this when creating a new SKILL.md, revising an existing skill, bringing repo skills into a shared compliance shape, designing a skill-specific test suite, deciding whether a skill is metadata-block or procedural, or asking the question set required before a skill can be accepted.
---

# skill-build — build skills that can build better skills

Apply this contract to canonical skills and repo-local `.agents/skills/` copies.

## Core contract

- Start from existing examples in this repo before inventing a new shape.
- Keep `SKILL.md` lean: put only activation rules, doctrine, workflow, output shape, validation, and essential examples in the main file. Apply the narrative compression invariant below.
- Prefer references, examples, templates, or scripts only when they reduce repeated context or make validation more reliable.
- Make the description load-bearing: say exactly when to load the skill.
- Every skill must answer: **what task triggers it, what context it needs, what it changes, what it refuses to guess, how output should look, and how success is tested**.
- Unknown or unresolved fields become `hmmm`, not silence and not invention.

## Existing examples to inspect first

Choose the closest existing sibling before writing:

- **Foundation / parser convention**: `msdmd/SKILL.md`.
- **Metadata-block skill with runner contract**: `test-build/SKILL.md`, then `doc-build/SKILL.md`, `cap-build/SKILL.md`, `deps-build/SKILL.md`, `owner-build/SKILL.md`, `risk-boundary-build/SKILL.md`, `llms-build/SKILL.md`, or `typed-meta-frontend/SKILL.md`.
- **Metadata-first module planning**: `meta-module-build/SKILL.md`.
- **Procedural doctrine skill**: `canon/SKILL.md`, `visitor-intro/SKILL.md`, `char-compress/SKILL.md`, `plain-lens/SKILL.md`, `loop-eng/SKILL.md`, or `the-interdependency/SKILL.md`.
- **Repo-distribution guidance**: `AGENTS.md`, `README.md`, `skills.json`, `ORG_DISTRIBUTION.md`, and `CLAUDE.md`.

Do not copy a sibling mechanically. Extract its structure, then individualize the questions, tests, and boundaries for the new skill.

## Narrative compression invariant

Skill prose is executable context. Compress by semantic ownership, not by deleting necessary meaning.

- Give each concept one authoritative home in the skill.
- Each clause should do one job: trigger, rule, action, evidence, failure, or boundary.
- Repeat a concept only when the repetition changes execution at that location.
- Prefer decision/action structure over conceptual restatement or persuasive explanation.
- State the operative rule once; use references for rationale, examples, or extended background.
- Remove prose that merely rephrases the previous sentence, heading, or list item.
- Preserve distinctions, exceptions, authority, failure conditions, and `hmmm`; compression must not erase load-bearing semantics.

A skill narrative fails this invariant when the agent must read multiple phrasings of the same concept to discover whether anything changed.

## Required question set

Ask or answer these before writing a new skill or compliance patch:

1. **Trigger** — What exact user requests, repo contexts, file types, or phrases should load this skill?
2. **Non-trigger** — What similar requests should *not* load it?
3. **Kind** — Is this a metadata-block skill, a procedural skill, or a rare helper-only skill? If metadata-block, what block name does it own?
4. **Source of truth** — Which existing file, repo, doctrine, API, schema, or workflow is authoritative?
5. **Inputs** — What files, user facts, environment facts, or external references must the agent inspect before acting?
6. **Workflow** — What ordered steps must the agent follow? Which steps are mandatory versus situational?
7. **Outputs** — What final artifact shape should the agent produce: patch, report, generated file, checklist, command output, handoff, UI, or test result?
8. **Validation** — What tests, checks, drift gates, snapshots, or human-review prompts prove the skill worked?
9. **Failure modes** — What common bad outputs should the skill prevent?
10. **Degree of freedom** — Should the skill give high-level heuristics, a constrained recipe, or deterministic scripts?
11. **Progressive disclosure** — What belongs in `SKILL.md`, and what should move into `references/`, `examples/`, `assets/`, or `scripts/`?
12. **Security / safety / permissions** — Does the skill touch secrets, user data, money, auth, network, deployment, destructive writes, or policy-sensitive claims?
13. **Accessibility / usability** — Does the skill need plain-language output, keyboard/form accessibility, static fallback, examples, or newcomer guidance?
14. **Canon boundary** — Which claims are declared, implemented, inferred, desired, or `hmmm`?
15. **Maintenance** — Which indexes, README tables, generated files, propagation docs, or drift checks must change with the skill?

If an answer is unknown, record `hmmm` and design the skill so the unknown remains visible.

## Individualized test-suite question set

A useful skill has tests shaped to its behavior. Ask these before declaring it done:

1. **Activation test** — Can a test or reviewer verify that the frontmatter description contains concrete load triggers?
2. **Structure test** — Does the skill include the sections needed for its kind: load trigger, workflow, output shape, validation, anti-patterns, and `hmmm`?
3. **Example test** — Is there at least one minimal example, fixture, or sibling citation showing the intended pattern?
4. **Negative test** — Is there a prompt or fixture where the skill should *not* apply, and does the skill state that boundary?
5. **Coverage test** — For metadata-block skills, can a runner report modules/files with missing blocks as visible gaps?
6. **Schema test** — For metadata-block skills, are required and optional fields machine-checkable or at least checklist-checkable?
7. **Round-trip test** — If the skill generates or edits artifacts, can output be regenerated or checked for drift?
8. **Failure-mode test** — Is at least one likely bad output named and blocked by the skill?
9. **hmmm test** — Are unresolved constraints preserved in a visible `hmmm` section rather than erased?
10. **Repo-index test** — Does adding the skill keep `skills.json`, `README.md`, `ORG_DISTRIBUTION.md`, `AGENTS.md`, and `CLAUDE.md` in sync?
11. **Command test** — What exact local command should pass after the change? Prefer existing stdlib checks before adding dependencies.
12. **Human approval test** — What decision remains for the human, and how is that decision isolated from already-delivered work?

## Compliance workflow for existing skills

1. Inventory every skill from `skills.json` and every root directory containing `SKILL.md`.
2. Classify each skill as metadata-block or procedural.
3. Compare each skill against the required question set and its individualized test-suite questions.
4. Patch only one family at a time unless the user approves a broader normalization:
   - metadata-block skills;
   - procedural workflow skills;
   - canon/theory-heavy procedural skills;
   - repo index and propagation docs.
5. Keep semantic doctrine stable unless the user explicitly approves doctrinal changes.
6. Run repo drift and unit checks after every patch family.
7. Report remaining `hmmm` as living continuation work, not as failure.

## Output shape when this skill is active

For a proposed skill or compliance patch, answer in this shape:

```markdown
## Fit check
- Correct / correction: ...
- Skill kind: metadata-block | procedural | hmmm

## Questions answered
- Trigger: ...
- Source of truth: ...
- Validation: ...
- hmmm: ...

## Proposed patch
- Files to create/update: ...
- Tests to run: ...

## Approval needed
- ...
```

When editing, replace the proposal with a concise summary, tests, commit hash, and PR note.

## Anti-patterns

- Writing a skill that says what the topic is but not when to load or how to act.
- Copying another skill's tests without asking what success means for this skill.
- Putting long doctrine in `SKILL.md` when a reference file would preserve context better.
- Treating `hmmm` as a TODO list to hide rather than a boundary object to preserve.
- Updating a skill directory without updating the repo index and distribution docs.
- Adding a deterministic runner contract without either shipping a runner or clearly saying it is a consuming-repo contract.

hmmm
- Baseline compliance is now checkable with `python tools/check_skill_compliance.py`; fuller family-by-family normalization still needs human approval before doctrine-shaped edits.
- Whether future compliance should be enforced by a new checker script, by extending existing drift checks, or by human review only.
- The exact minimum section set for every existing historical skill is not yet canon; this skill supplies the question set first, then lets the compliance pass reveal the honest shape.
- A skill that teaches skill-building is a ladder carrying a small pocket ladder; suspicious, but surprisingly useful near roofs.
