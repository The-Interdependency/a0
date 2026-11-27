---
name: doc-build
description: Native-first documentation coverage built on msdmd. Consume docstrings, documentation comments and source-linked documents; supplemental DOCS blocks express remaining obligations. A consuming runner verifies references and reports missing information separately from unsupported extraction. Load this when adding or auditing module documentation, tying code surfaces to docs, or wiring documentation coverage checks into CI.
---

# doc-build — Documentation contracts on msdmd

Implementation status: this skill defines the `DOCS` block and runner contract.
The MSDMD schema-2 collector ships structured Python docstrings, JSDoc, Rustdoc/Javadoc/Doxygen extraction
and nested Markdown-frontmatter readers, but no complete DOCS obligation/link/anchor runner. Consuming repos add
and test the policies and resolvers their documentation tree requires.

Read `msdmd/SKILL.md` first. Its provenance, information-coverage, parser and
explicit reader-support contracts apply.

## Native-first coverage

Consume supported docstrings, JSDoc/TSDoc or other language documentation
comments, and source-linked documents at their actual symbol/document scopes.
Preserve dialect, attachment, original tags and references. A docstring needs no
duplicate DOCS block; a manifest-owned documentation link belongs to its package.
Block fields such as `audience` and `status` are not invented for native sources.
Policy determines which information each audience/surface actually requires.

Missing descriptions, unresolved readers, broken links and block adoption are
separate findings. Comments alone do not prove every documentation obligation is
met; lack of DOCS syntax does not prove documentation is missing. Reader support
outside the shipped manifest remains implementation work.

## The block

A module may supplement otherwise unexpressed documentation obligations:

```python
# === DOCS ===
# id: chat_api_public_docs
#   summary: public documentation for creating and reading chat conversations
#   audience: developer
#   source: docs/chat.md#conversations
#   covers: create_conversation, get_conversation
#   status: current
# === END DOCS ===
```

## Field schema

These fields govern supplemental DOCS entries, not native documentation syntax.
Required:

| Field | Meaning |
|---|---|
| `id` | Stable documentation contract id. |
| `summary` | One-sentence description of what the docs promise to explain. |
| `audience` | One of `user`, `developer`, `operator`, `agent`, `internal`, or `hmmm`. |
| `source` | Path to the documentation file, optionally with an anchor (`docs/file.md#heading`). Use `hmmm` if the target is not resolved yet. |
| `status` | `current`, `draft`, `deprecated`, or `hmmm`. |

Optional:

| Field | Meaning |
|---|---|
| `covers` | Comma-separated module surfaces, routes, functions, components, or concepts covered by the doc. |
| `examples` | Comma-separated example ids, files, or anchors the doc depends on. |
| `requires` | Comma-separated ids this documentation contract depends on. |
| `owner` | Person, role, or team responsible for doc freshness. |
| `since` | Version or date the contract was added. |

## Runner contract

A DOCS runner MUST:

1. Extract supported native documentation and parse supplemental `DOCS` blocks
   with the universal msdmd parser. Report support per convention and dialect.
2. Verify each non-`hmmm` declared local `source` path exists; retain native
   inline documentation spans instead of fabricating a separate document path.
3. Verify declared anchors when the identified format has a capable resolver.
4. Report `status: draft`, `source: hmmm`, unknown required coverage and
   unsupported required syntax as pending, not passing.
5. Report an information GAP only after capable inspection of eligible sources
   finds required documentation absent. Track missing blocks only as adoption.
6. Exit non-zero for missing declared files/anchors, malformed supplemental
   fields or deprecated docs referenced as current. Strict mode also fails on
   missing information, required-reader gaps and unresolved required conflicts.

## Reporting shape

- `PASS`: the stated documentation obligation and supported references are satisfied.
- `PENDING`: draft, `hmmm`, unsupported extraction or unresolved required information.
- `DRIFT`: a resolvable source path, anchor or covered surface no longer resolves.
- `GAP`: required documentation is genuinely absent after capable inspection.

`PASS` here does not prove the documented behavior is correct.

## Validation

A docstring-only fixture with no DOCS blocks must satisfy an applicable
symbol-description obligation using a tested reader. Pair it with an empty
public symbol, unsupported dialect, broken anchor and native/block conflict.

## Anti-patterns

- Demanding a DOCS copy of documentation already owned by a native source.
- Marking docs `current` when the source is `hmmm`.
- Conflating missing blocks, absent information and unsupported extraction.
- Letting generated docs replace the source-owned declaration.

hmmm
- native documentation readers and audience-specific policies remain consuming-repo work
- whether examples listed in `examples` must execute or only resolve
- how to normalize anchors across Markdown renderers
