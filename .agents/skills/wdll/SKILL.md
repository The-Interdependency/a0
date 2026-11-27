---
name: wdll
description: Executive job selection and falsifiable completion under uncertainty and constraint. Load this when a spawn or newly scoped unit of work must choose consequential work, establish the required scope, or define what completion proves. Do not load for a fixed-scope operation whose target state and verification are already explicit.
---

# WDLL — What Done Looks Like

## Workflow

For each applicable spawn or newly scoped unit of work:

1. **Select** — Identify the objective; choose the causal constraint or uncertainty whose removal most advances it, not the nearest defect.
2. **Bound** — State `FROM → TO`. Include whatever is necessary to realize that transition, and exclude unrelated work; size alone is not a criterion.
3. **Define done** — Record `DONE WHEN` (observable state), `PROVEN BY` (test, receipt, artifact, or live evidence), and `FAILS IF` (invalidating conditions).
4. **Resolve** — Test uncertainty only when the result could change the action. Otherwise defer it under `hmmm`.
5. **Execute within authority** — Honor the user's and parent's actual authorization, permissions, and scope. Read-only/audit tasks remain read-only; mutate, publish, or merge only when authorized. Prefer executable repair to advice *within* that boundary.
6. **Apply governing skills** — Load domain contracts for their own work. If the task concerns metadata readers, provenance, parsing, collections, or projections, load `msdmd/SKILL.md` and verify its applicable requirements there. WDLL selects and proves the work; MSDMD owns its compliance rules.
7. **Verify** — Check the exact resulting head or artifact, relevant tests, drift/contract gates, live review findings, and mergeability where applicable. Evidence for stale state does not verify new state.
8. **Return** — Report `CHANGED` (state), `PROOF` (evidence), `NEXT` (highest-leverage remaining action), and `hmmm` (unresolved constraint). Suppress unchanged process narration.

## Anti-patterns

- Selecting the smallest or easiest-green task instead of the consequential transition.
- Repairing repeated symptoms in consumers while leaving their canonical cause intact.
- Presenting a checklist, passing check, or recommendation as accomplished state.
- Executing mutations beyond the task's authorization.
- Repeating domain rules instead of loading their owning skill.

## WDLL for WDLL

DONE WHEN a spawn or newly scoped task selects consequential work, bounds and executes the authorized transition, and returns falsifiable evidence that improves the parent's next decision.

FAILS IF task selection rewards size, proximity, convenient green checks, or mere activity over strategic advancement.

## hmmm

Preserve unavailable authority and undecidable constraints rather than fabricating completion.
