---
name: ucns-option-selection
description: Fail-closed rubric for comparing, retaining, rejecting, deprecating, and selecting UCNS options within an explicit scope. Load this when an agent asks which UCNS candidate should win, whether evidence authorizes selection, how an option moves from registered or implemented to selected, how to compare competing gonol constructors, carriers, geometries, policies, projections, or measurement candidates, or how to issue a scoped UCNS decision receipt. Do not load merely to register options, execute one already-selected option, or choose ordinary UI preferences. Never select universal UCNS canon by score, familiarity, implementation order, or EDCM-local evidence.
---

# ucns-option-selection — selection must earn its scope

Use this procedural rubric for the transition from preserved alternatives to
an explicit, evidence-bearing, scoped decision. Current UCNS source, registries,
manifests, protocols, receipts, and canon remain authoritative. This skill does
not appoint a winner or freeze a current option inventory.

## Selection principle

Selection is a gated decision, not an additive score.

A candidate cannot compensate for a violated invariant, incomplete evidence,
failed replay, hidden information loss, or absent authority by being faster,
simpler, popular, familiar, or already implemented.

```text
scope and authority
    -> eligibility
    -> evidence completeness
    -> falsification and replay
    -> purpose-relative comparison
    -> non-transfer and rollback
    -> explicit ratification
    -> scoped decision receipt
```

Failure of a hard gate stops selection while preserving the option and its
evidence under the appropriate standing.

## Workflow

### 1. Fix the decision boundary

Record before comparing outcomes:

```text
decision_id:
selection_scope:
purpose:
authority:
consumer:
candidate_set:
required_constraints:
comparison_policy:
evidence_boundary:
non_transfer_boundaries:
ratification_rule:
```

Examples of valid scope include one EDCM profile, one declared gonol
construction layer, one rendering surface, or one experiment. “UCNS generally”
is not a valid scope without separately ratified universal authority.

Freeze the candidate set or state the admission rule before inspecting results.
Newly discovered candidates may enter only through a recorded protocol event;
do not silently add or remove competitors after seeing an outcome.

### 2. Resolve exact candidate identity

Each candidate must bind:

- name, version, evaluator kind, and code reference;
- source, corpus, adapter, configuration, and producer identities;
- option values and applicable policies;
- construction and evidence receipt digests;
- declared scope, purpose, and known information loss;
- authorship of candidate, evidence, comparison, and decision.

Identity mismatch fails closed. Similar names or byte-different receipts are
not interchangeable evidence.

### 3. Apply hard eligibility gates

A candidate is eligible only if it:

- satisfies every decided constraint applicable to the selection scope;
- preserves required distinctions, ordering, multiplicity, provenance, and
  typed absence;
- respects construction boundaries, including gonol closure and atomic
  promotion when applicable;
- uses declared comparison and structure policies without hidden defaults;
- retains exact evidence beneath every lossy projection;
- violates no active rejection, deprecation, security, consent, custody, or
  source-license boundary.

An ineligible candidate is `REJECTED` for this decision boundary. Rejecting it
here does not erase historical evidence or prove universal invalidity.

### 4. Require complete evidence

Selection requires the complete evidence declared by the protocol:

- full admitted corpus or complete declared mathematical/domain boundary;
- natural terminal execution or a genuine preregistered stop condition;
- exact counts, identities, digests, custody, and failure propagation;
- no sampled prefix represented as completion;
- no fixture success represented as generality;
- no outcome-dependent change to target, metric, control, or criterion.

Missing required evidence yields `BLOCKED` when a named prerequisite is absent,
or `UNRESOLVED` when the decision boundary itself remains incomplete.

### 5. Require falsification and independent replay

The candidate must face its frozen falsifiers and matched-information controls.
Where the protocol requires deterministic identity, independently reconstruct
or replay the full declared scope and compare exact receipts byte-for-byte.

Classify results without promotion:

- `SURVIVED` means the candidate survived the declared test;
- `FALSIFIED` means it failed the declared falsifier;
- neither word means selected, canonical, proved, useful outside scope, or
  measurement-valid.

### 6. Compare for the declared purpose

Compare only after eligibility and evidence gates close. Use the frozen named
policy and report the complete vector rather than collapsing it prematurely:

```text
constraint fidelity:
purpose effectiveness:
worst-case behavior:
retained distinctions:
declared information loss:
reconstruction/replay:
failure transparency:
resource observations:
integration cost:
rollback and migration:
unresolved dependencies:
```

Purpose effectiveness must distinguish “works” from “advantage over a
matched-information alternative.” Resource use may break a tie only when the
decision record explicitly makes it relevant; it cannot rescue semantic or
structural failure.

Do not use one scalar rank unless the scalar and aggregation rule were frozen,
all hard gates remain independently visible, and the scalar cannot conceal a
disqualifying failure.

### 7. Apply the selection rule

A candidate may become `SELECTED_FOR_SCOPE` only when:

1. its exact identity is closed;
2. every hard eligibility gate passes;
3. required evidence is complete;
4. declared falsifiers and replay requirements are satisfied;
5. it meets the frozen purpose-relative selection criterion;
6. alternatives and negative evidence remain recoverable;
7. non-transfer, rollback, and migration boundaries are explicit; and
8. the named authority performs the required ratification event.

Repeated use, registration order, implementation completeness, CI success,
agent preference, or an absent objection cannot substitute for ratification.

### 8. Emit one terminal standing

- `SELECTED_FOR_SCOPE` — explicitly ratified winner for the declared scope.
- `RETAINED_CANDIDATE` — eligible evidence-bearing alternative not selected.
- `REJECTED` — failed an applicable hard gate or frozen criterion.
- `BLOCKED` — a named prerequisite prevents authorized evaluation or decision.
- `UNRESOLVED` — admissible constructions, interpretation, or decision rule is
  not complete enough to close.
- `DEPRECATED` — removed from active forward use by an explicit replacement or
  failure-propagation decision; historical evidence remains.

Do not translate these standings into statuses owned by another scope.

### 9. Seal the decision receipt

```text
decision_id:
scope:
purpose:
authority and ratification event:
candidate identities:
eligibility results:
evidence receipts:
falsifier and replay results:
comparison policy and complete vector:
selected candidate or none:
terminal standing of every candidate:
claims authorized:
claims not authorized:
non-transfer boundaries:
rollback trigger and procedure:
migration effect:
remaining hmmm:
```

The receipt must identify every candidate considered and preserve negative
results. A selection receipt never rewrites its preregistration or source
evidence.

## Gonol-constructor application

Load `gonol-build` with this skill when comparing gonol constructors.

An unresolved recursive-gonol constructor does not block candidate
construction. Build and label explicit candidates, preserve closed lower-scale
gonols as atomic participants, bind intrinsic relations and option choices,
preregister their falsifiers, and run them to completion. `hmmm` prevents a
candidate from silently becoming the constructor; it does not prevent the
candidate from being built or tested.

## Anti-patterns

- Selecting the first implementation because it exists.
- Using a weighted score to cancel a hard-gate failure.
- Treating elegance, speed, compression, or familiarity as semantic evidence.
- Choosing after inspecting hidden outcome labels or changing the candidate set
  after results appear.
- Comparing candidates that received different information without declaring
  and controlling the difference.
- Treating CI, fixtures, or deterministic replay as purpose effectiveness.
- Promoting EDCM-local survival into universal UCNS, EDCM measurement,
  METAPAT, cognition, theorem, or PTCNA authority.
- Treating `UNRESOLVED` as “do no work” instead of authorization to construct
  explicit candidates under preserved uncertainty.
- Deleting losing options or their evidence after selection.

## Validation

A valid use demonstrates:

- scope, purpose, authority, candidates, gates, and policies were frozen before
  outcome comparison;
- hard gates remained noncompensable;
- complete evidence and independent replay requirements were enforced;
- every candidate received a terminal standing;
- selection, canon, proof, usefulness, and measurement validity remained
  distinct;
- ratification was explicit;
- rollback, migration, non-transfer, negative evidence, and `hmmm` survived.

## hmmm

- the first UCNS domain to ratify and exercise this complete rubric;
- whether decision receipts should gain a machine-readable schema and runner;
- which authorities may ratify scopes delegated by Erin Spencer;
- the measurement-validity criterion required before any measurement option
  can be selected as valid rather than merely structurally preferred;
- when multiple non-dominated candidates should remain a selected set rather
  than forcing one winner.
