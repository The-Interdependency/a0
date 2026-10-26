---
name: msdmd
description: Module Self-Declared Metadata in Markdown — the foundational convention where each source module declares its own structured metadata in a fenced comment block. Other skills in this lib (test-build, doc-build, cap-build, etc.) are thin applications on top of this convention. Load this when authoring a new metadata-driven skill, when extending the block schema, or when building a parser/executor for a new application.
---

# msdmd — Module Self-Declared Metadata in Markdown

## The doctrine

Every cross-cutting fact a module owns — its test contracts, its public
documentation, its declared capabilities, its dependency edges, its
owner — should live **in the same file as the code that implements it**,
in a structured comment block. A meta-runner walks the tree, parses
every block, and acts on it.

Modules without the relevant block surface as visible coverage gaps in
the runner output. Coverage is observable, not implicit.

This is the inverse of the conventional "keep your docs/tests/configs in
sync with code" approach, which fails because the contract and the
implementation live in different files. Anyone can delete the code and
forget the doc; the lie persists. msdmd makes the lie structurally
impossible: when you delete the code, you delete the block in the same
diff.

## Block syntax

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

### Universal rules

- **Fence**: `=== <BLOCK_NAME> ===` opens, `=== END <BLOCK_NAME> ===`
  closes. Block name is uppercase snake_case (e.g. `CONTRACTS`, `DOCS`,
  `CAPABILITIES`, `REQUIRES`, `OWNERS`).
- **Comment marker**: whatever is idiomatic for the file's language.
  `#` for Python / Ruby / Elixir / shell. `//` for TS / JS / Rust / Go /
  Java / C / C++ / Swift. `--` for SQL / Lua / Haskell. The marker
  appears at the start of every line inside the block.
- **Entry boundary**: every entry begins with `id:`. The id must be
  unique within its block and stable across refactors (so it can be
  referenced from external tooling).
- **Field lines**: indented one level beneath the id (two spaces of
  visible indent inside the comment). Field names are lowercase
  snake_case followed by `:` and a value.
- **Multiple blocks per file**: a module may declare more than one
  block, of the same or different types. The parser concatenates
  entries.
- **Multiple block types per file**: a module may declare both
  `CONTRACTS` and `DOCS` (and any others). Each is parsed
  independently by its respective application.

### Example (Python)

```python
# === CONTRACTS ===
# id: chat_get_other_owner_404
#   given: GET /api/v1/conversations/{id} with x-user-id != row.user_id
#   then:  404 (existence non-disclosure)
#   class: security
#   call:  tests.contracts.chat.test_get_other_owner_404
# === END CONTRACTS ===
```

### Example (TypeScript)

```typescript
// === CONTRACTS ===
// id: chat_input_send_disabled_while_pending
//   given: a message is in flight
//   then:  send button is disabled and shows pending state
//   class: ux_correctness
//   call:  src/__contracts__/chat_input.ts#test_send_disabled_while_pending
// === END CONTRACTS ===
```

### Example (Elixir)

```elixir
# === CAPABILITIES ===
# id: agent_supervisor_dynamic_spawn
#   summary: spawns child agents under a DynamicSupervisor with max_children=cap
#   exposes: AgentSupervisor.start_child/1
# === END CAPABILITIES ===
```

The block content is identical across languages — only the comment
marker changes.

## The parser contract

A msdmd parser is a pure function over file text:

```
parse(file_text: str, block_name: str) -> list[Entry]
```

where `Entry` is a flat `dict[str, str]` containing at minimum the
`id` field plus whatever fields the entry declared. The parser:

- Returns all entries from all matching blocks (using
  `re.finditer`-style iteration, not just the first block).
- Does not interpret or validate field semantics — that's the
  application's job. An entry missing a required field surfaces as an
  error in the executor, not in the parser.
- Does not fail on missing block type — returns empty list if no block
  of that name exists.

A reference implementation in pure stdlib Python lives at
`parsers/universal.py`; the TypeScript equivalent at `parsers/universal.ts`.
Both commit to zero non-stdlib dependencies so you can copy them into
any project.

## The runner protocol

A msdmd runner combines a parser and an executor:

```
walk(root: Path, block_name: str) -> Iterator[(file: Path, entries: list[Entry])]
```

Implementation rules every runner MUST follow:

1. **Walk the source tree** under a configurable root, skipping
   conventional non-source paths (`__pycache__`, `node_modules`,
   `.git`, build outputs, the runner's own test directory).
2. **Detect comment marker by extension**, not by content sniffing.
   `.py / .rb / .ex / .sh → #`. `.ts / .js / .tsx / .jsx / .rs / .go /
   .java / .c / .cpp / .swift → //`. `.sql / .lua / .hs → --`.
3. **Parse all matching blocks** in each file. Multiple blocks of the
   same type concatenate; entries from different blocks are
   distinguishable only by id, not by source block.
4. **Visit modules without any block of the requested type** and emit
   them as a separate "untested" / "undocumented" / "uncapable" gap
   list. Truncate noise (e.g. show first 20, count the rest), but
   never silently drop. Visibility is the whole point.
5. **Exit non-zero** when any entry fails the executor's check. The
   gap list itself is informational unless the application opts in to
   strict mode (in which case missing blocks are also a fail).

## Field naming conventions

Reserved field names and their canonical meanings (for cross-skill
consistency):

| Field | Meaning |
|---|---|
| `id` | Unique stable identifier within the block. Required on every entry. |
| `class` | Free-text tag for grouping (`security`, `correctness`, `idempotency`, etc.). The runner counts entries per class in summaries. |
| `call` | Fully-qualified path to an executable target (Python module path, JS module + export, etc.) the executor will invoke. |
| `summary` | One-sentence human description. |
| `requires` | Comma-separated list of other entry ids this one depends on. |
| `owner` | Who is responsible (person, agent role, team). |
| `since` | Version or date this declaration was added. |
| `deprecated` | If present, marks the entry as scheduled for removal. |

Application-specific fields (`given`, `then`, `expects`, `inputs`,
`outputs`, etc.) are introduced by individual SKILLs and documented in
their own SKILL.md.

## Authoring a new msdmd application

1. **Pick a block name** that doesn't collide with an existing
   application. Search the lib README for current names.
2. **Define the field schema** — which fields are required, which
   optional, what types they carry. Document in your SKILL.md.
3. **Write the executor** — the function that takes parsed entries
   and acts on them. Use the universal parser; do not write a new
   one unless your block needs syntax the universal parser can't
   express.
4. **Implement the visibility report** — your runner must list
   modules without your block type as gaps, and the gap list must
   be visible in normal output (not buried behind a flag).
5. **Author a SKILL.md** in this lib with the convention spec, the
   executor's behavior, and at least one worked example.

`test-build/` is the canonical reference application. Read its
SKILL.md alongside this one to see the pattern fully realized.

## Anti-patterns

- **Don't define the contract in a separate file.** The whole point is
  that the declaration lives next to the implementation. If you find
  yourself writing `tests.yaml` or `docs.json`, you're outside the
  doctrine.
- **Don't make ids reflect implementation details.** `chat_returns_200`
  tells future-you nothing; `chat_get_other_owner_404` tells you what's
  protected. Ids are part of the documentation.
- **Don't silently drop modules without blocks.** Coverage gaps must be
  visible. If your runner doesn't emit the gap list, it's not a msdmd
  runner; it's a test discovery tool with extra steps.
- **Don't introduce parser dialects.** If you need richer syntax than
  the universal parser handles, propose an extension to msdmd, not a
  fork. The portability of the convention depends on the parser
  contract being one thing.

## Versioning

- **Block syntax is stable.** Breaking changes (renaming the fence,
  changing field-line indentation rules, etc.) go through a major
  version bump and a migration note in the lib README.
- **Reserved field names** above are stable. New reserved names are
  additive only.
- **Application SKILLs** version independently in their own SKILL.md
  files.
