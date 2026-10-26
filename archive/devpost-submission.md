# a0: continuous work across model providers

**Draft only. Not sent to Devpost.** This describes the repository, not a verified Amazon-track entry. Resolve the track and demo gates in [submission evidence](docs/hackathon/subm_evid_v0.0.0alpha.md) before using it as final submission copy.

This root filename is the Devpost preparation-tool boundary; supporting documents follow the repository's versioned filename convention.

## One-line summary

A research instrument for keeping one conversation and its work history continuous while language-model providers remain replaceable execution resources.

## Problem and intended user

People doing extended work with AI need to preserve the task, recent context, and a reviewable history when a model's context fills or a provider fails. a0 explores that problem for researchers and technically engaged users. Its value proposition is continuity and inspectability, not a claim that every task can be completed autonomously.

## What a0 does

a0 separates the persistent conversation from the model executing a turn. Its continuous-work harness retains the initial task and recent messages, constructs a bounded checkpoint for older turns, and keeps the stored transcript authoritative. An explicitly selected provider stays pinned. In automatic mode, the harness can try an eligible alternative after a supported failure, but stops automatic replay once a registry tool has executed.

The repository combines a React console, an Express authentication and request boundary, and a Python/FastAPI orchestration service backed by PostgreSQL. Console structure comes from route-owned metadata. Provider adapters and model configuration are separated, and public access has explicit entitlement and cost limits.

These are source-backed implementation descriptions. The current run results and limits belong in the [demo instructions](docs/hackathon/demo_runb_v0.0.0alpha.md), not in a blanket claim that the full platform is verified.

## What changed during the hackathon

This is an **existing project**. During the event window, the repository added the continuous-work harness and persisted continuity state, typed provider failures and guarded failover, a generic OpenAI-compatible transport, and public-access controls. An Android Capacitor shell was also added; it has not been established as a Fire TV application.

The strongest before/after story is the new continuous-work harness: long conversations retain their original task identity, older context is bounded, and provider failures are handled without automatically repeating an already executed tool. Exact commits, source files, and proof limits are in [the change evidence](docs/hackathon/subm_evid_v0.0.0alpha.md#existing-project-evidence).

## How AI is used

The runtime delegates model inference to configured providers through its adapters. This draft does not claim that every provider in the registry has been exercised in the submitted build. Development assistance for this preparation included repository inspection and documentation drafting with an AI coding assistant. The submitter should confirm the actual development tools used for the final required answer.

## Links and testing

- Repository: https://github.com/The-Interdependency/a0
- Exact candidate revision: **UNRESOLVED. Record the final tested commit before recording the video.**
- Run instructions and recording plan: [docs/hackathon/demo_runb_v0.0.0alpha.md](docs/hackathon/demo_runb_v0.0.0alpha.md).
- Public YouTube/Vimeo video: **REQUIRED, NOT PROVIDED.**
- Hosted testing URL: optional; no public hosting claim is made.
- License: [AGPL-3.0-or-later](LICENSE); preserve the notices for vendored dependencies, including skill-lib.

## Track positioning, not yet selected

No implemented Amazon-track runtime or simulated Alexa+ experience has been verified. Do not label the existing chat UI an Alexa+ simulation merely to fill the form. The owner must choose the intended experience, and the repository and video must then demonstrate it. See the practical alternatives in [submission evidence](docs/hackathon/subm_evid_v0.0.0alpha.md#track-decision).

## Known limitations

- Bounded continuity is intentionally lossy. It is not lossless memory or a substitute for the stored transcript.
- Tests using fake providers establish local behavior only, not live provider reliability, useful end-to-end task execution, or track qualification.
- The previously exercised Replit revision and the canonical GitHub source have not been proved identical.
- The repo's public-release checklist remains separate. A local judge demo does not establish safe public deployment, production privacy, scientific efficacy.

## Required form answers still owned by the submitter

Live form checked 2026-10-22. IDs identify fields; these are preparation notes, not authorization to submit.

| Field IDs | Answer or remaining decision |
| --- | --- |
| 28285–28288 | Individual/team/organization, organization name or N/A, country, and Canadian province or N/A. Do not infer. |
| 28289 | Primary track selection, pending working track evidence. |
| 28290 | Final GitHub judging URL and exact tested revision. |
| 28291–28292 | Existing, but significantly updated. Use the sourced change description above, with the demonstrated feature updates. |
| 28293–28294 | AWS mini-challenge choice. No qualifying AWS or Kiro use has been verified; do not claim it. The service-description field is marked required even when the choice is No. |
| 28295–28299 | Open-source mini-challenge choice. If Yes, supply a distinct qualifying contribution, repository URL, personal GitHub username, and explanation. A public license alone does not answer these fields. |
| 28303–28307 | Five product-feedback answers: [draft and evidence limits](docs/hackathon/tool_feed_v0.0.0alpha.md). |
| 28308–28310 | Age, eligible jurisdiction, and absence of disqualifying employment/representation. Personal attestations, unanswered. |
| 29056 | AI tools actually used for development, to be confirmed. |
| 29057–29058 | Learning level and career AI value. Personal judgments, unanswered. |

Optional testing instructions belong in field 29377. Never place real API keys, account passwords, or production credentials in this file or the public form. The form does not ask for a Codex session ID.

Official sources: [submission requirements and rules](https://amazonappdev2026.devpost.com/rules), [FAQs](https://amazonappdev2026.devpost.com/details/faqs). Refresh the live form before final entry.
