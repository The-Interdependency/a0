# DeepSeek handoff: complete A0's GUI

Prepared November 4, 2026, America/Los_Angeles.

GPT generated; context, prompt Erin Spencer.

## Assignment

Audit the existing A0 successor against the recovered GUI requirements, close the confirmed gaps, and deliver the integrated interface through the existing authenticated VM website. Preserve working behavior and user data. The supplied graphic is a requirements map; the source contracts below govern implementation.

**FROM:** an implemented successor with merged mobile repairs, dated acceptance records, and GUI requirements spread across conversations.

**TO:** a coherent phone-first workspace for system inspection, conversations, model comparison, context editing, retained agents, temporary modules, and AHBG, with inspectable evidence and durable state.

**DONE WHEN:** the scoped flows work on the deployed release, each requirement has a source/implementation/evidence link, and actual-phone acceptance is recorded. **FAILS IF:** controls discard choices, context or drafts disappear, effects cross conversation/agent boundaries, a module swap resets state, evidence is overstated, or a mockup/merge is presented as a deployed result. Complete all unblocked work; an external blocker remains attached to its specific gate.

## Starting state: use this to avoid restarting finished work

Verified through GitHub at 2026-11-04 17:43 PST:

- Repository: [The-Interdependency/a0](https://github.com/The-Interdependency/a0).
- Main: `4656cd3f841b896ad3a6a104a5c9caca2031ca51`.
- [PR #121](https://github.com/The-Interdependency/a0/pull/121) is **merged**, at 14:47:35 PST on November 4. All ten returned review threads are resolved. Its body and some build records still say the integration is held; those statements are stale relative to the merge record.
- [Web regressions run 41780891487](https://github.com/The-Interdependency/a0/actions/runs/41780891487) is successful for that PR head. The PR reports 40 browser tests, 13 Markdown assertions and 17 Responses assertions. These tests were not rerun while preparing this handoff.
- Later entries in `docs/acceptance.md` report retained agents, module lifecycle, and an AHBG integration slice. Earlier FR2-FR4 "pending" entries and issue-body snapshots do not establish current absence. Verify the latest scoped evidence and implementation before replacing anything.
- Deployed source/assets, physical-phone behavior, and current security-check configuration were **not inspected here**. Merge does not resolve those observations. Full active-stream reattachment after page destruction remains an explicit gap in the mobile repair record.

Re-resolve heads and inspect the real VM checkout before mutation. Preserve newer or uncommitted work. The recorded SHA is a starting observation, not a reset instruction.

## Read before editing

1. Current [skill-lib AGENTS.md](https://github.com/The-Interdependency/skill-lib/blob/main/AGENTS.md) and applicable skills. Observed skill-lib head: `6a16302f0b7ad6e2ed5331ee1423fcc0939e1d57`. Apply WDLL, structure preservation, native-first MSDMD and the relevant frontend, audit, test, and VM contracts. Consult METAPAT only for an unresolved conceptual/architectural choice. Resolve producer authority before UCNS/PTCNA/AHBG changes.
2. Current A0 `AGENTS.md`, `docs/a0-replacement-spec.md`, `docs/deep-code-vm-handoff.md`, and `docs/work-graphs/a0-replacement-spec.json`. Read the reactivation amendment and [issues #119](https://github.com/The-Interdependency/a0/issues/119) / [#120](https://github.com/The-Interdependency/a0/issues/120).
3. `sources/september-system-explorer-excerpt.md`, `sources/october-interface-build-brief.md`, and `sources/options-contract-excerpt.md` in this packet. Preserve the accepted September interaction model within the current successor. Its old implementation is historical reference.
4. Current `docs/build-status.md`, `docs/acceptance.md`, `docs/mobile-chat-repair.md`, and `operations/README.md`. Resolve chronology and evidence scope: requirements, historical proposals, fixture/API checks, deployment, and actual-phone results are distinct.

The October 29 instruction replaces Replit hosting and mandatory native APK delivery with the existing VM and authenticated responsive HTTPS website. Do not let obsolete delivery choices re-enter the plan.

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

For **every supported option**, record: label → supported values → default → effective value → scope → persistence/reset → validation → actual request/state effect → unavailable reason. The complete options inventory is included. Do not expose controls that are ignored or silently coerce incompatible values.

The System view may show source-backed application relations while UCNS mapping remains unresolved. Calling a generic graph UCNS does not establish its geometry or operations.

## Execution sequence

1. **Reconcile source and deployment.** Inspect authorized VM access, checkout/dirty state, deployed revision, served assets, current reviews and checks. Determine whether the merged mobile repair is already deployed. Reuse the supported app-only rollout when it is needed. Verify served JavaScript as well as health/build metadata.
2. **Make a coverage matrix.** Map G01-G14 and the options inventory to active source owners, tests, observed behavior and remaining gaps. Preserve useful existing work. Distinguish source defects, missing integration, stale documentation and unavailable external evidence.
3. **Complete the connected flows.** Extend the current frontend/backend and existing run/context/agent/module owners. Known frontend owners are `apps/web/app.js`, `index.html`, `styles.css`, `markdown.js`; core server owners include `apps/server/src/index.js`, `providers.js`, `contexts.js`, `harness.js`, `ptcna.js`, and `ahbg.js`. Confirm actual ownership before edits. Use declared schemas/capabilities for controls and read-only reasons; a historical React prototype does not require a framework rewrite.
4. **Verify meaningful failures.** Repair owning layers and exercise real interfaces with isolated fixtures before authorized live checks. Preserve the merged mobile regression protection. Resolve current test/security failures without bypassing policy. Complete the appropriate R/A, FR/OC and integration gates; record one scoped outcome per gate.
5. **Release and hand over.** Update source-owned specifications, source pins/work graph when affected, acceptance, release and build-status records. Commit and publish through the permitted workflow; merge/deploy within existing authority. Verify the actual HTTPS release, compatible rollback, and phone flows. Preserve unrelated VM services and durable data.

Resource limits are part of execution: preflight dependencies/quotas, reuse pinned artifacts and completed evidence, and checkpoint exact state before context/session limits. Missing credentials block their live witnesses, not unrelated implementation. Keep secrets out of prompts, logs, source, browser bundles and evidence. Inspect tests before any production-directed execution. Preserve `archive/`; do not boot it or run its suites as successor gates.

## Proof that must be capable of failing

- A three-participant comparison preserves the intended history, order, attribution and attachments; selected-history exclusion changes every next request consistently without authorizing tools.
- An option changed in the GUI survives its declared persistence boundary and changes the captured provider request or owned state. Unsupported choices fail visibly.
- Accepted-but-unacknowledged retry, late navigation/dictation/upload, initialization, stream EOF/reset and logout cannot duplicate effects, lose newer input or restore stale controls/private recovery.
- Tool approval and Stop remain tied to the complete run, including later tool rounds. Cancelling prevents new dispatch and reports already-dispatched effects accurately.
- Two agents remain isolated. Hot swap, reconnect and invalid module candidates preserve the correct state; malicious rendered content stays inert and private APIs enforce ownership.
- AHBG rejected/racing turns do not mutate twice; replay and module swapping preserve the session. Evidence identifies the actual A0 agent and the producer mechanics exercised.
- Failed source refresh retains the last observation with its age and error. Inspection cannot silently execute work or promote an inferred relation into verified fact.
- Actual Android login, keyboard, attachment, voice, app-return/history, comparison, agent/module and AHBG flows are observed. Emulation or fake speech alone cannot close physical-phone gates.

At the observed revision, the isolated entry points are:

```sh
npm ci
npx playwright install chromium
npm run test:offline
npm run test:browser
git diff --check
```

Use the existing supported Node/runtime and browser installation when available. Recheck scripts and setup first. Root `npm test` invokes `tests/acceptance/run.js`; it is not an interchangeable offline test command. Inspect its target, credentials, writes and cleanup before using the authorized integration lane. Select additional tests from changed behavior rather than repeatedly rerunning everything.

Return **CHANGED / PROOF / NEXT / hmmm**: working URL, exact deployed source/assets, requirement/gate evidence, useful operating/rollback guidance, and only the precise unresolved actions. Preserve implementation, merge, deployment and handset acceptance as separate facts.

## Packet usage and hmmm

Upload the ZIP to DeepSeek, ask it to read this file first, and provide the existing authorized repository/VM connection. The bundle contains the graphic, dated source texts, source snapshots at the observed A0 head, and `sources/verified-github-state.json`; `SHA256SUMS` checks package integrity. The standalone handoff can also be pasted; use the live links and repository paths for its supporting material.

hmmm: this preparation verified GitHub merge/review/run metadata and read source records; it did not operate the VM or rerun application tests. Current deployment, physical-phone observations, live provider/MCP grants, off-VM recovery and complete GUI coverage must be established by execution. Existing records contain partial and superseded statuses. Keep their valid evidence, correct stale summaries, and do not turn uncertainty into a new prerequisite for unrelated work.
