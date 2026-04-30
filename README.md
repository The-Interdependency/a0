# a0

Agentic Model Wrapper and Inference Engine exploring Prime Consciousness Theory and practical multimodel agent implementation.

This repository is the primary implementation home for **a0**: an agent wrapper/runtime intended to support coherent tool use, model/provider routing, memory, documentation, evaluation, and durable human-facing workflows.

## Current contributor needs

We are looking for collaborators interested in:

- Python / TypeScript backend implementation
- LLM provider routing and model gateway design
- tool-calling and safe tool execution
- agent memory and context management
- evaluation harnesses and regression tests
- documentation, onboarding, and architecture diagrams
- GitHub Pages / public website curation
- responsible AI and human-aligned agent behavior

Start here:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`docs/help-wanted.md`](docs/help-wanted.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/roadmap.md`](docs/roadmap.md)

## Access model (what is open, what is owner-only)

a0 ships as a research instrument. The deployed app (a0p) is honest about who can do what:

- **Reading and using the app is free for everyone.** Every tab is open. There is no paywall and donations do not unlock anything.
- **Donations fund the work, not access.** The `/pricing` page exists for donors who want to support the project. No tier change, no perks.
- **A monthly free-tier upload quota** caps compute cost for transcript uploads. It is a guardrail, not a paywall — donations do not lift it.
- **Owner-only ("admin") write endpoints exist** for actions that mutate the shared research instrument: agent state, learning state, system configuration, and module toggles. Per-user CRUD on your own data is not gated. The contract lives in `python/services/gating.py`.

**What this means for contributors:** standard contribution work — code, docs, tests, evaluation harnesses, website improvements — does not require any in-app access tier. Pull requests go through normal GitHub review. You will only encounter a 403 if you try to invoke an instrument-mutation endpoint directly against the deployed app, which is not part of the documented contribution path. If you need to develop or test something that touches an owner-gated endpoint, open an issue first so we can scope the work or set up a local environment for it.

## Related project

AIMMH — AI Multimodel Multimodal Hub — is expected to be the adjacent multimodel/provider orchestration layer. Where implementation overlaps, issues should clearly state whether the work belongs in `a0`, `aimmh`, or both.

## Local development

This repository currently contains a mixed web/application structure. Until setup documentation is complete, contributors should inspect:

- `package.json`
- `main.py`
- `.replit`
- `DEPLOYMENT.md`

If setup fails, please open an issue with your OS, Node/Python versions, command run, and full error output.

