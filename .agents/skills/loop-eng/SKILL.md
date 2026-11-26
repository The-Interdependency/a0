---
name: loop-eng
description: Loop engineering for designing closed feedback cycles (Discover→Plan→Execute→Verify→Iterate), single-agent and fleet loops with subagent maker/checker separation, and automated verify-iterate workflows. Load this when building or orchestrating agent systems (a0p, AIMMH), EDCM analysis pipelines, repeatable AI workflows, or any The-Interdependency project that benefits from structured loops instead of manual prompting. Cross-load with the-interdependency for org workflow context. This includes design, implementation and review of research, coding or content loops, Emergent App workflows, single-agent versus fleet selection, and replacing a manual human feedback loop. Also load when routed from the-interdependency or either agent lifecycle skill.
---



## Core Doctrine

- **Closed loops are the default**: Bounded, reliable, cheaper, and neurodivergence-compatible. Define clear goal, steps, evaluation criteria, stop condition, and hand-off before opening the loop. Open loops are powerful for exploration but burn tokens and risk drift/flattening; use them only after closed-loop checks are strong.
- **5-stage cycle as the skeleton**: Every loop follows Discover → Plan → Execute → Verify → Iterate. The Verify stage is where quality and structure are enforced (use the EDCM lens for transcript/analysis work; custom checkers or subagents for code/docs).
- **6 building blocks must be considered**:
  - **Automations**: The heartbeat (scheduled, event-driven, or goal-driven triggers). If a human must manually start every run, the loop is incomplete.
  - **Worktrees** (or equivalent isolation): Prevent agent collisions when multiple agents edit the same repo/files in parallel.
  - **Skills**: Reusable context (exactly what skill-lib + msdmd provides: VISION, ARCHITECTURE, rules, never-do lists, build/test steps). Every loop should start "warm" with accumulated project knowledge.
  - **Plugins & Connectors**: GitHub, Linear, Slack, databases, staging APIs, etc. Turn suggestions into real actions (opened PR, updated ticket, posted update).
  - **Subagents**: Maker and checker should rarely be the same model/agent. The agent that wrote the code/article is often too generous in review. Separate exploration, implementation, review, testing, fact-checking, and final summary roles.
  - **Memory**: The loop remembers across runs via Markdown files, project logs, GitHub issues, msdmd blocks, or EDCM-structured transcripts. Without memory the loop cold-starts every time.
- **Maker/checker separation is non-negotiable for quality**: The generator is biased toward its own output. Use distinct subagents or models for verification. This aligns with structure-preservation goals (catch flattening, lost variables, epistemic drift).
- **Usage guidance in every loop output**: Every artifact, summary, code change, or analysis produced by a loop must include clear, copy-pasteable usage guidance, examples, integration notes, and limitations.
- **Structure preservation across the loop**: Before any compression, summarization, or decision inside the loop, preserve full relational topology, variables, epistemic status (declared/implemented/inferred/hmmm), and layers. Mark unresolveds explicitly.
- **Integration with org stack**: `loop-eng` works alongside `the-interdependency` (overall workflow), `agent-instantiation`/`a0p-instancing` (orchestration mechanics), `canon` (source-backed decisions), `char-compress` (context handoff), and EDCM (Verify-stage analysis for transcripts and agent outputs).

## Workflow

1. **Define the loop contract first** (closed by default): Goal, success criteria, stop condition, hand-off rules, which building blocks are active.
2. **Map to 5 stages**: Explicitly design what happens in Discover, Plan, Execute, Verify (EDCM or subagent checker), and Iterate (fix + re-verify).
3. **Provision the 6 building blocks**: Skills (load relevant skill-lib entries), Memory (project log or msdmd), Subagents (via a0p), Connectors, Automations, isolation strategy.
4. **Run closed first**: Let the loop execute autonomously inside its bounds. Human only intervenes on hand-off or when confidence/stuck threshold is hit.
5. **Capture memory & usage guidance**: Every iteration or final output includes structured memory update + usage guidance section.
6. **Review & evolve**: Use canon skill for any pattern that should become org doctrine. Update the loop contract if drift or new requirements appear.

## Anti-patterns

- Treating the human as the permanent manual feedback loop (the old prompting habit).
- Running open/exploratory loops without strong Verify and stop conditions (token burn + drift risk).
- Using the same agent/model for both generation and verification.
- Starting loops cold without Skills/Memory (every run reinvents context).
- Skipping usage guidance in loop outputs or artifacts.
- Flattening structure or dropping variables/relations during any stage of the loop.
- Building loops that cannot be inspected or debugged (no memory, no clear stages).
- Canonizing loop patterns without source backing or testing in closed form first.

## Output Rubric (when this skill is active)

- Lead with the loop contract (goal, stages, building blocks in use, closed vs open rationale).
- Show explicit mapping to the 5 stages and how Verify enforces quality/structure (EDCM when applicable).
- Document the 6 building blocks status for this specific loop.
- Include maker/checker separation plan and which subagents/models are used.
- Every output/artifact contains prominent usage guidance + examples.
- Memory updates are structured and reference previous iterations.
- Close with `hmmm` items, next smallest improvement to the loop itself, and any canon proposals.

hmmm
- Concrete a0p-native patterns for worktree isolation and parallel subagent execution in TIW repos.
- Standardized memory schema (beyond ad-hoc Markdown) that all loops can write/read (possible msdmd block candidate later).
- How tightly to couple `loop-eng` with `the-interdependency` vs keeping them as peer skills that cross-load.
- Whether to add a lightweight metadata-block companion (e.g. `# === LOOP_CONTRACT ===`) for self-declaring loop definitions inside modules.
- Exact thresholds and hand-off protocols for when a closed loop should escalate to human or open exploratory mode.
