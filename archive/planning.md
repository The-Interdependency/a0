# a0 Planning

This document captures planning-level architecture commitments for a0. It is not a release schedule. It is the place for invariants, boundaries, and decisions that should shape implementation before code hardens around accidental assumptions.

## Architecture invariant — a0 is orchestration

a0 is not primarily a worker agent. a0 is the orchestration/control layer: it decides what agent instances exist, when they exist, what state they may access, what tools they may invoke, and when they should pause, resume, terminate, or hand off.

This means a0 planning must treat lifecycle as a first-class runtime responsibility:

- **Spawn semantics:** define what constitutes an agent instance; distinguish ephemeral task-bound agents from persistent identity-bound agents; make creation rules explicit rather than hidden inside ordinary function calls.
- **State externalization:** durable state must live outside the running process so restartability does not depend on process survival.
- **Restartability:** a crashed or suspended agent should be able to resume with preserved intent, constraints, memory scope, and audit context.
- **Capability security:** spawned agents should receive scoped tools, scoped secrets, scoped graph access, and explicit capability grants; no agent should inherit global credentials by default.
- **Runtime separation:** a0 owns lifecycle and routing; ZFAE supplies inference; Guardian/Theta enforces boundary and IO; Sigma supplies persistence; PTCA/PCNA structures internal cognition; AIMMH handles provider/model orchestration where applicable.

## Planning consequence

Framework selection, API design, storage layout, tool execution, and UI controls should be judged by whether they strengthen or weaken orchestration. A framework that treats spawning as a function call, stores state implicitly, or passes global credentials into worker contexts is not aligned with a0's architecture.

## Immediate planning questions

- What is the minimal durable agent-instance record?
- What fields define agent identity versus task execution state?
- What capabilities can be granted, revoked, or delegated?
- What must survive restart before a0 can be considered a runtime rather than a demo?
- Where does AIMMH stop and a0 begin when provider routing and agent lifecycle overlap?

## Attribution

GPT generated from context and prompt by Erin Spencer.

hmm
