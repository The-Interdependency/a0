# a0p — AI Agent

A mobile-first autonomous AI agent app powered by dual AI brains (Grok + Gemini), with full EDCMBONE orchestration engine, adaptive intelligence layer (multi-armed bandit, EDCM behavioral directives, 11-seed external memory tensor), autonomous research heartbeat, Google infrastructure access, and cost telemetry.

## Architecture

- **Frontend**: React + Vite + TypeScript, mobile-first bottom-tab navigation, dark mode by default
- **Backend**: Express.js + TypeScript on port 5000
- **Database**: PostgreSQL via Drizzle ORM (20+ tables)
- **Auth**: Replit Auth (OpenID Connect via passport)
- **Payments**: Stripe (sandbox) via stripe-replit-sync, managed webhooks
- **Engine**: a0p v1.0.2-S9 — EDCMBONE + PCNA/PTCA + SHA-256 hash chain + 9 sentinels (canon-aligned)
- **Adaptive Intelligence**: Multi-armed bandit (UCB1 + EMA decay), EDCM behavioral directives, 11-seed external memory tensor with sentinel governance
- **Autonomous Research**: Heartbeat task scheduler with transcript analysis, GitHub search, AI-AI social monitoring, proactive discovery drafts
- **Logging**: 7 append-only JSONL log streams with per-stream toggles
- **Philosophy**: Everything logged (append-only), everything toggleable, everything slider-adjustable

## AI Integrations

- **Built-in**: Gemini 2.5 Flash (Replit AI Integrations), Grok-3 Mini (xAI `XAI_API_KEY`)
- **Dual-Model Synthesis**: Parallel Gemini + Grok execution, merged via Gemini (toggleable)
- **BYO Providers**: OpenAI, Anthropic, Mistral, Cohere, Perplexity (user-supplied keys via Console > Context)
- **Custom Function Calls**: User-defined tools with webhook/javascript/template handlers, per-model targeting
- Switchable per conversation in chat header
- REST AI endpoints: `GET /api/ai/models`, `POST /api/ai/complete`, `POST /api/ai/stream`, `POST /api/ai/estimate`

## Google Integrations

- **Gmail**: Read inbox, open full emails, compose & send (via Replit Connector `google-mail`)
- **Google Drive**: Browse folders, list files by type (via Replit Connector `google-drive`)

## GitHub Integration

- **Connector**: Replit GitHub Connector (`@octokit/rest` v22)
- **Tools**: github_list_repos, github_get_file, github_list_files, github_create_or_update_file, github_delete_file, github_push_zip, codespace_list, codespace_create, codespace_start, codespace_stop, codespace_delete, codespace_exec
- **GitHub Pages**: Agent can manage wayseer00/wayseer.github.io directly — read, create, update, and delete files; commits trigger Pages rebuild automatically
- **Auth**: OAuth via Replit Connector (user must authorize in integrations panel)
- **Client**: `server/github.ts` — uncacheable client pattern (tokens expire)

## a0p Engine (v1.0.2-S9 canon)

- **EDCMBONE**: 5-class operator vectors (P/K/Q/T/S), L1 normalization, L2 distance, merge/softfork/fork at 0.18/0.30
- **EDCM Metrics**: 6 families — CM (Constraint Mismatch), DA (Dissonance Accumulation), DRIFT, DVG (Divergence), INT (Intensity), TBF (Turn-Balance Fairness)
- **EDCM Behavioral Directives**: 6 directives (CONSTRAINT_REFOCUS, DISSONANCE_HALT, DRIFT_ANCHOR, DIVERGENCE_COMMIT, INTENSITY_CALM, BALANCE_CONCISE) with per-metric thresholds + per-directive toggles
- **80/20 Alerts**: TRIGGER >= 0.80, CLEAR <= 0.20, hysteresis band — named alerts: ALERT_CM_HIGH, ALERT_DA_RISING, ALERT_DRIFT_AWAY, ALERT_DVG_SPLIT, ALERT_INT_SPIKE, ALERT_TBF_SKEW
- **PCNA**: 53-node circular topology, adjacency distances {1,2,3,4,5,6,7,14}
- **PTCA**: Full 4D tensor (53×9×8×7 = 26,712 elements via Float64Array) — prime_node, sentinel, phase, heptagram
  - Heptagram 6+1 geometry: 6 ring sites + Z hub per seed
  - Exchange operator: ring rotation (Δ=1, dir=(-1)^s), intra-seed coupling (β=0.20 ring→hub, γ=0.10 hub→ring), inter-seed coupling (α=0.10 shared Z)
  - Diffusion solver: dt=0.01, alpha=0.6 beta=0.4 gamma=0.2
- **Multi-Armed Bandit**: UCB1 + EMA decay (λ=0.95), 4 domains (tool, model, ptca_route, pcna_route), cold start epsilon=0.3, cross-domain correlation tracking
- **11-Seed External Memory Tensor**: Outside working 53-node graph, sentinel governance (S1/S3/S4/S8/S9), semantic memory slots, projection matrices (11×53, 53×11), attribution traces, interference detection, semantic drift detection, exportable/importable identity
- **Sentinels S1-S9**: Canon evaluation order S6→S5→S2→S3→S8→S7→S4→S1→S9
  - S1_PROVENANCE, S2_POLICY, S3_BOUNDS, S4_APPROVAL, S5_CONTEXT, S6_IDENTITY, S7_MEMORY, S8_RISK, S9_AUDIT
- **S5_CONTEXT**: Window (turns, W=32), retrieval (none), hygiene (strip_secrets, redact_keys)
- **EDCMBONE Report**: Wrapped in `{ edcmbone: {...} }` per frozen spec, includes metrics/alerts/recommendations/provenance
- **Provenance**: Every event includes `{ ts, build: "v1.0.2-S9", hash }` block
- **Hash Chain**: SHA-256, genesis hash, canonical JSON with sorted keys
- **hmmm invariant**: Fail-closed — no silent fallback
- **Heartbeat**: Background task scheduler (30s tick), weighted task selection, autonomous research
- **Cost tracking**: Token counting and estimated cost per model
- **Canon spec**: tiw_spec/canon/spec.md (frozen v1.0.2-S9), tiw_spec/config/v1.0.2.json

## Adaptive Intelligence Layer

### Multi-Armed Bandit
- UCB1 with EMA decay (λ=0.95), exploration constant C=sqrt(2), cold start epsilon=0.3 for <5 pulls
- 4 domains: tool, model, ptca_route, pcna_route — each with multiple arms
- Cross-domain correlation tracking: records joint (tool+model+ptca+pcna) selections and composite reward
- All params adjustable via system_toggles: C, λ, epsilon, cold_start_threshold

### EDCM Behavioral Directives
- 6 directives triggered by EDCM metric thresholds (default 0.80)
- Per-directive toggles + per-metric threshold sliders
- Fired directives injected into agent system prompt
- Entire system toggleable via "edcm_directives" system toggle

### 11-Seed External Memory Tensor
- 11 seeds external to working 53-node graph, each with PTCA structural state (504 elements) + semantic summary + controls
- Sentinel governance: 5 checks (S1_PROVENANCE, S3_BOUNDS, S4_APPROVAL, S8_RISK, S9_COHERENCE) before each injection
- Projection IN (seeds→working 53) and OUT (working 53→seeds) with configurable learning rate α
- Attribution traces: per-seed contribution percentage per response
- Interference detection: cross-seed contradictory bias detection
- Semantic drift detection: every 50 requests, DRIFT metric on current vs original summary
- Exportable/importable identity (full JSON with all seeds + projections)
- User controls: label, summary, pin, weight slider, enable/disable, clear, import

### Dual-Model Synthesis
- Parallel Gemini + Grok execution, merged via Gemini
- Both responses EDCM-scored and bandit-rewarded
- Timeout/error fallback, toggleable via system toggle

### Custom Function Calls
- User-defined tools: webhook, javascript, or template handlers
- Per-model targeting, per-tool toggle, system-level toggle
- Bandit-rewarded after execution

## Autonomous Research (Heartbeat)

- **Scheduler**: `server/heartbeat.ts` — 30s tick interval, weighted task selection
- **Transcript Search**: Scans recent conversations, EDCM-scores messages, routes findings to Seed 7
- **GitHub Search**: Searches for autonomous agent/ethical AI repos, scores relevance, routes to Seed 1 + Seed 6
- **AI-AI Social Monitoring**: Monitors agent directories, Hugging Face, leaderboards, routes to Seed 7 + Seed 10
- **X/Twitter Monitor**: Reserved (disabled by default)
- **Discovery Drafts**: High-relevance findings auto-create proactive conversation starters in Console

## Append-Only Logging

- 7 streams: master, edcm, memory, sentinel, interference, attribution, transcripts
- All JSONL format, append-only, per-stream toggleable
- API endpoints for paginated reading of all streams
- Files in `logs/` directory

## Features

### Agent (`/`)
- Autonomous AI agent with Gemini function-calling (up to 8 tool rounds per request)
- 23 tools: run_command, read_file, write_file, list_files, search_files, list_gmail, read_gmail, send_gmail, list_drive, github_list_repos, github_get_file, github_list_files, github_create_or_update_file, github_delete_file, github_push_zip, codespace_list, codespace_create, codespace_start, codespace_stop, codespace_delete, codespace_exec, web_search, fetch_url
- EDCM directives injected into prompt when metrics exceed thresholds
- Memory context (enabled seed summaries) included in system prompt
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

### Console (`/console`) — 8 tabs
- **Workflow**: Engine status, emergency stop (Enter-key confirm), heartbeat log, hash chain status
- **Metrics**: Token usage, cost estimates, spend limits with slider + toggle
- **EDCM**: 6 metric families (CM/DA/DRIFT/DVG/INT/TBF), 80/20 alerts, PTCA tensor (53×9×8×7), sentinel context (S1-S9), EDCMBONE report, disposition & operators, history
- **Logs**: Unified log viewer — events, heartbeats, EDCM snapshots, commands, costs; filterable by source, searchable, expandable detail panels with raw payload inspection
- **Context**: Editable system prompt + context prefix, BYO API keys (OpenAI, Anthropic, Mistral, Cohere, Perplexity)
- **Bandit**: Four domain sections with per-arm toggles, reward bars, UCB1 scores; EDCM Directives panel; Cross-domain correlation panel
- **Memory**: 11 seed cards (label, summary, weight, enabled/pinned, clear/import); Sentinel audit; Attribution trace; Interference alerts; Drift warnings; Projection heatmaps; Export/Import
- **System**: Global toggles table; Parameter sliders per subsystem; Discovery drafts panel with "Start Conversation" promotion

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
- `bandit_arms` — multi-armed bandit arms per domain
- `custom_tools` — user-defined function calls
- `heartbeat_tasks` — background task scheduler
- `edcm_metric_snapshots` — append-only EDCM metric snapshots
- `memory_seeds` — 11 external memory seeds
- `memory_projections` — projection matrices (11×53, 53×11)
- `memory_tensor_snapshots` — append-only memory state snapshots
- `bandit_correlations` — cross-domain joint rewards
- `system_toggles` — per-subsystem toggles and parameters
- `discovery_drafts` — proactive conversation starters from heartbeat

## Key Files

- `server/routes.ts` — all API routes
- `server/storage.ts` — database storage layer (IStorage interface, 40+ methods)
- `server/a0p-engine.ts` — full engine: EDCMBONE, PCNA, PTCA, sentinels, hash chain, bandit, EDCM directives, memory tensor, correlation tracking
- `server/heartbeat.ts` — background task scheduler (transcript search, GitHub search, AI social monitoring, discovery drafts)
- `server/logger.ts` — append-only logging system (7 streams, per-stream toggles)
- `server/stripeClient.ts` — Stripe client + StripeSync setup
- `server/webhookHandlers.ts` — Stripe webhook processor
- `server/seed-products.ts` — Product seeding script (run manually)
- `server/replit_integrations/auth/` — Replit Auth module
- `server/gmail.ts` — Gmail client factory
- `server/drive.ts` — Google Drive client factory
- `server/xai.ts` — Grok/xAI client factory
- `server/github.ts` — GitHub client factory (uncacheable tokens)
- `client/src/pages/console.tsx` — multi-tab console (8 tabs: Workflow, Metrics, EDCM, Logs, Context, Bandit, Memory, System)
- `client/src/pages/pricing.tsx` — pricing/account page
- `client/src/pages/chat.tsx` — main chat UI
- `client/src/components/hmmm-doctrine.tsx` — hmmm doctrine footer
- `client/src/components/bottom-nav.tsx` — mobile bottom navigation
- `client/src/hooks/use-auth.ts` — Replit Auth hook
- `shared/schema.ts` — Drizzle schema + Zod types (20+ tables)
- `shared/models/auth.ts` — Auth-related models

## Environment Variables / Secrets

- `DATABASE_URL` — PostgreSQL (auto-provisioned)
- `SESSION_SECRET` — Express session secret
- `XAI_API_KEY` — xAI/Grok API key (user-provided)
- `AI_INTEGRATIONS_GEMINI_API_KEY` / `AI_INTEGRATIONS_GEMINI_BASE_URL` — Gemini (Replit-managed)
- `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY` — Google OAuth connectors (Replit-managed)
