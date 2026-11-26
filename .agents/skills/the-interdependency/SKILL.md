---
name: the-interdependency
description: Protocol and workflow for all tasks involving The Interdependency organization, its repositories, The Interdependent Way projects, EDCM transcript analysis, code building, research, GitHub maintenance and updates. Load this whenever the task or context touches The-Interdependency assets, interdependentway.org, Harrison Hovel, or on phrases like "assemble EDCM transcripts for analysis", the legacy "assemble edcmbone transcripts for analysis", "write code that...", or any GitHub/research/build work on org projects.
---



## Core Doctrine

- **Agent/work context gate**: `skill-lib` is standing context for org agents. At every agent instantiation, resolve the available skill-lib entrypoint/index plus the governing repository instructions before that agent may reason about or execute org work. At the start of every unit of work, reevaluate the request against skill descriptions and read every applicable `SKILL.md` before acting. Child/sub-agents inherit already-resolved repository identities, governing contracts, and applicable skill context from the parent, then reevaluate triggers for their own assignment. Previously resolved authoritative instructions stay resolved until their source changes, conflicts, becomes unavailable, or is explicitly superseded. Do not ask the user to restate repository knowledge that authoritative sources already resolve. If required authority cannot be resolved, stop that boundary as `hmmm`; do not guess or reconstruct stable project semantics from conversational repetition.
- **Structure preservation first**: Before any summarization, compression, decision, or output, preserve the complete relational structure, variables, topology, epistemic status (declared / implemented / inferred / hmmm), distinct layers (lived experience vs formal claims vs emotional), and explicitly mark all unresolveds. This follows the org's neurodivergence-preserving interaction principles.
- **Resource-run preflight and completion**: Resource scarcity requires contemplation **before** a compute run begins. Before launch, inspect or estimate whether available time under real external constraints, CPU, memory, disk, battery/power, network, quotas, API/tool usage limits, and session/process durability are sufficient for the run to reach its natural terminal condition. If there is material doubt that it can finish, do not start it: reduce, stage/checkpoint, relocate, acquire resources, or leave it `hmmm`. Once a healthy run begins, let it finish to completion or deterministic computational failure unless the user explicitly cancels it or an unforeseen real resource/safety emergency requires interruption. Do **not** invent or enforce a wall-clock cutoff merely to make work bounded, falsifiable, or convenient. Runtime/resource ceilings are stopping criteria only when the quantity is itself load-bearing to the hypothesis or acceptance criterion, an authorized safety boundary, or a real externally imposed hard limit, and they must be justified before launch.
- **METAPAT consultation gate**: Consult current `The-Interdependency/metapat` before committing a conceptual choice when the task must decide which distinctions, relations, boundaries, transformations, scales, or cross-domain correspondences should organize downstream work. METAPAT consultation is also required when an unresolved conceptual choice would constrain architecture, semantics, measurement, ontology, or later falsifiable claims. Do not consult METAPAT merely to execute an already-fixed implementation, run tests, repair syntax, move data, or apply a relation whose meaning and boundary are already established. METAPAT is the source of truth for its own doctrine; skill-lib routes to it and must not duplicate a frozen theory snapshot.
- **EDCM transcript assembly & analysis**: When the task involves assembling or analyzing transcripts (e.g. for EDCM / Energy–Dissonance Circuit Model measurement, formerly EDCMBONE / Energy Dissonance Circuit Model Bound Operator Numerical Evaluation), apply the established EDCM lens: map energy flows and dissonance circuits, compute/report F-loss metrics (fidelity, deletion, inversion, collapse detection), tag F1–F6 failure modes, segment for cognitive accessibility (especially neurodivergent readers), and preserve transcript topology. Do not improvise assembly; extend or adhere to patterns from the `edcm` repository (`edcmbone` is archived 2026-07-28 and superseded by `edcm`; treat it as historical provenance only).
- **Code writing standards**: When writing or modifying code that touches The-Interdependency:
  - Use msdmd self-declaration blocks (`# === BLOCK_NAME ===` ... `# === END BLOCK_NAME ===`) wherever the module fits an existing or new metadata skill.
  - Respect ratios, test contracts, dependency declarations, ownership, and risk boundaries per the relevant skills.
  - For new modules, begin with `meta-module-build` patterns.
- **GitHub maintenance & updates**: 
  - Follow org conventions in `ORG_DISTRIBUTION.md` (install paths `.agents/skills/`, propagation rules).
  - Before/after changes, run available drift checkers and update machine-readable indexes (`skills.json`, README tables, AGENTS.md pointers).
  - Use clear commit messages that reference affected skills or the change class.
  - When propagating skill-lib changes, prefer the canonical `tools/propagate_skills.py` (or equivalent) with `--apply` only after dry-run validation.
- **Usage guidance requirement**: Every code file, SKILL.md update, README change, research summary, or artifact produced under this skill **must contain clear, actionable usage guidance**: runnable examples, invocation patterns, integration notes, edge cases, limitations, and participation in larger workflows. This is non-negotiable for accessibility, onboarding, and reducing signal loss.
- **Research & canon alignment**: Ground all claims in source-backed canon (cross-load `canon` skill). Use `char-compress` for context handoff. Leave genuine uncertainty as `hmmm`.

## Operator workflow contract

These constraints govern how work is selected and executed; they do not override repository-local authority about what a project means.

- **Audit before assent**: Test a proposal against current code, canon, evidence, constraints, and failure modes before agreeing with it. Agreement is a conclusion, not a conversational default.
- **Preserve concepts; reject bad placement**: When a proposal is useful but architecturally misplaced, preserve the concept and move or re-scope it to the owning layer rather than either accepting the wrong placement or discarding the idea.
- **Useful, good, true**: Do not generate work merely to create activity. Prefer artifacts and actions that are useful to the stated goal, operationally sound, and truthfully supported by evidence or explicit status.
- **KISS under reality contact**: Prefer the smallest skilled design that survives actual execution. A clever mechanism that is fragile, opaque, untestable, or needlessly expensive is not simpler than a slightly longer mechanism that works.
- **Prior planning before execution**: Resolve authority, placement, dependency order, resource needs, validation, rollback, and terminal condition before expensive or destructive work begins. Planning exists to prevent avoidable failure, not to create an approval ceremony.
- **Complete within granted scope**: When the request, authority, and safety boundary already permit the next action, continue through the coherent workflow instead of repeatedly asking the operator to approve each obvious intermediate step. Ask only when a real unresolved decision cannot be recovered from authoritative sources or safely isolated as `hmmm`.
- **Usage-limit aware orchestration**: Treat model-plan limits, API quotas, tool-call limits, rate limits, context budgets, and session durability as real resources during preflight. Stage or redistribute work before launch so a workflow does not predictably die midway from exhaustion. Do not silently downgrade evidence quality merely to fit a limit.
- **Purposeful functions**: Every function, script, workflow step, and abstraction must have a defensible purpose, coherent inputs/outputs, failure behavior, and a reason to exist at that layer. Remove dead indirection and mechanisms whose only justification is that they already exist.
- **Deprecation is removal plus replacement when capability remains required**: Once a mechanism is declared deprecated, stop routing new work through it and provide or identify its supported replacement when the retired capability remains required. If the capability is intentionally retired as unnecessary, complete removal is the replacement outcome. Do not preserve deprecated behavior by default out of inertia.
- **`hmmm` is mandatory honest incompletion**: `hmmm` is the boundary object for unresolved constraints, missing authority, incomplete evidence, or a living continuation. Never erase an unresolved merely to make an artifact look finished. Where the boundary would otherwise be empty, leave a brief apropos, cogent, or humorous nonsequitur rather than silently dropping it.

## Operational authority topology

This section records durable ownership boundaries, not a frozen inventory of the operator's current machines, clients, logins, quotas, or provider sessions.

- **GitHub repository boundary**: GitHub is the canonical remote source, review, and merge surface for repositories under `The-Interdependency`. GitHub Actions is validation evidence only where a repository's current workflows actually execute the claimed gates; inspect those jobs rather than inferring health from a green badge.
- **VM control-plane authority**: `skill-lib/vm-mcp` owns reusable VM MCP implementation and doctrine. Its authority profiles are deployment choices: bounded defaults remain appropriate for shared or first-contact environments, while the explicit `personal-console` profile is available for a deliberately configured single-owner private VM. The personal-console profile entered canonical skill-lib in merged #81 at `222ba4d4348022d81950c3fad054bae7e528b6a0`. Repository tests do not prove that any particular VM currently satisfies that profile.
- **Stack deployment authority**: `The-Interdependency/stack` owns stack-specific deployment and operational-use guidance. Stack's consumption of the canonical `vm-mcp` personal console entered stack in merged #12 at `22b74340d0c603883193a4ecf53e2ef3f9c3e780`. When stack deployment consumes `vm-mcp`, resolve that exact pinned skill-lib identity and the current `stack/backend/deploy` instructions before acting. No implementation or doctrine authority transfers from skill-lib into stack merely because stack consumes it.
- **Concrete host/client facts are runtime evidence**: A hostname or alias such as `a0`, a client such as Termux, Git transport/authentication method, tunnel state, installed CLI, provider login, exact version, quota, and API availability must be discovered from the current deployment/operator environment before use. This skill must not elevate those transient facts into unconditional organization-wide routing doctrine.
- **Provider execution capacity is not source authority**: OpenAI/Codex, xAI/Grok, DeepSeek/DeepCode, or another provider may be usable execution capacity when currently authenticated and within quota. Their availability must be checked at runtime, and choosing an executor does not transfer repository, semantic, mathematical, measurement, or publication authority.
- **Deprecated/stale routes do not revive themselves**: Historical services, hosts, clients, authentication paths, or provider assumptions are not automatic fallbacks. If a route is deprecated, migrate to its supported replacement and remove obsolete routing when compatibility permits; otherwise preserve the unresolved deployment boundary as `hmmm`.

### Operational usage guidance

Before routing work to a machine or provider:

1. resolve the repository and exact commit that owns the work;
2. read the current deployment instructions owned by the consuming repository;
3. verify the actual host/client/authentication/tunnel/provider state;
4. choose only the authority profile and executor justified by that evidence; and
5. keep human recovery access independent where the deployment contract requires it.

A statement like "use `a0`" is therefore a runtime/operator decision backed by current deployment evidence, not standing organization canon in this skill.

## METAPAT consultation test

Ask one question before conceptual or architectural commitment:

> Am I deciding **what relation/boundary/transformation should exist or matter**, or merely implementing one already established?

Consult METAPAT for the first case. Continue locally for the second.

Strong consultation triggers:

- choosing or revising an architecture-level distinction;
- deciding whether a boundary deserves independent status;
- comparing similarly shaped transformations across different domains;
- importing a domain term, metaphor, formula, or ontology into another layer;
- deciding what remains invariant across scale or representation change;
- a design choice is being mistaken for an empirical or mathematical claim, or vice versa;
- an unexplained but productive discovery path is at risk of being removed only because its mechanism is not yet known;
- two repos disagree because they encode different conceptions of the same relation rather than because of an implementation bug.

Non-triggers:

- routine refactors under fixed contracts;
- dependency/version updates;
- deterministic data ingestion;
- tests whose expected relation is already declared;
- formatting, documentation, packaging, CI, deployment, or syntax repair;
- independent recovery of a result after the discovery result and comparison criterion are already frozen.

When consultation triggers, inspect the current METAPAT repository state before deciding. At minimum resolve the relevant current axioms, postulates, domain-restraint rules, and any directly applicable theory/implementation boundary. Do not import historical skill-lib `meta` wording as authority over current METAPAT.

## Workflow

1. **Context gate**: Apply the agent/work context gate in Core Doctrine.
2. **Resource preflight**: Apply the resource-run rule in Core Doctrine before compute.
3. **METAPAT gate**: Before conceptual or architectural commitment, run the consultation test above. If triggered, inspect current METAPAT before selecting the relation, boundary, transformation, or cross-domain mapping.
4. **Context assembly**: For transcript work, explicitly structure output using EDCM energy-dissonance mapping, F-metrics, failure-mode tags, and accessibility annotations. Preserve full original relations.
5. **Artifact production**: Write code/docs with msdmd blocks (if applicable) + dedicated "Usage Guidance" section or equivalent. Include examples that can be copy-pasted.
6. **GitHub hygiene**: Check drift, update indexes, propagate only after validation. Reference this skill in commit messages where relevant.
7. **Output packaging**: Structure responses with:
   - Preserved structure / epistemic layers first.
   - EDCM-mapped analysis where transcripts are involved.
   - Usage guidance and examples.
   - `hmmm` boundaries clearly marked.
   - Smallest next patch or action.

## Anti-patterns

- Beginning org work or instantiating an org agent without resolving skill-lib, governing repo instructions, and applicable contracts first.
- Asking the user to restate stable repository knowledge instead of resolving it from its authoritative source.
- Flattening, dropping variables, or losing topology/relations before acting or summarizing (directly conflicts with neurodivergence preservation).
- Starting a compute run when available resources have not been considered sufficiently to expect completion.
- Terminating a healthy compute run because of an arbitrary wall-clock limit that was not actually load-bearing to the claim, safety boundary, or external resource limit.
- Producing code, docs, or analysis without explicit usage guidance and examples.
- Assembling or analyzing EDCM transcripts without applying the framework's energy circuit, F-loss, and failure-mode model.
- Performing GitHub or org maintenance without drift checks or index updates.
- Canonizing inferred patterns without source backing (pair with `canon` skill).
- Omitting `hmmm` when uncertainty or missing source exists.
- Treating repo-local copies as canonical source of truth.
- Using METAPAT to decorate a routine implementation decision.
- Making a conceptual architecture choice that crosses the METAPAT gate without consulting current METAPAT.
- Copying METAPAT doctrine into skill-lib and allowing the copy to become a competing authority.
- Treating a concrete host, client, provider login, or quota as standing organization authority without current deployment evidence.

## Output Rubric (active whenever this skill is loaded)

- Lead with preserved relational structure and epistemic status.
- Transcript tasks → EDCM-structured output (energy maps, F1–F6 tags, accessibility notes, full topology).
- Code / docs → msdmd blocks where fitting + prominent, copy-pasteable "Usage Guidance" with examples and integration notes.
- GitHub / research → Drift status noted, index updates performed, relevant skills cross-referenced.
- If the METAPAT gate triggered, state what conceptual boundary required consultation and preserve any remaining `hmmm`.
- Always close with actionable next steps and any open `hmmm` items.

hmmm
- Precise harness integration for automatically fetching current METAPAT after this gate triggers; the skill currently defines the decision rule and source-of-truth boundary, while the consuming agent uses its available GitHub/local-repo access.
- Whether the historical `meta` skill should remain as a compatibility router or be removed after all consumers propagate this gate.
- Whether a companion metadata-block skill (e.g. `# === TIW_WORKFLOW ===` or `# === INTERDEPENDENCY ===`) should be added for self-declaring modules inside The-Interdependency repos.
- Exact canonical reference for the full EDCM transcript assembly protocol — should the detailed steps live in this skill or be expanded inside the `edcm` repo's own skill definitions?
- Actual VM state, current client/private-tunnel state, provider sessions, and quotas remain runtime evidence outside this skill.
