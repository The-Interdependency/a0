---
name: epac-selection-display
description: Evidence-bound EPAC target selection and display for WebMCP handoffs and other human-facing surfaces. Load this when choosing an EPAC element, molecule, construction receipt, comparison result, or available visualization to present; when preparing a receipt-backed EPAC display packet; when exposing the EPAC workflow as a selectable WebMCP skill; or when a requested EPAC display would require missing or invented geometry so the request can be refused or downgraded to verified source-backed output. Do not load to select EPAC or a UCNS candidate as canon, or for unrelated WebMCP catalogue changes.
---

# epac-selection-display — choose what to show without promoting what it means

## Core boundary

```text
display selection != canon selection
presented claim <= source receipt and its standing
WebMCP handoff != EPAC execution authority
```

The EPAC handle is despecified here. A source repository may use an expansion in
one provisional research instance, but this skill does not freeze that expansion
as EPAC's canonical identity.

At source state `The-Interdependency/stack@5b24db9a7fe40df4b2791e1137ade5de01c78942`,
`research/epac` is a provisional research scaffold with no independent authoritative
source repository. Treat its code, receipts, standings, nonclaims, and `hmmm` as
scoped research evidence, not organization canon. This identity records the source
observed when this workflow was repaired; resolve the current source again on every
use rather than treating it as a permanent inventory.

## Selection record

Fix the following before constructing or displaying anything:

```text
source_repository:
source_commit_or_snapshot:
source_path:
working_tree_state: clean | dirty-with-digests | hmmm
target_kind: element | molecule | receipt | comparison | population | hmmm
target_id:
occurrence_or_instance:
constructor_or_reader:
display_mode: summary | text | svg | receipt-json | comparison | hmmm
audience:
destination: WebMCP handoff | file | response | other
```

The target kinds and display modes are descriptive, not an evergreen API enum.
Admit only targets and renderers that the selected source identity actually
provides.

## Workflow

### 1. Resolve authority and exact source identity

Inspect the current EPAC-owning or incubating repository, its governing
instructions, status documentation, code, tests, and registries. Record a commit
or immutable snapshot. If uncommitted bytes are explicitly in scope, record the
base commit plus content digests for every consumed dirty file; do not present
those bytes as a commit-pinned public artifact.

When the display crosses from EPAC source to a website or MCP consumer, use
`interdependent-work-graph`. EPAC retains research-artifact authority;
`skill-lib` owns this reusable workflow; the website owns presentation. No
semantic, mathematical, empirical, measurement, proof, or canon status transfers
between them.

### 2. Separate content choice from status choice

Selecting `C`, `H2O`, a receipt, or a comparison for display chooses content. It
does not choose EPAC, its constructor, its geometry, or a UCNS option as canonical.

Preserve the source's `selection_effect`, standing, nonclaims, and unresolved
items. If the request asks which candidate should win or whether evidence permits
promotion, pause display selection and load the applicable option-selection and
domain-authority workflow. A display preference cannot ratify a candidate.

### 3. Discover the live target surface

Read the selected source identity rather than relying on a remembered list. For
the current stack scaffold, relevant surfaces may include:

- declared element records and `construct_element_gonol`;
- declared molecule compositions and `construct_molecule`;
- `PublicGonolReceipt` plus its replay function;
- post-construction comparison records; and
- a text or SVG renderer only when it exists in the selected source identity and
  its tests establish the requested projection.

Do not assume a local, untracked, proposed, or previously observed visualizer is
available in a commit-pinned source. If no verified renderer exists, emit the
receipt-backed summary rather than inventing a visual projection. A request that
would require invented geometry is therefore a load-to-refuse case for this skill,
not a reason to bypass it.

### 4. Admit and construct the exact target

Resolve the user-facing target to one exact registered identifier and occurrence.
Reject ambiguous symbols, formulas, aliases, or instances instead of selecting a
familiar default.

Use the source-owned public constructor or reader. Preserve closed participants,
carried options, declared couplings, charge states, and occurrence identity. For
an existing receipt, independently replay it and require the reconstructed digest
to match before calling the display verified.

For preregistered molecular comparison work, construction remains blind to sealed
known-shape labels. Open comparison-only data after construction and keep
`SURVIVED`, `FALSIFIED`, and `UNRESOLVED` distinct from selection or canon status.

### 5. Choose a representation that does not add claims

Use the smallest representation that meets the human request:

- `summary` — identity, standing, digest, structure summary, nonclaims, and
  `hmmm`;
- `text` — a source-provided textual projection plus the summary;
- `svg` — a source-provided deterministic SVG plus equivalent text and accessible
  title/description;
- `receipt-json` — canonical or source-declared receipt serialization; and
- `comparison` — source readouts and terminal standings, visibly labeled as
  post-construction evidence.

A renderer may project only values already carried by the construction, receipt,
or an explicitly pinned upstream law. It must not infer positions, couplings,
Cartesian coordinates, empirical angles, shape labels, or a missing geometric
operation.

### 6. Emit the evidence packet beside the display

Include every available field that controls interpretation:

```text
source repository + exact identity + path
target kind + exact target id + occurrence
constructor/reader id and version
constructor standing and selection_effect
source_id and receipt digest
pinned carrier or upstream digest
display mode and renderer identity
audience
destination
replay/verification result
structure/readout fields actually projected
nonclaims
hmmm
```

Omit absent fields only by marking them `hmmm` or explaining that the selected
artifact type does not define them. Never fill them from a neighboring checkout
or from general chemistry knowledge.

### 7. Preserve the WebMCP boundary

When this skill is presented by The Interdependency WebMCP surface:

1. expose the exact canonical skill entry to both the human catalogue and the
   read-only registry tools;
2. require repository selection before skill selection;
3. require an explicit Send before publishing the page-session handoff;
4. carry the selected repository head, canonical skill identity and closure, and
   the human's target/display request; and
5. leave all construction, file writes, repository access, and deployment to the
   agent's separately authorized tools.

The remote MCP server remains a read-only registry. Do not import EPAC modules,
open sealed comparison data, render SVG, persist the request, or mutate a
repository inside that server merely because this skill is selectable.

### 8. Validate the completed presentation

A presentation is `READY` only when the source identity and target are exact, the
requested representation exists, receipt replay or the source-declared verifier
passes, and the evidence packet accompanies the display.

Return `BLOCKED` for a missing declared prerequisite, `INVALID` for an ambiguous
or rejected target or digest mismatch, and `hmmm` when authority, source identity,
or representation semantics remain unresolved. These are display-workflow
results, not EPAC research standings.

## Output shape

```markdown
## EPAC selection
- Source identity:
- Target:
- Display mode:
- Audience:
- Destination:
- Display status: READY | BLOCKED | INVALID | hmmm

## Evidence packet
- Constructor / reader:
- Receipt / upstream identities:
- Replay / verification:
- Standing and selection effect:
- Audience:
- Destination:

## Display
- Human-readable result or artifact link:
- Equivalent text / accessibility:

## Boundaries
- Claims carried:
- Nonclaims:
- hmmm:
```

## Usage guidance

On the WebMCP page, choose the repository that contains the intended EPAC source,
then choose **Select and display EPAC**, and send a bounded request such as:

```text
Display the committed EPAC element C as a receipt-backed text summary. Pin the
source commit and path, replay the receipt, show the constructor standing and
selection_effect, and preserve every nonclaim and hmmm. Do not select canon.
```

For a graphical request, make renderer availability conditional:

```text
If the selected commit contains a tested receipt-backed SVG renderer, display H2O
as SVG with equivalent text and the complete evidence packet. Otherwise return a
verified receipt summary and mark SVG display BLOCKED; do not invent geometry.
```

## Validation

A valid use demonstrates that:

- target selection and canon/option selection remained distinct;
- the exact source and renderer identities were recorded;
- only a source-admitted target and representation were used;
- receipt replay or the declared verifier closed successfully;
- sealed comparison labels did not leak into construction;
- the display added no geometry or empirical interpretation;
- audience and destination survived into the evidence packet and output;
- nonclaims, research standings, `selection_effect`, and `hmmm` stayed visible;
- human-readable and agent-readable WebMCP catalogues exposed the same skill; and
- the MCP registry/handoff stayed read-only and permission-neutral.

## Anti-patterns

- Treating a displayed EPAC object as selected or canonical.
- Expanding EPAC and presenting the expansion as a globally fixed identity.
- Selecting a target by spelling correction, chemical familiarity, or an
  undeclared alias.
- Using dirty or untracked renderer code while claiming commit-pinned provenance.
- Drawing bonds, angles, positions, or shape names absent from the receipt.
- Opening sealed comparison labels during construction.
- Dropping a failed or unresolved standing because it makes the display awkward.
- Making the public MCP server execute research code or accept repository writes.
- Showing a skill card to the human that the MCP registry cannot inspect, or the
  reverse.

## hmmm

- the future independent EPAC repository, authority, and release identity;
- whether EPAC will ever ratify a fixed expansion rather than remain a
  despecified handle;
- the first committed, source-owned public renderer and its stable interface;
- the durable schema, if any, for EPAC display packets;
- whether a future separately authorized service should execute EPAC displays;
  the current WebMCP server is registry and handoff only.
