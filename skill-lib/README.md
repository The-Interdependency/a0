# skill-lib

A portable library of agent skills built on **msdmd** — Module Self-
Declared Metadata Markdown — a language-agnostic convention where each
module declares its own structured metadata in a fenced comment block.

Licensed under Apache 2.0. Drop the directory into any repo's `.skills/`,
`.local/skills/`, or wherever your agent looks for skills, and the
contents work as-is.

## What's inside

| Skill | Purpose |
|---|---|
| [`msdmd/`](msdmd/SKILL.md) | The foundational convention. Defines the block syntax, parser contract, and visibility (gap-reporting) requirement. Every other skill in this lib depends on it. |
| [`test-build/`](test-build/SKILL.md) | Applies msdmd → contract test runner. Each module declares its test contracts in a `# === CONTRACTS ===` block; the runner walks the tree, parses, runs them, and reports per-contract status plus visible coverage gaps. |

## The core idea

Most "keep docs/tests/configs in sync with code" attempts rot because the
contract lives in a separate file from the code it describes. Anyone can
delete the code and forget the doc; the lie persists.

msdmd inverts this: the contract lives **in the same file as the code that
implements it**, in a structured comment block. A meta-runner walks the
tree, parses every block, and acts on it. Modules without the relevant
block surface as visible coverage gaps in the runner output. Coverage is
observable, not implicit.

The same convention covers tests, docs, capability registries, dependency
topologies, ownership manifests — anywhere a module needs to declare
something structured about itself for an external tool to read.

## Block syntax (universal)

```python
# === <BLOCK_NAME> ===
# id: <unique_snake_case_id>
#   <field>: <value>
#   <field>: <value>
#
# id: <next_entry_id>
#   <field>: <value>
# === END <BLOCK_NAME> ===
```

The comment marker (`#`, `//`, `--`, etc.) is whatever's idiomatic for
the file's language. The fence text and field structure are identical
across languages. See [`msdmd/SKILL.md`](msdmd/SKILL.md) for the
authoritative spec.

## Extending the lib

Adding a new application of msdmd is a small skill on top of the
foundation:

1. Pick a `<BLOCK_NAME>` (e.g. `DOCS`, `CAPABILITIES`, `OWNERS`).
2. Decide the field schema (which fields are required, which optional).
3. Write a thin executor that takes parsed entries from
   `msdmd/parsers/universal.py` and does something with them.
4. Author a `SKILL.md` that documents the convention and the executor.

`test-build/` is the canonical worked example.

## Versioning and stability

- The msdmd block syntax is treated as a stable contract — breaking
  changes will go through a major version bump.
- Skill executors and field schemas live in their own SKILL.md files and
  may evolve independently.
- The universal parsers (`msdmd/parsers/universal.{py,ts}`) commit to
  pure-stdlib dependencies; you can copy them anywhere.
