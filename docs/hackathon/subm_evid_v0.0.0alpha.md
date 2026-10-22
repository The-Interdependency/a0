# Submission evidence and remaining gates

Checked 2026-10-22 against canonical source `b5be72523b687c2fbf5fb45893d1d5643c086700`, live Devpost requirements, and the official links below. Later implementation changes need their own exact-head run record.

## Requirements/evidence matrix

| Gate | Evidence in hand | Remaining proof or decision |
| --- | --- | --- |
| Primary-track functionality | Existing web-agent runtime; no verified Amazon-track implementation | Choose a track and demonstrate its actual required experience. |
| GitHub source and license | Public a0 repository; root AGPL license and consistent package declarations | Pin the tested candidate. Check all dependencies/assets are retrievable. Preserve third-party notices. |
| Reproducible run | Locked production build and scoped offline aggregate passed in the implementation checkout | Record final committed-head results and source receipt; full app/track runtime remains untested. |
| Existing-project update | Pre-start baseline and substantive post-start commits identified below | Video must show the chosen update working, not just a diff. |
| Description | [Repository-grounded draft](../../devpost-submission.md) | Remove unsupported claims; finish track-specific positioning. |
| Demo video | [Recording plan](demo_runb_v0.0.0alpha.md) | Record actual functionality, under three minutes; publish on YouTube/Vimeo and check public playback. |
| Tool feedback | [Evidence-based draft](tool_feed_v0.0.0alpha.md) | Confirm firsthand tool experience and fill unanswered opinions. |
| Entrant/team fields | Live form inventory in the draft | Submitter confirms details, eligibility, and representation. |
| Final entry | Local materials only | Enter required fields and obtain explicit authority for final submission. |

Deadline: **2026-10-23 19:00 UTC / noon PDT**. A locally runnable repo and video can suffice; a public website and website-maintainer integration are not prerequisites. [Official rules](https://amazonappdev2026.devpost.com/rules), [FAQ](https://amazonappdev2026.devpost.com/details/faqs).

## Track decision

The material decision is: **Which a0 capability should the Amazon-track demonstration actually exercise?**

| Option | Fit with a0 | New evidence needed |
| --- | --- | --- |
| Alexa+ through MCP/Agent Skill | Expose a bounded existing a0 capability rather than replace the application | A real working integration. The MCP route needs version 2025-11-25 or later and Streamable HTTP, with demonstrated calls. |
| Alexa+ simulated experience | Reuse the conversational frontend and agent runtime | An actual, explicitly simulated Alexa+ experience in source and video; generic chatbot screenshots are not proof. No particular SDK is required for this alternative. |
| Fire TV | Android source is present | Run and demonstrate the app on the qualifying Fire OS/Vega device or simulator; an Android shell alone does not establish that. |
| Bee or Ring | No connection found in the inspected implementation | Real Bee-device/Watch data use, or a working documented Ring API/SDK/simulator/device integration, respectively. |

No option is selected by this document. The first two are the closest architectural fits, an engineering judgment rather than a ruling of eligibility. [Track rules](https://amazonappdev2026.devpost.com/rules). Gated Alexa+ partner tools are not needed; [the FAQ](https://amazonappdev2026.devpost.com/details/faqs) describes participant-accessible paths.

## Existing-project evidence

The event opened at `2026-08-31T17:15:00Z`. The last first-parent commit before that boundary is [`6dc1ac0f5cf9e7f1a232c086274ce1af405735ec`](https://github.com/The-Interdependency/a0/commit/6dc1ac0f5cf9e7f1a232c086274ce1af405735ec), timestamped `2026-08-31T13:04:25Z`. This establishes that a0 predates the event.

| Change | Source evidence after the boundary | What it does not prove |
| --- | --- | --- |
| Android shell and bounded native bridge | [cab1aa4c](https://github.com/The-Interdependency/a0/commit/cab1aa4c1d48a7b0c8b9d33f59eb91c689777e77), September 7; `capacitor.config.ts`, `android/` | Fire TV/Vega compatibility or a tested APK. |
| Registry-driven compatible-provider adapter | [PR #106 merge 60a6b87a](https://github.com/The-Interdependency/a0/commit/60a6b87a6c39fd2293bbb944bf2b4aea27cbb708), September 10 UTC; `python/services/providers/open_comp_prov_v0.0.0alpha.py` | Successful calls to every configured provider. |
| Public-access boundary | [f4faf5c5](https://github.com/The-Interdependency/a0/commit/f4faf5c50dd5bc55e377279a0e403e088bcdced8), September 19; `python/services/publ_acce_poli_v0.0.0alpha.py`, `PUBLIC_RELEASE.md` | Completed public deployment, historical cleanup, or production privacy. |
| Continuous work and guarded failover | [PR #110 merge ad958a4e](https://github.com/The-Interdependency/a0/commit/ad958a4e5f4cdb17ba815539d2e6a545034db161), September 23; `python/services/work_harness.py`, `provider_failure.py`, `python/routes/chat.py`, `shared/schema.ts` | A live user task, actual provider availability, or safe replay outside the tested boundary. |

Commit dates and source differences establish repository history, not independent authorship or eligibility certification. They support a specific significant-update description; the selected updates must still be shown functioning.

Reproduce the history comparison from a full checkout:

```bash
git log --first-parent --reverse --since='2026-08-31T17:15:00Z' \
  --format='%H %cI %s' b5be72523b687c2fbf5fb45893d1d5643c086700
git diff --stat 6dc1ac0f5cf9e7f1a232c086274ce1af405735ec \
  b5be72523b687c2fbf5fb45893d1d5643c086700
git show ad958a4e5f4cdb17ba815539d2e6a545034db161 -- \
  python/services/work_harness.py tests/test_work_harness_v0.0.0alpha.py
```

## Candidate identity and post-deadline preservation

Before recording, capture the exact commit, dependency locks, run commands, outputs, and any deliberately mocked boundary. Use the same candidate in the repository link, description, and video. The earlier Replit revision `ca1aa77` is not established as equivalent to canonical `b5be7252`; old test totals must not be relabeled as current-candidate results.

The [October 19 organizer update](https://amazonappdev2026.devpost.com/updates/46539-final-stretch) instructs entrants not to alter submitted code, video, or materials after the deadline until after the December 3 winner announcement. Decide which repository/materials will be frozen before entry. A pinned commit is useful identity evidence but does not, by itself, override an instruction not to edit the submitted repository. No separate repository, freeze mechanism, permission change, or publication is authorized by this document.

Keep [PUBLIC_RELEASE.md](../../PUBLIC_RELEASE.md) intact. Local judging and public deployment have different acceptance gates.
