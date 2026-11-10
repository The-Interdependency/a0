# DeepSeek handoff: repair and complete A0's GUI

Updated November 10, 2026, America/Los_Angeles. Original requirement sources: November 4 packet and its cited September/October instructions.

GPT generated; context, prompt Erin Spencer.

## Assignment

Repair the confirmed GUI failures, then complete G01–G15 through the existing authenticated VM website. Read this file, [the November 10 audit](AUDIT-2026-11-10.md) and the new [GUI self-description requirement](GUI-MSDMD.md) before implementation. The audit owns finding details, reproductions, source locations and acceptance checks; this entry point owns repair order and completion. Preserve working behavior and user data. The supplied graphic is a requirements map; the source contracts govern implementation.

**FROM:** deployed successor commit `de66778dd1d9073f6a8b3d532e73514868f94e3c`, with working mobile regression coverage, implemented System/AHBG screens, and fourteen confirmed application/integration/evidence/CI findings. Two context-integrity defects have first priority.

**TO:** a coherent phone-first workspace for system inspection, conversations, model comparison, context editing, retained agents, temporary modules and AHBG, with truthful evidence and durable state.

**DONE WHEN:** the scoped flows work on the deployed release; each G01–G15 requirement and audit finding has a source/implementation/behavioral-evidence link; served assets match the candidate; and actual-phone acceptance is recorded. **FAILS IF:** the latest prompt is omitted, excluded answers still enter context, a delayed dialog changes another conversation, a control discards its chosen model or setting, state/history is lost, a module swap is only a label, or fixture/marker/merge evidence is presented as deployed behavior. Complete unblocked work; attach each external blocker to its exact gate.

## Owner addition — GUI metadata display

G15 adds **About this interface (MSDMD)** to About & harness, with **About this view** opening the same inspector for the current view. Display the GUI’s source-owned living specification, structured metadata, provenance, coverage and hmmm without altering the chat or executing inspected content. [GUI-MSDMD.md](GUI-MSDMD.md) owns placement, source/collection boundaries and GM01–GM08 acceptance. This is a new requirement after the audit; the audit still has fourteen findings.

## Verified starting point

The November 10 audit inspected GitHub main at `de66778dd1d9073f6a8b3d532e73514868f94e3c` (tree `8e83504f18173b56a4addcdcf8b4ef7b707c7eba`). The audit packet was subsequently published through PR #124 at `1ff211d309a42c69c4efca9ec4b1d4da4dd5ad28`; this G15 amendment starts from that publication. The deployed-source observation remains bound to the audited commit. Resolve current main and the VM checkout again before editing; these identities are evidence, not reset instructions.

- **Website:** https://35.212.252.101.nip.io/. Around 09:34 UTC / 01:34 PST, public health reported the audited commit and the served HTML, JavaScript, CSS and Markdown renderer matched the checkout byte for byte. The signed-out live interface was observed. Backend source identity was reported by health; authenticated production flows were not exercised.
- **Fresh local baseline:** 40 browser tests, 13 Markdown assertions and 17 Responses-adapter assertions passed on the audited source, using isolated API/speech/provider fixtures. Preserve those working repairs. [PR #121](https://github.com/The-Interdependency/a0/pull/121) is merged; its old five unresolved risks must not be reintroduced as current absence.
- **Confirmed failures:** nine targeted browser witnesses plus actual context modules/exact route callbacks reproduced the failures below. Their assertions recognize defects: a diagnostic PASS means the defect occurred. See the [portable reproduction bundle](evidence/2026-11-10/README.md).
- **Evidence limitation:** the unchanged new GUI script produced 19 PASS against a nonfunctional inert fixture. Its labels and API/source markers cannot close interaction, option-effect or safety gates. The audit explains the specific false-positive conditions.
- **CI:** the [exact-source Web regressions run](https://github.com/The-Interdependency/a0/actions/runs/42784382390) failed during Playwright setup on Ubuntu 26.04.1, before tests ran. Repair runner/browser compatibility and preserve the distinction between local passes and remote CI. Do not bypass protections.
- **Open observations:** authenticated live flows, real provider/media/MCP effects, physical Android acceptance and scoped producer/AHBG mechanics were not newly verified. Full stream reattachment after page destruction remains a recorded implementation gap.

## Repair order — audit findings F01–F14

These IDs belong to [AUDIT-2026-11-10.md](AUDIT-2026-11-10.md), not earlier issue-numbered finding ledgers. Keep the full G01–G15 scope after closing this queue.

| Order | Finding | Required result |
| --- | --- | --- |
| 1 | **F01 P1 — selected context drops prompts and retains excluded answers** | With saved history U1/A1/A2, selecting A1 and sending U2 produces U1/A1/U2 for every participant. Returning to all restores applicable history. Preserve deliberate context edits under a defined inclusion policy. |
| 2 | **F02 P1 — delayed dialogs write the wrong conversation** | Both answer selection and full context editing capture originating identity before awaiting. Delayed A reads followed by navigation to B cannot change B; validate message and project/block ownership server-side. |
| 3 | F03 — Continue retains the old model | Choosing model P2 then Continue dispatches to P2, with intended history and stable participant identity. |
| 4 | F04 — supported options lack GUI controls | Expose effective values, scope, persistence/reset, validation and unavailable reasons; prove each supported change reaches its provider request or owned state. Keep tool scope independent. |
| 5 | F05 — agent context saves return 400 | Owned agent blocks validate and save; effective instruction edits reach the next snapshot while originals and other agents remain unchanged. |
| 6 | F06 — AHBG errors leave sessions busy | Every failed preparation path reconciles turn ownership. Recovery permits one valid turn; uncertain completed effects are reconciled before retry. |
| 7 | F07 — module swap changes only a label | Mount a distinct validated stats/chat renderer against the existing agent/conversation/run; preserve state and reject invalid candidates without replay. |
| 8 | F08 — System claims observations/absence without evidence | Distinguish declarations, observations and unknowns; separate A–F/1–6 assessments; inspect actual owned information, use and authority. |
| 9 | F09 — previews/next steps have 1.10:1 contrast | Repair shared foreground/background tokens and verify readable context, agent, AHBG and System surfaces. |
| 10 | F10 — MCP names and schemas are hidden | Show discovered tool names, descriptions and input schemas without executing tools. |
| 11 | F11 — AHBG agent list stays stale | Create/retire agents and return to AHBG without page reload; choices refresh and valid selection persists. |
| 12 | F12 — System All resets do nothing | State and category resets work independently and together; the unfiltered inventory returns. |
| 13 | F13 — new GUI checks accept a nonfunctional interface | Replace marker-only acceptance with discoverable behavioral checks and non-vacuous fixtures; the inert counterexample must fail. |
| 14 | F14 — remote regression setup prevents testing | Use a supported runner/Playwright combination and obtain candidate-bound CI results that actually execute the required cases. |

F01/F02 are release-blocking data-integrity repairs for the affected context flows. F03–F13 remain incomplete product or evidence requirements; F14 is an environment/CI configuration defect. Backend API receipts remain useful within their actual scope.

## Read before editing

1. Current [skill-lib AGENTS.md](https://github.com/The-Interdependency/skill-lib/blob/main/AGENTS.md) and applicable skills. Resolved during this update: `8ee77a6630379e48844350d8666515389b94f4c8`. Apply WDLL where scope/proof needs resolution, structure preservation, native-first MSDMD, and relevant frontend, agent-ops, audit, test and VM contracts. Resolve producer authority before UCNS/PTCNA/AHBG changes.
2. Current A0 [AGENTS.md](https://github.com/The-Interdependency/a0/blob/main/AGENTS.md), [replacement specification](https://github.com/The-Interdependency/a0/blob/main/docs/a0-replacement-spec.md), [VM handoff](https://github.com/The-Interdependency/a0/blob/main/docs/deep-code-vm-handoff.md), and source work graph. Read the reactivation amendment and [issues #119](https://github.com/The-Interdependency/a0/issues/119) / [#120](https://github.com/The-Interdependency/a0/issues/120).
3. [The audit](AUDIT-2026-11-10.md) and [reproduction bundle](evidence/2026-11-10/README.md), then sources/september-system-explorer-excerpt.md, sources/october-interface-build-brief.md and sources/options-contract-excerpt.md. Keep the accepted September interaction model inside the current successor; its old runtime is historical reference.
4. Current docs/build-status.md, docs/acceptance.md, docs/gui-coverage.md, docs/mobile-chat-repair.md and operations/README.md. Resolve chronology: source presence, historical receipts, fixture/API checks, deployment and handset observations are different evidence. Correct contradicted current claims when their owning repairs land.

The October 29 instruction replaces Replit hosting and mandatory native APK delivery with the existing VM and authenticated responsive HTTPS website. Preserve that delivery decision.

## GUI contract to preserve

| ID | Required behavior |
| --- | --- |
| G01 Access | Erin-only initial access; phone-first Android-browser use and usable desktop layout. Keyboard-safe composer, readable text, visible loading/error/empty/disabled states. Ordinary use requires no terminal or APK. |
| G02 System inspection | Narrative, Relations, and Attention entry views; tappable system objects and nested narrative contexts. Show skills → required tools → constituent operations, object ownership, and recorded/inferred relations distinctly. Category labels are cross-cutting filters. Working, construction, broken, and deprecated states remain distinct. |
| G03 Evidence and intention | Expose source identity, freshness, coverage gaps, and Admiralty reliability A-F / credibility 1-6. These are not probabilities. Each category has minimal, maximal-feasible-now, and maximal-potential next steps, including unmet prerequisites. Selecting an intention does not execute it. Preserve the four action-decision conditions in the September source. |
| G04 Personal knowledge | Let Erin inspect what information A0 has, what it actually uses, and the authority for that use. Label inferred and unknown information. |
| G05 Providers and options | BYOK OpenAI, Anthropic, xAI, DeepSeek; DeepSeek initially selected. Provider/model editing in chat and settings, including valid custom IDs and supported model-specific controls. Preserve deliberate choices, participant identity, and historical attribution. |
| G06 Switching | Offer New conversation / One answer or continue / Compare models. New starts with standard harness context. Continue carries full intended history to one selected model. Comparison uses one intended semantic snapshot; joining participants receive the complete intended prior history. Cache misses never discard saved history. |
| G07 Comparison | Readable carousel and side-by-side responses; preserve the existing stacked view. Support saved rounds as well as streaming answers. Two participants is the ordinary case, with C/D and further participants supported. Default next-turn context includes all answers; a selected subset applies equally to every participant and excluded answers remain saved. |
| G08 Three independent controls | Keep chat participants, future-context inclusion, and tool executors independent. Show concrete tool proposals before selecting one/subset/all/cancel. Preserve requester/action/executor/result identities, coordinate duplicate effects, and report cancellation's actual outcome. |
| G09 Chat continuity | Working menu and discoverable history. Preserve selected conversation, drafts, uploads, and pending-delivery identity through supported reload/app-return flows. Prevent duplicate retries and stale asynchronous work from overriding newer navigation. Handle sign-out and stream loss honestly. |
| G10 Media, projects, MCP | Visible attachment pending/ready/error/removal and actual model-delivery support; functional microphone, playback, stop, permission/error feedback; persistent project selection/instructions. MCP setup/auth/discovery, tool/schema inspection, enable/disable, progress/results and cancellation. |
| G11 Context editor | Inspect source-attributed full context, edit permitted blocks, select inclusion and revision, preview/save, and dispatch that effective revision. Active runs retain their frozen snapshot. Show predicted cache effects separately from observed usage; preserve attachment references. |
| G12 Retained agents | Reuse actual PTCNA memory and Phi/Psi/Omega cores, and Forge's eight templates: sage, trickster, paladin, druid, engineer, diplomat, hacker, captain. Preserve exact archived originals with provenance and separately editable effective instructions. Bind provider/context/tools/budget and real numerical state to each instance. Exclude Jury, Bandit, Meta-13, and ZFAE from active registration/routing. |
| G13 Temporary modules | Spawn creates and displays the instance-bound stats/chat module. Mount, swap, reconnect, and retire preserve agent identity, state, history and pending work. Invalid candidates retain the working renderer. Presentation changes must not spawn another engine or replay effects. |
| G14 AHBG | Operate the actual retained A0 agent through the producer-owned game/runtime and successor adapter. Expose session/agent controls, implemented mechanics, plan validation, turn/result history and replay. Preserve sessions across module swaps; show unsupported/unverified mechanics explicitly. |
| G15 GUI self-description | Provide About this interface (MSDMD) and a current-view entry into the same read-only inspector. Show source-owned living specs, typed/structured metadata, provenance, evidence scope, reader coverage/conflicts and hmmm. Preserve workflow state and disclose only authorized metadata. See [GUI-MSDMD.md](GUI-MSDMD.md) and GM01–GM08. |

For **every supported option**, record: label → supported values → default → effective value → scope → persistence/reset → validation → actual request/state effect → unavailable reason. The complete options inventory is included. Do not expose controls that are ignored or silently coerce incompatible values.

The System view may show source-backed application relations while UCNS mapping remains unresolved. Calling a generic graph UCNS does not establish its geometry or operations.

## Execution sequence

1. **Reconcile current source and deployment.** Inspect authorized VM access, checkout/dirty state, deployed revision, served assets, reviews and checks. Preserve newer work and unrelated services. Use current source as the integration base and the pinned audit revision for reproducing historical witnesses.
2. **Close F01/F02 first.** Turn their defect witnesses into acceptance tests that assert correct dispatch contents and conversation binding. Reconcile context-policy and explicit-editor precedence without discarding edits or history. Verify both dialogs, not just general history navigation.
3. **Complete connected flows.** Work through the remaining repair queue, implement the G15 metadata inspector and GM01–GM08 checks, then re-evaluate every G01–G15 requirement. Keep apps/web and the existing run/context/agent/module owners. Use declared schemas/capabilities; a historical React prototype does not require a framework rewrite.
4. **Verify effects and failures.** Retain the 40-test mobile baseline. Add isolated regressions for the newly exposed gaps, including a no-run-dispatched assertion for System intention selection, failed AHBG preparation recovery, actual renderer changes and settings-to-request effects. Repair current CI setup and evidence overclaims at their owners. Inspect every production-directed runner before use.
5. **Release and hand over.** Update source-owned specs, work graph/pins when affected, coverage, acceptance, release and build-status records. Publish through the permitted workflow; merge/deploy within existing authority. Verify candidate-bound served assets, supported rollback and actual Android flows. Keep any external blocker attached to its precise gate.

Resource limits are part of execution: preflight dependencies/quotas, reuse pinned artifacts and completed evidence, and checkpoint exact source, running jobs, results and next action before session limits. Missing live credentials block their witnesses, not unrelated implementation. Keep secrets and private content out of prompts, logs, source, browser bundles and public evidence. Preserve archive/; do not boot it or run its suites as successor gates.

## Proof that must be capable of failing

- **Context semantics:** exact snapshot/provider inputs preserve the latest user prompt and applicable user/tool history, include only the intended assistant responses, preserve attachment references and apply equally to every comparison participant. Test before/after a saved revision and after returning to Include all.
- **Conversation boundaries:** delayed reads for both context dialogs cannot apply A's IDs or text to B. Server validation rejects foreign message/block identities and preserves revision conflicts.
- **Choices have effects:** selecting P2 actually dispatches to P2; each supported GUI option survives its declared persistence boundary and changes a captured request or owned state; unsupported combinations fail visibly.
- **Existing continuity survives:** accepted-but-unacknowledged retry, late navigation/dictation/upload, initialization, stream EOF/reset and logout cannot duplicate effects, lose newer input or restore stale controls/private recovery.
- **Tools remain independent:** concrete proposals precede executor choice; Stop covers later tool rounds; cancellation prevents new dispatch and accurately reports already-dispatched effects. MCP schemas are inspectable without execution.
- **Agents and modules:** two agents remain isolated; effective instruction edits save and dispatch; hot swap/reconnect/invalid candidates preserve state and show a real presentation change without engine replay.
- **AHBG:** transient observation/preparation errors recover; rejected/racing turns do not mutate twice; replay and module changes preserve the session. Identify the actual retained agent and producer mechanics exercised.
- **Inspection is truthful:** missing/stale observations remain unknown or dated; failed refresh retains the last observation with age/error. Intention selection dispatches no work. Unknown personal-data coverage cannot become a claim of absence.
- **GUI self-description:** native source facts reach the same inspector from global/current-view entry points; unsupported extraction and wrong-revision evidence remain visible; viewing metadata leaves chat/run state intact. Execute GM01–GM08.
- **Usability:** normal text meets at least 4.5:1 contrast. Actual Android login, keyboard, attachments, voice, app-return/history, comparison, agent/module and AHBG flows are observed. Emulation and fake speech do not close handset gates.

The existing isolated entry points are:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run test:offline
npm run test:browser
git diff --check
```

Inspect scripts first and reuse supported installed dependencies/browser artifacts. The [audit reproduction bundle](evidence/2026-11-10/README.md) provides portable commands for the new witnesses. **Do not add defect-recognition assertions as green product gates:** invert/replace them with expected-behavior assertions when repairing. Root npm test invokes the separate production-directed acceptance runner; it is not an offline synonym. Inspect target, credentials, writes and cleanup before authorized integration execution.

Return **CHANGED / PROOF / NEXT / hmmm**: working URL; exact implementation, merge and deployed identities; findings and G01–G15 outcomes with executable evidence; operating/rollback guidance; and precise remaining actions. A documentation/ZIP publication does not repair the app.

## Packet usage and integrity

Give DeepSeek the GitHub URL of this file and ask it to read the linked audit and evidence README. The [current ZIP](https://github.com/The-Interdependency/a0/raw/main/docs/handoffs/deepseek-gui/a0-gui-deepseek-handoff.zip) is the same packet for offline use. The original requirements graphic maps G01–G14; the later G15 requirement is in GUI-MSDMD.md. The graphic and dated sources retain their original scope; historical copied paths resolve in their original repository context. Use current source-owned contracts through the live links above.

From this directory, run python3 build-packet.py --check to verify the manifest, ZIP bytes and receipt. Maintainers update authored content, then run python3 build-packet.py --write and --check before publishing the whole packet atomically. SHA256SUMS covers authored packet content; the ZIP contains those files plus the manifest. PACKET-RECEIPT.json is outside the ZIP to avoid a self-reference and records exact inputs, generator identity and output hashes.

## hmmm

The November 10 audit established public deployment/frontend identity and isolated failures, not authenticated production or physical-phone acceptance. Full active-stream reattachment remains a recorded implementation gap. Live provider/media/MCP effects and retained-engine/AHBG mechanics still need scoped execution. Preserve verified existing repairs, close unblocked failures, and carry these boundaries into the final evidence rather than converting them into a blanket PASS.
