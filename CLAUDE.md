# CLAUDE.md — AI Assistant Guide for a0p

## Project Overview

**a0p** is a mobile-first autonomous AI agent platform built on a custom orchestration engine called **EDCMBONE** (Energy-Dissonance Circuit Model with Boltzmann Operator Neural Engine). It supports multi-model AI orchestration, real-time cost tracking, cryptographic audit logging, and integrations with Google services, GitHub, and Stripe.

**Stack:** React 18 + Vite (frontend), Express 5 + TypeScript (backend), PostgreSQL + Drizzle ORM (database), deployed on Google Cloud Run and Replit.

---

## Development Commands

```bash
npm run dev        # Start dev server (tsx hot reload, port 5000)
npm run build      # Bundle client (Vite) + server (esbuild) → dist/
npm run start      # Run production build (node dist/index.cjs)
npm run check      # TypeScript type check
npm run db:push    # Push Drizzle schema changes to database
```

There are **no test scripts**. The project does not include unit or integration tests.

---

## Directory Structure

```
client/src/
  components/tabs/   # 18 agent-control tab components (barrel export in index.ts)
  components/ui/     # shadcn/ui primitives (30+ components)
  components/        # top-nav, bottom-nav, popout-panel, hmmm-doctrine
  pages/             # 12 route pages (chat, terminal, files, drive, mail, etc.)
  hooks/             # Custom React hooks (use-auth, etc.)
  lib/               # queryClient, contexts, utils, console-config

server/
  a0p-engine.ts      # Core EDCMBONE orchestration engine (3220 lines)
  routes.ts          # All Express API route definitions
  index.ts           # App setup, middleware, startup
  db.ts              # Drizzle ORM + pg pool connection
  logger.ts          # 10 append-only cryptographic log streams
  storage.ts         # Multer file uploads + file utilities
  heartbeat.ts       # Background task scheduler (30s tick)
  stripeClient.ts    # Stripe SDK
  webhookHandlers.ts # Stripe webhook processing
  gmail.ts           # Cached Gmail API client
  drive.ts           # Cached Google Drive API client
  github.ts          # Cached GitHub API client
  xai.ts             # xAI/Grok API client
  seed-products.ts   # DB seeding

  lib/               # 12 core server modules
    agent-tools.ts   # 23+ built-in tool definitions
    ai-client.ts     # Model client factory (Gemini, Grok, OpenAI, etc.)
    brain.ts         # Brain preset management
    bandit.ts        # Multi-armed bandit (UCB1 + EMA)
    memory.ts        # 11-seed external memory tensor
    edcm.ts          # EDCM metric computation
    persona.ts       # Persona system prompt management
    synthesis.ts     # Multi-model response synthesis
    custom-tools-lib.ts # User-defined tool management
    transcripts-lib.ts  # Transcript logging
    keys.ts          # Credential/secret management
    slots.ts         # Model slot configuration

  hub/               # Multi-model orchestration (fan_out, daisy_chain, room_all,
                     # room_synthesized, council, roleplay)
  subcore/           # 17-seed memory sub-graph
  replit_integrations/auth/ # Passport OIDC (Replit Auth)

shared/
  schema.ts          # Drizzle table definitions (shared by client + server)
  models/auth.ts     # sessions + users tables

script/
  build.ts           # esbuild + Vite production build

logs/                # Runtime append-only log files (do not edit manually)
```

---

## Architecture & Key Concepts

### EDCMBONE Engine (`server/a0p-engine.ts`)

The core orchestration engine. Key internal structures:
- **PTCA tensor** `(53×11×8×7)` — cognitive model over node × layer × class × depth
- **PTCA-Ψ tensor** `(53×11×8×7)` — self-model (introspective state)
- **PTCA-Ω tensor** `(53×10×8×7)` — autonomy model (goal-directed behavior)
- **EDCM metric families:** CM, DA, DRIFT, DVG, INT, TBF
- **Operator vector classes:** P, K, Q, T, S
- **Sentinels S0–S10** — governance and monitoring constraints
- **Hash-chained event log** — every event gets SHA-256 chained to previous; stored in `a0p_events` table and `logs/a0p-master.jsonl`

Do **not** make ad-hoc changes to tensor dimensions or sentinel thresholds without reading `spec.md`.

### Multi-Model Hub (`server/hub/`)

Six orchestration patterns available via `/api/hub/*` routes:
- `fan_out` — parallel calls to multiple models, return all
- `daisy_chain` — sequential pipeline, output feeds next
- `room_all` — all models see all messages
- `room_synthesized` — room + synthesis pass
- `council` — voting/consensus
- `roleplay` — role-assigned models

### Memory Systems

- **11-seed external memory tensor** (`server/lib/memory.ts`) — structured memory graph
- **17-seed SubCore** (`server/subcore/`) — background memory sub-graph with its own heartbeat
- **Bandit arms** (`server/lib/bandit.ts`) — UCB1 + EMA multi-armed bandit for model selection

### Logging (`server/logger.ts`)

10 append-only `.jsonl` log streams under `logs/`:
- `a0p-master.jsonl` — master event log (hash-chained)
- `edcm-metrics.jsonl` — EDCM metric snapshots
- `memory-tensor.jsonl` — memory tensor updates
- `sentinel-memory.jsonl` — sentinel events
- `omega-autonomy.jsonl` — autonomy model events
- `psi-selfmodel.jsonl` — self-model events
- `memory-attribution.jsonl` — attribution tracking
- `transcripts/` — conversation transcripts
- `ai-transcripts` — raw AI response logs
- `interference` — interference events

Never delete or truncate log files manually — they are cryptographically chained.

---

## Path Aliases

Configured in both `tsconfig.json` and `vite.config.ts`:

| Alias | Resolves To |
|-------|-------------|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |
| `@assets/*` | `attached_assets/*` |

---

## Database

- **ORM:** Drizzle ORM with `pg` driver
- **Schema file:** `shared/schema.ts` (imported by both client and server)
- **Config:** `drizzle.config.ts`
- **Migrations:** `npm run db:push` (schema push, not migration files)

Key tables:
| Table | Purpose |
|-------|---------|
| `conversations` | Chat sessions |
| `messages` | Individual messages |
| `a0p_events` | Hash-chained audit log |
| `automationTasks` | Scheduled/background tasks |
| `commandHistory` | Command execution history |
| `heartbeat_logs` | Background task logs |
| `cost_metrics` | Token usage + spend tracking |
| `edcm_snapshots` | Engine state snapshots |
| `bandit_arms` | Model selection bandit state |
| `sessions` | Auth sessions (Replit Auth) |
| `users` | User profiles |

---

## API Routes

All routes defined in `server/routes.ts`, mounted at both `/api` and `/api/v1`.

Key route groups:
- `POST /api/chat` — Main agent request endpoint
- `GET/POST /api/conversations` — Conversation CRUD
- `GET/POST /api/messages` — Message CRUD
- `GET /api/agent/engine-state` — EDCM engine status
- `GET /api/agent/slots` — Model slot config
- `POST /api/hub/*` — Multi-model orchestration
- `GET/POST /api/files/*` — File operations
- `GET /api/gmail/*` — Gmail API wrapper
- `GET /api/drive/*` — Drive API wrapper
- `GET /api/github/*` — GitHub API wrapper
- `POST /api/stripe/*` — Stripe operations
- `/auth/*` — OAuth endpoints (Replit OIDC)

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session encryption |
| `XAI_API_KEY` | Yes | xAI/Grok API key |
| `STRIPE_SECRET_KEY` | Yes | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signature |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Yes (Replit) | Gemini API key |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Yes (Replit) | Gemini API base URL |
| `REPLIT_DOMAINS` | Replit only | Allowed auth domains |
| `PORT` | No | HTTP port (default: 5000) |
| `NODE_ENV` | No | `development` or `production` |

User API credentials (OpenAI, Anthropic, etc.) are stored **encrypted in the database**, not in environment variables. Access via `getUserCredential()` in `server/lib/keys.ts`.

---

## Naming Conventions

- **React components:** PascalCase (`ChatPage`, `TopNav`, `WorkflowTab`)
- **TypeScript types/interfaces:** PascalCase (`A0Request`, `EdcmSnapshot`)
- **Variables and functions:** camelCase (`activeConvId`, `buildGeminiHistory`)
- **Database tables:** snake_case plural (`conversations`, `cost_metrics`, `bandit_arms`)
- **API routes:** `/api/resource/action` — lowercase kebab-case
- **Log stream keys:** lowercase with hyphens (`ai-transcripts`, `omega-autonomy`)
- **Tab components:** PascalCase + `Tab` suffix (`WorkflowTab`, `PsiTab`, `OmegaTab`)
- **Files:** kebab-case for pages and components (`top-nav.tsx`, `agent-tools.ts`)

---

## Frontend Conventions

- **Routing:** `wouter` (not React Router)
- **State management:** TanStack React Query v5 for server state; `localStorage` for UI state
- **UI library:** shadcn/ui components in `client/src/components/ui/`
- **Icons:** Lucide React
- **Charts:** Recharts
- **Animations:** Framer Motion
- **Dark mode:** Enforced by default — `document.documentElement.classList.add("dark")` on mount
- **Mobile-first:** Responsive layout; `bottom-nav.tsx` for mobile, `top-nav.tsx` for desktop

When adding new tab components, export them from `client/src/components/tabs/index.ts`.

---

## Backend Conventions

- **Express 5** (not Express 4) — async error handling is built-in
- **All routes** go in `server/routes.ts`
- **New integrations** get their own file in `server/` (see `gmail.ts`, `drive.ts`)
- **New server-side libraries** go in `server/lib/`
- **Error responses:** use `{ error: "message" }` JSON with appropriate HTTP status
- **Authentication:** Replit OIDC via `server/replit_integrations/auth/`. The `requireAuth` middleware is available for protected routes.
- **Credentials:** Never log or expose user API keys. Use `getUserSecret()` / `getUserCredential()` from `server/lib/keys.ts`.

---

## Build System

**Development:** `tsx` runs `server/index.ts` directly with TypeScript (no compile step).

**Production build** (`script/build.ts`):
1. Deletes `dist/`
2. Runs Vite for client → `dist/public/`
3. Runs esbuild for server → `dist/index.cjs`
   - Format: CommonJS (required for `require()` interop)
   - 33-item allowlist of bundled deps (for faster cold start on Cloud Run)
   - Everything else marked external

**Dockerfile:** Multi-stage; Node.js 20 alpine base; runs `npm run build` then `npm run start`.

---

## Deployment

### Replit
- Runs `npm run dev` automatically via `.replit`
- PostgreSQL 16 auto-provisioned
- Gemini API key injected via Replit AI Integrations
- See `replit.md` for Replit-specific notes

### Google Cloud Run
- CI: `cloudbuild.yaml` — build Docker image → push to Artifact Registry → deploy to Cloud Run
- Region: `us-central1`
- Resources: 512Mi memory, 1 CPU, 0–10 instances
- Secrets from GCP Secret Manager (see Environment Variables above)
- See `DEPLOYMENT.md` for full setup guide

---

## Key Documentation Files

| File | Contents |
|------|---------|
| `spec.md` | Full v1.0.2-S11 specification — EDCMBONE architecture, PTCA tensors, EDCM metrics, Sentinel definitions, operator algebra, coupling parameters. **Read before modifying the engine.** |
| `DEPLOYMENT.md` | Step-by-step Cloud Run deployment guide |
| `replit.md` | Replit environment notes, modular architecture decisions, feature specs |
| `tiw_spec/` | TIW (The Interdependency) specification documents |

---

## Things to Avoid

1. **Do not modify tensor dimensions** in `a0p-engine.ts` (PTCA 53×11×8×7, PTCA-Ψ 53×11×8×7, PTCA-Ω 53×10×8×7) without cross-referencing `spec.md`.
2. **Do not truncate or delete log files** under `logs/` — they are hash-chained and deleting breaks integrity.
3. **Do not expose user credentials** stored in the database. Route credential access through `server/lib/keys.ts`.
4. **Do not use `app.use(express.static(...))` in `routes.ts`** — static serving is handled separately in `server/static.ts`.
5. **Do not use React Router** — routing is via `wouter`.
6. **Do not use `git push --force`** to `main`.
7. **Do not add Drizzle migration files manually** — use `npm run db:push` for schema changes.
8. **Do not hardcode API keys** anywhere in source code.

---

## Common Tasks

### Adding a new API route
1. Add handler function in `server/routes.ts`
2. Register route under the correct prefix (`/api/` + resource)
3. Add corresponding types to `shared/schema.ts` if a new table is needed
4. Add frontend query/mutation in relevant page or hook using React Query

### Adding a new tab component
1. Create `client/src/components/tabs/MyNewTab.tsx`
2. Export from `client/src/components/tabs/index.ts`
3. Register in `client/src/lib/console-config.ts`
4. Add tab to `client/src/pages/console.tsx`

### Adding a new model integration
1. Add client factory case in `server/lib/ai-client.ts`
2. Add slot configuration support in `server/lib/slots.ts`
3. Add UI option in `client/src/components/tabs/ApiModelTab.tsx`

### Schema changes
1. Edit `shared/schema.ts`
2. Run `npm run db:push` to apply to database
3. Update any affected Drizzle queries (type errors will guide you)
