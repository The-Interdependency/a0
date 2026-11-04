# Mobile chat repair — 2026-11-03

GPT generated; context, prompt Erin Spencer.

## Scope and baseline

Repair the reported navigation, history/resume, attachments, voice and comparison
flows, plus the screenshot's OpenAI Responses error. Starting source and the
public `/api/health` both identify `ef9f44b518087b9152240731a727ec0f3d531913`.
Canonical skill-lib: `d71a3a938cb6d646ffc0b59186452117e4a37d13`.

Done means the actual browser opens history, restores the current conversation
and unsent draft after reload, shows upload/playback/recognition outcomes, keeps
paired responses together after completion, and sends valid assistant history
to OpenAI. Failure includes losing a draft, crossing conversation boundaries,
silently ignoring an action, or a mock-only claim of physical-phone acceptance.

## Findings and file plan

| Finding | Owner and repair | Evidence required |
| --- | --- | --- |
| Participant rendering references undeclared `tools`; rejection prevents navigation binding | `apps/web/app.js`: repair render, bind controls before independent requests | Nonempty participants; menu opens; one failed settings request does not disable history |
| Current conversation and composer exist only in process memory | `apps/web/app.js`: owner-scoped recovery, guarded navigation, resume from server | Reload, app return, delayed navigation, drafts isolated per conversation |
| Uploads have no pending state; sent attachments are never cleared | `apps/web/app.js`: pending/ready/error UI, disable send during upload, preserve descriptors and clear accepted draft | File chooser cancellation, successful/failed upload, reload and send |
| Recognition errors are immediately hidden by `onend`; playback has no outcome feedback | `apps/web/app.js`: persistent voice status and speech lifecycle handling | Fake speech services exercise success, denied permission, unsupported API, playback error and stop |
| Comparison layout preference is unused; saved replies are flattened | `apps/web/app.js`, `index.html`, `styles.css`: round grouping with carousel/side/stack controls | Live and saved pairs, horizontal movement, narrow/wide viewport, persisted choice |
| Responses encodes assistant content as `input_text` | `apps/server/src/providers.js` | Strict local endpoint rejects old encoding and accepts mixed-provider history |

History stays authoritative on the server. Browser recovery contains only the
owner's unsent drafts, uploaded-file descriptors and UI identities; no provider
credentials or saved transcript copies. Sign-out removes local draft recovery.
No database migration, archive edit, provider model substitution or live
credential change is included.

## Verification and rollout

Use isolated local browser fixtures and a strict fake Responses endpoint; never
run the legacy production-directed acceptance runner without its prerequisites.
Check the existing offline Markdown and Responses suites too. Browser assertions
must execute the real app and CSS; mocked APIs/speech do not prove production
authentication, provider access or Android audio output.

Publish a reviewable branch after verification. Deployment requires the existing
VM control connection, a clean source check, app-only activation, public build
identity verification and the reported phone flows. Rollback is an app-only
return to the prior commit; the repair changes no storage schema.

### Observed local results

- Node 24.22.1, Playwright 1.56.1, Chromium 141.0.7390.37; phone viewport
  393 × 820 and a 1280 × 900 layout check. `npm run test:browser`: **18 passed**,
  no failures or skips. Speech APIs and authenticated APIs are explicit fixtures.
- `npm run test:offline`: **13 Markdown assertions and 17 Responses assertions
  passed**, including a strict endpoint that rejects invalid assistant content.
- Against the unmodified baseline, the menu browser check fails with
  `tools is not defined`, the microphone check detects a hidden permission error,
  and both new assistant-history assertions fail (one reproduces HTTP 400).
- `node --check` for changed JavaScript and `git diff --check` passed.
- Archive tree remains `573843696f7090e5164488f782e38eaccc5b64bd`.
- `.github/workflows/web-regressions.yml` runs isolated checks on pull requests
  and main, retaining browser traces, screenshots and JUnit results. It does not
  use the production-directed acceptance runner or live keys.

These are results for the working tree committed with this record. The PR/CI
head identifies the published revision; local passing results do not certify
remote CI or deployment.

The first published code revision `3dd39efc9f7fd331a472b0bf68712e6a421207dd`
has a successful [GitHub Web regressions run](https://github.com/The-Interdependency/a0/actions/runs/41743383734).
Its separate [CodeQL run](https://github.com/The-Interdependency/a0/actions/runs/41743383675)
completed analysis but failed upload: GitHub rejects advanced configurations
while default setup is enabled. That existing configuration conflict remains
open; this UI repair does not disable or bypass scanning. The test workflow's
actions were then updated to verified immutable v7 release commits to remove
the deprecated Node 20 action-runtime dependency; the subsequent workflow run
is the evidence for those pins.

The deployed `app.js` SHA-256 is
`28936795d4b63404358e75e096df088dc0bc156d2bd9aee496a15c500c2dbfbc`,
identical to the baseline source. Deployment must refresh `/opt/a0/build-info.json`
from the actual checked-out release; health reads that metadata file, so also
compare served JavaScript with the reviewed release instead of trusting the
reported commit alone.

### Usage and replay

Run the commands in the root README. For screenshots and traces, set
`A0_TEST_ARTIFACT_DIR=test-results` before `npm run test:browser`; those inert
fixtures are ignored by git. `A0_TEST_WEB_ROOT` may point to an isolated export
of `apps/web` at an older commit to reproduce historical failures with the same
browser tests. The harness serves only its five allowlisted static files and
intercepts every API call locally.

Primary API references used for the repair:
[OpenAI Responses migration](https://developers.openai.com/api/docs/guides/migrate-to-responses),
[recognition errors](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/error_event),
and [speech playback errors](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/error_event).

## hmmm

No VM execution connection or SSH identity is exposed in this session. Physical
Android microphone/audio and production acceptance remain unverified. Browser
speech depends on the device/browser speech service and permission; unsupported
or failed services now produce visible feedback. A page reload restores saved
history, not the old streaming HTTP connection; reopen/refresh history for a run
still completing on the server. Active-stream reattachment after full page
destruction remains separate unfinished work, not a claimed result of draft
recovery. Session-scoped drafts survive tab reload/discard but are not synced to
other devices or retained after explicit sign-out/tab closure.
