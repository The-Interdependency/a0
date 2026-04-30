# a0 Architecture

This document is a living map of the a0 implementation. It is intentionally practical: identify what exists, what is intended, and what remains unresolved.

## Purpose

a0 is an agentic model wrapper and inference engine. Its implementation should support:

- coherent agent behavior;
- multimodel/provider routing;
- tool execution;
- memory and context management;
- auditable actions;
- website/docs publication;
- evaluation of regressions and improvements.

## Working component map

```text
human request
  -> a0 agent interface
  -> context / memory layer
  -> planner / policy layer
  -> provider routing layer
  -> model call(s)
  -> tool execution layer, when needed
  -> audit/logging layer
  -> response / artifact / repository update
```

## Repository areas to inspect

- `client/` — likely frontend application area.
- `server/` — likely backend/runtime area if present in current tree.
- `shared/` — likely shared types/schema area if present in current tree.
- `main.py` — Python entry point currently present.
- `package.json` — Node/TypeScript dependencies and scripts.
- `.replit` — hosted development/runtime configuration.
- `DEPLOYMENT.md` — deployment notes.
- `interdependent_way.md` — philosophical/source doctrine for project behavior and voice.

## Where things live

A short implementation map for the working component layers in this repo:

- `a0 agent interface` → `client/` for the browser UI, `server/` for the Express proxy, and `python/routes/` for backend API endpoints.
- `context / memory layer` → `python/engine/pcna.py` (PCNA engine and memory inference), with persisted state modeled in `python/models.py` and `python/storage/domain.py`.
- `planner / policy layer` → `python/services/inference.py` for orchestration and `python/config/policy_loader.py` for policy config.
- `provider routing layer` → `python/services/energy_registry.py` and `python/services/providers/` (including `python/services/providers/_resolver.py`).
- `model call(s)` → `python/services/inference.py` plus provider implementations under `python/services/providers/`.
- `tool execution layer` → `python/services/tool_executor.py` and tool handlers in `python/services/tools/`.
- `audit / logging layer` → `python/logger.py` for log streams and audit plumbing in services such as `python/services/spawn_executor.py`.
- `gating / access control` → `python/services/gating.py` (with explicit allowlist rules in `python/services/gating_allowlist.py`).
- `agent runtime` → `python/main.py` for FastAPI startup, PCNA lifecycle, and route registration.

## AIMMH boundary

AIMMH is expected to provide, or eventually provide, the multimodel/multimodal hub layer. The clean boundary still needs confirmation.

Open questions:

1. Should a0 call AIMMH through HTTP, package import, or shared deployment?
2. What request/response schema should represent model calls?
3. How should capabilities be declared: text, vision, audio, tool use, long context, cost, latency?
4. How should routing decisions be logged and audited?
5. What fallback behavior is acceptable when a provider fails?
6. What user approval scopes are required before tool execution?

## Safety and audit requirements

Implementation should prefer:

- explicit schemas;
- permission checks before side effects;
- dry-run support for risky actions;
- durable logs for tool calls and repository changes;
- clear distinction between verified facts, inference, and uncertainty.

## Next documentation tasks

- Identify actual runtime entry points.
- Document local setup from a fresh clone.
- Add a deployment diagram.
- Define the a0 ↔ AIMMH API boundary.
- Add evaluation and test strategy.
