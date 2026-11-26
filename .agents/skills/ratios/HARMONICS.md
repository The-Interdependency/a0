# RATIOS harmonic exploration

Status: **experimental, read-only, non-gating**.

`ratios/harmonics.py` explores whether verified msdmd ratio primitives carry repeatable structure when the independent axis is something other than time. It does **not** change the RATIOS seal, promote a spectral peak into canon, or make harmonic structure a compliance requirement.

## Domains

- `import` — graph Fourier analysis on the canonical relative-import stem graph already used to compute fan-in. The analyzer uses the combinatorial graph Laplacian and sums energy across degenerate eigenspaces before significance testing.
- `semantic` — the same graph analysis after projecting `msdmd.collect` declaration edges onto the source files that own both endpoint ids.
- `distance` — least-squares sinusoid fits against shortest-path distance from an explicit source-file anchor, using either the import or semantic graph.
- `source` — least-squares harmonics over line position inside one source file. This mode currently uses the primitive balance underlying `N:M`: code lines are `+1`, comment/docstring lines are `-1`, blanks are `0`.

Filename order, alphabetical path order, commit chronology, and arbitrary module ordinals are intentionally absent. They can produce spectra, but the resulting frequencies describe the sorting convention rather than the software.

## Signals

Repo-level domains expose the six raw canonical primitives first:

```text
code comment consumed declared fan_in fan_out
```

Explicit bounded contrasts are also available:

```text
nm_contrast cd_contrast io_contrast
```

A contrast is `(A-B)/(A+B)`. `0:0` remains undefined rather than being silently converted to zero; affected files are reported as omitted from that contrast signal.

## Significance and numerical boundaries

Every graph or scalar peak can be compared against a deterministic permutation null. The coordinate/domain stays fixed while signal values are shuffled. The default is 199 shuffles with seed `0`; use `--permutations 0` for a quick descriptive scan without an empirical p-value.

The graph eigensolver is pure Python stdlib and cubic in active node count. The default `--max-nodes 128` is a resource guard, not a mathematical limit. Raise it only when the machine running the analysis can finish the eigendecomposition.

Repeated graph eigenvalues are treated as one eigenspace: spectral energy is summed across the whole degenerate space before testing. This avoids reporting a basis-rotation artifact as a harmonic peak.

## Usage

From a repo containing the `ratios` and `msdmd` skill helpers:

```bash
python ratios/harmonics.py --root . --domain import --signal code
python ratios/harmonics.py --root . --domain semantic --signal fan_in
python ratios/harmonics.py --root . --domain distance --distance-graph import --anchor pkg/api.py --signal comment
python ratios/harmonics.py --root . --domain source --file pkg/api.py
python ratios/harmonics.py --root . --domain import --signal nm_contrast --json
```

For vendored skill-lib installs, call the same script at its installed path and point `--root` at the consuming repository.

Interpret a small permutation p-value only as evidence that the observed signal concentrates unusually strongly in that mode **for that chosen domain and null model**. Stronger evidence comes from a mode or structural scale that survives a change of domain, for example import topology → semantic topology → architectural distance.

## Nonclaims

A spectral peak does not establish causation, architectural quality, UCNS structure, physical resonance, or a preferred refactor. It is an exploratory statistic over measured software structure. Any promotion beyond that requires an independently stated hypothesis and falsifier.

## hmmm

- `source` currently analyzes only the `N:M` primitive balance. Windowed source-local analogues of `C:D` and `I:O` need semantics that do not counterfeit their repo-wide meanings.
- Relative-import stem collisions are preserved and reported because the canonical fan-in computer itself uses stem matching. A later path-resolved graph may be useful, but it would be a new domain rather than a silent correction of the canonical one.
- The existing `ratios` skill trigger text does not yet advertise harmonic exploration explicitly; this file and the CLI are the current discoverability surface.
