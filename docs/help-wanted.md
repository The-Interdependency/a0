# Help Wanted: a0 + AIMMH implementation

We are looking for collaborators who want to help build practical open-source agent infrastructure.

## What a0 needs

### 1. Architecture clarification

Help map the current repository into clear components:

- frontend / website
- backend runtime
- model/provider layer
- tool execution layer
- memory/context layer
- deployment path

Deliverable: update `docs/architecture.md` with diagrams, entry points, and unresolved questions.

### 2. AIMMH integration design

Clarify how a0 should connect to AIMMH, the AI Multimodel Multimodal Hub.

Questions:

- Is AIMMH the provider router for a0?
- What API boundary should a0 call?
- How should model capabilities be represented?
- How should failures, fallbacks, and cost controls work?

### 3. Local development setup

Make it easy for a new contributor to run the project locally.

Deliverables:

- documented prerequisites;
- one-command setup if possible;
- known-good Node/Python versions;
- troubleshooting notes.

### 4. Agent runtime and tool safety

Help define and implement reliable tool execution:

- input/output schemas;
- permission boundaries;
- logging;
- dry-run mode;
- audit trail;
- safe failure behavior.

### 5. Evaluation and regression testing

Create tests that show whether a0 is improving or regressing.

Useful areas:

- provider routing correctness;
- tool-call reliability;
- instruction-following regressions;
- memory/context behavior;
- website build/deploy checks.

## Skills that are especially useful

- Python
- TypeScript / React
- Node.js
- LLM APIs
- LangGraph, OpenAI Agents SDK, LiteLLM, AutoGen, CrewAI, or similar systems
- GitHub Actions
- Docker / deployment
- docs and diagrams

## How to start

1. Comment on a `help wanted` issue.
2. Ask what scope would be useful.
3. Open a small PR.
4. Keep uncertainty visible.

Large rewrites are discouraged until the current architecture is documented.

## A note on access

The deployed instance (`a0p`, the public-facing deployment of `a0`) is free to use. Donations support the project but do not unlock anything. A small set of write endpoints are owner-only because they mutate shared research-instrument state — see "Access model" in `README.md` and `python/services/gating.py`. None of the contribution areas above require hitting an owner-gated endpoint; if a task you propose appears to, flag that on the issue so we can scope it.
