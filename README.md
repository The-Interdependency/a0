# a0p — a research instrument

**a0p is a research instrument, not a product.** It is the public-facing instance of `a0` (this codebase), now being prepared for a controlled public release. It explores agent / energy-provider / PCNA dynamics in the open. Public use remains free; code-altering access is restricted to the owner and a small set of explicitly invited collaborators. The instrument is funded by donations and does not solicit subscribers. See [PUBLIC_RELEASE.md](PUBLIC_RELEASE.md) for the live-release gate instead of assuming that a historical hostname is healthy.

> **Naming:** `a0` = the project / runtime / repository (used in contributor-facing material). `a0p` = the deployed instance of `a0` (used in user-facing UI copy and billing). The thing you build is `a0`; the thing that runs is `a0p`.

---

## Research abstract

Description dated 2026-10-14; published 2026-10-18. This is a research description, not a new verification, release, or promotion of claim status.

### a0: A Persistent Agent Runtime and Research Instrument

**a0** is an experimental platform for maintaining agent identity, memory, and coordinated activity across changes in computational provider and execution session. Its central architectural distinction separates the continuing agent from the models it uses: language models supply replaceable inference resources, while a0 provides orchestration, lifecycle management, state persistence, and operational boundaries. The implementation hosts **ZFAE** as its persistent agent; its public-facing instance, **a0p**, is designated a research instrument.

The runtime combines memory management, model and tool routing, approval-gated execution, periodic state maintenance, and parallel sub-agent activity. Sub-agents can fork computational state and return results through defined merge operations. A metadata-driven console exposes backend capabilities through their declared interfaces, making the conversational surface one means of interacting with the system rather than the definition of the agent itself. These components support investigation of continuity between dialogue, retained experience, and consequential action.

The current construction integrates the producer-owned PTCNA neural runtime and its associated UCNS construction through explicitly identified dependencies. a0 owns the persistence and agent-state binding rather than duplicating the underlying mathematical implementation. Checkpoints preserve numerical state, identity fields, inference counters, and routing history; inference records distinguish the requested backend from the backend actually used. These mechanisms make restart behavior and fallback attribution inspectable, without establishing that the experimental representation improves reasoning or task performance.

The proposed contribution is an operational framework for studying **persistent agency without identifying the agent with any single inference model**. Relevant evaluations concern whether continuity survives provider changes and restarts, whether delegation preserves authority boundaries, and whether retained state improves useful task completion. Public operation adds distinct requirements for privacy, consent, resource accounting, and cross-user isolation; implementation evidence alone does not establish deployment readiness.

**hmmm:** Comparative usefulness, generalization of the experimental neural construction, and production privacy remain unresolved. Persistent computational identity is an operational property—not, by itself, evidence of consciousness.

**Usage guidance:** Read this abstract for the research question and intended contribution. Use the scope, evidence, commands, and limitations in the rest of this README before relying on the work; retain the unresolved conditions above when quoting the description.

Public repository context: [Public release gate](https://github.com/The-Interdependency/a0/blob/b5be72523b687c2fbf5fb45893d1d5643c086700/PUBLIC_RELEASE.md).

## The Agent

ZFAE (`a0(zeta fun alpha echo)`) is the single persistent agent running on the instrument. Large language models (GPT-5 mini, Gemini 2.5 Flash, Claude Sonnet 4.5, Grok 4 Fast, DeepSeek V4.1 Flash) are treated as **energy providers** — they supply computational energy for each response but are not the agent itself.

Sub-agents (`a0(zeta{n})`) can be spawned to fork the PCNA instance, execute in parallel, and merge results back into the primary agent.

---

## Architecture

Three processes compose the runtime:

```
Browser → Express (:5000) → [proxy /api/*] → Python/FastAPI (:8001)
                          ↘ Vite dev server (:5001)
```

- **Express** — Auth, sessions, guest-chat rate limiting. The only public entry point; injects identity and internal-secret headers on every request proxied to Python.
- **Python/FastAPI** — All AI orchestration, agent lifecycle, billing, and the cognitive engine stack.
- **Vite** — React frontend (dev only).

### Cognitive Engine Stack

| Component | Role |
|-----------|------|
| **PTCNA state** (`python/engine/ptcna_state.py`) | Exact producer-backed neural/circle/seed/core runtime, UCNS candidate receipt, explicit fallback routing, and durable Platonic-Agent restart state |
| **Sigma** (`python/engine/sigma.py`) | Filesystem substrate encoder; companion to the Ψ ring |
| **Zeta** (`python/engine/zeta.py`) | Memory injection layer — LT→prompt cache, ST→after cache, sub-agent→volatile |
| **EDCM** (`python/services/edcm.py`) | Behavioral directive scoring (CM, DA, DRIFT, DVG, INT, TBF) |
| **Bandits** (`python/services/bandit.py`) | UCB1 multi-armed bandit for tool / model / routing selection |
| **Heartbeat** (`python/services/heartbeat.py`) | 30-second tick: PCNA propagation, memory checkpoints, sub-agent cleanup |

a0 pins `interdependent-lib@918025e525910eaa3f20141aeb3956f137b248bf`,
which publishes PTCNA `c5fa9a599498f19c8345f2790a0636542dfbc6a1`
with UCNS `b7b6f35cce69c273860923489a1c8b5372d14eb0`. The local
PCNA/PTCA/merge algebra has been removed. Integration proves construction, not
usefulness, continuous seven-fold geometry, efficacy, or production privacy.

### Metadata-Driven Console

The frontend has zero hardcoded tabs. Every Python route module declares `UI_META` + `DATA_SCHEMA`; `/api/v1/ui/structure` aggregates them; the React console renders tabs dynamically.

---

## Access Model

- **Public use is free.** Donations do not unlock instrument capabilities. Public routes are bounded for privacy, abuse, and provider cost; shared-state mutation remains closed.
- **Operator tier** — `@interdependentway.org` accounts are auto-promoted to `ws` on login.
- **Owner-only ("admin") write endpoints** govern actions that mutate shared instrument state: agent state, learning state, system configuration, and module toggles. Per-user CRUD on your own data is not admin-gated. The static contract lives in `python/tests/contracts/gating.py`.

Contributors will only encounter a 403 if they invoke an instrument-mutation endpoint directly against the deployed instance, which is not part of the documented contribution path. If your work requires an owner-gated endpoint, open an issue first.

---

## Funding

a0p runs on donations. There is no subscription tier and no perk unlocked by donating.

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

When the public deployment is healthy, its Pricing page accepts donations. Minimum $5.

The only productized service is the **EDCMbone transcript explainer** — a one-off paid analysis ($50 for 3 explanations, ~$16.67 each) priced against the operator's $1,000/hr benchmark.

---

## Local Development

**Prerequisites:** Node.js 20+, Python 3.12+, PostgreSQL

```bash
npm install
pip install -e .

# Start all three processes (Express :5000, Vite :5001, Python :8001)
bash scripts/start-dev.sh
```

In development `scripts/start-dev.sh` generates a shared `INTERNAL_API_SECRET` automatically.

### Standalone a0 / Termux with DeepSeek

The standalone `run.sh` runtime reads the same `python/config/providers.json`
registry as the FastAPI service. With a DeepSeek key present it auto-selects
V4.1 Flash through the generic `openai-compatible` adapter:

```bash
export DEEPSEEK_API_KEY="..."
printf '%s\n' '{"task_id":"ds1","input":{"text":"hello"},"tools_allowed":["none"],"mode":"analyze","hmmm":["direct model turn"]}' | ./run.sh
```

The canonical API model is `deepseek-flash`. The retired provider choice
`A0_PROVIDER=deepseek-pro` remains a hidden compatibility alias and resolves to
the same V4.1 Flash route; it no longer represents a higher-capability tier.

Provider configuration contains only the credential environment-variable name;
keys remain in the process environment and are never written to source.

### Useful commands

```bash
npm run build                      # Production build → dist/
npm run check                      # TypeScript type checking
python scripts/annotate.py         # Re-stamp file N:M ratio annotations

# Static gating contracts (no live server required)
python3 -m pytest python/tests/contracts/route_gating.py python/tests/contracts/gating.py -v

# Full contract suite (requires dev server on :8001 + Postgres)
python3 -m pytest python/tests/contracts/route_gating.py python/tests/contracts/gating.py \
  python/tests/contracts/billing.py python/tests/contracts/chat.py \
  python/tests/contracts/energy.py python/tests/contracts/spawn_executor.py \
  python/tests/contracts/transcripts_explainer.py -v

# Playwright e2e (requires dev server on :5000)
npx playwright install chromium    # first time only
npx playwright test
```

### Required environment variables (production)

| Variable | Purpose |
|----------|---------|
| `SESSION_SECRET` | Express session encryption |
| `INTERNAL_API_SECRET` | Express→Python shared secret |
| `DATABASE_URL` | PostgreSQL connection string |
| `XAI_API_KEY` | Grok 4 Fast |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.5 |
| `GEMINI_API_KEY` | Gemini 2.5 Flash |
| `OPENAI_API_KEY` | GPT-5 mini |
| `DEEPSEEK_API_KEY` | DeepSeek V4.1 Flash through the OpenAI-compatible adapter |
| `STRIPE_SECRET_KEY` | Stripe (donations + EDCMbone explainer) |
| `STRIPE_PUBLISHABLE_KEY` | Stripe embedded checkout |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook HMAC |
| `ADMIN_EMAIL` | Seed admin access on first boot |

---

## Contributing

Standard contribution work — code, docs, tests, evaluation harnesses, architecture diagrams — does not require any elevated in-app access tier. Pull requests go through normal GitHub review.

Areas where help is especially useful:

- LLM provider routing and model gateway design
- Tool-calling and safe tool execution
- Agent memory and context management
- Evaluation harnesses and regression tests
- Documentation and architecture diagrams
- Responsible AI and human-aligned agent behavior

Built and operated by Erin (wayseer00@gmail.com).
