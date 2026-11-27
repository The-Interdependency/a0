---
name: owner-build
description: Native-first module stewardship built on msdmd. Consume provider-specific CODEOWNERS, OWNERS and other authoritative responsibility declarations; supplemental OWNERS blocks express missing stewardship or escalation information. Keep review assignment, operational ownership and permissions distinct. Load this when assigning module ownership, routing reviews, auditing unowned code, or wiring stewardship coverage into CI.
---

# owner-build — Module stewardship on msdmd

Implementation status: this skill defines the `OWNERS` block and runner
contract. The MSDMD schema-2 collector ships ordered GitHub CODEOWNERS rule
extraction as review assignment only, but no path-applicability or operational-
ownership policy runner. Consuming repos implement and test those mappings.

Read `msdmd/SKILL.md` first. Its provenance, information-coverage, parser and
explicit reader-support contracts apply.

## Native-first coverage

Consume provider-specific CODEOWNERS rules, native OWNERS files and other
explicit responsibility declarations before requesting supplemental blocks.
Preserve path matching, precedence, authority, source locations and scope.
CODEOWNERS review assignment does not automatically establish authorship,
operational ownership, escalation responsibility or effective permissions.
Whether a declared review team also satisfies an operational-owner obligation
must be explicit in the consuming policy, not guessed by the reader.

A native declaration needs no duplicate OWNERS block. Unsupported matching,
unresolved teams and conflicting assignments remain `PENDING` / `hmmm`, not
proof that a module is unowned. Missing-information findings require completed
eligible-source inspection with capable readers.

## The block

Use this supplemental form for information not adequately expressed by the
owning native source:

```python
# === OWNERS ===
# id: chat_route_owner
#   owner: platform-runtime
#   steward: erin
#   review_required_for: auth, storage, user_data
#   escalation: platform-runtime
#   since: 2026-06-04
# === END OWNERS ===
```

## Field schema

These fields govern supplemental OWNERS entries, not the syntax of native
ownership sources. Required:

| Field | Meaning |
|---|---|
| `id` | Stable ownership declaration id. |
| `owner` | Person, role, team, or `hmmm` if unresolved. |

Optional:

| Field | Meaning |
|---|---|
| `steward` | Person or role currently tending the module; use `hmmm` if unresolved. |
| `review_required_for` | Comma-separated change classes requiring review (`auth`, `storage`, `network`, `user_data`, `admin`, `public_api`, `docs`, etc.). |
| `escalation` | Person, role, team, channel, or `hmmm` for unresolved escalation. |
| `backup_owner` | Secondary owner or team. |
| `requires` | Comma-separated ids whose ownership affects this module. |
| `since` | Version or date the owner declaration was added. |
| `deprecated` | If present, marks ownership as scheduled for replacement. |

## Runner contract

An OWNERS runner MUST:

1. Extract supported native responsibility declarations and parse supplemental
   `OWNERS` blocks with the universal msdmd parser. Report reader coverage.
2. Report `owner: hmmm`, `steward: hmmm`, or `escalation: hmmm` as pending.
3. Evaluate each applicable responsibility obligation across eligible sources;
   report a stewardship gap only when required information is genuinely absent.
   Record block adoption separately; block absence alone is not a GAP.
4. Cross-check sensitive modules against declared review requirements when
   BOUNDARIES or equivalent native effect metadata is available.
5. Exit non-zero for malformed required fields, missing required owners,
   unresolved required-source coverage or conflicting required assignments in
   strict mode. Keep optional unknowns visible without blocking unrelated work.

## Agent behavior

When this skill is loaded before edits:

- Read the applicable native responsibility rules and supplemental OWNERS.
- If the edit touches a class named in `review_required_for` or an equivalent
  native rule, call out the review requirement in the handoff or PR summary.
- Do not replace `hmmm` with a guessed person, role, or team.
- Preserve absent or unresolved responsibility in output rather than pretending
  the committer or agent owns the file.

## Reporting shape

- `OWNED`: the applicable ownership obligation has a source-backed declaration.
- `PENDING`: responsibility, reader coverage or authority is unresolved.
- `REVIEW_REQUIRED`: edit class requires explicit review.
- `GAP`: required responsibility information is absent after capable inspection.

## Validation

A CODEOWNERS-only fixture must satisfy its supported review-assignment
obligation without adding OWNERS blocks. It must not satisfy a distinct
operational-owner obligation without an explicit mapping. Pair it with genuine
missing-owner, unsupported-rule, conflict and strict-mode fixtures.

## Anti-patterns

- Treating Git author, last committer, or PR opener as owner.
- Requiring a module-local duplicate of a valid native responsibility source.
- Using ownership metadata to bypass review; it routes review, not permission.
- Guessing a team from a filename. Unknown is `hmmm`.

hmmm
- non-GitHub provider ownership readers remain consuming-repo work
- whether strict policy requires operational owners for all modules or only public/sensitive ones
- how to represent temporary stewardship during incidents
