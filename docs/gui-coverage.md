# A0 GUI coverage matrix (DeepSeek handoff execution)

Handoff: `docs/handoffs/deepseek-gui/START-HERE.md`. Executed 2026-11-10 UTC.
Deployed release: see `docs/build-status.md` and `/api/health`.

## G01–G14 → owner / test / status

| Gate | Required behavior | Source owner | Test/evidence | Status |
| --- | --- | --- | --- | --- |
| G01 Access | Owner-only, phone-first HTTPS, keyboard-safe composer, visible loading/error/empty/disabled states | `apps/web/app.js`, `index.html`, `styles.css`, `apps/server/src/auth.js`, `operations/Caddyfile` | F09 contrast repaired; served markers; CSP/HSTS; anonymous 401s; A01/A17/A18 | API PASS; physical phone NOT RUN (A17/A18) |
| G02 System inspection | Narrative/Relations/Attention entry views; tappable objects; skills→tools→operations; state filters; category labels | `apps/server/src/system.js`, `/api/system`, `apps/web/app.js` System view | `tests/gui/run.js` (object identity, relation endpoints, state vocabulary, provenance) | PASS (API/served-source level) |
| G03 Evidence and intention | Source identity, freshness, A–F/1–6 labels, three next-step ranges, four decision conditions, intention without execution | `apps/server/src/system.js`, System view | F08 separated evidence; `tests/gui/run.js` non-vacuous semantics | PASS (API/served-source level; observations labeled as declarations) |
| G04 Personal knowledge | What A0 holds/uses and the authority; inferred/unknown labeled | `apps/server/src/system.js` knowledge tab | F08 unknown/inferred labels; `tests/gui/run.js` | PASS (API/served-source level; unknown states no longer asserted as absence) |
| G05 Providers and options | BYOK four providers; DeepSeek initially selected; model editing incl. custom IDs and model-specific controls | `apps/server/src/providers.js`, Participants view, `/api/options` | `tests/issue120/run.js`, `tests/issue120/settings-effect.js`, `tests/fr0-fr1/run.js` | PASS (API/fixture level); Anthropic live key absent |
| G06 Switching | New / continue / compare with distinct context rules; full intended history | `apps/web/app.js`, `apps/server/src/index.js` run handler | F01/F03 repaired; `tests/issue120/run.js` (C03/C08) | PASS (API/e2e fixture level) |
| G07 Comparison | Carousel + side-by-side + stacked; saved rounds; default all-responses context; selected subset applies equally; C/D extensible | `apps/web/app.js` compareWrap/context policy, `index.html` layout select | `tests/issue120/run.js`, mobile repair browser suite (recorded 40 tests) | PASS at fixture/API level; three-participant live proof pending |
| G08 Three independent controls | Participants, future-context inclusion, tool executors independent; concrete proposals; identity preservation; cancellation outcome | `apps/web/app.js`, `apps/server/src/runs.js`, `mcp.js` | F01 context delivery repaired; F04 tool scope GUI; OC07 | PASS (API/tool-loop level) |
| G09 Chat continuity | Menu/history, drafts/uploads/pending identity across reload/app-return; duplicate retry and stale async guarded; sign-out and stream loss honest | `apps/web/app.js` recovery/pending logic | mobile repair browser suite (recorded), `tests/issue120/run.js` (C13) | PASS at fixture level; active-stream reattachment after page destruction remains NOT RUN |
| G10 Media, projects, MCP | Attachment pending/ready/error/removal and delivery; microphone/playback/stop/errors; project selection/instructions; MCP setup/discovery/inspection/enable/cancel | `apps/web/app.js`, `apps/server/src/media.js`, `mcp.js`, `index.js` | F10 tool names/schemas visible; A20/A21/A22; OC07 | PASS (API/fixture level); physical microphone/playback NOT RUN |
| G11 Context editor | Source-attributed full context, editable permitted blocks, inclusion/revision, preview/save, dispatch effective revision; active runs frozen; cache forecast separate from observed usage | `apps/server/src/contexts.js`, `apps/web/app.js` context modal | `tests/issue119/lifecycle.js` (RC04), issue120 suite (C04/C05) | PASS (API/e2e level) |
| G12 Retained agents | Eight Forge templates + Phi/Psi/Omega cores; exact originals with provenance; editable effective instructions; bound provider/context/tools/budget and real numerical state; exclusions | `apps/server/src/retained/definitions.js`, `apps/server/src/ptcna.js`, `/api/agents` | `tests/issue119/run.js` (RD01/RD03/RP01), `agent-execution.js` (RD02) | PASS (API/real producer sidecar) |
| G13 Temporary modules | Spawn creates stats/chat module; mount/swap/reconnect/retire preserve agent identity/state/history; invalid candidates retain working renderer; no engine replay | `apps/server/src/index.js` module endpoints, `apps/web/app.js` | F07 distinct stats/chat presentation; issue119 suites | PASS (API + browser fixture level) |
| G14 AHBG | Retained agent through producer-owned game/runtime and successor adapter; session/agent controls, implemented mechanics, plan validation, turn/result history, replay; sessions survive module swaps; unsupported mechanics explicit | `apps/server/src/ahbg.js`, `operations/ahbg-sidecar.py`, `/api/ahbg/*`, AHBG view | F06/F11 repaired; `tests/issue119/ahbg.js` | PASS (API/real engine turn path); broader mechanic matrix entries explicitly NOT RUN |

## Options inventory

`GET /api/options` serves every supported choice with label → supported values → default → effective value → scope → persistence/reset → validation → request/state effect → unavailable reason. Covered areas: Provider/model, Model behavior, Request/resources, Conversation switching, Context, Cache, Tools/web, Comparison/history, Files, Voice, Presentation, Projects, Forge/retained agents, Temporary modules/AHBG. Verified by `tests/gui/run.js`.

## Not yet evidenced (attached to their specific gates)

- A17/A18/OC09/RX01: physical Android observation.
- A04: live Anthropic call (key absent).
- Three-participant live comparison with history-selection proof (fixture level passes; live run pending credentials).
- Active-stream reattachment after page destruction (recorded gap).
- AHBG mechanic-to-rule matrix entries explicitly NOT RUN (War collision coverage, tile visitation, communication/DM, diary rules, subordinate decision trees).
