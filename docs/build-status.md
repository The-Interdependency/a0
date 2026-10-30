# A0 build status — resumption record

Last updated: 2026-10-30 (VM local time)

## Current state

- **Source**: The-Interdependency/a0 checkout at `/home/wayseer_interdependentway_org/a0` and deployed at `/opt/a0`.
- **Deployed HEAD**: see docs/release.md (matches `/opt/a0` `git rev-parse HEAD`).
- **Deployment**: production A0 running on this VM. HTTPS URL: https://35.212.252.101.nip.io (and https://35.212.252.101.sslip.io).
- **Issue #118**: all code-fixable findings (F01–F12, F15, F16 code portion, additional usability) implemented, verified, and committed; F13/F14 partial (provider + backup/restore evidence below); F16 publication completed via `gh` auth.

## Issue #118 checklist status

| Finding | Status | Evidence |
| --- | --- | --- |
| F01 P1 Markdown/XSS | DONE | `apps/web/markdown.js` safe renderer + CSP header; `tests/frontend/run.js` adversarial fixtures all inert. |
| F02 P1 Stop lifetime | DONE | Stop bound to `{runId, conversationId}`, visible until terminal event; cancellation verified (A23). |
| F03 P1 switching choices | DONE | Switch modal with New conversation / One answer or continue / Compare models; served-source check passes. |
| F04 P1 project flows | DONE | Project selection + conversation association + project instructions verified in model context (marker found). |
| F05 P2 drafts | DONE | Draft/attachment preservation + retry + idempotent clientRequestId (1→1 user messages). |
| F06 P2 run/conversation isolation | DONE | Panes/streams/approvals keyed to conversation/run; navigation no longer hijacked. |
| F07 P2 About overflow | DONE | `#aboutBox pre` pre-wrap/anywhere CSS; real-phone confirmation still pending (A17). |
| F08 P2 voice errors | DONE | `voiceErrorMessage()` visible feedback + capture reset. |
| F09 P2 speech truncation | DONE | Chunked playback, no silent 1500-char limit, per-message speak, auto-speak only new completed responses. |
| F10 P2 no-selection dispatch | DONE | Send blocked with visible error when nothing selected; documented DeepSeek default only on load. |
| F11 P3 About numbering | DONE | Server emits unnumbered assembly order; `<ol>` owns numbering. |
| F12 ledger | DONE | docs/acceptance.md rebuilt: one row per A01–A24, totals 21 PASS / 1 FAIL / 2 BLOCKED / 0 NOT RUN. |
| F13 P1 live providers | PARTIAL | `/api/providers/:provider/test` diagnosis endpoint added. openai/xai/deepseek PASS real test requests; anthropic BLOCKED (no key) — operator action remains. |
| F14 P1 off-VM recovery | PARTIAL | GnuPG integrity-protected backups + manifest + tamper-failure + restored-Bao canary verified. Off-VM copy remains operator action. |
| F15 P1 rollback | DONE | `operations/rollback.sh --check` rehearsal passed; `--apply` documented. |
| F16 P2 publication | DONE (after push) | Build identity in `/api/health`; commits pushed via `gh` (erinepshovel-code account). |
| Additional usability | DONE | Attributed context-selection modal, MCP auth masked with reveal, visible mutation failures, keyboard semantics, voice privacy note in About. |

## Gate results

- Acceptance A01–A24 (final run): **21 PASS, 1 FAIL (A04), 2 BLOCKED (A17/A18), 0 NOT RUN** — see docs/acceptance.md.
- A04 detail: openai PASS, xai PASS, deepseek PASS, anthropic BLOCKED (no key). OpenAI's earlier 401 was traced to a clobbered key (previous acceptance run overwrote it with a test placeholder); the real key was re-imported and now passes.

## Selected decisions (issue #118)

- Markdown: home-grown string renderer replaced with `apps/web/markdown.js` (escape text → validate protocols → escape attributes) plus Caddy CSP header.
- Provider diagnosis: `/api/providers/:provider/test` makes one minimal real request and returns the provider's actual status/message (key value never returned).
- Backup: switched from `openssl enc` to `gpg --symmetric --cipher-algo AES256` (integrity-protected); embedded SHA-256 manifest verified before SQL execution; restored-Bao usability proven by starting a second OpenBao against the restored store and reading the original canary.
- Rollback: `operations/rollback.sh --check` (isolated rehearsal) and `--apply` (maintenance-state restore + redeploy recorded commit).
- Acceptance hygiene: runner now emits exactly one row per case, uses a dedicated nonsecret vault canary (A12) and provider `/test` (A11), never overwrites real provider keys, and runs as a temporary owner (`a0test`) that is deleted afterward.

## Running jobs

- `systemctl status a0 openbao a0-caddy` — all active.
- Caddy certificate renewal automatic (Let's Encrypt).

## Next action

- Operator (Erin): add an Anthropic key in Settings → Providers; open the site from the Android phone to close A17/A18; copy `/srv/a0/backups/*.gpg` + `/etc/a0/backup.key` off-VM.

## Outstanding hmmm

- Anthropic key not configured (A04 cannot pass until all four providers succeed).
- Real-phone browser/microphone observation (A17/A18).
- Off-VM backup/key copy not yet performed by the operator.
- Org hostname (a0.interdependentway.org) requires DNS A record to 35.212.252.101 plus Caddyfile hostname addition if a vanity URL is wanted.

## Issue #119 reactivation — in-progress record (2026-10-30)

Scope amendment FR0–FR4 accepted. **FR0 and FR1 are implemented, verified, and live on this VM.** FR2–FR4 remain pending producer integrations (PTCNA/Forge/temp modules/AHBG) and are recorded honestly below; no scaffold is promoted as a pass.

| Area | Status | Evidence |
| --- | --- | --- |
| FR0 OpenAI calls | DONE (text path) | Current GPT-6 catalogue in providers.js; distinct `/v1/responses` streaming transport; complete output-item replay + `call_id` tool continuation; cache/reasoning usage columns; in-place participant model upgrade (UI + API); Settings Test uses the same adapter and exact selected model. `tests/fr0-fr1/run.js` all PASS; live `gpt-6-luna` text smoke PASS on the deployed site. |
| FR1 context editor | DONE (backend + phone editor) | Structured source-attributed blocks (harness/project/history/tool), immutable revisions, single preview/dispatch assembler, conflict 409, forecast-labeled cache estimate, editor modal in the website. RC01/RC02/RC05 PASS; RC03/RC04 remain operator/live-observation. |
| FR2 agents/tools + PTCNA/Forge | NOT RUN | Requires the retained PTCNA cores (`c5fa9a59…`), Forge eight-template catalogue, and excluded-component isolation (Jury/Bandit/Meta-13/ZFAE). No scaffold shipped. |
| FR3 temporary modules | NOT RUN | Requires FR2's agent/module lifecycle. Archived form/schema is reference-only; no working hot-swap loader is claimed. |
| FR4 AHBG | NOT RUN | Requires Stack `ahbg/` runtime + successor adapter + UCNS geometry pin reconciliation. |
| RD/RP/RU/RA/RM/RG/RX gates | NOT RUN | Blocked on FR2–FR4; will be run when those features exist. |

A01–A24 ledger after FR0/FR1: unchanged at **21 PASS / 1 FAIL (A04) / 2 BLOCKED / 0 NOT RUN** (see docs/acceptance.md). RO01/RO02 PASS; RO03 partial; RO04 partial (text smoke only); RC01/RC02/RC05 PASS; RC03/RC04 NOT RUN.
