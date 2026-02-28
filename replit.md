# a0p — AI Agent

A mobile-first AI agent app powered by dual AI brains (Grok + Gemini), with full EDCMBONE orchestration engine, Google infrastructure access, and cost telemetry.

## Architecture

- **Frontend**: React + Vite + TypeScript, mobile-first bottom-tab navigation, dark mode by default
- **Backend**: Express.js + TypeScript on port 5000
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Replit Auth (OpenID Connect via passport)
- **Payments**: Stripe (sandbox) via stripe-replit-sync, managed webhooks
- **Engine**: a0p v1.0.0 — EDCMBONE + PCNA/PTCA + SHA-256 hash chain + 9 sentinels

## AI Integrations

- **Built-in**: Gemini 2.5 Flash (Replit AI Integrations), Grok-3 Mini (xAI `XAI_API_KEY`)
- **BYO Providers**: OpenAI, Anthropic, Mistral, Cohere, Perplexity (user-supplied keys via Console > Context)
- Switchable per conversation in chat header
- REST AI endpoints: `GET /api/ai/models`, `POST /api/ai/complete`, `POST /api/ai/stream`, `POST /api/ai/estimate`

## Google Integrations

- **Gmail**: Read inbox, open full emails, compose & send (via Replit Connector `google-mail`)
- **Google Drive**: Browse folders, list files by type (via Replit Connector `google-drive`)

## a0p Engine (v1.0.0)

- **EDCMBONE**: 5-class operator vectors (P/K/Q/T/S), L1 normalization, L2 distance, merge/softfork/fork at 0.18/0.30
- **PCNA**: 53-node circular topology, adjacency distances {1,2,3,4,5,6,7,14}
- **PTCA**: Explicit-Euler solver, dt=0.01, alpha=0.6 beta=0.4 gamma=0.2
- **Hash Chain**: SHA-256, genesis hash, canonical JSON with sorted keys
- **Sentinels**: S1-S9 preflight/postflight checks
- **hmmm invariant**: Fail-closed — no silent fallback
- **Heartbeat**: Once per hour (+ startup at 5s)
- **Cost tracking**: Token counting and estimated cost per model

## Features

### Agent (`/`)
- Autonomous AI agent with Gemini function-calling (up to 8 tool rounds per request)
- 9 tools: run_command, read_file, write_file, list_files, search_files, list_gmail, read_gmail, send_gmail, list_drive
- Tool actions displayed in real-time (amber indicators for calls, results inline)
- Task sidebar (replaces conversation list), auto-titling
- Agent decides which tools to use — no manual model toggle

### Terminal (`/terminal`)
- Sandboxed shell execution (allowlisted commands only)
- Arrow-key history navigation

### Files (`/files`)
- Browse project directory tree, read/edit files inline
- **Direct upload**: Upload files from phone/desktop into workspace (up to 50 files, 50MB each)
- **Phone snapshot**: Upload a file manifest (.txt/.csv/.json) for dedup analysis by the agent
- Upload progress bar with XHR tracking
- Files stored in `uploads/` directory

### Console (`/console`) — 5 tabs
- **Workflow**: Engine status, emergency stop (Enter-key confirm), heartbeat log, hash chain status
- **Metrics**: Token usage, cost estimates, spend limits with slider + toggle
- **EDCM**: Dual-brain operator vectors, BONE delta, alignment risk, PTCA energy, history
- **Context**: Editable system prompt + context prefix, BYO API keys (OpenAI, Anthropic, Mistral, Cohere, Perplexity)
- **Costs**: Donations vs API costs comparison, coverage percentage

### Account/Pricing (`/pricing`)
- Replit OAuth login/logout
- $15/month Core Access tier (Stripe Checkout subscription)
- Optional support: +$1, +$2, +$5 (Stripe one-time payments)
- Founder tier: $153 one-time (limited to 53) (Stripe one-time payment)
- Compute credits: $10, $25, $50 blocks (Stripe one-time payments)
- Products seeded via `server/seed-products.ts`

### Drive (`/drive`) & Mail (`/mail`)
- Still accessible via URL, not in main nav

### Automation (`/automation`)
- Spec.md automation with Gemini analysis

### hmmm Doctrine
- Persistent footer across all pages

## Database Schema

- `users` + `sessions` — Replit Auth
- `conversations` — chat records (title, model, userId)
- `messages` — individual messages (role, content, model)
- `automation_tasks` — spec.md tasks
- `command_history` — terminal log
- `a0p_events` — hash-chained event log
- `heartbeat_logs` — hourly heartbeat records
- `cost_metrics` — token/cost tracking per model
- `edcm_snapshots` — EDCMBONE evaluation history

## Key Files

- `server/routes.ts` — all API routes
- `server/storage.ts` — database storage layer
- `server/a0p-engine.ts` — full engine: EDCMBONE, PCNA, PTCA, sentinels, hash chain, heartbeat, cost tracking
- `server/stripeClient.ts` — Stripe client + StripeSync setup
- `server/webhookHandlers.ts` — Stripe webhook processor
- `server/seed-products.ts` — Product seeding script (run manually)
- `server/replit_integrations/auth/` — Replit Auth module
- `server/gmail.ts` — Gmail client factory
- `server/drive.ts` — Google Drive client factory
- `server/xai.ts` — Grok/xAI client factory
- `client/src/pages/console.tsx` — tabbed console (5 tabs)
- `client/src/pages/pricing.tsx` — pricing/account page
- `client/src/pages/chat.tsx` — main chat UI
- `client/src/components/hmmm-doctrine.tsx` — hmmm doctrine footer
- `client/src/components/bottom-nav.tsx` — mobile bottom navigation
- `client/src/hooks/use-auth.ts` — Replit Auth hook
- `shared/schema.ts` — Drizzle schema + Zod types
- `shared/models/auth.ts` — Auth-related models

## Environment Variables / Secrets

- `DATABASE_URL` — PostgreSQL (auto-provisioned)
- `SESSION_SECRET` — Express session secret
- `XAI_API_KEY` — xAI/Grok API key (user-provided)
- `AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini (Replit-managed)
- `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY` — Google OAuth connectors (Replit-managed)
