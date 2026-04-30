# a0p — a research instrument

## Identity
**a0p is a research instrument, not a product.** It is the deployed instance of `a0` (this codebase / repository) running publicly. It explores agent / energy-provider / PCNA dynamics in the open. Anyone may read and use it. Code-altering access is restricted to the owner (Erin) and a small set of explicitly-invited collaborators. The instrument is funded by donations; it does not solicit subscribers.

> Naming: `a0` = the project / runtime / repository (used in `README.md`, `CONTRIBUTING.md`, `docs/`, GitHub). `a0p` = the deployed instance of `a0` (used in user-facing UI copy, billing, pricing, splash). See "Project name: `a0` vs `a0p`" in `README.md`.

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
- `python/services/energy_registry.py` — LLM provider registry (loads `python/config/providers.json`)
- `python/services/inference.py` — Dispatcher + orchestration (`_call_openai_routed` policy/role/gate); delegates outbound API calls to `providers/<name>.py`
- `python/services/providers/` — One file per provider (P3 of energy-model-task-overhaul):
  - `_resolver.py` — env > seed `route_config.model_assignments[role]` > spec model lookup; raises on unresolvable
  - `openai_provider.py` — OpenAI Responses API + tool loop
  - `grok_provider.py` — xAI Responses-with-search + Chat-Completions tool loop + SSE streaming
  - `gemini_provider.py` — google-genai SDK (thin wrapper over `gemini_native.py`)
  - `claude_provider.py` — Anthropic SDK + prompt caching
  - All four expose `async def call(messages, *, role, model_override, api_key, max_tokens, use_tools, reasoning_effort, ...) -> (text, usage)` and lazy-import shared helpers from inference.py to avoid circular imports
- `python/services/provider_seeds_bootstrap.py` — Lifespan-time idempotent seeding of `provider_<id>` WS modules from `providers.json` (preserves admin overrides)
- `python/services/heartbeat.py` — Background heartbeat service (30s tick)
- `python/services/bandit.py` — Multi-Armed Bandit (UCB1) service
- `python/services/edcm.py` — EDCM behavioral directives scoring
- `python/services/research.py` — Autonomous research (GitHub, AI social search)
- `python/services/agent_lifecycle.py` — Sub-agent PCNA fork/merge math
- `python/services/spawn_executor.py` — Background poller that picks up `agent_runs` rows written by `sub_agent_spawn` and actually executes them: atomic claim (UPDATE … FOR UPDATE SKIP LOCKED), per-row provider binding via `AgentInstance`, full PCNA fork→infer→absorb cycle (forks child PCNA from primary at claim, feeds task + model response into child.infer, snapshots before/after parent state, absorbs back via merge_sub_agent), result logged via `run_logger.emit` with rich `merge` event carrying phi/psi/omega/theta_circles deltas (flows into existing agent_logs → JSONL artifact pipeline). Crash isolation per row; orchestration_mode != 'single' raises NotImplementedError (no silent fallback). `_try_get_primary_pcna` returns explicit `(pcna, error)` tuple so a missing primary surfaces in logs instead of being silently skipped.
- `GET /api/v1/agents/learning_summary` — Aggregates the most recent `merge` events into cumulative phi/psi/omega/theta_circles delta sums + per-provider breakdown + live `primary_pcna_now` snapshot. This is the surface that lets you SEE alpha echo's compounded learning gain from spawned sub-agents. Defensive parsing skips malformed rows (counted, not fatal); primary snapshot failure surfaces as `primary_pcna_error` rather than null. Read-only SELECT over `agent_logs.event = 'merge'`; no schema change.
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
- `billing.py` — Stripe billing: status, donations, portal, webhook (donations-only — no recurring subscription tier)
- `contexts.py` — Prompt contexts CRUD (admin-only write via ADMIN_USER_ID)

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
  - `scripts/check-console-tabs.mjs` — fast static preflight: parses `CUSTOM_TAB_RENDERERS`, fetches `/api/v1/ui/structure`, fails if any API tab has no renderer and no sections. Run locally with `node scripts/check-console-tabs.mjs` (against Express on :5000) or `API_BASE=http://localhost:8001 INTERNAL_API_SECRET=… node scripts/check-console-tabs.mjs` (direct against uvicorn). The script reads `INTERNAL_API_SECRET` and forwards it as the `x-a0p-internal` header so it can call the gated Python backend without going through the Express proxy.
  - **CI integration (Task #92):** the `check-console-tabs` job in both `.github/workflows/deploy.yml` and `cloudbuild.yaml` boots an ephemeral Postgres + uvicorn backend on every push to `main` and runs the script. The `deploy` job declares `needs: check-console-tabs`, so the Cloud Run deploy is blocked when the script exits non-zero, which happens for either (a) a tab returned by the API with no custom renderer and no sections, or (b) an orphan entry in `CUSTOM_TAB_RENDERERS` whose `tab_id` is no longer returned by `/api/v1/ui/structure`. See `DEPLOYMENT.md` → "Pre-deploy checks".
- `client/src/pages/chat.tsx` — chat shell with conversation list + message bubbles
- `client/src/components/top-nav.tsx` — Agent/Console nav, agent name + tier badge
- `client/src/components/tabs/` — Legacy hardcoded tab components (unused, retained for reference)
- `client/src/hooks/use-billing-status.ts` — fetches /api/v1/billing/status (5-min stale), exposes tier, isAdmin
- `client/src/pages/pricing.tsx` — Donations-only support page (research-instrument framing; verbatim 501c3 copy block; one-off donation flow)
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
LLMs are energy sources, not agents. Managed by `energy_registry.py` (loads `python/config/providers.json` + `python/config/pricing.json`):
- **grok** — xAI Grok-4 Fast (reasoning)
- **gemini** — Google Gemini 2.5 Flash
- **gemini3** — Google Gemini 3 Pro (preview)
- **claude** — Anthropic Claude Sonnet 4.5
- **openai** — OpenAI GPT-5 mini (Responses API)
- **openai-5.5** — OpenAI GPT-5.5 (1M ctx, $5/$30 per 1M in/out, cached $0.50; released Apr 2026)
- **openai-5.5-pro** — OpenAI GPT-5.5 Pro (1M ctx, $30/$180 per 1M, cached $3.00; FrontierMath Tier 4 SOTA — reserve for PCNA-critical merges; requires `reasoning_effort >= medium`)

### PCNA Engine
53-node circular topology with rings: Phi, Psi, Omega, Theta (formerly "Guardian"; runs PCEA encryption over its tensor state via the `pcea-lib` package).
Each ring has coherence tracking and propagation.

### Key Concepts
- **UI_META + DATA_SCHEMA**: Every route module declares both; `collect_ui_meta()` aggregates; `/api/v1/ui/structure` serves; frontend has zero hardcoded tabs
- **Heartbeat**: 30s tick, runs scheduled tasks (audit, snapshot, propagate, research)
- **Bandits**: UCB1 + EMA decay across tool, model, routing domains
- **EDCM**: Behavioral directive scoring (CM, DA, DRIFT, DVG, INT, TBF)
- **Sub-agent lifecycle**: fork() at spawn → absorb() on completion → retired
- **ADMIN_USER_ID**: Env var set to Erin's Replit user ID; only this user can write to `prompt_contexts` via `PUT /api/v1/contexts/{name}`

## Funding

a0p is a research instrument, not a product. It is supported entirely by donations.

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

The single productized service is the **EDCMbone transcript explainer** — a one-off paid analysis priced against the operator's $1,000/hr benchmark. Donations and the explainer are the only two ways money enters the project. There is no recurring subscription tier.

### Explainer pricing (LOCKED, Task #111)

- 3 free explanations per user, lifetime (seeded on first read of `/api/v1/transcripts/explainer/credits`).
- $50 = pack of 3 explanations (~$16.67 each, ~1 minute of operator time per shot).
- Decrement order: free first, then paid.
- Stripe Checkout (embedded) created via `POST /api/v1/billing/explainer-checkout`; `checkout.session.completed` webhook (product_key=`explainer_pack`) calls `storage.add_explanation_credits(uid, packs)`. Amount is re-derived from `amount_total` to defeat metadata tampering.
- `charge.refunded` webhook reverses paid credits (rounded down by $50 increments).
- One explanation per report (UNIQUE on `transcript_explanations.report_id` + FK CASCADE on report delete) — refresh on the report page returns the cached row, no re-billing.
- Model: `openai-5.5` (gpt-5.5) via `call_energy_provider`. Strict-JSON output (body + citations); parse failure refunds the credit and surfaces the error.
- **Citation integrity**: every quoted span is verified to actually appear in the transcript (whitespace/case-normalized substring match). Fabricated quotes are dropped; if none survive, the call is rejected and the credit refunded.
- Observability: each call emits an `agent_logs.event = 'explainer_call'` row that `/api/v1/agents/learning_summary` rolls up into a separate `paid_explainer` section (kept out of `cum.merges` so the sub-agent merge counter stays honest).
- Frontend: `client/src/components/ExplainerCard.tsx`, mounted in `client/src/pages/transcripts.tsx` under the report stat grid.

The previous Free / Seeker / Operator / Patron / Founder pricing language has been retired; it never matched what the code actually enforced. The runtime tiers that still exist are operational only:

- `free` — default tier for any signed-in user; full read access to the console.
- `ws` — auto-assigned to `@interdependentway.org` accounts; full operational access.
- `admin` — owner + invited collaborators (see Access Control below).

There is no `supporter` tier in new sign-ups. Existing Supporter subscribers (if any) are honored until they cancel via the Stripe portal; the `customer.subscription.deleted` webhook drops them back to `free`.

## Access Control (two-tier write gating)

Code-altering access has exactly two tiers:

1. **Owner + invited collaborators** — anyone with `users.role = 'admin'` (or whose email is in the `admin_emails` table). They can mutate prompt contexts, WS modules, energy-provider seeds, custom tools, admin emails, the resolution directory, billing/tier overrides, and other shared instrument state.
2. **Everyone else** — read the console, run their own chats, upload their own transcripts, manage their own Forge agents and conversations. They cannot reach into shared instrument state.

This is enforced at the route layer. `python/tests/contracts/route_gating.py` is the regression test: it walks every `python/routes/*.py`, finds every POST/PATCH/DELETE/PUT, and asserts each one is either (a) gated by an explicit ownership/admin check, (b) gated by `x-user-id` (i.e., a per-caller mutation that requires sign-in and is scoped to the caller's own row), or (c) explicitly listed in the contract's allowlist with a written reason (Stripe webhook, Express-internal endpoint, public guest chat, etc.). Adding a new write endpoint without falling into one of those buckets fails the contract.

## External Dependencies
- **AI**: Gemini 2.5 Flash (Replit integration), Grok-3 Mini (XAI_API_KEY), Claude (Anthropic)
- **Google**: Gmail, Google Drive (Replit connectors)
- **GitHub**: Repository ops, Codespace management (Replit connector + GITHUB_PAT)
- **Auth**: Replit Auth (OpenID Connect)
- **Payments**: Stripe (donations only — sandbox, Replit integration)
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

## The Forge (Apr 2026)
Character-sheet style agent creation. `python/routes/forge.py` + `client/src/components/ForgeTab.tsx`.

- 8 archetypes (Sage, Trickster, Paladin, Druid, Engineer, Diplomat, Hacker, Captain) with personality (D&D alignment, traits, verbosity 1–10), stats (D20 6-stat block: reasoning/speed/resilience/creativity/memory/charisma), and suggested tools.
- Self-updating registries: `GET /api/v1/forge/tools` introspects `TOOL_SCHEMAS_CHAT`; `GET /api/v1/forge/models` introspects `energy_registry`. No hand-maintained catalog.
- Per-user agent namespace: `agent_instances.name` no longer globally unique; collisions guarded per `(owner_id, name)` returning 409.
- Auth: `_user_id()` returns 401 if `x-user-id` missing — Express proxy trusts only authenticated users.
- Validation: `model_id` must exist in registry; tools must exist in `TOOL_SCHEMAS_CHAT`; both return 400 on bad input.

### RPG/Combat — STUBBED (DB only)
`agent_instances` columns: `level`, `xp`, `hp`, `wins`, `losses`, `draws`, `stats` (jsonb), `loadout` (jsonb), `avatar_url`, `backstory`. New table `agent_matches` (attackerId, defenderId, mode, rounds, winnerId, xpAwarded, status). `POST /api/v1/forge/duel` returns 501. Combat logic + leveling deferred; DB shape locked so it won't be retrofitted badly.

## Prompt Caching Strategy (multi-agent friendly)
System prompts are composed in **stable→volatile** order so cache prefixes stay long across turns and across forge agents:

```
1. a0_identity      ← global, immutable
2. system_base      ← global, edited rarely
3. tier_context     ← stable per tier
4. agent_persona    ← stable per Forge agent
5. ## Memory seeds  ← volatile (user edits)
```

Anthropic gets **two cache breakpoints**: one after the persona, one at the end. Memory seed edits invalidate only the seed segment, not the whole prefix. OpenAI/Grok cache automatically on stable prefixes ≥1024 tokens — same ordering benefits them. Gemini caching is API-explicit (not yet wired).

Pricing in `energy_registry`:
| provider | cache read | cache write |
|---|---|---|
| openai (gpt-5-mini) | 10% input | n/a (auto) |
| claude sonnet 4.5 | 10% input | 125% input |
| grok 4 fast | 25% input | n/a (auto) |
| gemini 2.5 flash | not wired | requires cachedContents API |

`energy_registry.cache_breakdown(usage)` normalizes the four shapes (Anthropic explicit, OpenAI Responses, OpenAI Chat, xAI Chat) into `{fresh_input, cache_read, cache_write, output, hit_ratio}` for the UI.
