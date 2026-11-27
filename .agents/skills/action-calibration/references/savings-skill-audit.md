# Audit of time-, effort-, and resource-saving skill opportunities

## Finding

No existing skill in `skill-lib` owns the decision:

> What is the smallest action that can change the branch, and when is the full
> layer-closing program justified?

`loop-eng` owns closed execution loops and stop conditions. `interdependent-work-graph`
owns cross-repository scope and authority. `meta-module-build` bounds a module before
implementation. None compares a minimal decisive action against a maximal coherent
action across research, implementation, proof, and publication.

That gap justifies `action-calibration`.

## Existing skills that already save resources

| Existing skill | Savings mechanism | Why no new skill is needed |
|---|---|---|
| `char-compress` | preserves load-bearing context while dropping regenerable scaffold | already owns context and handoff compression |
| `loop-eng` | closed loops, stop conditions, maker/checker separation | already owns repeatable execution after action size is chosen |
| `interdependent-work-graph` | prevents wrong-repo edits, duplicate schemas, and repeated evidence reconstruction | already owns authority and cross-repo identity |
| `distributed-publication` | retrieves exact source artifacts and preserves fallback/provenance | already owns publication reuse |
| `meta-module-build` | prevents unscoped implementation patches | already owns module manifests |
| `risk-boundary-build` | exposes hidden permissions and operational effects | already owns risk-driven scope expansion |
| `canon` | prevents repeated argument over unearned doctrine | already owns canon standing |
| `domain-claims` | prevents semantic collisions from becoming implementation churn | already owns term standing and collision |
| `test-build` | binds obligations to executable witnesses | already owns evidence coverage |
| `skill-usage` | prevents popularity from masquerading as maturity | already owns usage evidence |
| `ssh-automation` | bounded retries, idempotency, rollback, shell containment | already owns remote-automation resource failure modes |
| `validate-data` | attacks unsupported conclusions before publication | already owns analysis QA |

## New skill created now

### `action-calibration`

**Owns:** selecting minimal decisive, maximal coherent, prerequisite repair, or
immediate containment.

**Why distinct:** it acts before `loop-eng`, `meta-module-build`, formal proof, or
deployment. Its product is an action-size decision and frozen escalation rule.

## Strong future skill candidate 1: `evidence-ladder`

### Proposed trigger

Load when deciding whether a claim needs:

```text
illustration
sampled numerical evidence
deterministic replay
exact symbolic/rational calculation
outward interval certification
independent-kernel replay
formal proof
production or empirical validation
```

### Distinct ownership

`action-calibration` sizes the project action. `evidence-ladder` sizes the epistemic
strength needed for a claim and decides when escalation adds standing rather than
ceremony.

### Thread basis

The thread repeatedly moved only when a new claim required a stronger evidence class:
mesh → exact count → interval replay → independent MPFR → exact word calculation.

### Expected savings

- avoids proof-assistant work for exploratory claims;
- prevents weak evidence from being overinterpreted;
- avoids duplicate independent replay when the margin is not load-bearing;
- makes claim/evidence mismatch visible.

### Recommendation

Create next, after `action-calibration` is field-tested. It is recurrent and distinct.

## Strong future skill candidate 2: `preregistered-evaluation`

### Proposed trigger

Load when metrics, controls, targets, tie-breaks, stopping rules, or benchmark cases
could be selected after outcome inspection.

### Distinct ownership

`canon` evaluates standing after evidence. `test-build` maps obligations to checks.
`preregistered-evaluation` freezes the evaluation rule before the evidence exists.

### Thread basis

The phase selector, length-four target, outcome branches, and failure rules were frozen
before execution to prevent target fitting.

### Expected savings

- prevents invalidated research that must be repeated;
- avoids post-hoc metric disputes;
- preserves zero and negative results;
- makes human preference separate from evidentiary selection.

### Recommendation

Create after `evidence-ladder`, or co-design their boundary before either becomes
canon.

## Extend existing skills instead of creating duplicates

### Sealed evidence reuse

Add examples to `interdependent-work-graph` rather than create `evidence-cache`.
It already says generated evidence should be sealed once and reused.

### Event-type separation

Add a typed-event example to `domain-claims` if this recurs outside UCNS. Physical
contact versus projected crossing is a semantic collision before it is geometry.

### Same-protocol controls

Add a control-comparison extension to `validate-data` or `statistical-analysis`.
A standalone `control-selection` skill would currently be too narrow.

### Tool-surface failure containment

Keep generic stop/escalation rules in `loop-eng`; keep SSH and VM cases in their
own skills. A broad `tool-fallback` skill would likely duplicate capability-specific
safety rules.

### Stacked PR lineage

Keep exact commit and artifact lineage in `interdependent-work-graph` and
`distributed-publication`. Do not create `stacked-research` unless a machine contract
emerges that those skills cannot carry.

## Rejected candidate skills

| Candidate | Decision | Reason |
|---|---|---|
| `highest-leverage` | reject as separate | synonymous subset of `action-calibration` |
| `minimum-effective-action` | reject as separate | risks optimizing for deliverable viability rather than decisiveness |
| `evidence-cache` | extend existing | work-graph and distributed-publication already own identity/reuse |
| `research-stack` | extend existing | stacked work is coordination plus publication provenance |
| `control-selection` | extend existing for now | better housed in validation/statistical doctrine |
| `tool-fallback` | reject for now | fallback safety is capability-specific |
| `scope-management` | reject as too broad | would overlap module, work-graph, loop, and action scope without a crisp decision |

## Priority matrix

Scores are qualitative and intentionally not treated as universal measurements.

| Opportunity | Distinctness | Recurrence | Expected savings | Build cost | Priority |
|---|---|---|---|---|---|
| action calibration | high | high | high | medium | now |
| evidence ladder | high | high | high | medium | next |
| preregistered evaluation | high | medium-high | high | medium | after boundary design |
| evidence reuse extension | medium | high | high | low | patch existing skill |
| typed event extension | medium | medium | medium-high | low | patch existing if recurrence continues |
| control-comparison extension | medium | high | medium | low | patch imported validation skills carefully |
| generic tool fallback | low | medium | uncertain | high | do not build yet |

## Savings audit rule

Before creating any new “efficiency” skill, ask:

1. Does an existing skill already own the decision?
2. Is the proposed skill's trigger distinguishable in one sentence?
3. Does it produce a different artifact or decision?
4. Has the pattern recurred across at least two domains or projects?
5. Would a reference or extension save more maintenance than a new activation surface?
6. Can its success be tested without rewarding superficial shortness?
7. Does it preserve quality, safety, and user intent rather than merely reducing work?

A skill that saves execution but adds more activation ambiguity may be negative
economy.
