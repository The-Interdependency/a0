# a0p — a research instrument

## Identity
**a0p is a research instrument, not a product.** It is the deployed instance of `a0` (this codebase / repository) running publicly. It explores agent / energy-provider / PCNA dynamics in the open. Anyone may read and use it. Code-altering access is restricted to the owner (Erin) and a small set of explicitly-invited collaborators. The instrument is funded by donations; it does not solicit subscribers.

> Naming: `a0` = the project / runtime / repository. `a0p` = the deployed instance (used in user-facing UI copy, billing, splash).

## User Preferences
- Clear and concise explanations. Confirmation before significant changes.
- Iterative development and continuous feedback.
- Detailed logging and transparency into the agent's decision-making process.
- Control over AI model selection and custom tool definitions.
- Mobile-first UI with dark mode by default.
- Full token accounting with per-model, per-stage, per-conversation cost tracking.
- All AI model conversations logged verbatim.
- Data export (transcripts, conversations, credentials list, system config).

## System Architecture

**Three processes:**
- **Express** (:5000, external :80) — auth, session, guest chat, proxies `/api/*` to Python
- **Vite** (:5001) — React frontend, proxied by Express in dev
- **Python/FastAPI** (:8001, internal only) — AI + data backend; all access via Express

**Security:** Express injects `x-a0p-internal` + identity headers on every proxy. Python rejects requests missing the internal header. Session secret via `SESSION_SECRET` env var in production.

**Key entry points:** `server/index.ts`, `python/main.py`, `python/routes/__init__.py`, `client/src/App.tsx`

> Full file-by-file detail: `docs/ARCHITECTURE.md`

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
- `focus.py` — Context boost, focus regain, sub-agent delegation; also hosts the pre-chat inspector endpoints (context-preview, per-conversation tool selection GET/PATCH)

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
- `client/src/pages/chat.tsx` — chat shell with conversation list + message bubbles; shows `PreChatInspectorPanel` on empty conversations and `ConvToolsPopover` in input bar (Task #141)
- `client/src/components/chat-widgets.tsx` — `PreChatInspectorPanel` (Context tab: read-only system prompt; Tools tab: per-tool toggles) + `ConvToolsPopover` (compact wrench icon in input bar) (Task #141)
- `client/src/components/top-nav.tsx` — Agent/Console nav, agent name + tier badge
- `client/src/components/tabs/` — Legacy hardcoded tab components (unused, retained for reference)
- `client/src/hooks/use-billing-status.ts` — fetches /api/v1/billing/status (5-min stale), exposes tier, isAdmin
- `client/src/pages/pricing.tsx` — Donations-only support page (research-instrument framing; verbatim 501c3 copy block; one-off donation flow)
- `client/src/pages/admin-contexts.tsx` — Admin-only prompt context editor (guarded by isAdmin)

### Database
PostgreSQL via SQLAlchemy (Python) and Drizzle ORM (schema management).
- `shared/schema.ts` — Drizzle schema (source of truth for `db:push`)
- `drizzle.config.ts` — Drizzle Kit configuration
- `conversations.enabled_tools` — JSONB column (Task #141): null = all tools on; string[] = explicit allow-list enforced at inference time via ContextVar in `tool_executor.py`

## Agent Architecture

**ZFAE** — `a0(zeta fun alpha echo) {EnergyProvider}`. One PCNA instance per agent. Sub-agents fork PCNA, execute, merge back.

**Energy Providers** (LLMs are energy sources, not agents):
- **grok** — xAI Grok-4 Fast | **gemini** — Gemini 2.5 Flash | **gemini3** — Gemini 3 Pro
- **claude** — Claude Sonnet 4.5 | **openai** — GPT-5 mini | **openai-5.5** — GPT-5.5 | **openai-5.5-pro** — GPT-5.5 Pro

**PCNA Engine** — 53-node six-ring pipeline: Phi, Psi, Omega, Theta, Memory-L (N=19), Memory-S (N=17).

**Producer PTCNA Layer** — the exactly pinned PTCNA runtime consumes the pinned UCNS 157×7×7×53 candidate receipt. a0 persists runtime and routing receipts and binds them to the Platonic Agent; target routing is default and fallback is explicit.

**Party Slots** — six named role slots, each holds at most one model instance (`agent_instances.role_slot`). Allowlist enforced by `instances_api.py`.

| Slot | Role |
|------|------|
| `conduct` | Primary reasoning — main conversation turns |
| `perform` | Active execution — tool calls and agentic task runs |
| `practice` | Shadow / calibration — parallel run for bandit scoring |
| `record` | Structured logging — note-taking and output formatting |
| `derive` | Synthesis — post-turn PCNA reward signals and analysis |
| `edcm` | Transcript analysis — EDCM scoring and explanation |

All six slots are wired into inference routing via `_slot_routing_info()` in `inference.py`. When a task is classified to a slot, the model_instance assigned to that slot determines both the injected instance memory and the provider that handles the call (matched via `BUILTIN_PROVIDERS` model field). `edcm` additionally has its own dedicated lookup in `edcm_explainer.py`.

> Full slot contract + wiring milestone: `docs/ARCHITECTURE.md` → Party Slots

## Hard Rules
- No file over 400 lines
- No stubs or TODOs in production code
- Express handles auth/session/guest; Python handles all other API logic
- All API paths go through Express (`/api/*`) — never call Python (port 8001) directly from the frontend
- SQL column names in dynamic UPDATE queries must use an explicit allowlist

## Module Doctrine
Authoritative reference: `.agents/skills/a0p-module-doctrine/SKILL.md`. Load before creating or modifying any route module, service, or component.

- Every `.py`, `.ts`, `.tsx` file opens and closes with `# N:M` / `// N:M`. Run `python scripts/annotate.py` to re-stamp.
- Every new route file must be registered in 4 places in `python/routes/__init__.py`.
- Route naming: `{name}.py` = self-contained handler. `{name}_api.py` = thin delegate to a service.

## Funding
a0p runs on donations. No subscription tier. No perks unlocked by donating.

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

The single productized service is the **EDCMbone transcript explainer** — $50 for 3 explanations. 3 free lifetime credits per user. See `docs/ARCHITECTURE.md` → Explainer Pricing for full billing detail.

**Runtime tiers:** `free` (default, full read access) | `ws` (interdependentway.org accounts) | `admin` (owner + collaborators). No `supporter` tier in new sign-ups.

## Access Control (two-tier write gating)
1. **Admin** — `users.role = 'admin'` or email in `admin_emails`. Can mutate shared instrument state: prompt contexts, WS modules, provider seeds, custom tools, tier overrides.
2. **Everyone else** — read console, run own chats, manage own Forge agents and transcripts. Cannot reach shared instrument state.

Enforced at the route layer. Contract: `python/tests/contracts/route_gating.py`.

## External Dependencies
- **AI**: Gemini 2.5 Flash (Replit integration), Grok-4 Fast (XAI_API_KEY), Claude Sonnet 4.5, GPT-5 mini
- **Google**: Gmail, Google Drive (Replit connectors)
- **GitHub**: Repository ops (Replit connector)
- **Auth**: Replit Auth (OpenID Connect)
- **Payments**: Stripe (donations + EDCMbone explainer, Replit integration)
- **Database**: PostgreSQL (Replit managed)
