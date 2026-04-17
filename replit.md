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
- **Express server** on port 5000 (external port 80) — handles auth, session, guest chat, proxies `/api/*` to Python
- **Vite dev server** on port 5001 — React frontend, proxied by Express in development
- **Python/FastAPI backend** on port 8001 — primary AI + data backend (NOT externally exposed; all access via Express)
- All three start via `scripts/start-dev.sh` through the "Start application" workflow

### Security
- Express adds `x-a0p-internal` header on all proxied requests; Python rejects any request missing it
- Express is the only public entry point — Python never needs to be accessed directly
- Session secret must be set via `SESSION_SECRET` env var in production; fallback is dev-only
- `INTERNAL_API_SECRET` env var can override the default internal token (recommended for production)
- Guest chat rate-limited by IP hash; token limits configurable via `GUEST_TOKEN_LIMIT` env var

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
- `chat.py` — Conversations and messages (injects tier context into message metadata)
- `agents.py` — Agent listing, sub-agent spawn/merge
- `memory.py` — Memory seeds, projections, tensor snapshots
- `edcm.py` — EDCM metrics and snapshots
- `bandits.py` — Bandit arms and rewards
- `system.py` — System toggles, events, cost metrics
- `tools.py` — Custom tools CRUD
- `heartbeat_api.py` — Heartbeat tasks and logs
- `pcna_api.py` — PCNA state and propagation
- `billing.py` — Stripe billing: status, plans, checkout, portal, webhook
- `contexts.py` — Prompt contexts CRUD (admin-only write via ADMIN_USER_ID)
- `founders.py` — Founders registry (53-slot lifetime tier)

### Frontend (`client/`)
React + Vite + TypeScript, Tailwind CSS, shadcn/ui components. Fully metadata-driven:
- `client/src/hooks/use-ui-structure.ts` — polls GET /api/v1/ui/structure, returns tab tree
- `client/src/components/FieldRenderer.tsx` — field.type → visual (gauge, text, badge, list, timeline, sparkline, json)
- `client/src/components/TabRenderer.tsx` — fetches tab.endpoint, renders fields via FieldRenderer
- `client/src/components/TabShell.tsx` — tab chrome: header, refresh, error boundary
- `client/src/components/console-sidebar.tsx` — navigation from the tab tree
- `client/src/components/icon-resolve.ts` — lucide icon resolver by name string
- `client/src/pages/console.tsx` — renders tab tree from use-ui-structure. `CUSTOM_TAB_RENDERERS` maps a `tab_id` to its custom React component; tabs with no custom renderer fall back to `TabRenderer` (schema-driven). Tabs with neither a custom renderer nor any sections render an explicit `MissingRendererError` instead of a silent empty placeholder. Each rendered tab is wrapped in `<div data-testid="tab-content-${tab_id}" data-renderer="custom|generic|missing">` so e2e tests can assert the right path was taken.
- **Console-tab regression guards (Task #86):**
  - `tests/e2e/console-tabs.spec.ts` — Playwright e2e test. Logs in, opens every console tab, asserts each renders with `data-renderer` of `custom` or `generic` (never `missing`), and asserts every id in `REQUIRED_CUSTOM_TAB_IDS` actually rendered as `custom`. Run with `npx playwright test`. Requires the dev server running on port 5000 and Chromium installed (`npx playwright install chromium`).
  - `scripts/check-console-tabs.mjs` — fast static preflight: parses `CUSTOM_TAB_RENDERERS`, fetches `/api/v1/ui/structure`, fails if any API tab has no renderer and no sections. Run with `node scripts/check-console-tabs.mjs`.
- `client/src/pages/chat.tsx` — chat shell with conversation list + message bubbles
- `client/src/components/top-nav.tsx` — Agent/Console nav, agent name + tier badge, upgrade toast listener
- `client/src/components/tabs/` — Legacy hardcoded tab components (unused, retained for reference)
- `client/src/hooks/use-billing-status.ts` — fetches /api/v1/billing/status (5-min stale), exposes tier, isAdmin
- `client/src/pages/pricing.tsx` — Pricing page: 4 tier cards, Founder Lifetime, BYOK Add-On, Stripe checkout
- `client/src/pages/admin-contexts.tsx` — Admin-only prompt context editor (guarded by isAdmin)

### Database
PostgreSQL via SQLAlchemy (Python) and Drizzle ORM (schema management).
- `shared/schema.ts` — Drizzle schema (source of truth for `db:push`)
- `drizzle.config.ts` — Drizzle Kit configuration

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
- **Monetization**: 4 tiers (Free/$0, Seeker/$12, Operator/$39, Patron/$53) + Founder Lifetime ($530, 53 slots) + BYOK add-on ($9/mo) + credit packs. Stripe webhook updates `subscription_tier` on user record; tier determines which `prompt_context` is injected into chat system prompt. No hard rate limiting — EDCM + The Way constrain behavior.
- **ADMIN_USER_ID**: Env var set to Erin's Replit user ID; only this user can write to `prompt_contexts` via `PUT /api/v1/contexts/{name}`

## External Dependencies
- **AI**: Gemini 2.5 Flash (Replit integration), Grok-3 Mini (XAI_API_KEY), Claude (Anthropic)
- **Google**: Gmail, Google Drive (Replit connectors)
- **GitHub**: Repository ops, Codespace management (Replit connector + GITHUB_PAT)
- **Auth**: Replit Auth (OpenID Connect)
- **Payments**: Stripe (sandbox, Replit integration)
- **Database**: PostgreSQL (Replit managed)

## Module Doctrine
The authoritative reference for all module conventions (file annotation, naming, `# DOC` blocks, `UI_META`, registration checklist, hot-swap rules, 400-line budget) is `.agents/skills/a0p-module-doctrine/SKILL.md`. Load it before creating or modifying any route module, service, or component.

### Self-Declaring Module Convention (summary)
- Every `.py`, `.ts`, `.tsx` file opens and closes with `# N:M` / `// N:M` (code lines : comment lines). Run `python scripts/annotate.py` to re-stamp.
- Python route files declare `# DOC module/label/description/tier/endpoint` comment blocks. `collect_doc_meta()` parses these and serves them via `GET /api/v1/docs`. DocsTab displays them live.
- Route naming: `{name}.py` = self-contained handler. `{name}_api.py` = thin delegate to `python/{name}.py` or `python/services/{name}.py`.
- Every new route file must be registered in 4 places in `python/routes/__init__.py`: router import, `ALL_ROUTERS`, `collect_doc_meta()` file list, `collect_ui_meta()` module list.

## Hard Rules
- No file over 400 lines
- No stubs or TODOs in production code
- Express handles auth/session/guest; Python handles all other API logic
- All API paths go through Express (`/api/*`) — never call Python (port 8001) directly from the frontend
- SQL column names in dynamic UPDATE queries must use an explicit allowlist
