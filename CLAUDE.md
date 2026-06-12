# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Overview

**`a0`** is a 3-process autonomous AI-agent platform with a metadata-driven console UI. `a0` is the codebase/runtime; **`a0p`** is the deployed public instance ("a research instrument, not a product") at `replit.interdependentway.org`.

A single persistent agent — **ZFAE** (`a0(zeta fun alpha echo)`) — runs on the instrument. Large language models (Grok, GPT-5 mini, Gemini 2.5 Flash, Claude Sonnet) are treated as **energy providers**: they supply computational energy per response but are not the agent itself. Sub-agents (`a0(zeta{n})`) can fork the PCNA instance, run in parallel, and merge results back.

| | |
|---|---|
| **Languages** | TypeScript (Express + React/Vite), Python 3.12 (FastAPI) |
| **Frontend** | React 18, Vite 7, Wouter, TanStack Query, Radix UI, Tailwind 3 |
| **Backend (TS)** | Express 5, Drizzle ORM, `connect-pg-simple` sessions |
| **Backend (Py)** | FastAPI, uvicorn, SQLAlchemy async / asyncpg, Pydantic, Stripe, xai-sdk, anthropic, google-genai, openai |
| **DB** | PostgreSQL (schema source of truth: `shared/schema.ts`) |
| **License** | AGPL-3.0-or-later — declared consistently across `LICENSE`, `package.json`, and `pyproject.toml` (relicensed from MIT: network copyleft so any hosted fork must publish source). Vendored `skill-lib/` retains its upstream MPL-2.0 license. |
| **Deploy** | Docker → Google Cloud Run (`a0p` service, port 5000) |

---

## Commands

```bash
# Development — starts all 3 processes (Python :8001, Vite :5001, Express :5000)
scripts/start-dev.sh

# Express-only dev (no Python/Vite siblings; assumes they run elsewhere)
npm run dev                # = NODE_ENV=development tsx server/index.ts

# Production build (Vite → dist/public/, esbuild → dist/index.cjs)
npm run build              # = tsx script/build.ts

# Full prod bootstrap: npm install + pip install -e . + npm run build
scripts/build-prod.sh

# Production start (Express :5000 + uvicorn :8001)
npm start                  # Express only (dist/index.cjs)
scripts/start-prod.sh      # both processes

# TypeScript type checking
npm run check              # = tsc

# Push Drizzle schema to PostgreSQL
npm run db:push            # = drizzle-kit push

# Re-stamp all files with the N:M C:D I:O annotation (required after edits)
python scripts/annotate.py            # full scan, recomputes all metrics
python scripts/annotate.py <file ...> # single-file mode (preserves C:D / I:O)
```

### Tests

```bash
# Python test suite (pytest, asyncio auto-mode)
uv run pytest tests/ -v
uv run pytest tests/ -v --ignore=tests/test_live_server.py   # skip live-server smoke

# Contract runner — walks python/ for "# === CONTRACTS ===" blocks and runs them
python -m python.tests.contract_runner

# Console-tab regression guard (static preflight; needs Python backend on :8001)
node scripts/check-console-tabs.mjs
API_BASE=http://127.0.0.1:8001 node scripts/check-console-tabs.mjs

# Playwright e2e (requires dev server on :5000; chromium only)
npx playwright install chromium      # first time
npx playwright test
npx playwright test tests/e2e/console-tabs.spec.ts
```

`tests/` is Python pytest; `tests/e2e/` is Playwright. There are no frontend unit tests yet.

---

## Repository Layout

| Path | Contents |
|------|----------|
| `server/` | Express app: `index.ts`, proxy, `auth/` (sessions, guest-chat, password, seed), `attachments.ts`, `db.ts`, `replit_integrations/object_storage/` |
| `client/src/` | React frontend: `pages/` (console, chat, fleet, archive, transcripts, billing…), `hooks/` (incl. `use-ui-structure.ts`), `components/`, `lib/` |
| `python/` | FastAPI backend: `main.py` (app + `/api/health`), `routes/`, `services/`, `engine/`, `agents/`, `database.py`, `models.py`, `config/`, `storage/` |
| `python/routes/` | ~35 self-declaring route modules (export `router`, `UI_META`, `DATA_SCHEMA`) registered in `python/routes/__init__.py` |
| `python/engine/` | Cognitive engines: `pcna.py`, `sigma.py`, `zeta.py`, `theta.py`, `ptca_core.py`, `memory_core.py`, `merge.py`, `prime_seeds.py`, `ucns_kit/` |
| `python/services/` | Orchestration: `inference.py`, `heartbeat.py`, `tool_executor.py`, `edcm.py`, agent spawn/lifecycle, `providers/`, `tools/` |
| `shared/` | `schema.ts` (Drizzle, DB source of truth), `models/auth.ts` |
| `a0/` | Standalone `a0` Python package / Termux CLI runtime (`a0.py`, cores, adapters, connectors, guardian) — entry: `run.sh` (`python -m a0.a0`) |
| `scripts/` | `start-dev.sh`, `start-prod.sh`, `build-prod.sh`, `annotate.py`, `check-console-tabs.mjs`, `a0-cli.sh`, `post-merge.sh` |
| `script/build.ts` | Build entrypoint (vite + esbuild) invoked by `npm run build` |
| `.agents/skills/` | Authoritative agent skills & doctrine (`SKILL.md` per skill) |
| `tests/`, `python/tests/` | pytest suites; `python/tests/contracts/` + `contract_runner.py` |
| `.github/workflows/` | `deploy.yml`, `clean-build-check.yml` |

---

## Architecture

### Process Topology

```
Browser → Express (:5000) → [proxy /api/*] → Python/FastAPI (:8001, internal only)
                         ↘ [dev] Vite (:5001)
```

- **Express** (`server/`) — The only public entry point. Auth, sessions, guest-chat rate limiting, static serving. Injects `x-a0p-internal: <INTERNAL_API_SECRET>` plus identity headers (`x-user-id`, `x-user-email`, `x-user-role`) on every proxied request. Never expose the Python port directly.
- **Python/FastAPI** (`python/`) — All AI orchestration, PCNA engine, agent lifecycle, billing, heartbeat scheduler. Validates `x-a0p-internal` on every request (`_OPEN_PATHS` = `/api/health`, `/api/v1/guest/chat`).
- **Vite** — Dev only; proxied by Express.

In production a single Cloud Run container runs both Express (5000) and uvicorn (8001) via `scripts/start-prod.sh` / the `Dockerfile`.

### Frontend (Metadata-Driven Console)

`client/src/hooks/use-ui-structure.ts` polls `GET /api/v1/ui/structure`, which aggregates `UI_META` from every Python route module. The console (`client/src/pages/console.tsx`) renders tabs from this structure:

- Tab id in `CUSTOM_TAB_RENDERERS` → custom React component
- Otherwise → generic `TabRenderer` (schema-driven via `DATA_SCHEMA`)

The **console-tab regression guard** (`scripts/check-console-tabs.mjs`) and the e2e test (`tests/e2e/console-tabs.spec.ts`) enforce that every API-declared tab has either a custom renderer or sections. `deploy.yml` blocks deploy on guard failure.

### Python Route Modules

Each file in `python/routes/` is self-declaring: it exports a FastAPI `router` and defines `UI_META` / `DATA_SCHEMA`, with `# DOC` header comments (`# DOC module:`, `label:`, `description:`, `tier:`, `endpoint:`). **Adding a new route module requires 4 edits to `python/routes/__init__.py`:**

1. Import the router (top of file)
2. Add it to `ALL_ROUTERS`
3. Add the filename to `collect_doc_meta()`'s `route_files` list
4. Add the module name to `collect_ui_meta()`'s `modules` list (only if it should appear as a console tab — standalone pages like artifacts/transcripts are intentionally omitted)

Naming convention: `{name}.py` = self-contained module; `{name}_api.py` = thin delegate to a service in `python/services/`.

### Key Python Services & Engines

- `python/services/inference.py` — Orchestrates LLM calls across registered energy providers (Grok / Gemini / Claude / OpenAI-style); resolves role, normalizes reasoning effort, injects tier-specific `prompt_context`.
- `python/services/heartbeat.py` — Periodic tick: audit snapshots, memory checkpoints, PCNA propagation, sub-agent cleanup.
- `python/services/tool_executor.py` — Tool invocation with approval gates.
- `python/engine/pcna.py` — Multi-ring PCNA inference pipeline (Phi/Psi/Omega/Guardian/Memory rings); Project → Inject → Propagate → PTCA-seed → PTCA-circle → Coherence.
- `python/services/edcm.py` — Behavioral directive scoring (CM, DA, DRIFT, DVG, INT, TBF); fires corrective actions and guides LLM selection.
- `python/engine/sigma.py` — SigmaCore: encodes the workspace filesystem as a prime-ring tensor; companion to the Psi ring; has its own console tab.

### Database

Schema source of truth is `shared/schema.ts` (Drizzle ORM), applied via `npm run db:push`. Python reads the same PostgreSQL database via SQLAlchemy async (`python/database.py`, `python/models.py`).

### Auth & Tiers

Auth is handled entirely by Express. Tiers (Free → Seeker → Operator → Patron → Founder Lifetime) live on the user record, are updated via the Stripe webhook (`python/routes/billing.py`), and are injected into the LLM system prompt as `prompt_context`.

### CLI Access

`scripts/a0-cli.sh` is a terminal client hitting `POST /api/v1/cli/chat` with a `Bearer a0k_…` key (generated in Console → CLI Keys). Requires `A0_KEY` and `A0_HOST` env vars.

---

## Conventions & Gotchas

- **File annotation** — Every `.py` / `.ts` / `.tsx` file's first and last line carry a `# N:M C:D I:O` (or `// …`) annotation: code:comment, consumed:declared, fan-in:fan-out. Run `python scripts/annotate.py` after edits.
- **400-line budget** — `N` (non-blank, non-comment code lines) must stay ≤ 400. Split a file before it exceeds the limit.
- **Route DOC blocks** — Every route file needs complete `# DOC` headers (`module`, `label`, `description`, `tier` are required); enforced by contracts.
- **Write-route gating** — Every `@router.{post,patch,delete,put}` handler must reference a gating sentinel (admin check, `x-user-id` resolution, ownership filter, internal token, HMAC, or `Depends` auth) or be in the explicit allowlist (`python/tests/contracts/route_gating.py`). Enforced by the contract runner.
- **All frontend `/api/*` calls go through Express on :5000** — never call Python :8001 directly; it requires the internal secret.
- **Dynamic SQL UPDATE** — Use the established column-allowlist pattern; never interpolate column names freely.
- **`db:push` is interactive** — `drizzle-kit push` uses a TTY picker for rename disambiguation; `scripts/post-merge.sh` runs `db:push -- --force` and pre-creates tables to avoid hangs in non-TTY contexts.
- **Module-build doctrine** — Before adding any new module, route, service, adapter, schema, worker, engine, UI panel, migration, or experiment, read `./.agents/skills/meta-module-build/SKILL.md` and start with a `MODULE_BUILD` block; unknown fields must be marked `hmmm`, not guessed. For route conventions specifically, read `.agents/skills/a0p-module-doctrine/SKILL.md`.

---

## CI

| Workflow | Trigger | Does |
|----------|---------|------|
| `.github/workflows/deploy.yml` | push/PR to `main` | Boots Postgres + Python backend, runs console-tab guard; on push to `main`, builds Docker image and deploys to Cloud Run (`a0p`, us-central1) |
| `.github/workflows/clean-build-check.yml` | push/PR to `main` | Builds with `REPL_ID` unset and fails if any `@replit` reference leaks into the client bundle |

---

## Environment Variables

Required in production (dev has safe fallbacks except where noted):

```bash
SESSION_SECRET          # Express session encryption (no fallback in prod)
INTERNAL_API_SECRET     # Express→Python shared secret (start-dev.sh generates a per-run value)
DATABASE_URL            # PostgreSQL connection string
XAI_API_KEY             # Grok energy provider
STRIPE_SECRET_KEY       # Stripe billing
STRIPE_WEBHOOK_SECRET   # Stripe webhook validation
ADMIN_USER_ID           # User ID allowed to write prompt contexts
```

---

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Project framing (`a0` vs `a0p`, energy-provider model) |
| `replit.md` | Platform overview and user preferences |
| `DEPLOYMENT.md` | GCP / Cloud Run setup and secrets |
| `spec.md` | Full agent-platform spec (PCNA, EDCM, sentinel channels) |
| `MODULES.md` | Module catalog |
| `python/routes/__init__.py` | Module registration (edit when adding routes) |
| `client/src/pages/console.tsx` | `CUSTOM_TAB_RENDERERS` map and tab rendering |
| `script/build.ts` | Build pipeline (vite + esbuild) |
| `.agents/skills/meta-module-build/SKILL.md` | Module-build doctrine (read before new modules) |
| `.agents/skills/a0p-module-doctrine/SKILL.md` | Authoritative route/module conventions |

---

## Git Workflow

- Main branch: `main`
- Feature branches: `feat/<desc>`, `fix/<desc>`, `docs/<desc>`, `chore/<desc>`
- Commit style: Conventional Commits (`feat(console):`, `fix(pcna):`, …)
- Author: Erin Patrick Spencer (wayseer@interdependentway.org)
