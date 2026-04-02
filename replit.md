# a0p — Autonomous AI Agent Platform

## Overview
a0p is a mobile-first autonomous AI agent platform. One agent `a0(zeta fun alpha echo)` (ZFAE) owns one PCNA instance; LLMs (Gemini, Claude, Grok) are "energy providers" not agents; sub-agents `a0(zeta{n})` fork PCNA and merge back. The Python/FastAPI backend declares `UI_META` + `DATA_SCHEMA` per route module; Guardian assembles them into `GET /api/v1/ui/structure`; the frontend is a generic renderer.

## User Preferences
- Clear and concise explanations.
- Iterative development and continuous feedback.
- Confirmation before significant codebase or external system changes.
- Detailed logging and transparency into the agent's decision-making process.
- Control over AI model selection and custom tool definitions.
- Feature toggles and tunable parameters.
- Mobile-first UI with dark mode by default.
- Full token accounting with per-model, per-stage, per-conversation cost tracking.
- All AI model conversations logged verbatim.
- Data export (transcripts, conversations, credentials list, system config).

## System Architecture

### Runtime
- **Python/FastAPI backend** on port 8000 — `python/` directory (primary)
- **Vite dev server** on port 5000 — proxies `/api` to port 8000
- Both start via `scripts/start-dev.sh` through the "Start application" workflow

### Python Backend (`python/`)
- `python/main.py` — FastAPI app, mounts all routers, `/api/v1/ui/structure`, heartbeat lifespan
- `python/database.py` — Async SQLAlchemy (asyncpg), sync engine for migrations
- `python/models.py` — SQLAlchemy ORM models for all tables
- `python/pcna.py` — PCNA engine (53-node ring topology)
- `python/logger.py` — JSONL append logger
- `python/agents/zfae.py` — ZFAE agent definition, compose_name(), sub_agent_name()
- `python/services/energy_registry.py` — LLM provider registry (Gemini, Claude, Grok)
- `python/services/heartbeat.py` — Background heartbeat service (30s tick)
- `python/services/bandit.py` — Multi-Armed Bandit (UCB1) service
- `python/services/edcm.py` — EDCM behavioral directives scoring
- `python/services/research.py` — Autonomous research (GitHub, AI social search)
- `python/services/agent_lifecycle.py` — Sub-agent spawn/merge lifecycle
- `python/services/zeta_observe.py` — ZFAE observation service
- `python/storage/core.py` — Core CRUD storage (raw SQL via asyncpg)
- `python/storage/domain.py` — Domain-specific storage (heartbeat, memory, PCNA, bandits)

### Route Modules (`python/routes/`)
Each declares `UI_META` (tab config for frontend) + `DATA_SCHEMA` (field specs).
- `chat.py` — Conversations and messages
- `agents.py` — Agent listing, sub-agent spawn/merge
- `memory.py` — Memory seeds, projections, tensor snapshots
- `edcm.py` — EDCM metrics and snapshots
- `bandits.py` — Bandit arms and rewards
- `system.py` — System toggles, events, cost metrics
- `tools.py` — Custom tools CRUD
- `heartbeat_api.py` — Heartbeat tasks and logs
- `pcna_api.py` — PCNA state and propagation

### Frontend (`client/`)
React + Vite + TypeScript, Tailwind CSS, shadcn/ui components.
- `client/src/pages/console.tsx` — Layout shell
- `client/src/components/tabs/` — Tab components
- `client/src/lib/console-config.ts` — Shared types and tab config

### Database
PostgreSQL via SQLAlchemy (Python) and Drizzle ORM (schema management).
- `shared/schema.ts` — Drizzle schema (source of truth for `db:push`)
- `drizzle.config.ts` — Drizzle Kit configuration

### Legacy (kept for reference)
- `server/` — Old Express/Node.js backend (not started in dev mode)
- `script/build.ts` — Old production build script

## Agent Architecture

### ZFAE Agent
- Full name: `a0(zeta fun alpha echo) {EnergyProvider}`
- One PCNA instance per agent
- Sub-agents: `a0(zeta{n}) {Provider}` — fork PCNA, execute, merge back
- Deprecated names (alfa/beta/gamma) cleaned on boot

### Energy Providers
LLMs are energy sources, not agents. Managed by `energy_registry.py`:
- **grok** — xAI Grok-3 Mini (default)
- **gemini** — Google Gemini 2.5 Flash
- **claude** — Anthropic Claude

### PCNA Engine
53-node circular topology with 4 rings: Phi, Psi, Omega, Guardian.
Each ring has coherence tracking and propagation.

### Key Concepts
- **UI_META + DATA_SCHEMA**: Every route module declares both; `collect_ui_meta()` aggregates; `/api/v1/ui/structure` serves; frontend has zero hardcoded tabs
- **Heartbeat**: 30s tick, runs scheduled tasks (audit, snapshot, propagate, research)
- **Bandits**: UCB1 + EMA decay across tool, model, routing domains
- **EDCM**: Behavioral directive scoring (CM, DA, DRIFT, DVG, INT, TBF)
- **Sub-agent lifecycle**: fork() at spawn → absorb() on completion → retired

## External Dependencies
- **AI**: Gemini 2.5 Flash (Replit integration), Grok-3 Mini (XAI_API_KEY), Claude (Anthropic)
- **Google**: Gmail, Google Drive (Replit connectors)
- **GitHub**: Repository ops, Codespace management (Replit connector + GITHUB_PAT)
- **Auth**: Replit Auth (OpenID Connect)
- **Payments**: Stripe (sandbox, Replit integration)
- **Database**: PostgreSQL (Replit managed)

## Hard Rules
- No file over 400 lines
- No stubs or TODOs in production code
- Python-only backend (no Express routes in active use)
