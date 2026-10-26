# Threat Model

## Project Overview

This repository powers a0p, a public-facing research instrument with a React/Vite frontend, an Express public edge, and an internal FastAPI backend. Express handles browser sessions, authentication routes, guest-chat gating, and proxies `/api/*` requests to FastAPI; FastAPI owns most application data, transcript processing, billing, and admin tool/module configuration. PostgreSQL stores users, sessions, billing state, conversations, transcript artifacts, and admin configuration.

Production scope for this scan assumes `NODE_ENV=production`, Replit-managed TLS at the edge, Express as the only public network entry point, and FastAPI reachable only through the Express proxy or explicitly internal callers.

## Assets

- **User accounts and recovery factors** — usernames, email addresses, passphrase hashes, challenge-question answers, and recovery/reset state. Compromise allows account takeover.
- **Authenticated sessions** — Express session cookies and server-side session rows. Compromise allows impersonation until expiry or logout.
- **Private user content** — conversations, transcript uploads, generated explanations, and attachments. These contain sensitive user-authored and model-generated data.
- **Billing state** — Stripe customer IDs, subscription metadata, donation/explainer checkout state, and tier assignments. Abuse can redirect users, confuse payment flows, or mutate entitlements.
- **Administrative instrument state** — tools, WS modules, prompt contexts, provider configuration, admin-email allowlists, and other shared system controls. Abuse here can affect every user.
- **Application secrets** — `SESSION_SECRET`, `INTERNAL_API_SECRET`, Stripe secrets, DB credentials, and provider API keys.

## Trust Boundaries

- **Browser → Express** — the browser is untrusted. All auth, input validation, and CSRF-resistant assumptions must be enforced at the server.
- **Express → FastAPI** — FastAPI trusts identity and internal-origin headers supplied by Express. If this boundary collapses, user spoofing and admin abuse become possible.
- **Application → PostgreSQL** — both Node and Python processes can read and mutate security-sensitive data. Injection or overly broad queries would expose core assets.
- **Application → Stripe** — billing routes create checkout and portal sessions using Stripe secret keys. Caller-controlled redirect targets or weak webhook validation can abuse user trust or billing state.
- **Authenticated user → Admin/operator** — most reads are per-user, while mutation of shared instrument state is admin-only. This separation must hold server-side regardless of client behavior.
- **Public/guest → Authenticated user** — guest chat is intentionally public-but-limited; account, transcript, and billing data are private and must remain inaccessible without a valid session.
- **Authenticated user → Uploaded content** — user-supplied files cross from storage into browser rendering. Files served from the app origin must not become active same-origin content for other users.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/auth/*`, `python/main.py`, `python/routes/*.py`.
- **Highest-risk areas:** auth and account recovery in `server/auth/routes.ts`; internal-header trust boundary in `server/index.ts` and Python `_user_id()` callers; billing in `python/routes/billing.py`; admin mutation routes such as `python/routes/tools.py` and `python/routes/ws_modules.py`; upload/transcript flows in `server/attachments.ts`, `/uploads` serving in `server/index.ts`, and `python/routes/transcripts.py`.
- **Public vs authenticated vs admin:** public auth/login/reset and guest-chat endpoints live in Express; most `/api/v1/*` reads and per-user writes require Express-authenticated identity headers; shared-state mutation routes require admin gating.
- **Usually ignore unless proven reachable in production:** mockup/dev scaffolding, local scripts, and unused client helpers such as standalone render utilities with no production imports.

## Threat Categories

### Spoofing

The key spoofing risk is identity confusion across the Express-to-FastAPI handoff. FastAPI relies on `x-user-id`, `x-user-email`, `x-user-role`, and `x-a0p-internal` headers injected by Express, so the system must preserve the guarantee that public callers cannot set those headers directly against production-reachable Python routes. Session establishment and recovery flows must also resist online guessing so attackers cannot impersonate users through weak reset factors.

Required guarantees:
- Only Express or explicitly internal callers may reach privileged FastAPI paths that trust `x-a0p-internal`.
- Express sessions must be regenerated on auth-boundary changes and backed by unpredictable secrets in production.
- Account-recovery and login flows must resist brute force and credential enumeration at the network edge.

### Tampering

Users can submit conversation content, transcript files, billing parameters, and metadata that eventually affect stored state or third-party calls. The server must treat all such inputs as hostile. Stripe-facing routes must re-derive any security-sensitive values server-side, and admin mutation routes must reject non-admin callers regardless of client UI gating.

Required guarantees:
- Shared instrument state mutations must require server-side admin checks.
- Payment amount, product semantics, and entitlement changes must be derived server-side rather than trusted from client metadata.
- Uploaded files and attachment references must be validated for size, type, ownership, and filesystem scope before processing.

### Information Disclosure

The application stores private chats, transcript uploads, explanations, and billing identifiers. The main disclosure risk is cross-user data exposure through missing ownership checks, overly broad queries, verbose error flows that reveal account existence or recovery configuration, and uploaded-file serving paths that are not owner-scoped.

Required guarantees:
- Conversation, transcript, explanation, and attachment reads must be scoped to the authenticated owner.
- Error messages should avoid unnecessary disclosure of account existence, recovery configuration, or internal implementation details where that information materially helps attackers.
- Secrets and privileged headers must never be exposed to the client.
- Uploaded files must not become readable by unrelated authenticated users solely because a storage URL is known.

### Denial of Service

The app accepts uploads, guest-chat requests, auth attempts, and model-triggering actions. Expensive or unauthenticated operations are attractive abuse targets. Guest chat already has token-window controls; similar edge protections are required anywhere attackers can repeatedly trigger sensitive checks or costly work.

Required guarantees:
- Public and auth-sensitive endpoints must enforce rate limits or equivalent abuse controls.
- File uploads and background processing must retain strict byte-size and type limits.
- External calls must use timeouts so dependency stalls do not pin server resources indefinitely.

### Elevation of Privilege

This codebase has a strong privilege split between normal authenticated users and admins/operators who can change shared instrument behavior. The main privilege-escalation risks are missing admin checks on mutation routes, header-trust bypasses that let callers forge admin identity, and filesystem or injection bugs that break containment. Serving uploaded HTML from the application origin also turns stored user content into an execution primitive that can act with a victim's authenticated privileges.

Required guarantees:
- Every shared-state mutation route must enforce admin gating server-side.
- Per-user routes must verify ownership before reads or writes.
- File resolution and storage paths must stay confined to intended directories.
- Untrusted uploaded content must not execute as same-origin active content in other users' browsers.
- Both Node and Python database access must remain parameterized and avoid user-controlled query construction.
