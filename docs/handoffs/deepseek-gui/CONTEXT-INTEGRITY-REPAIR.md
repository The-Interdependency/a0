# DeepSeek directive — verify and repair F01/F02

Owner instruction received November 10, 2026. The directive below is preserved as supplied by Erin Spencer.

## Usage and current-source checkpoint

Read this directive with [START-HERE.md](START-HERE.md), the [audit](AUDIT-2026-11-10.md), the [portable witnesses](evidence/2026-11-10/README.md), and [G15](GUI-MSDMD.md). Resolve current A0 and skill-lib instructions before implementation.

At publication preparation, main was `12b64724145dac9591ca650f5d0fd3b573d4ae7d`. Its [build-status record](https://github.com/The-Interdependency/a0/blob/12b64724145dac9591ca650f5d0fd3b573d4ae7d/docs/build-status.md#november-10-audit-repair-f01f14) already reports F01–F14 repairs. That report is a claim to verify against the November 10 witnesses and correct-behavior tests; this documentation publication does not independently establish closure. Use the latest application source as the integration base, retain already-correct behavior, and identify any remaining failure with exact source and test evidence. The audited commit remains the historical reproduction baseline.

This directive's separate approval requirement governs deployment and production restarts for this repair work, including where an older handoff describes continuation through deployment. Publishing or merging the directive does not activate a repair.

## Owner directive

On November 10, 2026, A0 PR #124 published a reproducible GUI audit identifying fourteen findings, including two P1 context-integrity defects.

https://github.com/The-Interdependency/a0/pull/124

Canonical audit:
https://github.com/The-Interdependency/a0/blob/main/docs/handoffs/deepseek-gui/AUDIT-2026-11-10.md

The audit examined application commit `de66778dd1d9073f6a8b3d532e73514868f94e3c` and compared the deployed frontend against that source. The original 40 browser regressions passed, but targeted diagnostics reproduced failures outside their coverage.

**F01 — Incorrect context selection**

Selecting one assistant response can retain an explicitly excluded response while omitting the newest user question. The audited fixture expected `u1,a1,u2` but produced `u1,a1,a2`. The backend applies assistant-response selection to other message roles, while saved revision flags can override newer selections.

**F02 — Cross-conversation context writes**

Delayed context-dialog responses can arrive after navigation from conversation A to conversation B. Saving can then apply A's selections or editable context to B. One backend witness accepted the wrong-conversation revision with HTTP 201.

The audit establishes a context-integrity failure and a potential cross-provider disclosure path, not an observed live provider disclosure.

Both findings have specific source references and reproduction procedures in the published audit.

PR #125 subsequently added the GUI's own MSDMD inspector requirement, G15, to the DeepSeek handoff. That publication changes documentation, not the application's context handling.

https://github.com/The-Interdependency/a0/pull/125

**Action**

Repair F01 and F02 in A0's actual application code.

First verify the latest source against the November 10 reproductions so that already-corrected behavior is not unnecessarily changed.

Correct response-selection semantics so new user questions remain included, excluded assistant responses stay excluded, and intentional context edits retain their authority.

Bind asynchronous dialogs and their save operations to the originating conversation. Reject stale responses and unauthorized cross-conversation message or context references on the server.

Convert the existing defect witnesses into positive regression tests. Test selection changes, saved revisions, delayed requests, rapid navigation, multiple model participants, and cross-conversation isolation.

Preserve the working mobile-chat functionality and the expanded G01–G15 GUI requirements. Run the relevant suites and produce reviewable changes with exact source and test evidence.

Do not deploy the repairs or restart production services without showing me the proposed operation and obtaining separate approval.

## hmmm

DeepSeek must establish the latest source's F01/F02 behavior and remaining repair scope. This publication verifies handoff content and packet consistency; application behavior, live provider effects and physical-phone acceptance require their own evidence.

Publication framing: GPT generated; context, prompt Erin Spencer. Owner directive: supplied by Erin Spencer.
