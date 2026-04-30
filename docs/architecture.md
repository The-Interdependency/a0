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

## AIMMH boundary

AIMMH is expected to provide, or eventually provide, the multimodel/multimodal hub layer. The clean boundary still needs confirmation.

Open questions:

1. Should a0 call AIMMH through HTTP, package import, or shared deployment?
2. What request/response schema should represent model calls?
3. How should capabilities be declared: text, vision, audio, tool use, long context, cost, latency?
4. How should routing decisions be logged and audited?
5. What fallback behavior is acceptable when a provider fails?
6. What user approval scopes are required before tool execution?

## Access and gating layer

The deployed app uses a simple two-tier model defined in `python/services/gating.py`:

- **Open access** — every UI tab, every read endpoint, and per-user CRUD on the caller's own data. No paywall, no donation gate.
- **Owner-only writes** — endpoints that mutate shared research-instrument state (agent state, learning state, system configuration, module toggles) require the caller's `x-user-role` header to be `admin`. The contract is enforced by `python/tests/contracts/gating.py` against an explicit allowlist in `python/services/gating_allowlist.py`.

Donations (`/pricing`) are pure support and do not change tier or unlock endpoints. The grandfathered "supporter" label exists only for legacy Stripe subscriptions that pre-date the donation reframe.

This posture is described for new contributors in `README.md` ("Access model") and `CONTRIBUTING.md` ("How access works for contributors").

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
