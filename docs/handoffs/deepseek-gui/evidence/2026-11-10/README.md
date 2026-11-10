# A0 GUI audit evidence — 2026-11-10

Audited product source: [`de66778dd1d9073f6a8b3d532e73514868f94e3c`](https://github.com/The-Interdependency/a0/commit/de66778dd1d9073f6a8b3d532e73514868f94e3c).

**These six scripts are defect witnesses. A passing assertion or exit code 0 reproduces the defect; it does not mean A0 passes acceptance.** Keep this historical evidence separate from the positive regression gates added during repair. After each repair, turn the relevant scenario into an acceptance check that first fails on the audited source and then passes on the repair.

## Scope and receipts

The scripts preserve the original audit assertions. Packaging changes only source/dependency paths, source-identity reporting, fixture isolation, and output handling. They use synthetic owner/conversation/agent/provider data. Text such as “Private context from conversation A” is a deliberate fixture string, not user content.

The browser witnesses load the target checkout's actual web source in headless Chromium at 393 × 820. Static assets come from an ephemeral loopback server; API, speech, database, configuration, media, and sidecar interactions are inert fixtures. Nonfixture browser requests are blocked, service workers are disabled, and native Node fetch is blocked except for the exhaustive response map in the gate counterexample. No production test, provider call, account change, real microphone, database write, deployment, or application fix is performed.

| Receipt | What it establishes |
| --- | --- |
| [verification-summary.json](verification-summary.json) | All six portable witnesses exited 0 on the audited clean source; all seven JavaScript files passed syntax checking. These are successful defect reproductions. |
| [diagnostic-observations.json](diagnostic-observations.json) | Compact observed fixture outcomes from the packaged rerun, including the nine browser cases. |
| [baseline-summary.json](baseline-summary.json) | Previously run local baseline: 40 browser cases, 13 Markdown checks, and 17 Responses checks passed on the same source. Those passes coexist with the defects here. |
| [contrast-results.json](contrast-results.json) | Computed text/background colors for System next-step text and context preview; both measured approximately 1.10:1. |
| [ci-records.json](ci-records.json) | Exact-SHA GitHub runs and short failure excerpts. Web regressions failed before tests because Playwright 1.56.1 could not install on Ubuntu 26.04; custom CodeQL conflicted with default setup. |
| [public-asset-receipt.json](public-asset-receipt.json) | Public health and asset observations at their recorded times: deployed commit reported the audited SHA and four public web assets matched the checkout hashes. This does not prove authenticated behavior. |

No screenshot, trace archive, full downloaded application asset, credential, or private operational value is included.

## Run the preserved witnesses

Use an existing target checkout with its declared dependencies installed and its matching Playwright Chromium available. Node must satisfy the target repository's engine requirement. The recorded rerun used Node 24.22.1 and target Playwright 1.56.1. `context-selection-repro.mjs` additionally requires `--experimental-vm-modules`.

From the checkout containing this handoff, point `A0_AUDIT_ROOT` at the source to inspect. For exact baseline reproduction, use a separate clean checkout at the audited SHA. If omitted, the scripts use the current working directory. Each run reports both the original audited commit and the actual target commit/dirty state; it does not relabel a candidate as the original baseline.

```sh
export A0_AUDIT_ROOT=/path/to/a0-checkout
A0_EVIDENCE_DIR="$PWD/docs/handoffs/deepseek-gui/evidence/2026-11-10"

node --test "$A0_EVIDENCE_DIR/gui-repro.mjs"
node --experimental-vm-modules "$A0_EVIDENCE_DIR/context-selection-repro.mjs"
node "$A0_EVIDENCE_DIR/advanced-routes.mjs"
node --test "$A0_EVIDENCE_DIR/advanced-ui.test.mjs"
node --test "$A0_EVIDENCE_DIR/contrast.test.mjs"
node "$A0_EVIDENCE_DIR/gui-gate-counterexample.mjs"
```

Output goes to stdout. The contrast script also creates a small JSON receipt in a fresh operating-system temporary directory. To choose that directory, set `A0_AUDIT_OUTPUT_DIR` to a location outside the target checkout. No screenshots or traces are generated. Playwright is resolved from the target checkout, so a global installation is unnecessary. These commands do not require an A0 password, provider key, VM access, or running A0 backend. The repository's `npm test` command is a separate live acceptance runner and is not part of this procedure.

## Witness map and repair direction

| Script | Defects reproduced | Acceptance behavior to establish after repair |
| --- | --- | --- |
| [gui-repro.mjs](gui-repro.mjs) | Continue after selecting OpenAI still sends the old DeepSeek participant; discovered MCP tool name/schema are absent; a delayed context-selection response from A opens over B and saves A's message IDs into B. | Send to the newly selected participant; expose tool descriptions/schemas; bind context selection to its originating conversation and ignore stale navigation results. |
| [context-selection-repro.mjs](context-selection-repro.mjs) | Selected-answer policy drops the newest user message; existing revisions retain deselected earlier answers; returning to Include all still omits the new message. | Preserve the current user message and apply the intended response selection consistently before/after saved revisions and when returning to all responses. |
| [advanced-routes.mjs](advanced-routes.mjs) | A legitimate agent block is rejected; the context endpoint accepts the stale project body produced by the browser race; a transient AHBG observe failure leaves an in-progress lock and makes retry return 409. | Preserve valid agent-context editing; bind the browser editor's request/save to the original conversation/revision; give failed AHBG turns an honest recoverable state. The ordinary editable project-text route is not expected to infer which conversation arbitrary text came from. |
| [advanced-ui.test.mjs](advanced-ui.test.mjs) | System All fails to reset the filter; source-only data becomes an observed-runtime claim and unsupported absence claim; AHBG agent choices stay stale after first agent creation; module swap changes only its label; delayed context editor data from A saves into B. | Restore all items; display evidence and uncertainty accurately; refresh agent choices; render the selected module while preserving identity/state; reject or safely bind stale editor responses and saves. |
| [contrast.test.mjs](contrast.test.mjs) | System detail and context preview inherit near-white text on near-white cards, both below 1.2:1. | Replace the low-contrast witness assertions with appropriate readable-text acceptance thresholds using computed colors. |
| [gui-gate-counterexample.mjs](gui-gate-counterexample.mjs) | The unchanged `tests/gui/run.js` reports all 19 checks PASS for zero objects/relations, nonexistent controls/behavior, comment-only markers, and options containing only area names. | Reject empty/invalid contracts and verify rendered behavior, option effects, and intention-without-execution; discover the resulting checks in a documented local command and CI. |

The gate counterexample replaces every fetch before importing the target script, including its apparent login request. The public hostname is matched only as an inert URL key; no connection is made. A failing historical witness after source changes may mean a repair or fixture drift, so inspect the failure and prove the positive contract before claiming completion. The route witness extracts callbacks from source and intentionally fails if those route boundaries change.

## hmmm

These receipts establish reproducible fixture defects and the observed public build identity. Authenticated live operation, actual Android keyboard/audio behavior, real provider execution, page-destruction stream recovery, and broader AHBG mechanics retain their separately recorded evidence limits. A green defect witness is a red product finding; resist the very convenient confusion.
