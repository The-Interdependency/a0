---
name: ratios
description: Self-declaring module composition ratios on msdmd — one comment line at a file's opening and closing source boundaries (never a fenced block), with a valid interpreter shebang allowed before the opening seal. The canonical seal is `The-Interdependency/a0`'s compact positional `N:M C:D I:O` annotation (code:comment · consumed:declared · fan-in:fan-out), computed by a0's `scripts/annotate.py`; the named `loc_comments=… imports_exports=… calls_definitions=…` line is a portable, per-file adaptation for standalone libraries, verified by the stdlib `ratios_check.py` (drift/misplacement failures, visible gaps). JSON/Markdown are out of scope. Load this when recording a module's composition ratios, when authoring or extending the ratio registry, or when wiring ratio verification into CI.
---

# ratios — Module composition ratios on msdmd

Read `msdmd/SKILL.md` first if you haven't — the parser contract and the
visibility rules below are inherited from there and not redefined.

A ratio is a fact an executable/source module owns about its own shape. Like a contract, it
belongs in the file it describes, not in a side report that can drift out
of sync. Unlike a contract, it is not asserted by a human — it is
*recomputed from the source*, so a recorded ratio that no longer matches
the file is a build failure, not a stale comment nobody noticed.

## The canonical seal: a0's `N:M C:D I:O`

`The-Interdependency/a0` is the **canonical origin** of the ratios seal — the
convention every other form adapts, not the other way round. a0 stamps three
composition metrics at the opening and closing source boundaries of every
Python / TypeScript file, written and verified by its own `scripts/annotate.py`:

```text
# N:M C:D I:O        (Python)
// N:M C:D I:O       (TypeScript / TSX)
```

Ordinary modules put the opening seal on literal line 1. Directly executable
scripts reserve literal line 1 for a non-empty `#!` interpreter directive and
put the opening seal immediately on literal line 2. The matching closing seal
is the last non-blank line in both cases.

| pair | meaning | how computed |
|---|---|---|
| `N:M` | code lines : comment+docstring lines (internal density; `N` budget ≤ 400) | per-file |
| `C:D` | consumed : declared (surface utility — `D` = declared `# DOC` endpoints / exported symbols; `C` = those actually consumed elsewhere in the repo) | repo-wide index |
| `I:O` | fan-in : fan-out (graph position — `I` = files importing this one; `O` = project-internal modules it imports) | repo-wide index |

`C:D` and `I:O` are **not single-file computable**: they need the inverted
import/usage index built across the whole repo. a0's `scripts/annotate.py` is
the in-repo canonical computer.

### Portable computer: `ratios/annotate_index.py`

A shared, stdlib port of that index ships here as `ratios/annotate_index.py`, so
the canonical seal can be recomputed or stamped in **any** repo, not just a0:

```bash
python ratios/annotate_index.py --root .            # report drift/misplacement
python ratios/annotate_index.py --root . --write    # stamp the N:M C:D I:O seal
python ratios/annotate_index.py --root . --check    # CI gate (non-zero on drift)
```

It reproduces a0's metric definitions exactly (`build_index` → per-file
`{code, comment, consumed, declared, fan_in, fan_out}`; `seal_line` renders the
compact line). The one a0-specific input — the consumer dirs scanned for `C`
(default `client/src`, `server`) — is a `consumer_dirs=` parameter. Honest
caveat carried in the module docstring: `C:D` is route/surface-oriented, so a
pure library with no `# DOC endpoint:` routes and no TS exports reads
`C:D = 0:0` (correct, not a gap), and fan-in/out follow a0's relative-import
stem graph (absolute-only imports are not counted).

## The portable named form (per-file adaptation)

The verbose `loc_comments=… imports_exports=… calls_definitions=…` line below is
a **portable, per-file adaptation** of the canon for standalone libraries that
lack a0's app structure (no `client/src` / `server` to measure "consumed"
against, no meaningful repo-wide fan-in). Its three ids are single-file
computable, so the stdlib `ratios_check.py` verifies them with no repo index.
`loc_comments` is exactly a0's `N:M`; `imports_exports` and `calls_definitions`
are per-file stand-ins for the surface/graph intent of `C:D` and `I:O`. Repos
already stamped in this form (skill-lib, aimmh, edcmbone (archived), pcna, pcta, ptca,
pcea) remain valid and are **not** required to reconvert.

### The single line and shebang-safe boundary rule

RATIOS is the one msdmd declaration that is **not a fenced block**. It applies
to executable/source files with a language comment marker (`#`, `//`, or `--`),
not to JSON, Markdown, or other data/documentation files. In covered source
files it is a single comment line carrying all three ratios, placed at the
opening boundary and repeated on the file's last non-blank line:

```python
# ratios: loc_comments=128:49 imports_exports=4:7 calls_definitions=51:10
"""The module body lives between the two ratio lines."""
...
# ratios: loc_comments=128:49 imports_exports=4:7 calls_definitions=51:10
```

For a directly executable script:

```bash
#!/usr/bin/env bash
# ratios: loc_comments=40:12 imports_exports=0:0 calls_definitions=0:0
...
# ratios: loc_comments=40:12 imports_exports=0:0 calls_definitions=0:0
```

The shebang exception is structural, not a general license for preambles: it
must be non-empty, occupy literal line 1, and be followed immediately by the
opening seal. Blank lines, encoding headers, copyright comments, or other text
before the seal fail placement.

The form is:

```text
<marker> ratios: loc_comments=N:M imports_exports=N:M calls_definitions=N:M
```

- `<marker>` is the language-idiomatic comment marker (`#`, `//`, `--`) for executable/source files only; JSON and Markdown are intentionally not covered by this rule.
- The three ids are fixed: `loc_comments`, `imports_exports`,
  `calls_definitions`. Each carries an `A:B` value, or `hmmm` if the ratio is
  declared-but-not-yet-resolved.
- The same line opens and closes the file. Without a shebang the opening seal
  is literal line 1; with a valid shebang it is literal line 2.

There is no fenced `# === RATIOS === … # === END RATIOS ===` block. An earlier
draft of this skill described one; that was wrong. Tooling reads the single
line from both ends and verifies they agree.

## Field requirements

The required ratio ids are exactly `loc_comments`, `imports_exports`, and
`calls_definitions`. Each covered executable/source file records all three ids
on both boundary lines. Unknown ratio values are written `hmmm`; unknown ratio
ids stay unresolved until a matching computer is defined.

## How it is parsed

The reader lives in the msdmd universal parser as a sanctioned extension, not
a fork (`msdmd/parsers/universal.py`):

```python
from msdmd.parsers.universal import parse_ratios, ratios_placement, RATIO_IDS

parse_ratios(text, marker)      # -> [{"id": "loc_comments", "value": "128:49"}, ...]
ratios_placement(text, marker)  # -> (opening_ok, closing_ok)
```

`parse_ratios` returns one flat `{"id", "value"}` dict per (declaration line ×
ratio token), so the drift gate can verify every occurrence. It interprets no
semantics — that is the runner's job. A file with no `ratios:` line yields `[]`
and surfaces as a coverage gap.

## The registry and the verify contract

A ratio is *verified* when its `id` maps to a computer in the runner's
registry. A computer is a pure function `file_text -> "A:B"`. The runner:

- recomputes the ratio from the source, **excluding every `ratios:` line**
  (and any tolerated legacy fence) so a measuring line never inflates its own
  measurement;
- compares the recomputed value to the recorded value;
- on mismatch, emits a **drift** error and exits non-zero;
- on a declaration that is not on both source boundaries, emits a
  **misplaced** error and exits non-zero;
- on `value: hmmm`, reports a living continuation (pending), never a failure —
  the transition out of `hmmm` is the owner's decision;
- on an id with no registered computer, reports it as recorded-but-
  unverifiable (informational), so unknown ratios stay visible rather than
  silently trusted.

The bundled named-form computers currently implement Python syntax. Python
files without `ratios:` surface as coverage gaps; other parser-supported
languages do not become false gaps merely because msdmd learned their comment
marker. If a non-Python file already carries a named seal, the runner checks
its placement and reports its values as visible-but-unverifiable until a
language-aware computer is registered. JSON, Markdown, and unsupported files
remain out of scope. The Python gap list is informational unless `--strict`.

## The three ratios

### 1. `loc_comments` — lines of code to lines commented

`loc_comments` is `lines_of_code : lines_commented`.

- **N (lines of code)**: physical lines carrying a code token — not blank,
  not a pure comment, not a docstring-only line.
- **M (lines commented)**: strict `#`-comment lines plus docstring lines
  (`"""` / `'''` blocks).
- **self-exclusion**: every `ratios:` line is excluded from both counts.

Diagnostic signal: a ratio that drifts toward very high N:M (many code
lines, few comments) is approaching a code budget with low documentation
coverage. A ratio drifting toward very low N:M may indicate grounding load —
overhead accumulating faster than implementation.

---

### 2. `imports_exports` — import statements to public exports

`imports_exports` is `import_count : export_count`.

- **import_count**: lines whose stripped content matches
  `^(import |from \S+ import)`. Continuation lines of a multi-line import
  are not counted separately — only the opening `import` / `from` line.
- **export_count**: count of top-level `def` and `class` declarations
  whose names carry no leading underscore (public surface), **plus 1** if
  `__all__` appears anywhere in the file.
- **self-exclusion**: `ratios:` lines excluded from both counts.

Diagnostic signal: a high imports:exports ratio (many imports, few public
symbols) suggests the module is a consumer or orchestrator — low surface,
high dependency. A low ratio suggests a leaf module or utility layer.

---

### 3. `calls_definitions` — call sites to definitions

`calls_definitions` is `call_count : definition_count`.

- **definition_count**: top-level `def` and `class` lines plus one level of
  method nesting beneath a class. Closures nested inside another `def` do not
  count.
- **call_count**: non-definition, non-comment, non-blank, non-string lines
  containing at least one call expression matching `\w+\(`. Each physical
  line counts once regardless of how many calls it contains.
- **self-exclusion**: `ratios:` lines excluded from both counts.

Diagnostic signal: a very high calls:definitions ratio suggests a dense
orchestration file — close coupling. A low ratio suggests mostly definitions
with few call sites — a library or schema module.

---

## The runner

The reference runner ships here as `ratios_check.py` (pure stdlib; it reuses
`parse_ratios` from the msdmd universal parser):

```bash
# verify one file's recorded ratios against its source
python ratios_check.py path/to/module.py

# walk a tree, verifying executable/source files and listing source gaps
python ratios_check.py --root .

# strict: files with no ratios: line also fail (CI gate)
python ratios_check.py --root . --strict
```

Exit codes: `0` all recorded ratios match and are correctly placed (gaps
allowed unless `--strict`); `1` a ratio drifted from source, a declaration was
misplaced, or — under `--strict` — a coverage gap.

## a0 is the canon, not a dialect

The compact `N:M C:D I:O` form under **The canonical seal** above is the origin
the named form adapts — not a dialect *of* it. The mapping back to the portable
ids: `N:M` ≡ `loc_comments` (identical); `C:D` (consumed:declared) and `I:O`
(fan-in:fan-out) are the repo-wide surface/graph measures that `imports_exports`
and `calls_definitions` only approximate per-file.

Do **not** teach the canonical `parse_ratios` reader to parse a0's compact line:
a0's `scripts/annotate.py` owns reading and verifying the canonical seal (its
`C:D` / `I:O` need the repo-wide index `parse_ratios` deliberately does not
build). Pointing `ratios_check.py` at a0 and seeing the compact lines reported
as gaps is expected, not a bug.

## Anti-patterns

- Writing RATIOS as a fenced `# === RATIOS === … # === END RATIOS ===` block.
  It is a single `ratios:` line; the block form was a mistake.
- Recording a ratio by hand instead of recomputing it. The point is that the
  file measures itself; a hand-typed value is a contract that drifts.
- Placing anything before opening RATIOS except a valid line-1 shebang, or
  leaving a gap between that shebang and the opening seal. Either breaks the
  source-boundary invariant and fails placement.
- Counting a `ratios:` line in its own ratio. Always self-exclude.
- Inventing ratio ids whose computer does not exist and recording a number
  for them. If there's no computer, the value cannot be verified — record
  `hmmm` until a computer is registered.
- Introducing a parser dialect for ratios. The single-line reader is an msdmd
  extension (`parse_ratios`); if richer syntax is needed, extend msdmd, do
  not fork it.

## Completion criteria

A run is complete when every computer-covered source file carries a correctly
placed opening RATIOS line (literal line 1, or line 2 immediately after a valid
line-1 shebang), an identical closing line on the last non-blank line, the
registry's three computers (`loc_comments`, `imports_exports`,
`calls_definitions`) recompute each recorded value with no drift, and any
unresolved ratio is recorded as `hmmm` rather than guessed.

hmmm
- language-aware named-form computers for TypeScript and other parser-supported
  languages remain an extension point; the runner now exposes them as outside
  computer scope instead of applying Python semantics
- whether ratios verification joins CI beside the other msdmd checks
- calls_definitions: whether lambda assignments count as definitions
- imports_exports: whether re-exported names from `__init__.py` aggregate
  files count once or per-name
