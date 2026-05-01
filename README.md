# a0

Agentic Model Wrapper and Inference Engine exploring Prime Consciousness Theory and practical multimodel agent implementation.

This repository is the primary implementation home for **a0**: an agent wrapper/runtime intended to support coherent tool use, model/provider routing, memory, documentation, evaluation, and durable human-facing workflows.

## Project name: `a0` vs `a0p`

If you arrived here from the deployed app and saw a different name, here is the relationship:

- **`a0`** is the project — this repository, the runtime, the codebase, and everything you contribute to. Issues, PRs, docs, and roadmap are all under the name `a0`.
- **`a0p`** is the deployed instance of `a0` — the live, public-facing research instrument operated by the project owner. The user-visible app copy (titles, billing, pricing, splash) uses `a0p` to refer to that running instance.

In short: **`a0` is the thing you build; `a0p` is the thing that runs.** Anywhere you see `a0p` in user-facing UI, billing copy, or backend comments, it refers to the deployed instance of this same `a0` codebase. Contributor-facing material (README, CONTRIBUTING, `docs/`) refers to the project as `a0`.

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

`a0` ships as a research instrument. The deployed instance (`a0p`) is honest about who can do what:

- **Reading and using the app is free for everyone.** Every tab is open. There is no paywall and donations do not unlock anything.
- **Donations fund the work, not access.** The `/pricing` page exists for donors who want to support the project. No tier change, no perks.
- **A monthly free-tier upload quota** caps compute cost for transcript uploads. It is a guardrail, not a paywall — donations do not lift it.
- **Owner-only ("admin") write endpoints exist** for actions that mutate the shared research instrument: agent state, learning state, system configuration, and module toggles. Per-user CRUD on your own data is not gated. The contract lives in `python/services/gating.py`.

**What this means for contributors:** standard contribution work — code, docs, tests, evaluation harnesses, website improvements — does not require any in-app access tier. Pull requests go through normal GitHub review. You will only encounter a 403 if you try to invoke an instrument-mutation endpoint directly against the deployed instance (`a0p`), which is not part of the documented contribution path. If you need to develop or test something that touches an owner-gated endpoint, open an issue first so we can scope the work or set up a local environment for it.

## How to support the work

a0p runs on donations. There is no subscription tier and no perk unlocked by donating — it is pure support for the instrument. To donate, visit [a0p/pricing](https://a0p.replit.app/pricing).

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

The only productized service is the **EDCMbone transcript explainer** — a one-off paid analysis ($50 for 3 explanations, ~$16.67 each) priced against the operator's $1,000/hr benchmark.

## Related project

AIMMH — AI Multimodel Multimodal Hub — is expected to be the adjacent multimodel/provider orchestration layer. Where implementation overlaps, issues should clearly state whether the work belongs in `a0`, `aimmh`, or both.

## Local development

This repository currently contains a mixed web/application structure. Until setup documentation is complete, contributors should inspect:

- `package.json`
- `main.py`
- `.replit`
- `DEPLOYMENT.md`

If setup fails, please open an issue with your OS, Node/Python versions, command run, and full error output.

