# a0p

**a0p is a research instrument, not a product.** It explores the interplay between an autonomous agent (`a0(zeta fun alpha echo)`), pluggable LLM "energy providers" (Gemini, Claude, Grok, OpenAI, xAI), and a 53-node PCNA alignment engine. Everything is open to read, use, and learn from. Code-altering access is a deliberately small circle.

## How to use it (read-only)

You don't need an account to read the docs or browse the public surface. To try the chat / Forge / transcript explainer end-to-end:

1. Sign in with Replit Auth at `/login`.
2. The console at `/console` exposes every live tab — agents, PCNA rings, EDCM scoring, bandits, energy providers, custom tools, transcripts, billing.
3. Free-tier users get one transcript upload per month. The console itself is fully unlocked.

There is no hidden tier wall on read access. The previous "Free / Seeker / Operator / Patron / Founder" pricing language has been retired — it never matched what the code actually enforced.

## How to support it

Donations only. No subscriptions.

> "I don't have the cash required for 501c3 status, so I have to report it for taxes, but every tax payer is allowed to claim up to five hundred dollars in charitable donations per year without receipts required."

The donation page lives at `/pricing`. A donation does **not** buy you any feature, tier, or unlock — it pays for the instrument's continued operation. Minimum is $5.

The single productized service is the **EDCMbone transcript explainer** — a one-off paid analysis priced against the operator's $1,000/hr benchmark. That work is delivered manually; the donations page is the only self-serve money path.

## Who can change the code

There are exactly two tiers of write access:

1. **The owner (Erin) and an explicitly invited inner circle.** Anyone whose `users.role = 'admin'` or whose email is in the `admin_emails` table can mutate shared instrument state — prompt contexts, energy-provider seeds, custom tools, admin emails, the resolution directory, billing/tier overrides, etc. The inner circle is currently small and audited.
2. **Everyone else.** Sign-in lets you mutate your own data — your own conversations, your own Forge agents, your own transcript uploads, your own preferences. You cannot reach into shared instrument state.

This is enforced at the route layer and protected by a contract test (`python/tests/contracts/route_gating.py`) that asserts every write endpoint is either gated by an explicit ownership/admin check, gated by a per-caller `x-user-id`, or explicitly listed in an allowlist with a written reason. Adding a new write endpoint without falling into one of those buckets fails the contract.

If you want to be invited into the inner circle, talk to the owner directly. There is no self-serve path to admin.

## Architecture, in one paragraph

Express on port 5000 fronts everything (auth, sessions, guest chat, the React/Vite UI, and a proxy to the Python backend). FastAPI on port 8001 carries all the AI + data logic and is never directly exposed; Express attaches an `x-a0p-internal` header on every proxied request and Python rejects anything missing it. The frontend is metadata-driven: every Python route module declares `UI_META` + `DATA_SCHEMA`, `/api/v1/ui/structure` aggregates them, and the React console renders tabs from that tree. There are no hardcoded tabs in the UI. See `replit.md` for the full architectural map.

## Repository conventions

- Every `.py`, `.ts`, `.tsx` file opens and closes with a `# N:M` annotation (code lines : comment lines). Run `python scripts/annotate.py` to re-stamp.
- No file over 400 lines. No stubs or TODOs in production code.
- Route modules under `python/routes/` declare `# DOC` comment blocks that feed `/api/v1/docs`.
- Contract tests live in `python/tests/contracts/`; run them with `python -m python.tests.contract_runner`.
- The authoritative module-doctrine reference is `.agents/skills/a0p-module-doctrine/SKILL.md`.

## Status

Active research. Things break. The instrument is what's being studied. If you find a regression, open an issue or — better — read `replit.md`, find the contract that should have caught it, and add one.
