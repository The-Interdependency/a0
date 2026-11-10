# Expose all supported model/settings choices and fix current-build regressions (audit 700a817)

Source: https://github.com/The-Interdependency/a0/issues/120
Retrieved 2026-11-04, America/Los_Angeles. Issue state: open. Updated: 2026-10-31T06:53:43Z.

This is a dated source snapshot. Requirement text and current implementation status must be evaluated separately; historical status paragraphs may be stale.

---

## Owner request and required result

Erin requested a place to change models and stated: **“every place where I can have an option, I should have an option.”** This is an explicit product requirement extending [#119](https://github.com/The-Interdependency/a0/issues/119), with current-build regressions linked to [#118](https://github.com/The-Interdependency/a0/issues/118).

Provide model selection directly from the chat workspace and consistent configuration for **all four providers**. Expose every supported user choice in the existing scoped product, including the retained agent/Forge/module flows as they are implemented. Each control must show its current effective value, scope and supported values, persist where promised, and change actual execution. Defaults, explicit selections and temporary overrides must be distinguishable. A saved setting that the adapter discards is a defect.

Use a compact provider/model control beside the composer and an accessible settings sheet for additional choices. Show capability-dependent options with an explanation when unavailable. Keep user permission choices distinct from factual model capabilities. The requirement does not reinstate Jury, Bandit, Meta-13 or ZFAE; the retained PTCNA memory/Phi/Psi/Omega/Forge scope remains in force.

GPT generated; context, prompt Erin Spencer.

## Audit identity and limits

- **Audited source:** `The-Interdependency/a0@700a817be2dc768a78ad198dc5e87ac2294722f3`.
- **Live evidence:** public `/api/health` reported that same commit, empty dirty state and `servedFrom: production`; response timestamp `2026-10-30T14:29:38.405Z`, build timestamp `2026-10-30T11:21:19.040102+00:00`. This is a live self-reported build identity, not an independent VM filesystem/binary attestation.
- Source is three commits ahead of the prior `843efaf61a17d255dd98276d21fa9f719c44b507` audit. The implementation change is `f5a50f19c0d2de80343023842ed340c6e9ce81a6`; the later two commits update release documentation.
- The supplied phone screenshot establishes rendered conversation responses, a generic OpenAI failure, a model saying it cannot browse, and a clipped participant strip. It does not establish the original API error, current account grants, or current default model. Message attribution must remain historical after a model change.
- Eight focused defect scenarios were reproduced in isolated execution of the audited source functions with DOM/API/DB fixtures or mocked fetch. These are defect reproductions, not production acceptance passes. No production data, credentials, provider inference, microphone input or deployment was changed.
- The audit browser reached the sign-in screen; fresh authenticated website acceptance was not performed. The owner's screenshot, public health observation, exact source and isolated reproductions are identified separately. The screenshot and private operational details are not republished here.

## Current standing

| Area | What is present at the audited commit | Standing |
| --- | --- | --- |
| Model editing | OpenAI catalogue dropdown, Upgrade model and Test this model in Participants | Partial; loading race, legacy/custom-value mismatch, no equivalent edit for other providers or direct chat model control |
| OpenAI API | Responses streaming adapter, current model IDs, attempted tool continuation, usage persistence | Partial; cancellation, tool identity/state, outcomes and cache mapping defects below |
| Context editor | Structured blocks, immutable saved revisions, project edit, inclusion toggles and forecast toast | Partial; saved choices are replaced at next dispatch, and attachment references are lost |
| Existing chat features | Projects, context-selection UI, attachments, comparison panes, voice and MCP configuration | Present with the specific regressions/gaps below |
| Retained PTCNA/Forge agents | No active successor service/UI established in the inspected source tree | Pending FR2, consistent with the build-status record |
| Temporary stats/chat modules and hot swapping | No active successor lifecycle/UI established | Pending FR3 |
| AHBG through the real A0 agent | No active successor integration/UI established | Pending FR4 |

The OpenAI update is no longer wholly unimplemented. The release documentation's blanket “implemented, verified, and live” treatment of FR0/FR1 exceeds the evidence for complete user flows. [Build record][S9] [Acceptance][S10]

## Findings

### C01 — P2: model controls are incomplete and depend on loading order

[`app.js`][S1] `enterApp` concurrently loads participants/providers. `renderParticipantCards` adds the OpenAI selector only if the provider catalogue is already loaded; `loadProviders` does not rerender those cards. Isolated execution reproduced **zero selectors** when participants resolve first and **one** when providers resolve first.

The edit is OpenAI-only. Chat pills display participant names without their model IDs. A saved legacy/custom model absent from the four catalogue options is shown in the subtitle while the select defaults to its first option, misrepresenting the saved value.

**Repair:** deterministic rendering; accurate current/unsaved values; an accessible provider/model selector in chat; consistent editing for every supported provider; valid custom IDs with honest capability validation. Preserve participant identity and history.

### C02 — P2: creating defaults overwrites an existing model choice

[`index.js`][S2] `/api/participants/seed-defaults` unconditionally resets an existing OpenAI participant to the seed model. The row is chosen through a provider-keyed Map built from an unordered result, so multiple OpenAI participants make the target ambiguous.

**Repair:** “Create missing defaults” only creates missing records. Reset/upgrade is a separate, explicit action with an identified target and visible settings changes. Never use a default migration to overwrite a deliberate choice.

### C03 — P1: New / one-answer continuation / Compare are not reliable choices

Conversation detail returns `conversation` and a separate `messages` array, without a count. `openConversation` stores that row; `toggleParticipant` checks count fields. The isolated reproduction rendered two historical messages but opened **zero switch dialogs**; adding only the missing count made it open. [Client][S1] [API][S2]

Even when opened, Continue and Compare both assign the same `nextIds`; send mode is inferred solely from participant count. A “one answer” selection can therefore send multiple participants.

**Repair:** use authoritative history presence and define distinct behavior: new conversation with standard harness; one selected model continuing with full intended context; or explicitly selected comparison participants receiving the same semantic context. Persist the selected mode/participants at the declared scope.

### C04 — P1: saved context edits and exclusions are discarded at dispatch

[`harness.js::freezeSnapshot`][S3] rebuilds blocks from original database rows and creates a fresh revision whenever they differ from the saved editor revision. [`contexts.js`][S4] can save and preview an owner's choice, but it is not the choice used by the next run.

Two isolated reproductions confirmed:

- Saved project revision 2 previewed `OWNER_EDITED_PROJECT_OVERRIDE`; the next freeze created revision 3 with `ORIGINAL_PROJECT_INSTRUCTIONS`.
- Saved exclusion previewed no old message; the next freeze restored that excluded message alongside the new user message.

**Repair:** carry selected edits/inclusions forward when appending new history. Freeze the chosen effective revision; preserve originals separately. Test preview → save → new message → exact provider request, not merely preview/readback.

### C05 — P1: attachments lose their storage reference through context assembly

[`contexts.js::buildBlocks`][S4] queries `storage_key` but omits it from copied attachment metadata. `assembleBlocks` expects that reference, and [the actual run hydrator][S2] subsequently tries to read an undefined key.

Isolated execution read a fixture PNG successfully before assembly, then reproduced `data: null`, `hydrationError: attachment_missing`, and an encoded `data:image/png;base64,null` URL.

**Repair:** preserve or securely resolve owned attachment references through revisions. Fail visibly before dispatch when required bytes cannot be loaded. Enforce the configured attachment-count limit, and disclose actual model support: storage of an audio/PDF/file does not establish ingestion; the current adapters consume images only. [Media][S11] [Adapters][S5]

### C06 — P2: provider diagnostics are replaced by “unknown error”

The server sends `err.message/code` over SSE and stores text in `run_participants.error`, but [message persistence][S6] only keeps `meta: {runId}`. Conversation GET does not join the run-participant error. The client renders failed history using `m.meta.error || 'unknown error'`, and reloads history automatically after send. [API][S2] [Client][S1]

**Repair:** persist and return a structured, redacted diagnostic for the exact message/run/participant; show error category, selected model, useful detail, retryability and a relevant repair action. Preserve it after refresh/restart.

The screenshot's underlying provider failure remains **unknown**. The newer build report says the earlier key problem was repaired; this later screenshot must not be diagnosed as the same credential failure without the actual error.

### C07 — P1: Stop and the request deadline detach after the first chunk

[`providers.js::fetchWithTimeout`][S5] wraps `reader.read()` with `finally { release(); }`. That removes the abort listener and timeout after the first successful read, rather than after the whole stream.

Exact adapter execution with mocked fetch reproduced `requestedStop: true`, `upstreamAborted: false`, and final `finishReason: stop`; the stream also continued beyond its configured deadline.

**Repair:** retain cancellation/deadline propagation until terminal EOF/error/cancel, including all subsequent model/tool rounds. Show Stop for the lifetime of the complete run.

### C08 — P1: single-participant tool approval loses the active run

The server emits `participant_done` before tool approval. In single mode, [the client][S1] immediately clears `state.activeRun`. The approval handlers then build `/api/runs/undefined/tool-authorize`, and Stop disappears while work is pending.

**Repair:** bind the dialog to the proposing run directly. Provider-response completion is not whole-run completion; clear the active run only on its terminal event.

### C09 — P1: tool action and provider-call identities are broken across execution

Two separate contracts fail:

1. [The coordinator][S7] drops `providerToolCallId` and reads `requesterParticipantId`, while its caller supplies `participantId`. Exact isolated execution reproduced the missing call ID and undefined requester. The continuation then cannot match the executed result and tells the model `not executed`.
2. [`buildProposals`][S2] generates a UI action UUID but inserts the database row without that UUID or reading the generated database ID. Later outcome updates use the UI IDs and cannot address those inserted records.

**Repair:** use one persisted action ID throughout, and preserve every original participant/call mapping through deduplication. One shared execution must return the correct result to each original provider call. Persist a truthful outcome and reconcile uncertain effects before retry.

### C10 — P1: continuation drops state and failures are marked complete

[`index.js`][S2] builds continuation from only the latest matching function-call/result pairs. It omits other returned output/reasoning items and earlier tool rounds. Separately, `dispatchOne` marks every returned provider result complete even though the adapter distinguishes failed/incomplete outcomes. The overall `finish` path also unconditionally marks the run complete.

**Repair:** accumulate compatible per-participant continuation items across rounds, keep opaque provider state isolated, and propagate actual success/failed/incomplete/stopped/budget outcomes through messages, run records and UI. Exercise two or more tool rounds and refresh persisted results. Changing models/context must preserve the declared history while invalidating incompatible continuation state.

### C11 — P2: accepted settings often have no effect, and diagnostics test a different configuration

Participant settings accept arbitrary JSON, but [`streamProvider`][S5] only forwards settings to OpenAI; Anthropic/xAI/DeepSeek discard them. OpenAI consumes only a small subset. Anthropic fixes output at 8192 tokens; [run dispatch][S6] fixes timeout at 120 seconds despite the advertised environment default. `/api/settings` is GET-only.

The OpenAI Settings test accepts a model but ignores saved endpoint/reasoning/settings and substitutes a 256-token output budget. The website sends only the select value, so it may test an unsaved candidate without saying so. [API][S2] [Client][S1]

**Repair:** implement a typed capability-aware settings contract, validated on save and dispatch; reject unsupported/unknown fields visibly. Test the saved effective participant configuration with any diagnostic overrides clearly disclosed. Add persistence for owner defaults and supported conversation/agent/run overrides.

### C12 — P2: current OpenAI capability and cache mappings are inaccurate

[The catalogue][S5] uses 400,000 context tokens for all four models and omits supported `xhigh`/`max` effort values. Current official model documentation lists 1,050,000 context and 128,000 maximum output, with the model-specific effort sets. Do not confuse a deliberate A0 budget with a model's capability limit. [Models][O1] [Sol][O2] [Luna][O3]

The request builder maps `promptCacheKey` to `prompt_cache_options.cache_breakpoint_token`; current documentation instead defines top-level `prompt_cache_key`, separate mode/TTL options and explicit content breakpoints. Usage normalization reads `cache_creation_tokens` rather than the documented Responses `input_tokens_details.cache_write_tokens`. [Cache guide][O4]

**Repair:** correct and version the capability mapping; offer all supported effort values; implement distinct cache controls and actual read/write/lifetime accounting. Preserve raw usage and unknown values. Verify against exact payload/response fixtures and selected-account live behavior.

### C13 — P1: draft recovery throws even without attachments

[`saveDraft`][S1] stores `attachmentIds`; `restoreDraft` reads `state.draft.attachments.map`. Isolated execution reproduced a TypeError with both zero and one attachment. Reconstructing only `{id}` would also lose metadata required by the attachment renderer.

**Repair:** preserve content, complete attachment descriptors and retry identity across network/non-2xx/stream failures. A failed submission must leave a usable draft and unambiguous retry state.

### C14 — P2: web/tool capability is hidden and selection is too coarse

There is no built-in web fetch/search operation in the active source. A URL is message text unless an enabled, discovered MCP tool retrieves it. The screenshot alone cannot establish whether such a tool was connected, offered or invoked. [Run tools][S6] [MCP][S7]

Every tool from every enabled connection is offered to every participant. The website shows a tool count and Discover/Enable/Delete, without schemas, per-tool selection, per-participant scope or a clear “web access available/off/unconfigured” state. A connection disabled during an approval wait is not rejected by the later owner/ID-only execution lookup.

**Repair:** expose actual available capabilities and tools; choose none, a selected set or a saved set per applicable scope; inspect tool descriptions/schemas; provide setup when a capability is unavailable. Recheck current grants and enabled state immediately before dispatch. A model must not claim it read a page without a successful attributed retrieval.

### C15 — P2: phone choices are hard to discover; presentation/voice preferences are fixed

The screenshot visibly clips the rightmost participant label and shows dark labels on dark pills. CSS makes the strip horizontally scrollable, so the image does **not** prove those controls are unreachable; it does show poor discoverability. The pill rules lack an explicit readable foreground. The new model-select/action row also lacks wrapping and a label; its actual phone layout remains to test. [CSS][S8] [Client][S1]

Comparison panes exist only during streaming; reload renders stacked history with no saved-round layout choice. Context previews truncate read-only text at 400 characters, and the cache forecast appears only in a four-second toast. Dictation language is fixed to `en-US`, speech rate to `1.02`, preferences are not durable, and a new `speak` call cancels the previous answer.

**Repair:** visible model IDs and selected state, reachable controls with keyboard/enlarged text, persistent full context/cache inspection, comparison layout choice, and supported voice/language/rate/auto-speak behavior with a declared persistence scope. Provide message text-size and Enter-to-send preferences without crowding the composer.

### C16 — P1: acceptance claims cover less than the required flows

[The added fixture suite][S12] exercises adapter outputs, not the full website approval/coordinator/continuation path, saved-context-to-next-dispatch behavior or persisted outcome rendering. [The ledger][S10] nevertheless records RO01/RO02/RC01 as PASS and uses “PASS (partial)” for RO03.

**Repair:** reopen or narrow the affected assertions. Use one outcome per complete gate; subchecks may be recorded separately. A visible control, shared function name, successful initial text smoke or fixture checking a return value cannot establish the complete user flow. Retain valid prior evidence rather than treating every earlier repair as failed.

## Options inventory to implement

This is the minimum cross-product inventory from the current source and already-agreed build scope. The builder must reconcile every existing configuration field with it and record any additional supported user choice found during implementation.

| Area | Choices to expose | Current gap |
| --- | --- | --- |
| Provider/model | Provider, model, valid custom ID, selected participants, saved default, explicit upgrade/reset | OpenAI-only partial edit; no direct chat model control; defaults overwrite selections |
| Model behavior | Supported reasoning effort, verbosity, output budget, sampling and processing modes where actually supported | Missing UI; several settings ignored; capability catalogue incomplete |
| Request/resources | Effective timeout, tool-round budget, participant count within supported ceilings | Environment-only or hardcoded; no settings writer |
| Conversation switching | New, one-answer continuation, comparison participants; preserve complete intended context | Broken history guard and indistinct actions |
| Context | Project/agent/memory instructions where editable, inclusion, full inspection, selected revision and override/reset | Saved choices not used by next dispatch; source text truncated in UI |
| Cache | Supported mode, lifetime/boundaries, current predicted impact and observed read/write usage | Partial forecast only; incorrect OpenAI mapping |
| Tools/web | Tools off or selected/saved set; per-scope availability; connection editing/discovery/schema inspection; effective approval/grant scope | All enabled tools offered broadly; no visible web capability state |
| Comparison/history | Side-by-side or stacked view, inspect saved rounds, all/selected response inclusion, accessible older conversations | Streaming-only pane layout; selection not durable; list capped at 200 without pagination |
| Files | Select/remove attachments; inspect supported types/limits; explicit inclusion at the applicable context/participant scope | Reference loss, unused count limit, upload/ingestion ambiguity; broad phone access remains separate |
| Voice | Supported dictation language, playback voice/rate, auto-speak/which response, stop/queue behavior | Fixed language/rate and browser-memory settings |
| Presentation | Text size, composer Enter behavior, responsive answer layout, readable selected models | Fixed choices or unclear controls |
| Projects | Select/change project, edit instructions, distinguish shared project defaults from conversation override | Existing association/editor partly present; revision interaction defective |
| Forge/retained agents | All eight templates, exact archived original vs selected effective instructions, provider/model/context/tool/budget choices, memory/state visibility | Pending FR2; must use same validated options service rather than another hardcoded path |
| Temporary modules/AHBG | Available module/view selection and swap, instance-bound stats/chat; current supported game/session/agent options | Pending FR3/FR4; preserve state and source-owned rules |

For each option, record **label → supported values → default → effective value → scope → persistence/reset → validation → request/state effect → unavailable reason**. Do not silently coerce incompatible model settings or present an implemented-looking control whose value is discarded.

Proposed precedence for ordinary preferences is owner default → saved conversation/agent choice → explicit run override. Resolve ambiguities in source-owned contracts; freeze the complete effective configuration per run so concurrent edits affect the next eligible run. Security/permission scopes retain their current grant checks rather than inheriting broader authority from a presentation choice.

## Focused reproduction evidence

The following are isolated source executions, not a production browser run. Reproduce against the pinned source when repairing.

| Scenario | Input/sequence | Observed failure |
| --- | --- | --- |
| UI-RACE | Resolve participants before provider catalogue; compare reverse order | 0 model selectors versus 1 |
| UI-SWITCH | Open detail response containing two messages but no count; change participant | No modal; selection changes immediately. Adding only count opens it |
| UI-DRAFT | Save then restore draft with 0 and 1 attachment | Both throw undefined `.map` TypeError |
| CONTEXT-PROJECT | Save edited project revision, add user message, freeze run | Original project text replaces selected override |
| CONTEXT-INCLUSION | Save excluded history message, add user message, freeze run | Excluded message returns |
| ATTACHMENT | Readable image → build blocks → assemble → actual hydrator → encoder | Storage reference disappears; image URL contains base64 `null` |
| STOP | Emit first text chunk; abort after 10 ms; request deadline 50 ms; mocked response completes at 120 ms | Upstream abort remains false; adapter returns success |
| TOOL-CORRELATION | One selected proposal with participant and provider call IDs → coordinator | Call ID omitted; requester undefined |

No actual provider URL was contacted by these fixtures. Sources were extracted unchanged for the exercised functions; DB/DOM/fetch and unused dependencies were stubbed. The context reproduction additionally verified the recorded Git blob identities and used a local readable image fixture.

## Acceptance and repair order

- [ ] **OC01 — options coverage:** publish the inventory above mapped to concrete API/UI/adapter/state owners. Every supported choice has a control and a visible effective value; missing/unsupported capabilities have truthful explanations.
- [ ] **OC02 — universal model editing:** all four providers support in-place model configuration; saved/custom IDs display accurately; loading order cannot hide controls; changing defaults preserves deliberate selections and history.
- [ ] **OC03 — real option effect:** for every exposed control, verify change → save → reload → next exact request/state → recorded effective configuration. Unknown/ignored settings are rejected visibly. Diagnostic and inference configurations agree except disclosed diagnostic overrides.
- [ ] **OC04 — switching:** reopened history still presents New/Continue/Compare; each sends the correct participant set, mode and complete intended context; concurrent edits do not rewrite an active run.
- [ ] **OC05 — context/files:** saved overrides/exclusions survive new messages; attachments retain owned source references and exact bytes; unsupported inputs/missing bytes fail before dispatch; full context and cache observations remain inspectable.
- [ ] **OC06 — diagnostics/drafts:** actual errors and truthful outcomes survive normal history reload/restart; draft text/attachment descriptors/request identity survive all submission failures. Reproduce the screenshot's two-turn sequence with redacted request/error evidence before assigning a cause.
- [ ] **OC07 — complete tool lifecycle:** one- and multi-participant requests retain Stop/approval bindings; action IDs persist end to end; duplicate execution maps results to every original call; denial/revocation/disable prevents dispatch; two successive tool rounds retain complete compatible state and accurate outcomes.
- [ ] **OC08 — cancellation/status:** abort after first chunk and during later tool rounds; deadline remains enforced; failed/incomplete/EOF/budget/stopped outcomes never become success.
- [ ] **OC09 — actual phone choices:** test the owner's Android browser with keyboard open and increased text size. Every selected provider/model/control remains discoverable and reachable; dropdown labels, contrast, comparison layout and voice choices work and persist as declared.
- [ ] **OC10 — corrected evidence:** rerun the affected #118 and #119 gates, update the ledger with exact build/method/outcome/receipts, and keep FR2–FR4 pending until their actual scoped features exist.

Repair C04/C05/C07–C10/C13 and the model-control/switching foundations before building further flows on them. Implement the options service alongside these fixes, then reuse it for Forge/agents/modules/AHBG. Preserve other VM services, archived sources, exact retained definitions and prior valid evidence. Follow the existing repository/VM handoff and publication authorization; this audit made no production repairs.

## hmmm

- The screenshot's original OpenAI error needs its actual redacted diagnostic; current source explains why the UI lost it, not why the provider failed.
- Current signed-in participant settings, connected MCP servers/grants and live multi-round model behavior were not inspected in this browser.
- Provider access and actual cache hit/write observations require selected-account execution; static capability declarations do not establish those outcomes.
- The new Participants row, keyboard behavior, real voice operation and complete comparison interaction still need phone observation.
- A0's exact installed dependency/runtime state and private VM receipts remain separate from the observed public build identity.

## Sources

[S1]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/web/app.js
[S2]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/index.js
[S3]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/harness.js
[S4]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/contexts.js
[S5]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/providers.js
[S6]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/runs.js
[S7]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/mcp.js
[S8]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/web/styles.css
[S9]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/docs/build-status.md
[S10]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/docs/acceptance.md
[S11]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/apps/server/src/media.js
[S12]: https://github.com/The-Interdependency/a0/blob/700a817be2dc768a78ad198dc5e87ac2294722f3/tests/fr0-fr1/run.js
[O1]: https://developers.openai.com/api/docs/models
[O2]: https://developers.openai.com/api/docs/models/gpt-6.1-sol
[O3]: https://developers.openai.com/api/docs/models/gpt-6-luna
[O4]: https://developers.openai.com/api/docs/guides/prompt-caching


