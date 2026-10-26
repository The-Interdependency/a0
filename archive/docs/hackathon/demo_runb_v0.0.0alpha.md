# Candidate runbook and video plan

**Preparation, not a completed demonstration.** Build/test commands below must be tied to the final candidate's run record. Offline contracts do not demonstrate a functioning Amazon-track experience.

## Establish the source identity

Use a fresh checkout of the exact candidate, not an unidentified Replit workspace or a moving branch. Before running:

```bash
git rev-parse HEAD
git status --short
node --version
python3 --version
uv --version
```

Record those outputs with the run. The inspected baseline is `b5be72523b687c2fbf5fb45893d1d5643c086700`. It is not the final tested submission revision. Prerequisites are Node.js 20.19+ or 22.12+ (or a compatible later release), Python 3.12+, and uv. PostgreSQL is needed for the full application, not the offline checks.

## Locked build and offline checks

From the repository root:

```bash
npm ci --include=dev
uv sync --locked
python3 scripts/subm_chec_offl_v0.0.0alpha.py
```

The runner uses installed dependencies and does not start the application. It runs the Python suite with `tests/test_artifacts.py` and `tests/test_live_server.py` excluded, two selected provider-contract checks, public request-boundary unit checks, TypeScript checking, and the production bundle. It excludes PostgreSQL-backed rate-enforcement tests, browser tests, and full application acceptance. The contract graph is the legacy CONTRACTS/CHECKS subset, not complete native-metadata verification. Repeated contract-wrapper cases must not be counted as additional unique coverage.

The runner removes ambient service credentials, uses temporary home/log/state paths, and supplies a fail-closed loopback database fixture at port 1. This is process-environment isolation, **not an operating-system network sandbox**. Dependency installation needs network access. No real database or inference key is required for these checks.

The standalone locked production-build entry point is:

```bash
bash scripts/build-prod.sh
```

It resolves the repository root from the script location, installs `package-lock.json` with development build tools, validates `uv.lock` against the manifest, installs Python runtime dependencies, and builds in production mode. It does not launch the application. This production build omits Python development dependencies; run `uv sync --locked` again before subsequent offline tests.

Implementation-checkout evidence reported 2026-10-22:

- Production build passed when invoked from `/tmp`; 2,872 client modules and the server bundle were built without changing dependency locks.
- Host versions: Node 24.19.0, Python 3.12.14, uv 0.13.4. The runtime dependency installation resolved 98 packages.
- The Dockerfile's pinned uv 0.11.18 lock validation passed separately. A Docker image was **not** built because no Docker executable was available.
- Final integrated offline runner passed: 322 Python tests (4.64 s), the selected provider wrapper's 34 cases (1.07 s, repeated coverage), public request-boundary `--unit` checks, TypeScript checking, and the full production build.
- The suite includes 11 new checks for locked builds, source identity/refusals, credential-free validation, and the production launcher. Launcher tests use inert executables, including missing-runtime refusal and process-ownership checks; they do not start the app.
- `npm start` and `scripts/start-prod.sh` use one canonical launcher, which resolves the repository root and requires its locked Python environment before Express starts its sole Python child.

These observations concern the implementation checkout, not a live deployment. Record the final committed candidate and its receipt with fresh run output; neither the passing checks nor the archive establishes a working track demo.

## Export the exact committed source

After source and documentation changes are committed:

```bash
python3 scripts/subm_src_pack_v0.0.0alpha.py --output-dir ../a0-source-receipt
```

Choose a fresh output directory outside the checkout. The command requires a clean tracked HEAD and exports committed Git blobs only, with a deterministic compressed archive and JSON receipt containing the commit, tree, and archive SHA-256. It refuses submodules, LFS pointers, and archive-attribute transformations rather than silently omitting or rewriting source. Ignored/untracked files, installed dependencies, and Git history are excluded.

Tracked secrets would be included like any other committed file; review the source before sharing. This verifies source bytes only. It does not scan history, prove runtime functionality, establish Replit parity, publish anything, or decide which repository is frozen. Keep receipts and test logs separate from the source so recording evidence does not change the commit it identifies.

## Full application demonstration: outstanding

The source routes the browser through Express `:5000`, then to FastAPI `:8001`; Vite `:5001` is development-only. The application needs an isolated PostgreSQL database and appropriate local-only account/configuration. Real model inference needs a configured provider key and may incur provider charges. Never publish a key or real account password for judges.

Do not casually start the legacy `scripts/start-dev.sh` on a shared workstation: it terminates processes occupying its fixed ports. Python application startup also performs database setup/cleanup and starts background work. Until a candidate's isolated launch path is tested, this runbook does not present ordinary production startup as a safe judge sandbox. Do not point any test at a production database.

The UI flow visible in source is `/register` or `/login`, authenticated chat at `/`, and the metadata-driven console at `/console`. Once isolated startup is verified, rehearse a fresh local account, a new conversation, one real response, reopening that same conversation, and the selected track-specific action. Use synthetic, non-sensitive example data. These UI steps are a rehearsal plan, not a report that they passed.

To close this gate, record the exact launch command, isolated database creation/schema step, local URL, provider configuration names (not values), sample input, observed output, process shutdown, and test-data cleanup. A compiled frontend or health endpoint alone does not prove this flow.

## Video storyboard: target 2:50

Do not record a final submission video until the track-specific segment works. Show actual screen footage. Clearly label a controlled failure or fake-provider test; never edit it to look like a successful live provider call.

| Time | Screen evidence | Suggested narration and readiness |
| --- | --- | --- |
| 0:00–0:15 | Project name and the chosen user's task | “a0 explores how one task can stay continuous while the model doing the work changes.” Opening is source-backed. Add the concrete target user and task once chosen. |
| 0:15–1:15 | **Missing:** selected Amazon-track workflow completing an actual user action | No narration is finalized for this segment. Show the real input, track-specific runtime or explicitly labeled Alexa+ simulation, and observable result. A generic chat screenshot cannot fill this slot. |
| 1:15–1:55 | Same conversation retained; evidence of the new continuity/failure boundary | If demonstrated live: explain what remained continuous. If showing the contract suite: say, “This controlled test checks the harness boundary; it is not a live provider outage.” Do not claim a UI-only example proves long-context compaction. |
| 1:55–2:25 | August 31 baseline and September harness change, then the working candidate | “This was an existing project. During the event window, we added bounded conversation continuity and provider-failure handling that avoids automatic replay after tool execution.” Only keep features actually shown or clearly identified as test evidence. |
| 2:25–2:40 | Limitation caption and real result | “The checkpoint is intentionally lossy. The stored transcript remains the authoritative history.” Add the selected demo's concrete limit, not generic assurances. |
| 2:40–2:50 | Exact GitHub revision, runbook, and license | “The repository includes the source, setup instructions, and focused tests for this candidate.” Use the final tested link, not an untested branch tip. |

Useful screenshots are the task input, the actual track interaction/result, and the unchanged conversation identity after continuation. Do not fabricate screenshots or include unrelated private conversations, credentials, or unlicensed media.

## Before sharing the video

1. Confirm the video, repository and description refer to the same tested revision.
2. Confirm the video visibly demonstrates the claimed platform/track, not just tests or slides.
3. Upload to public YouTube/Vimeo, check playback without the owner's login, and add that verified URL to the draft.
4. Resolve the [remaining evidence gates](subm_evid_v0.0.0alpha.md). A recorded video is not a completed Devpost entry.
