---
name: llms-build
description: Native-first LLM instruction publication built on msdmd. Consume source-owned instruction metadata without requiring a second copy; the shipped stdlib runner generates llms.txt from LLMS blocks, while native-reader integration remains a contract. Load this when creating, updating, or maintaining llms.txt for repositories consumed by LLMs or agents.
---

# llms-build — Self-declaring LLM instructions (llms.txt)

## The doctrine

Every repo intended for consumption by LLMs or agents should maintain a single root file named exactly `llms.txt`.

That file locks four things:

- project overview
- key definitions, using a never-infer-or-expand rule
- architecture summary
- usage rules for agents

Read [msdmd](../msdmd/SKILL.md) first. Publication consumes source-owned
instruction metadata; it does not turn generated text into a second doctrine owner.

## Native-first coverage

Native instruction files, supported frontmatter and other explicit instruction
metadata are eligible owning sources. A native-capable publisher needs tested,
source-preserving mappings, explicit definition authority and visible reader
coverage; missing LLMS blocks do not establish missing instructions.

**Implementation boundary:** the shipped `llms/build.py` is a block-only
publisher. It walks the tree, parses `LLMS` blocks and compares generated output
with committed `llms.txt`. It does not implement native instruction readers.
Its fallback `hmmm` means no usable block input, not proof that no native source
exists. Native integration remains a contract; do not demand a second copy of
native metadata or advertise the existing command as implementing that contract.

Existing LLMS declarations remain supported owning sources. Edit those sources
before regenerating their output. Use supplemental LLMS entries for information
not otherwise owned; do not invent definitions from neighboring prose.

## Block syntax

```markdown
# === LLMS ===
# id: project_overview
#   content: One-sentence tagline plus one or two sentences describing the repo.
#
# id: key_definitions
#   msdmd: exact definition from msdmd/SKILL.md
#   char-compress: exact definition from char-compress/SKILL.md
#   any_other_key: exact one-line canonical text
#
# id: architecture_summary
#   content: Short bullet-point or table version of the core architecture.
#
# id: usage_rules
#   content: Bullet list of rules for LLMs and agents.
# === END LLMS ===
```

Use the language-appropriate comment marker for the file containing the block. Markdown and Python use `#`; TypeScript, JavaScript, Rust, Go, Java, C, C++, Swift, and Kotlin use `//`; SQL, Lua, and Haskell use `--`.

Multiple `LLMS` blocks or multiple `id:` entries are allowed and concatenated. The `content` field supports multi-line markdown when continuation lines remain inside the comment block.

## Required entries

These fields describe the block input for the shipped publisher. A future
native reader retains its source schema rather than manufacturing these entries.

| id | Required fields | Meaning |
|---|---|---|
| `project_overview` | `content` | One-sentence tagline plus one or two sentences describing the repo. |
| `key_definitions` | one field per key term | Canonical definitions. Never infer or expand these. |
| `architecture_summary` | `content` | Short bullet list or table describing the core architecture, skills, pipeline, or module map. |
| `usage_rules` | `content` | Rules for how LLMs and agents should use the repo. |

Unknowns in any section are written as `hmmm`, not guessed.

## The runner protocol

The shipped block-only `llms-build` runner:

1. Uses an equivalent parser preserving the LLMS block contract.
2. Walks the source tree with its documented conventional exclusions.
3. Collects every supported `LLMS` block entry.
4. Ignores fenced code examples in Markdown so examples do not become declarations.
5. Falls back with unresolved `hmmm` when no block input exists; this is not native coverage.
6. Assembles `llms.txt` using the canonical template.
7. Writes or updates `llms.txt` when `--apply` is passed.
8. Reports generated-file drift and exits non-zero for that drift in `--check` mode.

Reference generator in this repo:

```bash
python -m llms.build --root . --out llms.txt
python -m llms.build --root . --out llms.txt --apply
python -m llms.build --root . --out llms.txt --check
```

A future native-capable runner must additionally report unsupported required
sources, conflicts, exclusions and missing information separately; it must not
translate a successful block-only drift check into complete instruction coverage.

## Output template

The shipped block runner produces this shape:

```markdown
# LLM Instructions for <repo-name>

## Project Overview
[content from id: project_overview]

## Key Definitions (never infer or expand these)
- **msdmd** = ...
- **char-compress** = ...
- [any other keys you declared]

## Architecture Summary
[content from id: architecture_summary]

## How to Use This Repo with LLMs / Agents
[content from id: usage_rules]

This file is a generated projection of source LLMS blocks. Owning source declarations remain authoritative. The shipped publisher is block-only; omission here does not establish absence of native information. Unsupported native instruction sources remain hmmm.
```

The footer preserves source authority and discloses the publisher's scope;
regeneration does not establish an exhaustive native-source inventory.

## Editing doctrine

- Edit the owning declaration first. For the shipped command, edit source `LLMS` blocks.
- Run the generator to update `llms.txt`.
- Commit both the source and generated file in the same change.
- Unknowns are `hmmm`, never guessed.
- Definitions in `key_definitions` are canonical source text. Do not infer expansions from acronyms, repo names, or neighboring prose.

## Validation

Run the shipped generator's drift check after source edits. Native-reader
acceptance additionally needs a native-only instruction fixture, explicit
conflict/definition authority and unsupported-source tests; those readers are
not implemented by this skill revision.

## Anti-patterns

- Hand-editing `llms.txt` as independent doctrine instead of changing its owning source and regenerating.
- Letting Markdown examples become declarations.
- Expanding definitions from model memory when the source did not define them.
- Treating missing LLMS blocks as proof of absent instructions or requiring duplicate native content.
- Advertising a block-only drift check as full native instruction coverage.

## Primary source files for this skill

- `llms-build/SKILL.md` — canonical spec for the skill.
- `llms/build.py` — stdlib reference block-only runner.
- `msdmd/SKILL.md` — native-first and supplemental block contracts.
- `msdmd/parsers/universal.py` — shared block parser contract.

See `AGENTS.md` for loading triggers and `skills.json` for registration.

## hmmm

Native instruction readers and a native-capable publication schema remain
implementation work. Existing LLMS sources and the shipped command remain usable
within their explicitly narrower scope.
