---
name: visitor-intro
description: Onboarding tour for visitors arriving at any The-Interdependency repo. Load this when an unfamiliar user asks "what is this?", "what is The Interdependency?", "how do these repos fit together?", "where do I start?", or otherwise signals they are new to the org. Gives the agent a consistent, repo-aware way to orient a newcomer without inventing facts. Also load for a pre-task repository overview, a visitor evaluating or auditing the org, or cross-repository work where a newcomer lacks the repo map. Do not load for in-task work by an existing contributor; this is onboarding, not doctrine reference.
---


Start the tour from the visitor's landing repository and link to canonical entry points.

## Doctrine

Three rules govern any tour given under this skill:

1. **Repo-aware.** Start from the repo the visitor is in. Name it
   explicitly, say what it does, then widen the frame to the org.
2. **Map, don't recite.** Give the visitor a labelled map and a small
   number of entry points. Do not paraphrase the founding documents at
   length — they exist and can be read directly.
3. **Mark unknowns.** If the visitor asks about a part of the org you
   cannot describe from this skill or the repo's own files, say so.
   Write `hmmm` rather than inventing alignment.

## Org thesis (one paragraph)

The Interdependency is a research organization building an integrated
agent platform whose components are released as independent repos.
`a0` is the user-facing agent platform; `pcna` is the inference engine
it embeds; `ucns`, `PCEA`, and `ZFAE` are mathematical substrates the
engine and platform rest on; `edcm` is the measurement and evaluation layer
for agent behaviour (it superseded the archived `edcmbone`);
`interdependent-lib` and `skill-lib` are shared libraries; the rest are
extensions, archives, or variants. The founding document is
`a0/interdependent_way.md`.

## Repo map

Give the visitor this map. Use the one-liner for the repo they are in
plus a short ring of related repos; do not dump the whole table unless
they ask.

| Repo | One-liner |
|---|---|
| `a0` | The agent platform (`a0p`). Three-process app (Express + Vite + Python/FastAPI) with a metadata-driven console. This is what most visitors should run first. |
| `pcna` | Prime Circular Neural Architecture — the six-ring inference engine (Phi / Psi / Omega / Guardian / Memory-L / Memory-S) embedded in `a0`. |
| `PTCA` | Prime Tensor Circular Architecture — the ring-tensor substrate that `pcna` builds on. |
| `PCEA` | Prime Circular Encryption Algorithm — companion encryption layer for ring states. |
| `ucns` | Unit Circle Number System — the recursive factorization theory underlying the ring math. |
| `a0ucns` | `a0` packaged with `ucns` for combined research deployment. |
| `eml_ucns` | EML-flavoured `ucns` variant. |
| `edcm` | Energy–Dissonance Circuit Model measurement and evaluation. Maintains the structural-measurement implementation consolidated from `edcmbone`. |
| `edcmbone` | Archived 2026-07-28; superseded by `edcm`. Historical provenance only. |
| `aimmh` | Emergent Multi-Model AI Hub — multi-provider routing surface. |
| `interdependent-lib` | Shared cross-repo library code. |
| `skill-lib` | Canonical org-wide agent skill library (this repo). |
| `ai-tiw` | Archive / content repo (model-response artefacts; predates current doctrine). |
| `ZFAE` | Zero-Field Algebraic Encoding — substrate work. |

If a visitor is in a repo not in this table, say so honestly and point
them at the repo's own `README.md`.

## Core concepts visitors will encounter

Name these only as needed. Do not lecture.

- **PCNA / the six rings** — Phi, Psi, Omega, Guardian, Memory-Long,
  Memory-Short. Inference is a six-step pipeline over these rings.
  Defined in `a0`'s `python/engine/pcna.py` and documented in `a0/spec.md`.
- **EDCM** — Behavioural directive scoring (CM, DA, DRIFT, DVG, INT, TBF)
  that guides LLM selection and fires corrective actions. The archived
  implementation lives in `a0/archive/python/services/edcm.py`;
  measurement doctrine in `edcm`
  (`edcmbone`, archived 2026-07-28, is superseded by `edcm`).
- **SigmaCore** — Encodes the workspace filesystem as a prime-ring
  tensor; the Psi ring's filesystem companion.
- **msdmd** — Module Self-Declared Metadata Markdown. The org's
  convention for keeping module contracts in the same file as the code.
  Defined in `../msdmd/SKILL.md`.
- **The Interdependent Way** — The founding sociopolitical document.
  `a0/interdependent_way.md`. Long, poetic, and load-bearing for the
  org's framing. Quote sparingly; link instead.

## Recommended reading order

Offer this as a numbered list when the visitor asks "where do I
start". Pick the first item to match the repo they are in.

1. The repo's own `README.md` (always).
2. `a0/replit.md` — platform overview and current state.
3. `a0/CLAUDE.md` — concrete architecture: process topology,
   frontend metadata-driven console, route registration, key services.
4. `a0/spec.md` — full agent platform spec (PCNA, EDCM, sentinel
   channels). Long; skim.
5. `a0/interdependent_way.md` — founding philosophy. Optional but
   recommended before any contribution.
6. `../README.md` — the doctrinal toolkit agents use here.

## Workflow: tailoring by landing repo

Use the table below to pick the opening sentence. Then offer the
reading list above, reordered so the visitor's current repo's
documents appear first.

| Visitor is in | Opening frame |
|---|---|
| `a0` | "You're in the agent platform. Most of the org's runtime lives here; the other repos are substrates and extensions." |
| `pcna` / `PTCA` / `PCEA` / `ucns` / `ZFAE` | "You're in a mathematical substrate of the platform. The user-facing app that consumes this is `a0`." |
| `edcm` | "You're in the EDCM measurement and evaluation repo. Its `README.md` and `CANON.md` say what is measured and what is not claimed." |
| `edcmbone` | "You're in an archived repo (archived 2026-07-28). Maintained EDCM work lives in `edcm`; this repo is historical provenance." |
| `skill-lib` | "You're in the canonical org-wide agent skill library. Every other repo carries a `.agents/skills/` copy of these skills." |
| `interdependent-lib` | "You're in a shared cross-repo library. It is consumed by the runtime repos rather than run on its own." |
| `aimmh` | "You're in the multi-model hub used by the platform for provider routing." |
| `ai-tiw` | "You're in an archive / content repo. Historical artefacts; predates current module doctrine." |
| anything else | "I don't have a one-line frame for this repo committed to memory. Let me read its `README.md` and tell you what I see." |

## Anti-patterns / things to refuse

- Do not invent relationships between repos that are not in this skill
  or in the repo's own files.
- Do not claim a repo is "deprecated", "the main one", "the new
  version", or similar status the org has not stated.
- Do not paraphrase `interdependent_way.md` as if it were a TL;DR.
  Quote a single short line and link the file.

## Output shape

A good tour is short. Aim for:

- One sentence naming the repo the visitor is in and what it does.
- One sentence widening to the org thesis.
- A 3–5 entry map of the most relevant sibling repos for the visitor's
  apparent interest.
- A numbered reading list of 3–5 files, current-repo first.
- One closing line offering to go deeper on any item.

If the visitor asks a specific question, answer it first and only then
offer the tour.
