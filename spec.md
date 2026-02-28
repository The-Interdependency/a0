# a0p — Agent Zero Platform

## Specification v1.0.0

**Version**: 1.0.0
**Status**: Frozen
**Platform**: Replit (NixOS container)
**Runtime**: Node.js + TypeScript

---

## 1. Overview

a0p (agent zero platform) is a mobile-first autonomous AI agent application. It combines Gemini function-calling with a mathematically rigorous orchestration engine (EDCMBONE), Google infrastructure access (Gmail, Drive), file management with direct phone upload, commercial subscriptions via Stripe, and Replit OAuth authentication.

The agent executes tasks autonomously using up to 9 tools across up to 8 rounds per request, with full cryptographic audit logging and real-time cost tracking.

---

## 2. Architecture

### 2.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Express.js 5 + TypeScript |
| Database | PostgreSQL (Drizzle ORM) |
| Auth | Replit Auth (OpenID Connect via Passport) |
| Payments | Stripe (via stripe-replit-sync) |
| AI (built-in) | Gemini 2.5 Flash, Grok-3 Mini |
| AI (BYO) | OpenAI, Anthropic, Mistral, Cohere, Perplexity |
| Google | Gmail API v1, Drive API v3 (via Replit Connectors) |
| Engine | EDCMBONE + PCNA/PTCA + SHA-256 hash chain |

### 2.2 Design Principles

- Mobile-first: optimized for phone browsers, "Add to Home Screen" PWA-like experience
- Fail-closed: no silent fallback (hmmm invariant)
- Autonomous: agent decides which tools to use; no manual model toggle
- Auditable: every engine action is hash-chained and timestamped
- Cost-aware: per-token tracking with estimated USD cost

---

## 3. EDCMBONE Engine

### 3.1 Operator Vector System

Five operator classes: **P**, **K**, **Q**, **T**, **S**

Each actor (Grok, Gemini, User) produces a 5-dimensional operator vector. Vectors are L1-normalized with epsilon = 1e-9 to prevent division by zero.

### 3.2 Distance and Decision

| Metric | Method |
|--------|--------|
| Distance | L2 (Euclidean) between normalized vectors |
| Merge | delta <= 0.18 |
| Softfork | delta <= 0.30 |
| Fork | delta > 0.30 |
| Align Risk | user divergence > 0.25 from either actor |

Class priority for conflict resolution: P=0, K=1, Q=2, T=3, S=4 (lowest index dominates).

### 3.3 PCNA (Probabilistic Cellular Network Automata)

- **Nodes**: n = 53
- **Topology**: Circular graph
- **Adjacency distances**: {1, 2, 3, 4, 5, 6, 7, 14}
- Each node connects to neighbors at those distances (modular arithmetic)

### 3.4 PTCA (Probabilistic Temporal Coupling Algorithm)

Explicit-Euler solver for state evolution on the PCNA topology.

| Parameter | Value | Role |
|-----------|-------|------|
| dt | 0.01 | Time step |
| dtheta | 2*pi/53 | Angular spacing |
| steps | 10 | Iterations per evaluation |
| alpha | 0.6 | Diffusion (neighbor coupling) |
| beta | 0.4 | Drift (sine-wave signal) |
| gamma | 0.2 | Damping (energy dissipation) |

**Energy** = mean square of state vector: `sum(v^2) / n`

### 3.5 Hash Chain

- Algorithm: SHA-256
- Genesis hash: SHA-256 of "a0p-genesis"
- Canonical JSON: sorted keys, deterministic stringification
- Hash = SHA-256(prevHash + canonicalJson(payload))
- Verification: recomputes every hash from genesis to detect tampering

### 3.6 Sentinels (S1-S9)

| Sentinel | Check |
|----------|-------|
| S1 | Input validation |
| S2 | Auth verification |
| S3 | Rate limiting |
| S4 | Hash chain integrity |
| S5 | Operator bounds (vector sum > epsilon) |
| S6 | PTCA stability (energy < 100) |
| S7 | Reserved |
| S8 | Reserved |
| S9 | HmmmEnforcer (hmmm invariant) |

### 3.7 HmmmInvariant

```
When uncertain, pause. When conflicted, disclose. No silent fallback.
```

Every process carries an hmmm state object (`{valid, message, timestamp}`). S9 enforces this at every sentinel check. The system fails explicitly rather than degrading silently.

### 3.8 Heartbeat

- Frequency: every 1 hour (3,600,000 ms)
- Startup: initial heartbeat at 5 seconds after launch
- Action: runs full hash chain verification, logs status (OK / CHAIN_ERROR / ERROR)

### 3.9 Emergency Stop

Manual kill switch. Sets `emergencyStop = true`, halts heartbeat. Resume available via API.

---

## 4. AI Agent

### 4.1 Function-Calling Architecture

The agent uses Gemini 2.5 Flash with native function-calling (not prompt-based tool use). Each user request can trigger up to 8 tool rounds.

### 4.2 Tools (9)

| Tool | Args | Description |
|------|------|-------------|
| run_command | command | Execute shell command (sandboxed allowlist) |
| read_file | path | Read file contents |
| write_file | path, content | Write/create file |
| list_files | path | List directory contents |
| search_files | query, path | Search files by name pattern |
| list_gmail | maxResults | List recent Gmail messages |
| read_gmail | messageId | Read full Gmail message body |
| send_gmail | to, subject, body | Send email via Gmail |
| list_drive | folderId, query | List/search Google Drive files |

### 4.3 Tool Output

- Terminal results truncated to 4,000 chars
- SSE display results truncated to 2,000 chars
- Tool calls shown as amber indicators in real-time
- Tool results displayed inline in conversation

### 4.4 Auto-Titling

After first successful response, the agent generates a short title for the conversation.

---

## 5. AI Models

### 5.1 Built-In

| Model | Provider | Cost (per 1M tokens) |
|-------|----------|---------------------|
| Gemini 2.5 Flash | Google (Replit Integration) | $0.075 prompt / $0.30 completion |
| Grok-3 Mini | xAI (XAI_API_KEY) | $0.30 prompt / $0.50 completion |

### 5.2 BYO (Bring Your Own)

Users supply API keys via Console > Context tab.

| Provider | OpenAI-Compatible | Models |
|----------|-------------------|--------|
| OpenAI | Yes | gpt-4o, gpt-4o-mini, gpt-3.5-turbo |
| Mistral | Yes | mistral-large, mistral-small, mistral-tiny |
| Perplexity | Yes | pplx-70b-online, pplx-7b-online |
| Anthropic | No (stubbed) | claude-3-opus, claude-3-sonnet |
| Cohere | No (stubbed) | command-r-plus, command-r |

### 5.3 AI Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/ai/models | List all available models (built-in + BYO) |
| POST | /api/ai/complete | Non-streaming completion |
| POST | /api/ai/stream | Streaming completion (SSE) |
| POST | /api/ai/estimate | Cost estimate for prompt |

---

## 6. Google Infrastructure

### 6.1 Gmail

Accessed via Replit Connector `google-mail`. Uses `googleapis` library with short-lived OAuth tokens.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/gmail/inbox | GET | List recent inbox messages |
| /api/gmail/messages/:id | GET | Read full message with body |
| /api/gmail/send | POST | Send plain-text email |

### 6.2 Google Drive

Accessed via Replit Connector `google-drive`. Same authentication mechanism as Gmail.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/drive/files | GET | List files in folder |
| /api/drive/files/:id | GET | Get file metadata |

### 6.3 Google Cloud Requirements

To fully operate a0p with Google services, the following are required:

**Via Replit Connectors (no manual setup):**
- `google-mail` connector — connect your Google account in Replit's integrations panel
- `google-drive` connector — connect your Google account in Replit's integrations panel

**Environment (auto-provided by Replit):**
- `REPLIT_CONNECTORS_HOSTNAME` — connector API hostname
- `REPL_IDENTITY` / `WEB_REPL_RENEWAL` — identity tokens for OAuth

**If self-hosting outside Replit (Google Cloud Console setup):**
1. Create a Google Cloud project at console.cloud.google.com
2. Enable the Gmail API (gmail.googleapis.com)
3. Enable the Google Drive API (drive.googleapis.com)
4. Create OAuth 2.0 credentials (Web Application type)
5. Set redirect URI to your deployment domain + /auth/callback
6. Set scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/drive.readonly`
7. Store credentials as environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
8. Implement OAuth2 token exchange flow (replacing Replit Connectors)
9. Store refresh tokens per user in the database

**Google Cloud billing**: Gmail API and Drive API have generous free tiers (1B quota units/day for Gmail, 1B queries/day for Drive). No billing account is strictly required for normal usage, but Google may require one to enable APIs.

---

## 7. File System

### 7.1 File Manager

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/files | GET | List directory contents |
| /api/files/read | GET | Read file content |
| /api/files/write | POST | Write/create file |
| /api/files/move | POST | Move/rename file |
| /api/files/upload | POST | Upload files from device (multer, max 50 files, 50MB each) |
| /api/files/upload-manifest | POST | Upload phone file manifest for dedup analysis |

### 7.2 Path Safety

All file paths are resolved against `process.cwd()` (BASE_DIR). Traversal above BASE_DIR is blocked.

### 7.3 Uploads

Files stored in `uploads/` directory. Filenames sanitized to alphanumeric + dots/hyphens/underscores, prefixed with timestamp.

---

## 8. Terminal

### 8.1 Sandboxed Execution

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/terminal/exec | POST | Execute command |
| /api/terminal/history | GET | Get command history |

### 8.2 Allowlisted Commands

```
ls, pwd, echo, cat, find, grep, head, tail, mkdir, touch, cp, mv, rm,
chmod, env, date, ps, df, du, which, whoami, uname, curl, wget,
python3, node, npm, npx, git, tar, zip, unzip, sed, awk, sort, wc, diff
```

All other commands return "Permission denied."

---

## 9. Authentication

### 9.1 Replit Auth

- Protocol: OpenID Connect via Passport
- Session store: PostgreSQL (`sessions` table via connect-pg-simple)
- Cookie: `secure: true` in production
- User fields: id (UUID), email, firstName, lastName, profileImageUrl

### 9.2 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/auth/replit | GET | Initiate Replit OAuth flow |
| /api/auth/replit/callback | GET | OAuth callback |
| /api/auth/logout | POST | End session |
| /api/auth/user | GET | Get current user |

---

## 10. Payments (Stripe)

### 10.1 Products

| Product | Price | Type |
|---------|-------|------|
| Core Access | $15/month | Subscription |
| Founder | $153 one-time | Payment (limited to 53) |
| Optional Support +$1 | $1 | Payment |
| Optional Support +$2 | $2 | Payment |
| Optional Support +$5 | $5 | Payment |
| Compute Credits $10 | $10 | Payment |
| Compute Credits $25 | $25 | Payment |
| Compute Credits $50 | $50 | Payment |

### 10.2 Stripe Integration

- Client: via Replit Connector (stripe) — auto-provides API keys
- Sync: stripe-replit-sync keeps local DB tables in sync with Stripe events
- Products seeded via `npx tsx server/seed-products.ts`
- Webhook: registered automatically when `REPLIT_DOMAINS` is available; skipped gracefully in dev

### 10.3 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/stripe/publishable-key | GET | Get publishable key |
| /api/stripe/products | GET | List active products/prices |
| /api/stripe/checkout | POST | Create checkout session |
| /api/stripe/portal | POST | Create billing portal session |

---

## 11. Database Schema

### 11.1 Tables

| Table | Purpose |
|-------|---------|
| users | Replit Auth users (UUID id, email, names, profile image) |
| sessions | Express sessions (sid, sess jsonb, expire) |
| conversations | Chat/task records (title, model, userId) |
| messages | Individual messages (role, content, model, metadata jsonb) |
| automation_tasks | Spec.md automation tasks (name, specContent, status, result) |
| command_history | Terminal command log (command, output, exitCode) |
| a0p_events | Hash-chained event log (taskId, eventType, payload, prevHash, hash, hmmm) |
| heartbeat_logs | Hourly heartbeat records (status, hashChainValid, details) |
| cost_metrics | Per-model token/cost tracking (model, promptTokens, completionTokens, estimatedCost) |
| edcm_snapshots | EDCMBONE evaluation history (operators, deltas, decision, ptcaState) |

### 11.2 Stripe-Managed Tables

Automatically created and synced by `stripe-replit-sync`:
- `stripe.products`
- `stripe.prices`
- `stripe.customers`
- `stripe.subscriptions`
- `stripe.checkout_sessions`

---

## 12. Frontend

### 12.1 Pages

| Route | Page | In Nav |
|-------|------|--------|
| / | Agent (main AI interface) | Yes |
| /terminal | Terminal | Yes |
| /files | Files (browser + upload) | Yes |
| /console | Console (5-tab control panel) | Yes |
| /pricing | Account/Pricing | Yes |
| /drive | Google Drive browser | No |
| /mail | Gmail interface | No |
| /automation | Spec automation | No |

### 12.2 Console Tabs

1. **Workflow**: Engine status, emergency stop, heartbeat log, hash chain status
2. **Metrics**: Token usage, cost estimates, spend limits (slider + toggle)
3. **EDCM**: Operator vectors, BONE delta, alignment risk, PTCA energy, history
4. **Context**: System prompt, context prefix, BYO API keys
5. **Costs**: Donation vs API cost comparison, coverage percentage

### 12.3 Bottom Navigation

5 tabs: Agent, Term, Files, Console, Account

### 12.4 Styling

- Dark mode by default
- Tailwind CSS + shadcn/ui components
- Lucide React icons
- Mobile-first responsive design

---

## 13. Environment Variables

### 13.1 Required Secrets

| Variable | Source | Purpose |
|----------|--------|---------|
| DATABASE_URL | Replit (auto) | PostgreSQL connection |
| SESSION_SECRET | Manual | Express session encryption |
| XAI_API_KEY | Manual | xAI/Grok API access |

### 13.2 Auto-Provided by Replit

| Variable | Purpose |
|----------|---------|
| AI_INTEGRATIONS_GEMINI_API_KEY | Gemini API key |
| AI_INTEGRATIONS_GEMINI_BASE_URL | Gemini API base URL |
| REPLIT_CONNECTORS_HOSTNAME | Connector API host |
| REPL_IDENTITY | Identity token for connectors |
| REPLIT_DOMAINS | Deployment domain (for webhooks) |

---

## 14. Key Files

```
server/
  index.ts              — Express server entry point
  routes.ts             — All API routes
  storage.ts            — Database storage layer (IStorage interface)
  a0p-engine.ts         — EDCMBONE, PCNA, PTCA, sentinels, hash chain, heartbeat
  stripeClient.ts       — Stripe client + sync setup
  webhookHandlers.ts    — Stripe webhook processor
  seed-products.ts      — Stripe product seeding script
  gmail.ts              — Gmail client factory
  drive.ts              — Google Drive client factory
  xai.ts                — Grok/xAI client factory
  replit_integrations/  — Auth module (Passport + Replit OpenID)

client/src/
  App.tsx               — Router + layout
  pages/
    chat.tsx            — Agent command interface
    terminal.tsx        — Shell terminal
    files.tsx           — File manager + upload
    console.tsx         — 5-tab control panel
    pricing.tsx         — Stripe pricing/account
    drive.tsx           — Google Drive browser
    mail.tsx            — Gmail interface
    automation.tsx      — Spec automation
  components/
    bottom-nav.tsx      — Mobile navigation
    hmmm-doctrine.tsx   — Doctrine footer

shared/
  schema.ts             — Drizzle schema + Zod types
  models/auth.ts        — Auth-related models
```

---

## 15. Deployment

### 15.1 Commands

| Command | Purpose |
|---------|---------|
| npm run dev | Development (tsx watch) |
| npm run build | Production build |
| npm run start | Production server |
| npm run db:push | Sync schema to database |
| npx tsx server/seed-products.ts | Seed Stripe products |

### 15.2 Production Notes

- Single port (5000) serves both API and frontend (Vite SSR in dev, static in prod)
- Session cookies set `secure: true` in production
- Stripe webhook auto-registers when `REPLIT_DOMAINS` is available
- Hash chain verification runs on startup (5s) and hourly

---

## 16. Cost Model

### 16.1 Token Rates

| Model | Prompt (per 1M) | Completion (per 1M) |
|-------|-----------------|---------------------|
| Gemini 2.5 Flash | $0.075 | $0.30 |
| Grok-3 Mini | $0.30 | $0.50 |

### 16.2 Tracking

Every AI call records:
- User ID (if authenticated)
- Model used
- Prompt token count (estimated: string length / 4)
- Completion token count
- Estimated USD cost

Available via `/api/metrics/costs` and `/api/metrics/costs/history`.

---

## 17. Security

- Path traversal prevention on file operations
- Command allowlist on terminal
- L1-normalized operator vectors prevent zero-division
- PTCA stability guard (energy < 100)
- SHA-256 hash chain tamper detection
- Session-based auth with secure cookies
- BYO API keys stored in-memory (not persisted to DB)
- Filename sanitization on uploads
- File size limits (50MB per file)
