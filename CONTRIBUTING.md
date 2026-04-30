# Contributing to a0

Thank you for considering helping with a0.

## What help is wanted

Useful contributions include:

1. clarifying architecture and setup docs;
2. improving local development reliability;
3. implementing provider routing and AIMMH integration points;
4. adding tests and evaluation harnesses;
5. improving safe tool execution boundaries;
6. documenting memory, context, and agent behavior;
7. improving the public website and contributor onboarding.

## First steps

1. Read `README.md` — including the "Project name: `a0` vs `a0p`" and "Access model" sections so you know what is open versus owner-only in the deployed instance (`a0p`).
2. Read `docs/help-wanted.md`.
3. Pick a small issue labeled `good first issue` or `help wanted`.
4. If no issue fits, open a question issue before doing large work.

## How access works for contributors

> Naming reminder: `a0` is this project / repository; `a0p` is the deployed instance of `a0` running publicly. See "Project name: `a0` vs `a0p`" in `README.md`.

The deployed instance (`a0p`) is open to read and use; donations do not unlock anything. You will not hit a paywall by signing up. However, a small set of write endpoints are owner-only because they mutate shared research-instrument state (agent state, learning state, system configuration). The full posture is described in `README.md` under "Access model" and the contract lives in `python/services/gating.py`.

Contribution work — code, docs, tests, evaluation harnesses, AIMMH integration, website — does not require any in-app tier. If a task you want to take on appears to require hitting an owner-gated endpoint, open an issue describing the scope before starting; we may be able to either scope it differently or arrange a local development setup.

## Working norms

- Prefer small pull requests over large rewrites.
- Explain intent, tradeoffs, and testing.
- Do not commit secrets, tokens, private keys, or credentials.
- Mark uncertainty instead of presenting guesses as facts.
- Keep implementation claims grounded in visible code, docs, or linked sources.

## Issue quality

A good issue includes:

- what you are trying to do;
- what you expected;
- what happened instead;
- steps to reproduce;
- relevant logs or screenshots;
- proposed direction, if any.

## Pull request checklist

Before opening a PR:

- [ ] The change is scoped and understandable.
- [ ] Docs were updated if behavior changed.
- [ ] Tests were added or the manual test path is described.
- [ ] No secrets or private data are included.
- [ ] The PR explains whether it affects a0, AIMMH, or both.
