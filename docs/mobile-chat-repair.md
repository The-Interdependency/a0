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
  393 × 820 and a 1280 × 900 layout check. `npm run test:browser`: **21 passed**,
  no failures or skips. Speech APIs and authenticated APIs are explicit fixtures.
- `npm run test:offline`: **13 Markdown assertions and 17 Responses assertions
  passed**, including a strict endpoint that rejects invalid assistant content.
- Against the unmodified baseline, the menu browser check fails with
  `tools is not defined`, the microphone check detects a hidden permission error,
  and both new assistant-history assertions fail (one reproduces HTTP 400).
- Review regressions also reproduce and repair rejected-upload correction,
  desktop navigation to a third answer, and typing/upload completion while new
  chat creation is pending. Rejected requests can be edited and sent with a new
  identity; uncertain deliveries retain their protected retry path. Uploads and
  the latest draft migrate at the actual conversation switch, and informational
  toasts do not intercept composer or attachment controls.
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
is the evidence for those pins: [Web regressions passed at `e964bb4`](https://github.com/The-Interdependency/a0/actions/runs/41743812088).
The review fixes above were tested locally afterward; PR #121 records CI at its
latest published head separately.

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

## Five additional P2 findings — repair receipt

The November 3 review at 16:14 PST (November 4, 00:14 UTC) inspected
PR #121 head bf38c7f090951f3080810abd84ee247985801b21. All five findings
were reproduced as repository-owned DEFECTs in the actual Chromium client.
The patch also incorporates main f231aec5a7ed6d24ba564253b402d426247d20b6,
preserving its AHBG turn protection and acceptance record.

| Review finding | Owning correction in apps/web/app.js | Browser regression |
| --- | --- | --- |
| Acknowledged retry leaves a duplicate ready to send | Reuse submitted-composer cleanup for saved acknowledgements; remove matching text/file IDs and preserve newer edits/uploads | Accepted-but-unacknowledged request, untouched/edited drafts, reload and subsequent Send; original identity remains single |
| Delayed retry changes newer navigation | Recheck navigation generation and conversation after the history request, before UI or POST effects | Accepted/unaccepted requests, navigation away and away/back, original pending identity retained |
| Startup erases early input | Disable composer, files, dictation and sends until owner recovery and initial conversation detail finish | Empty/recovered startup and delayed detail; composition available afterward |
| Lost stream restores stale Working/Stop | Invalidate the conversation's cached run on stream loss; reconcile stopped:false; clear associated tool controls | Real local HTTP EOF and socket reset, including background conversation; reopen twice; Stop reports inactive |
| Sign-out recreates private recovery on pagehide | Revoke persistence, clear owner/in-memory recovery and selection, then remove storage before reload | Actual logout reload and same-account sign-in; drafts/files/pending IDs absent; failed logout preserves recovery |

The initial 12 new cases failed against bf38c7f. The EOF case was rerun
after tightening the harness's same-conversation navigation wait, and failed on
the stale Working control as expected. All 12 passed after repair. Two further
cases protect the initial-detail loading boundary and unsuccessful logout.

Final integration review reproduced a related navigation race at stream
completion: refreshing the old conversation could supersede a newer selection
whose detail request was still pending. Two additional regressions fail on
08fa26f and protect both first sends and retries.

The review of b25406d found two further defects, both reproduced before repair.
Late recognition now follows the first draft's adopted conversation identity,
including final results delivered after the detail request. Stream completion
refreshes a visible conversation after a completed return, while an outstanding
selection keeps priority. If a terminal event arrives while a history request
is pending, its older snapshot is refetched before display. Three regressions
cover dictation/reload, a completed return and a pending return; all fail against
b25406d. Navigation tests wait for the rendered selection rather than assuming
that a previously idle network means a released fixture has finished rendering.

Integrated local verification: **40 browser tests passed**, zero failures,
skips or cancellations; **13 Markdown and 17 Responses assertions passed**.
Node 24.22.1, Playwright 1.56.1, Chromium 141.0.7390.37; actual app/CSS,
fixture APIs and speech, plus real loopback stream disconnection. Syntax and
whitespace checks pass. No archive change or archived test execution.
The first repair commit 08fa26f passed 35 browser tests and both offline suites
in [Web regressions](https://github.com/The-Interdependency/a0/actions/runs/41779243873);
its [CodeQL workflow](https://github.com/The-Interdependency/a0/actions/runs/41779243878)
still failed at SARIF processing because default setup was enabled.
The follow-up b25406d passed 37 browser tests and both offline suites in
[Web regressions](https://github.com/The-Interdependency/a0/actions/runs/41779684125).
Its default CodeQL check passed, while the duplicate repository workflow
[failed on the same configuration conflict](https://github.com/The-Interdependency/a0/actions/runs/41779684181).
The workflow runs the same browser test file on PRs and main; the PR records the
published commit, remote run and final review state rather than treating these
local results as CI evidence.

Replay the targeted original failures by exporting apps/web from bf38c7f,
setting A0_TEST_WEB_ROOT to that directory, then running:

~~~sh
node --test --test-name-pattern='acknowledged retry|delayed retry|initialization never|disconnected stream|Stop reconciles|sign-out removes' tests/frontend/browser.test.js
~~~

Release-gate investigation: CodeQL job 126295016629 completed analysis but
GitHub rejected its SARIF processing because default setup was enabled.
The repository's deliberately scoped advanced workflow remains unchanged.
[GitHub documents the setup conflict and supported transition](https://docs.github.com/en/enterprise-cloud%40latest/code-security/reference/code-scanning/troubleshoot-analysis-errors/results-different-than-expected).
The connected repository API cannot change that administrative setup, and
branch-protection details return 403. The settings browser is signed out, so it
does not supply administrator access either. The visible active ruleset preserves
deletion/force-push protection and requests Copilot review on push; it contains
no required-status or approval rule. No bypass or security-policy change was made.

The public health response reports f231aec5a7ed6d24ba564253b402d426247d20b6
(builtAt 2026-11-04T02:59:07.675186+00:00). Served app.js still hashes to
28936795d4b63404358e75e096df088dc0bc156d2bd9aee496a15c500c2dbfbc,
identical to main's unrepaired client. Thus this mobile repair is **not deployed**.
No VM execution tool or SSH identity is exposed here. Use the existing
authorized VM connection after merge admission succeeds; refresh build metadata,
compare served JavaScript, then perform the actual Android flows.

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
