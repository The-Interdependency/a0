---
name: action-calibration
description: Action sizing and escalation doctrine. Load this when choosing between the smallest decisive experiment and a maximal coherent program; when asked for the highest-leverage action, minimal versus maximal action, what to do next under time, attention, money, compute, or coordination constraints; when deciding whether to run a bounded falsifier before a full build; or when a task risks scope sprawl. Do not load for a trivial fixed-scope task, immediate emergency containment, or ordinary prioritization that has no evidence or escalation decision.
---

# action-calibration — spend only enough to change the decision

The governing distinctions are:

```text
minimal decisive action != smallest visible deliverable
maximal coherent action  != everything that could possibly be done
```

A **minimal decisive action** is the least burdensome action whose possible outcomes
can materially change the next decision, theory, architecture, or allocation.

A **maximal coherent action** is the broadest bounded program whose parts share one
decision layer, common prerequisites, and reusable outputs, and which closes that
layer without importing unrelated ambitions.

## Load this when

- The user asks for the highest-leverage, minimal, maximal, next, or most efficient
  action.
- A research program can begin with a falsifier, exact control, obstruction, or
  sensitivity test before a complete proof program.
- A build can be staged as a bounded experiment before production hardening.
- Formal proof, independent replay, deployment, or publication may be premature.
- Several candidate tasks compete for limited human attention, money, compute,
  context, or coordination.
- A long task risks becoming impressive but non-discriminating work.
- The result of one small experiment could decide which large program is worth doing.

## Do not load this when

- The task is fixed, trivial, and has no meaningful scope choice.
- Immediate safety or security containment must happen before analysis. Contain first;
  calibrate follow-up work afterward.
- A user has explicitly required a complete regulated, contractual, or production
  deliverable whose scope cannot be reduced.
- The question is only ordinary ordering of a to-do list and no evidence, uncertainty,
  or escalation rule is involved.
- Another skill owns the real issue: use `interdependent-work-graph` for cross-repo
  authority, `risk-boundary-build` for runtime permissions, or `domain-claims` for
  semantic collisions.

## Core contract

1. **Name the decision, not merely the task.** Ask what choice the work must inform.
2. **Sketch the maximal coherent closure before selecting the minimum.** The minimum
   is defined relative to the whole decision layer, not in isolation.
3. **Find the earliest load-bearing unknown.** Prefer the first uncertainty whose
   resolution changes the downstream branch.
4. **Require outcome branching.** A minimal action is decisive only when its positive,
   negative, and unresolved outcomes have different declared consequences.
5. **Close prerequisites first.** A cheap result is not economical if an unresolved
   prerequisite makes it uninterpretable.
6. **Reuse the work.** Prefer actions whose fixtures, certificates, schemas, datasets,
   or code become inputs to the maximal program.
7. **Preserve optionality.** Avoid irreversible commitments before evidence requires
   them.
8. **Freeze criteria before evaluation.** Do not select targets, metrics, controls, or
   scientifically meaningful stopping rules after seeing the result.
9. **Preflight scarce resources before execution.** Resource scarcity requires
   contemplation before a compute run begins. Decide whether the available compute,
   memory, disk, power, network, quotas, usage limits, and durable execution time are
   sufficient for the selected action to reach its natural terminal condition. If
   there is material doubt, do not start the run; resize, stage/checkpoint, relocate,
   acquire resources, or leave it `hmmm`. Once a healthy run begins, let it finish.
   Do not invent a wall-clock ceiling merely because the action is described as
   bounded or falsifiable. Runtime/resource ceilings are stopping criteria only when
   they are load-bearing to the claim or acceptance criterion, an authorized safety
   boundary, or a real externally imposed hard limit fixed before launch.
10. **Escalate by rule, not momentum.** The result determines whether the next action is
   stop, redirect, repair a prerequisite, or enter the maximal program.
11. **Carry `hmmm`.** Unknown cost, coupling, interpretation, authority, and completion
    feasibility boundaries remain visible.

## The action record

Before execution, write:

```yaml
decision: <the choice this work must inform>
decision_layer: <geometry | topology | implementation | production | publication | other>
load_bearing_unknown: <earliest uncertainty that changes the branch>
invariants_to_preserve:
  - <facts, contracts, or user requirements that may not be traded away>

minimal_decisive_action:
  action: <bounded experiment or implementation>
  positive_outcome: <result and next action>
  negative_outcome: <result and next action>
  unresolved_outcome: <failed prerequisite or ambiguity and next action>
  prerequisites:
    - <must already be true>
  stop_condition: <semantic/computational completion condition; not an arbitrary timeout>
  reusable_outputs:
    - <artifact reused by later work>

maximal_coherent_action:
  closure_target: <entire decision layer to close>
  included_work:
    - <work sharing the same closure target>
  excluded_work:
    - <adjacent ambition intentionally outside>
  completion_condition: <what closes the layer>

cost_vector:
  time: low | medium | high | hmmm
  human_attention: low | medium | high | hmmm
  money: low | medium | high | hmmm
  compute: low | medium | high | hmmm
  coordination: low | medium | high | hmmm
  operational_risk: low | medium | high | hmmm

resource_preflight:
  completion_feasible: yes | no | hmmm
  externally_imposed_hard_limits:
    - <actual limit or none>
  scientific_resource_stop_rule: <justified load-bearing criterion or none>
  execution_durability: <why the run can reach its natural terminal condition>

choice: minimal | maximal | prerequisite_repair | immediate_containment
rationale: <why this size is appropriate>
escalation_rule: <frozen mapping from result to next action>
hmmm:
  - <unresolved boundary>
```

## Decisiveness tests

A candidate minimum must pass every applicable test.

### 1. Branch-change test

For each outcome, ask:

> Would this outcome cause a materially different next action?

If every outcome leads to the same work, the experiment is informative at best, not
decisive.

### 2. Interpretation test

The result must remain meaningful whether it confirms, falsifies, returns zero, or
exposes an unresolved prerequisite. A test designed only to celebrate one result is
not calibrated.

### 3. Prerequisite test

List every assumption that could invalidate interpretation. Repair the cheapest
load-bearing prerequisite before running the experiment.

### 4. Reuse test

The minimum should preferably emit something the maximal program will consume:
fixtures, typed events, exact identities, a dataset, a certificate, a counterexample,
a schema, a proof obligation, or a tested implementation surface.

### 5. Cost-vector test

Do not compress all burden into “time.” Consider:

```text
elapsed time
human attention
money
compute
coordination
permissions
operational risk
future maintenance
```

### 6. Coupling test

A local experiment is false economy when the truth condition is irreducibly
system-wide. If isolating the minimum destroys the phenomenon being tested, choose a
larger coherent unit.

### 7. Optionality test

Prefer the action that leaves the greatest number of valid next moves open unless an
irreversible commitment is itself required.

### 8. Evidence-standing test

Match evidence strength to the claim. A mesh can guide a search; it cannot silently
become an exact theorem. A focused test can validate one contract; it cannot silently
become production readiness.

### 9. Completion-feasibility test

Before starting a compute run, ask:

> Given the actual scarce resources and execution environment, do I have sufficient
> reason to expect this run can reach its natural terminal condition?

If `no`, do not start it. If `hmmm`, resolve the resource uncertainty first or redesign
for safe staging/checkpointing. Do not compensate for uncertainty by starting anyway
and attaching an arbitrary wall-clock timeout. Once started, a healthy run continues
to completion or deterministic computational failure unless an explicit user
cancellation or unforeseen real resource/safety emergency requires interruption.

## Default choice

Choose the **minimal decisive action first** when it:

- can be interpreted independently;
- is materially cheaper than the maximal program;
- changes the branch under at least two outcomes;
- preserves all load-bearing invariants;
- emits reusable evidence;
- has a clear semantic/computational stop condition;
- has passed the completion-feasibility preflight;
- does not create disproportionate safety or irreversibility risk.

Choose the **maximal coherent action directly** when one or more are true:

- the smaller action duplicates nearly all maximal setup and verification;
- only the whole coupled system has a meaningful truth condition;
- fragmentation costs more coordination than it saves;
- batching creates a large shared-setup economy;
- an irreversible, safety-critical, legal, contractual, or production decision
  requires complete due diligence;
- the user explicitly needs closure of the whole layer rather than a directional
  research result.

Choose **prerequisite repair** when neither scope is interpretable yet.

Choose **immediate containment** when delay increases harm; calibrate investigation
and remediation after containment.

## Minimal versus maximal comparison

Use qualitative values; do not invent false precision.

| Criterion | Minimal decisive | Maximal coherent |
|---|---|---|
| Decision changed by result | required | required |
| Scope | one load-bearing unknown | one complete decision layer |
| Stop condition | exact and claim-relevant | exact and layer-closing |
| Cost | lowest burden that remains decisive | highest burden justified by closure |
| Reuse | should feed later work | should consolidate prior work |
| Failure surface | narrow and diagnosable | broader, with explicit sub-gates |
| Best use | choose direction | certify, productionize, or close the layer |

A useful ordinal heuristic is:

```text
action leverage
  ~ decisiveness × evidence quality × reuse × preserved optionality
    ---------------------------------------------------------------
       time + attention + money + compute + coordination + risk
```

This is a comparison aid, not a universal numerical formula.

## Workflow

1. **State the decision and curiosity type.** Distinguish directional curiosity,
   falsification, production readiness, publication, and exhaustive classification.
2. **Preserve invariants.** Record user requirements and source-backed constraints
   that scope reduction may not discard.
3. **Sketch the maximal coherent program.** Bound what closes the layer and what
   remains outside.
4. **Locate the earliest branch-changing unknown.**
5. **Generate candidate minima.** Include a control, falsifier, obstruction, or
   sensitivity test where applicable.
6. **Run the decisiveness tests.**
7. **Compare the complete cost vectors.**
8. **Choose minimal, maximal, prerequisite repair, or containment.**
9. **Preflight resource sufficiency.** If the chosen run cannot reasonably be expected
   to finish with available scarce resources, do not launch it. Resize, stage,
   checkpoint, relocate, acquire resources, or leave it `hmmm`.
10. **Freeze target, metrics, controls, and only genuinely load-bearing stopping rules
    before execution.** Do not manufacture a wall-clock limit merely because a
    protocol is preregistered.
11. **Execute with a closed loop.** Cross-load `loop-eng` for repeated
    execute→verify→iterate work. Once a healthy compute run starts, let it reach its
    natural terminal condition.
12. **Record the result and re-calibrate.** Do not continue merely because the tools
    and branch are already open.
13. **Promote repeated patterns through `canon`, not by accidental repetition.**

## Relationship to other skills

- **`loop-eng`** executes the chosen bounded loop and enforces success and stop
  conditions. `action-calibration` decides how large that loop should be. “Bounded”
  scopes the decision/work; it does not imply an arbitrary elapsed-time cutoff.
- **`interdependent-work-graph`** resolves cross-repository participants and authority.
  `action-calibration` decides which bounded slice of the graph to execute now.
- **`meta-module-build`** scopes one implementation module after the action size is
  selected.
- **`risk-boundary-build`** may force maximal due diligence or immediate containment
  where permissions, data, or operational effects are high.
- **`canon` and `domain-claims`** prevent a cheap result from acquiring unearned
  doctrine or semantic authority.
- **`char-compress`** preserves the chosen decision record and evidence across handoff.
- **`distributed-publication`** publishes exact results after the action has earned
  publication standing.
- **`skill-usage`** can later record whether this skill actually saved effort and
  whether its decisions were reliable.

## Output shape

When this skill is active, return:

```markdown
## Decision boundary
- Decision:
- Load-bearing unknown:
- Invariants:

## Minimal decisive action
- Action:
- Positive → next:
- Negative → next:
- Unresolved → next:
- Stop condition:
- Reusable outputs:

## Maximal coherent action
- Closure target:
- Included:
- Excluded:
- Completion condition:

## Resource preflight
- Completion feasible:
- Hard external limits:
- Claim-relevant resource stop rule:
- Execution durability:

## Comparison
| criterion | minimal | maximal |

## Choice
- Selected scope:
- Rationale:
- Frozen escalation rule:

## hmmm
- ...
```

## Validation

A successful application demonstrates that:

- the decision is named separately from the task;
- the minimum has positive, negative, and unresolved outcome branches;
- the maximal program is coherent and bounded rather than merely large;
- prerequisites capable of invalidating interpretation are explicit;
- all important cost dimensions are considered;
- resource sufficiency is contemplated before any compute run begins;
- a run with material doubt about completion is not started;
- target and escalation rules are frozen before evaluation;
- only scientifically or externally load-bearing resource limits become stopping rules;
- once started, a healthy compute run is allowed to reach its natural terminal condition;
- the minimum preserves a path into the maximal program;
- a stop condition prevents momentum-driven continuation without becoming an arbitrary runtime cutoff;
- existing skills are cross-loaded rather than duplicated;
- unresolved boundaries remain `hmmm`.

## Anti-patterns

- Calling the smallest deliverable “minimal” when it cannot change a decision.
- Calling an unbounded wish list “maximal.”
- Running a cheap experiment whose result cannot be interpreted independently.
- Formalizing, deploying, or publishing before the preceding evidence layer closes.
- Repeating an expensive validation that does not change confidence or claim standing.
- Choosing metrics, controls, or targets after seeing the result.
- Treating a selected parameter as an emergent law without sensitivity controls.
- Solving a cross-repository or semantic problem inside the convenient open folder.
- Retrying an unavailable tool surface instead of preserving a bounded artifact and
  declaring the capability boundary.
- Starting a compute run when completion feasibility is still materially uncertain.
- Inventing a wall-clock timeout merely because a test or protocol should be “bounded.”
- Stopping a healthy compute run after launch because a non-load-bearing arbitrary
  resource ceiling was chosen instead of doing adequate preflight.
- Continuing because work has already begun rather than because the escalation rule
  was met after the current run reaches its terminal condition.
- Downscoping away a load-bearing part of the user's request.
- Using “resource saving” to justify unsafe, incomplete, or misleading evidence.

## Minimal example

```text
Decision:
Does the P7 realization contain higher-order linking beyond pairwise and triple data?

Minimal decisive action:
Evaluate the one length-four Milnor invariant whose sublink has all pairwise and
triple lower-order invariants zero.

Outcomes:
nonzero -> enter the maximal whole-link program
zero -> redirect maximal work toward Alexander ideals and nilpotent quotients
unresolved -> certify crossing combinatorics first

Maximal coherent action:
Certify every crossing, compute symbolic Alexander ideals, all admissible length-four
invariants, nilpotent quotients, phase co-winner controls, and proof-ready ledgers.
```

## hmmm

- Whether action records should gain a machine-readable `ACTION_SCOPE` metadata-block
  sibling after enough field use.
- Whether burden and decisiveness should remain qualitative or gain domain-specific
  scoring profiles.
- How to measure saved attention and coordination without rewarding superficial
  shortness.
- When a human's desire for exhaustive understanding should override the default
  minimal-first rule.
- Whether `evidence-ladder` and `preregistered-evaluation` should become separate
  skills or references loaded by this one.
