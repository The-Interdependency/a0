# Options contract excerpt

Source: https://github.com/The-Interdependency/a0/issues/120
The historical Current gap column is a baseline, not a current defect finding. Apply the choices and per-option contract; re-audit current behavior.

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


