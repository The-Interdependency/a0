---
name: manifest
description: >-
  Living-spec generator. Derives the mechanical, observable facts of a repo
  (package name, version, description, license, authors, repository, build
  backend, development status, supported Python versions, keywords, runtime
  dependencies, optional extras, top-level layout, CI workflows) from
  pyproject.toml + the file tree and splices them into a machine-owned, marked
  block inside CLAUDE.md — keeping the doc from silently drifting from the code.
  Ships a stdlib-only generator with --write (refresh), --check (CI drift gate),
  and --print modes. Load this when: setting up or maintaining a CLAUDE.md /
  AGENTS.md so its factual half is generated rather than hand-typed; wiring a CI
  check that fails when docs drift from pyproject/version/deps/layout; deciding
  which parts of a doc to generate vs. hand-author; or onboarding a new org repo
  to the living-spec convention.
---



## The line it draws

- **Generate** what is *observable*: package name, version, description,
  license, authors, repository URL, build backend, development status,
  supported Python versions, keywords, runtime dependencies, optional extras,
  top-level layout, and CI workflow filenames. These are the fields that repeat
  across repos and rot silently — the "myriad variables" nobody should type
  twice. (Fuzzy facts that can't be read with confidence — e.g. the exact test
  command — are deliberately left to hand-authored prose rather than risk
  emitting a wrong "fact".)
- **Author** what is *judgement*: why a boundary exists, scope, claim status
  (`DEFENDED`/`FRONTIER`), gotchas. The generator never touches these.
- **`hmmm`** is the seam: an unknown fact renders as `hmmm`, a visible gap, not
  a guess (per the `msdmd` doctrine this skill is built on).

Everything generated lives between two markers; everything else in the file is
yours:

```
<!-- BEGIN GENERATED:manifest -->
...derived facts...
<!-- END GENERATED:manifest -->
```

## Usage

```bash
# Print the block (no writes) — see what would be generated
python .agents/skills/manifest/generate.py --root . --print

# Insert or refresh the block in CLAUDE.md
python .agents/skills/manifest/generate.py --root . --write

# CI drift gate: exit 1 if CLAUDE.md's block is stale or missing
python .agents/skills/manifest/generate.py --root . --check

# src-layout / non-root pyproject (e.g. edcmbone):
python .agents/skills/manifest/generate.py --pyproject backend/pyproject.toml --write
```

Flags: `--root <dir>` (default `.`), `--file <doc>` (default `CLAUDE.md`),
`--pyproject <path>` (default `pyproject.toml`), and exactly one of
`--write` / `--check` / `--print`.

## Field requirements

The required generated fields are the observable repo facts the runner can
derive: package metadata, runtime dependencies, optional extras, top-level
layout, and CI workflow names. Judgement, rationale, test-command guesses, and
doctrine stay hand-authored outside the generated block. Unknown observable
facts render as `hmmm`.

## Runner contract

A compliant manifest runner is stdlib-only, deterministic, idempotent, and
non-destructive. It reads `pyproject.toml` plus the file tree, rewrites only the
bytes between the manifest markers, supports `--write`, `--check`, and
`--print`, and exits non-zero when `--check` detects drift.

## Wiring a repo (the propagation recipe)

1. Vendor `generate.py` to `.agents/skills/manifest/generate.py` (verbatim copy
   from this canonical source). Record the source commit SHA in the local
   `.agents/skills/README.md` note, and cite this repo + SHA in the propagation
   PR (the PR-citation requirement is in `ORG_DISTRIBUTION.md`).
2. Run `--write` once to insert the block near the top of `CLAUDE.md`. Leave the
   markers in place; never hand-edit between them.
3. Add a CI step that runs `--check` (a tiny `manifest-check.yml` workflow, or a
   step in the existing one) so a stale block fails the build.
4. **Pin the vendored copy (drift gate).** Vendoring duplicates this file, so
   guard the duplication: record its checksum and verify it in CI, so a repo's
   copy can never be silently forked.

   ```bash
   # at vendor time, from the repo root:
   ( cd .agents/skills/manifest && sha256sum generate.py > generate.py.sha256 )
   ```
   ```yaml
   # in the CI job, before the --check step:
   - name: Vendored generate.py matches skill-lib (no local fork)
     run: cd .agents/skills/manifest && sha256sum -c generate.py.sha256
   ```

   The checksum is the same one `skill-lib@<recorded-sha>/manifest/generate.py`
   produces, so a reviewer can verify the copy is a pristine artifact of that
   commit. The only legal way to change a repo's generator is to change it here
   and re-vendor (which updates the SHA + checksum together). Catching the *other*
   direction — copies falling behind a newer skill-lib — is a skill-lib-side push
   concern (mirror/propagation), not the consumer gate.
5. After any change to `pyproject.toml` / version / deps / layout, run `--write`
   and commit the refreshed block — the same discipline as a lockfile.

## Contract & boundaries

- **Stdlib only.** Uses `tomllib`, so it needs Python 3.11+ to *run*; it is a
  dev/CI tool and is never shipped inside a package.
- **Deterministic & idempotent.** `--write` twice is a no-op; that is what makes
  `--check` a stable gate.
- **Non-destructive.** It only ever rewrites the bytes between the two markers
  (or appends the block once if absent). Hand-authored prose is untouched.
- **Additive scope.** Start with the high-signal/low-noise fields above. New
  derived fields are an extension here (bump the block, keep markers stable), not
  a per-repo fork — portability depends on one generator.

## Anti-patterns

- Hand-editing bytes inside the generated manifest markers.
- Emitting fuzzy or judgement-shaped facts as if they were mechanically derived.
- Forking the vendored generator in a consuming repo instead of changing this
  canonical source and re-vendoring.
- Running `--write` in CI when the intended gate is `--check`.
