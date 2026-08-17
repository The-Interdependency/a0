# a0p — a research instrument

**a0p is a research instrument, not a product.** It is the deployed instance of `a0` (this codebase) running publicly at [replit.interdependentway.org](https://replit.interdependentway.org). It explores agent / energy-provider / PCNA dynamics in the open. Anyone may read and use it. Code-altering access is restricted to the owner and a small set of explicitly-invited collaborators. The instrument is funded by donations; it does not solicit subscribers.

> **Naming:** `a0` = the project / runtime / repository (used in contributor-facing material). `a0p` = the deployed instance of `a0` (used in user-facing UI copy and billing). The thing you build is `a0`; the thing that runs is `a0p`.

---

## The Agent

ZFAE (`a0(zeta fun alpha echo)`) is the single persistent agent running on the instrument. Large language models (GPT-5 mini, Gemini 2.5 Flash, Claude Sonnet 4.5, Grok 4 Fast) are treated as **energy providers** — they supply computational energy for each response but are not the agent itself.

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

- **Reading and using the app is free for everyone.** Every tab is open. There is no paywall and donations do not unlock anything.
- **Operator tier** — `@interdependentway.org` accounts are auto-promoted to `ws` on login.
- **Owner-only ("admin") write endpoints** govern actions that mutate shared instrument state: agent state, learning state, system configuration, and module toggles. Per-user CRUD on your own data is not admin-gated. The static contract lives in `python/tests/contracts/gating.py`.

Contributors will only encounter a 403 if they invoke an instrument-mutation endpoint directly against the deployed instance, which is not part of the documented contribution path. If your work requires an owner-gated endpoint, open an issue first.

---

## Funding

a0p runs on donations. There is no subscription tier and no perk unlocked by donating.

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

To donate, visit [a0p/pricing](https://replit.interdependentway.org/pricing). Minimum $5.

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
