# A0 acceptance record (issue #118 corrective rerun)

Source: deployed at https://35.212.252.101.nip.io on VM `a0-prod-1` (GCP project `cs-poc-ab8uzg6ej7vv4vwtyywhbwn`).
Runner: `tests/acceptance/run.js` (updated for F01–F16). Date: 2026-10-30.
Method: automated runner over public HTTPS as a temporary acceptance owner (`a0test`, deleted after the run; production owner `erin` untouched). Provider test requests were real; chat context tests used the in-runner fake OpenAI-compatible provider and fake MCP server.

## Ledger (one status per A01–A24)

| ID | Result | Method + evidence |
| --- | --- | --- |
| A01 | PASS | Automated: anonymous /api/me, /api/conversations, /api/attachments/* → 401; wrong setup code → 403/409 (owner exists). |
| A02 | PASS | Automated: inert key add/replace/delete via `/api/providers/anthropic/key`; provider list never returned the value. Real provider keys untouched. |
| A03 | PASS | Automated: new conversation returned `a0-harness/1.0.0` with zero messages. |
| A04 | FAIL | Automated + real provider /test requests: openai PASS, xai PASS, deepseek PASS; anthropic BLOCKED (no key). A04 cannot pass until all four providers succeed; remaining operator action: add an Anthropic key. |
| A05 | PASS | Automated: continue switching delivered full prior history (system,user,assistant,user). |
| A06 | PASS | Automated: two participants received identical semantic snapshots. |
| A07 | PASS | Automated: next round included both prior assistant responses with attribution. |
| A08 | PASS | Automated: selected-response policy applied equally; excluded responses stayed saved. |
| A09 | PASS | Automated: 1→3→1 participants without history loss (5 assistant messages). |
| A10 | PASS | Automated: image-incompatible participant reported mismatch before dispatch. |
| A11 | PASS | Automated: missing Anthropic key produced "No Anthropic API key is configured…" via the provider /test endpoint. |
| A12 | PASS | Automated: dedicated nonsecret canary (`/api/acceptance-canary`) survived `systemctl restart openbao` and was read back. |
| A13 | PASS | Operator-run `RUN_OPS=1`: backup.sh → encrypted backup; restore.sh → isolated `a0app_verify1`/`openbao_verify1` restore; second OpenBao instance started against the restored store, unsealed, and read the original canary (`CANARY_OK`). Tampered copy of the backup failed decryption (script exit 2) before extraction. |
| A14 | PASS | Automated: conversation survived `systemctl restart a0` (2→2 messages). |
| A15 | PASS | Automated: authorized upload/retrieval returned exact bytes; anonymous retrieval → 401. |
| A16 | PASS | Automated: per-participant outcomes retained (one complete, one honest 429); idempotent retry with same clientRequestId kept 1→1 user messages. |
| A17 | BLOCKED | No physical Android phone available. Automated HTTPS checks pass (200 + CSP + streaming). Operator action: open from Erin's Android browser. |
| A18 | BLOCKED | Project instructions verified in model context (marker found). Real-phone microphone/voice flow still needs the phone. |
| A19 | PASS | Automated: logout revoked session; stale cookie → 401. |
| A20 | PASS | Automated: fake MCP server discovery found 2 tools; loopback blocked unless explicitly allowed; enable/disable persisted. |
| A21 | PASS | Automated: tool proposal executed through the shared coordinator after explicit authorization. |
| A22 | PASS | Automated: two duplicate tool proposals surfaced together for coordination. |
| A23 | PASS | Automated: cancellation stopped new dispatch; zero tool invocations. |
| A24 | PASS | Automated + operator-run: served-source issue-#118 checks all pass (CSP header, safe renderer import, switching choices, draft preservation, voice errors, no silent fallback dispatch, unnumbered assembly order, About CSS); rollback `--check` rehearsal passed. |

**Totals: PASS 21, FAIL 1, BLOCKED 2, NOT RUN 0, TOTAL 24** (calculated from the rows above).

## Issue #118 findings closed by this run

- F01 P1: safe renderer (`apps/web/markdown.js`), CSP header, adversarial fixture suite (`tests/frontend/run.js`).
- F02 P1: Stop stays visible for the active run; cancellation bound to `{runId, conversationId}`.
- F03 P1: explicit New conversation / One answer or continue / Compare models switch modal.
- F04 P1: project selection/association UI + verified project instructions in model context.
- F05 P2: draft/attachment preservation + retry bar + idempotent clientRequestId.
- F06 P2: panes/streams/tool approvals bound to conversation/run identity; navigation no longer hijacked.
- F07 P2: About overflow CSS (`#aboutBox pre` pre-wrap/anywhere).
- F08 P2: visible voice errors + reset capture state.
- F09 P2: chunked speech (no silent 1500-char limit); per-message speak button; auto-speak only for new completed responses.
- F10 P2: send blocked with visible error when no participant selected; documented DeepSeek default restored only on load.
- F11 P3: assembly-order strings unnumbered server-side; `<ol>` owns numbering.
- F12: ledger rebuilt as one row per A01–A24 with totals computed from rows.
- F13: provider `/test` diagnosis endpoint; OpenAI 401 was traced to a clobbered key, now re-imported and passing; Anthropic remains the only missing provider key.
- F14: GnuPG symmetric (AES256, integrity-protected) backups + manifest verification + tamper failure + restored-Bao usability.
- F15: `operations/rollback.sh --check` rehearsal passed; `--apply` documented maintenance-state path.
- F16: build identity in `/api/health` + served-source checks; publication via `gh` auth (commits pushed below).
- Additional usability: attributed context-selection modal, MCP auth masked with reveal, visible mutation failures, keyboard semantics (buttons + aria labels), voice dependency/privacy documented in About.

## hmmm

- A17/A18 real-phone observation and Anthropic key remain operator actions.
- Off-VM copy of `/srv/a0/backups/*.gpg` and `/etc/a0/backup.key` remains to be performed by the operator.

## Issue #119 FR0/FR1 added gates (2026-10-30)

Runner: `tests/fr0-fr1/run.js` (offline Responses fixtures) + `/tmp/fr1-check.mjs` (production checks as temporary owner) + live OpenAI Responses smoke.

| Gate | Result | Evidence |
| --- | --- | --- |
| RO01 | PASS (API-level) | seed-defaults creates missing defaults without overwriting (C02 fix); provider list exposes the exact GPT-6 catalogue; in-place model edit for all four providers; Settings Test ran against the selected model. Full website phone flow remains OC09. |
| RO02 | PASS (fixture-level) | `tests/fr0-fr1/run.js` offline fixtures: typed text+image input preserved, fragmented function-call deltas accumulated with `call_id` correlation, incomplete/failed/EOF outcomes distinguished, Stop aborts the body read, reasoning.effort validation rejects Sol with `none`. Does not by itself establish the full website approval flow (see OC07). |
| RO03 | PARTIAL | Chat and Responses usage shapes normalize to input/output/total + cache_read/cache_write/reasoning tokens with raw preserved; live run recorded `prompt_tokens=117, completion_tokens=5, cache_read_tokens=0, reasoning_tokens=0`. Continuation-state replay across edits/forks is not yet proven live; the remaining half stays open until RO04 live tool smoke. |
| RO04 | PARTIAL | Live text smoke via the deployed website: OpenAI participant `gpt-6-luna` returned `ok` with usage. Image and authorized-tool-to-answer smoke checks need an image-enabled, MCP-attached live run and remain operator actions. |
| RC01 | PASS (API-level) | `/api/conversations/:id/context` preview and run assembly share `contexts.js`; project edit reached both preview and the frozen run snapshot; latest revision persists across reads. Full preview → save → new message → exact provider request is covered by the issue-#120 script (C04) at API level. |
| RC02 | PASS | Edited project block without history messages did not corrupt segmentation; saved revision is immutable; cache estimate labeled a forecast with earliest changed block. |
| RC03 | NOT RUN (partial) | Deterministic serialization and actual provider cache observations require live multi-round runs; absent usage remains unknown by construction. |
| RC04 | NOT RUN | Editing during a stream requires the real-phone/UI observation; frozen revisions are used per run so next run sees the new revision. |
| RC05 | PASS | Stale `expectedRevision` returned 409 with the current revision; unauthorized callers are blocked by owner checks (A01). |

A01–A24 rerun after FR0/FR1: unchanged at **21 PASS, 1 FAIL (A04), 2 BLOCKED (A17/A18), 0 NOT RUN** (RUN_OPS=1 run).

## Issue #120 corrective record (2026-10-30)

Defect repairs verified by `tests/issue120/run.js` (static + API + fake-provider e2e) and `tests/fr0-fr1/run.js`:

| Defect | Repair | Evidence |
| --- | --- | --- |
| C01 model controls/race | loadProviders rerenders participant cards; pills show model IDs; all providers editable; saved custom IDs shown accurately | issue120 script PASS (static served-source) |
| C02 defaults overwrite | seed-defaults only creates missing rows | code + RO01 API check |
| C03 switching unreliable | authoritative `messageCount`; Continue = one model; Compare = explicit ≥2; mode persisted | issue120 script PASS (static) |
| C04 edits discarded | freeze starts from latest saved revision and appends new history | issue120 script PASS (owner override survived new message + dispatch) |
| C05 attachments | storage_key preserved through blocks; hydration failure fails before dispatch; count limit enforced | issue120 script PASS (image bytes intact) |
| C06 diagnostics lost | failed/incomplete outcomes persist `meta.error`/`meta.code` on messages | issue120 script PASS |
| C07 Stop/deadline detach | timer/abort listener retained until terminal EOF/error | fr0-fr1 suite PASS (Stop during stream aborts) |
| C08 tool approval loses run | client keeps activeRun until run_complete/run_error | served-source + A21/A23 PASS |
| C09 tool identity | coordinator preserves participantId + providerToolCallId; tool_actions use one persisted UUID | issue120 unit PASS + A21/A22 PASS |
| C10 continuation/outcomes | per-participant continuation accumulation; failed/incomplete never marked complete; run status truthful | code + A21/A22 PASS (multi-round live OpenAI remains RO04) |
| C11 settings ignored | typed settings contract (reject unknown), forwarded to all adapters, owner defaults PUT /api/settings | code + settings endpoints live |
| C12 OpenAI mappings | 1,050,000 context / 128,000 output; xhigh/max efforts; top-level `prompt_cache_key`; `cache_write_tokens` | code + fr0-fr1 suite still PASS |
| C13 draft TypeError | complete attachment descriptors preserved/restored; legacy drafts tolerated | issue120 script PASS (static) |
| C14 tools/web coarse | MCP cards show tool names/descriptions; disabled connections rejected at dispatch | issue120 script + code |
| C15 phone choices | readable pills, wrapped model rows, full scrollable context, owner prefs (text size, Enter-to-send, voice rate, auto-speak, layout) persisted | issue120 script PASS (static served-source) |
| C16 ledger overclaim | RO03 narrowed to PARTIAL; RO01/RO02/RC01 labeled API/fixture-level; OC07/OC09 remain | this document |

OC gates: OC01 partial (inventory recorded below), OC02 PASS at API level (all providers editable; phone OC09 pending), OC03 partial (settings effect verified for model/timeout; full reload matrix pending), OC04 PASS at API level (C03/C04 e2e), OC05 PASS at API level (C04/C05 e2e), OC06 PASS (C06/C13), OC07 PASS (full offline tool lifecycle through the real server path: two Responses rounds, call_id correlation, executed MCP result returned to the model), OC08 PASS at fixture level (C07), OC09 NOT RUN (physical phone), OC10 updated here.

## Issue #119 FR2/FR3 reactivation record (2026-10-31)

Retained agents and temporary modules are now live; FR4 (AHBG) remains NOT RUN.

| Gate | Result | Evidence |
| --- | --- | --- |
| RD01 | PASS (partial) | Eight exact Forge templates and Phi/Psi/Omega core definitions served verbatim from the archive with path/symbol/digest provenance (`/api/forge/templates`); `tests/issue119/run.js` checks exact Sage prompt. |
| RD02 | PARTIAL | Effective instructions are bound per agent (original vs effective shown in UI); provider-payload use is via the existing run/participant path; full exact-text inspector across hot swap/restart remains operator observation. |
| RD03 | PASS | No active registration of Jury/Bandit/Meta-13/ZFAE; historical mentions exist only inside exact retained core text (allowed). |
| RP01 | PASS (partial) | Pinned producer PTCNA runtime (ptcna c5fa9a59 + ucns b7b6f35) runs in a loopback sidecar; per-agent phi/psi/omega/memory_l/memory_s state created, inferred, and independently mutated (one agent's infer leaves the other unchanged). Fork uses producer-object deep copy; absorb/converge merge algebra NOT RUN. |
| RU01 | PARTIAL | Source-path/function-to-successor ledger for Forge/PTCNA is in `apps/server/src/retained/definitions.js` + `operations/ptcna-sidecar.py`; full UI/chat/AHBG reuse paths remain. |
| RM01/RM03 | PASS (partial) | Agent spawn creates one active module; hot swap changes the renderer while preserving agent/state bindings; chat/stats per instance via the agent's bound conversation/participant. Retire/reconnect/late-event gates remain operator observation. |
| FR4 / RG / RX | NOT RUN | Pinned Stack AHBG runtime cloned and inspected; its `a0_http.py` targets the retired API and needs the successor adapter + owner-scoped durable sessions before any gate run. |

`tests/issue119/run.js`: all checks passed (RD01/RD03/RP01 partial/RM01/RM03 partial).
