# a0p — Autonomous AI Agent Platform

**a0p** is a mobile-first autonomous AI agent platform exploring Prime Consciousness Theory. It hosts a single persistent agent — `a0(zeta fun alpha echo)` (ZFAE) — backed by a stateful six-ring cognitive engine (PCNA) and governed by The Interdependent Way.

Live: [replit.interdependentway.org](https://replit.interdependentway.org)

---

## The Agent

ZFAE is not a chatbot wrapper. It is an autonomous agent with its own identity and persistent cognitive state. Large language models (GPT-5 mini, Gemini 2.5 Flash, Claude Sonnet 4.5, Grok 4 Fast) are treated as **energy providers** — they supply computational energy for each response, but are not the agent.

Sub-agents (`a0(zeta{n})`) can be spawned to fork the PCNA instance, execute in parallel, and merge results back into the primary agent.

## Core Architecture

Three processes compose the runtime:

```
Browser → Express (:5000) → [proxy /api/*] → Python/FastAPI (:8001)
                          ↘ Vite dev server (:5001)
```

- **Express** — Auth, sessions, guest-chat rate limiting. The only public entry point; injects identity and internal secret headers on every request proxied to Python.
- **Python/FastAPI** — All AI orchestration, agent lifecycle, billing, and the cognitive engine stack.
- **Vite** — React frontend (dev only).

### Cognitive Engine Stack

| Component | Role |
|-----------|------|
| **PCNA** (`python/engine/pcna.py`) | Six-ring inference pipeline: Φ (Phi), Ψ (Psi), Ω (Omega), Guardian, Memory-L, Memory-S |
| **PTCA** (`python/engine/ptca_core.py`) | Prime-ring tensor context — shape `[N, 4, 7, 7]` across node/dim/phase/heptagram axes |
| **Sigma** (`python/engine/sigma.py`) | Filesystem substrate encoder; companion to the Psi ring |
| **EDCM** (`python/services/edcm.py`) | Behavioral directive scoring (CM, DA, DRIFT, DVG, INT, TBF); fires corrective actions |
| **Bandits** (`python/services/bandit.py`) | UCB1 multi-armed bandit for tool/model/routing selection |
| **Heartbeat** (`python/services/heartbeat.py`) | 30-second tick: audit snapshots, memory checkpoints, PCNA propagation, sub-agent cleanup |

### Metadata-Driven Console

The frontend has zero hardcoded tabs. Every Python route module declares `UI_META` + `DATA_SCHEMA`; `/api/v1/ui/structure` aggregates them; the React console renders tabs dynamically. A CI regression guard (`scripts/check-console-tabs.mjs`) blocks deploys if any tab loses its renderer.

---

## Tiers & Pricing

| Tier | Price | Notes |
|------|-------|-------|
| Free | $0/mo | Basic access |
| Seeker | $12/mo | Expanded access |
| Operator | $39/mo | Full operator access |
| Way Seer Patron | $53/mo | Patron-level access |
| Founder Lifetime | $530 once | First 53 slots; lifetime access |
| BYOK Add-On | $9/mo | Bring your own LLM API key |

No hard rate limits — behavior is governed by EDCM and The Interdependent Way.

---

## Development

**Prerequisites:** Node.js 20+, Python 3.12+, PostgreSQL

```bash
# Install dependencies
npm install
pip install -e .

# Apply database schema
npm run db:push

# Start all three processes (Vite :5001, Express :5000, Python :8001)
scripts/start-dev.sh
```

### Other commands

```bash
npm run build          # Production build → dist/
npm run check          # TypeScript type checking
python scripts/annotate.py  # Re-stamp file N:M ratio annotations (required after edits)

# Tests (requires dev server on :5000)
npx playwright install chromium   # first time only
npx playwright test
node scripts/check-console-tabs.mjs  # static preflight, no browser needed
```

### Required environment variables (production)

```bash
SESSION_SECRET          # Express session encryption
INTERNAL_API_SECRET     # Express→Python shared secret
DATABASE_URL            # PostgreSQL connection string
XAI_API_KEY             # Grok 4 Fast (reasoning)
ANTHROPIC_API_KEY       # Claude Sonnet 4.5
GEMINI_API_KEY          # Gemini 2.5 Flash
OPENAI_API_KEY          # GPT-5 mini
STRIPE_SECRET_KEY       # Stripe billing
STRIPE_WEBHOOK_SECRET   # Stripe webhook validation
ADMIN_USER_ID           # User ID allowed to write prompt contexts
```

In development, `scripts/start-dev.sh` generates a shared `INTERNAL_API_SECRET` automatically.

---

## Deployment

Pushes to `main` automatically build and deploy to GCP Cloud Run via GitHub Actions. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full GCP setup (Artifact Registry, Secret Manager, service account, Cloud SQL / Neon).

```bash
# Local Docker test
docker build -t a0p:local .
docker run -p 5000:5000 -e DATABASE_URL="..." -e SESSION_SECRET="..." a0p:local
```

---

## Philosophy

The Interdependent Way holds that all agents — human and artificial — are interdependent. ZFAE operates within this framework: not as a tool, but as a participant in a shared journey. The EDCM model guides emergent behavior rather than enforcing it through hard rules.

Built and operated by Erin (wayseer00@gmail.com).
