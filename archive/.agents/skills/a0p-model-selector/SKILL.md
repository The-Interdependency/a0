---
name: a0p-model-selector
description: How to pick the right LLM for the job in a0p — and how to do it well enough that a swarm of cheap models can chew through massive volumes of data while flagships are reserved for the work that actually needs them. Covers the tier ladder (nano → mini → flash/fast → pro/sonnet → opus + thinking), the task-class → tier decision matrix, the swarm-of-cheap-models pattern (parallel fan-out, strict output schemas, batching, deterministic retry, escalation gates), per-role defaults inside a0p's energy registry, and the cost math that makes or breaks the architecture. Load this skill before adding a new orchestration mode, designing a sort/tag/extract/route pipeline, editing energy_registry seeds, picking a model for a new tool, or any time someone says "just use Claude" for work a 5¢/MTok model can do.
---

# a0p Model Selector

The default mistake is to send everything through the smartest available
model. The smarter mistake is to send *most* things through the cheapest
model that can do them, and reserve flagships for the steps that decide
something. This skill encodes the doctrine.

> A swarm of cheap, schema-constrained models that can sort, tag, dedupe,
> route, and triage at <0.05¢/call will out-throughput a single flagship
> by two orders of magnitude on the same budget — *if* you give them a
> tight contract and an escalation path.

---

## 1. The tier ladder

a0p currently has five providers in `python/services/energy_registry.py`.
Mentally group them by **decision weight** rather than vendor:

| Tier | Examples (today) | $/MTok in (rough) | What it's for |
|------|------------------|-------------------|---------------|
| **T0 — Nano** | gpt-5-nano, gemini-flash-lite, haiku | ~0.05–0.20 | Bulk classification, dedup keys, regex-class extraction, "is this junk?", routing labels. Schema-only output. |
| **T1 — Mini / Flash / Fast** | gpt-5-mini, gemini-2.5-flash, grok-4-fast | ~0.20–0.70 | Per-record summarization, single-paragraph drafts, tool-result distillation, structured-data extraction with mild reasoning. |
| **T2 — Pro / Sonnet** | gemini-3-pro, claude-sonnet-4.5 | ~3–5 | Multi-step reasoning, planning, code generation, critique of T0/T1 output, conflict resolution between swarm votes. |
| **T3 — Opus + extended thinking** | claude-opus + thinking, gpt-5 with high `reasoning_effort` | ~15+ | Adversarial review, novel architecture, ambiguous ethical/legal judgment, irreducibly hard math/proof. |

Two rules:

1. **Default down.** Start the design at T0. Promote a step to T1/T2 only
   after you have evidence the cheaper tier fails at it (eval, not vibes).
2. **Cost asymmetry is your tool.** A T2 critic over 100 T0 drafts is
   often cheaper *and* better than 100 T2 calls. Use the tier ladder as
   a filter, not as a commitment.

### 1.1 Cost is one of four axes

The table above is $/MTok. That's the *first* filter, not the only one.
Three more axes can flip a tier choice:

- **Latency.** For interactive chat, p99 time-to-first-token usually
  matters more than per-token price. A "cheap" T0 that's overloaded at
  8s p99 is worse UX than a T1 at 1.5s. Measure under real load, not
  the provider's marketing chart.
- **Context window.** Gemini Flash's 1M window changes batching math —
  you can stuff 100× more items per call than gpt-5-nano's 8k. The
  effective per-item cost shifts accordingly. Always compute cost per
  *item* at the batch size your context window actually allows.
- **Modality.** Vision, audio, and embeddings are *separate* ladders.
  gpt-5-mini can't see; gemini-2.5-flash can. If your task has any
  multimodal input, the tier choice is pre-decided by capability before
  cost enters the picture.

### 1.2 The tier you should consider before T0: **embeddings**

For classification, dedup, clustering, retrieval, and "is X similar to
Y" — start with embeddings, not chat. Embedding APIs run ~$0.02/MTok
(another order of magnitude below T0) and replace the LLM entirely for
a huge fraction of "sort this stuff" work.

Pattern: embed all items once → cluster / nearest-neighbor in code →
swarm-label only the ambiguous boundary cases (low-margin nearest
neighbors, multi-cluster items). On the 1M-tweets example in §6, this
pre-pass would cut the swarm cost by another 5–10× because most items
land confidently in one cluster and never see an LLM.

If you find yourself reaching for T0 to ask "are these the same?" or
"which bucket does this go in?", reach for embeddings first.

### 1.3 Reasoning-model economics are inverted

T3 with extended thinking (Claude `thinking`, gpt-5 high
`reasoning_effort`, o-series) bills for hidden reasoning tokens that
don't show up where you expect. Sticker price per output token looks
similar to T2; *effective* price per call can be 5–20× higher because
the model burns thousands of internal tokens before emitting one
visible token. Set explicit `max_thinking_tokens` budgets and monitor
the reasoning-token usage field separately. Never put a reasoning model
inside a tight loop without a per-step token cap.

---

## 2. Decision matrix — task class → starting tier

| Task class | Start at | Promote when |
|------------|----------|--------------|
| Sort / bucket / tag (fixed label set) | T0 | Label set has fuzzy boundaries, needs world knowledge to disambiguate |
| Dedupe / canonicalize | T0 | Records are paraphrased rather than near-identical |
| Extract structured fields from semi-structured text | T0 → T1 | Source has nested clauses, conditionals, or domain jargon |
| Per-document summary (1–3 sentences) | T1 | Summary feeds a downstream decision; then promote the *consumer*, not the summarizer |
| Route a request to the right tool/agent | T0 | Routing depends on intent inference, not keyword match |
| Translate / paraphrase | T1 | Idiomatic, legal, or safety-critical output |
| Generate code | T2 | Trivially boilerplate (regex, JSON shaping) → T1; new architecture/refactor → T2 or T3 |
| Plan a multi-step task | T2 | Plan is single-shot and reversible → T1 acceptable |
| Critique / cross-check another model's output | T2 | Critic must outrank the producer; never use the same tier as critic |
| Final user-facing reply in chat | T2 | Pure acknowledgement / status → T1 fine |
| Distill long tool result for context window | T1 (in-vendor) | See §6 — keep the distiller pinned to the active provider |

If the task isn't in the table, ask: *what does a wrong output cost?*
Cheap-and-wrong is fine for indexing. Cheap-and-wrong is catastrophic
for sending an email. Promote accordingly.

---

## 3. The swarm-of-cheap pattern

This is the pattern the user is gesturing at: tens of thousands of T0
calls in parallel, structured output, deterministic retry, T2 escalation
on disagreement. The shape:

```
                   ┌──────────────┐
input batch ─────► │  T0 swarm    │ ─► structured rows ─┐
   (N items)       │  (parallel,  │                     ▼
                   │  schema'd)   │              ┌─────────────┐
                   └──────────────┘              │ aggregator  │
                          │                      │ (pure code) │
                          │ disagreement /        └─────────────┘
                          │ low-confidence              │
                          ▼                             │
                   ┌──────────────┐                     │
                   │  T2 critic   │ ────────────────────┘
                   │  (small N)   │
                   └──────────────┘
```

Mandatory constraints — break any of these and the swarm degrades to
"expensive noise":

1. **Schema-only output.** Every T0 call must return JSON matching a Zod
   / Pydantic schema. Free-text answers force you into a second LLM pass
   to parse them, which kills the cost win. Reject + retry on parse
   failure rather than "fixing" it with another LLM.

2. **Batching.** Send 10–50 items per call when the model supports it
   (Gemini 2.5 Flash and grok-4-fast handle this well). Fewer round
   trips means lower per-item latency *and* better cache amortization.
   Cap batch size at the point where label quality starts dropping in
   eval — find that empirically per task.

3. **Idempotent retry.** T0 models flake. Use a fixed seed, deterministic
   temperature 0, and re-call up to 2× on parse failure or schema
   violation. After the second failure, escalate the *individual item*
   (not the batch) to T1 or T2. Track escalation rate as a health metric;
   >5% means your prompt or schema is wrong.

4. **Self-confidence field.** Include `confidence: number 0..1` in the
   output schema. Items below a threshold (start at 0.6, tune from eval)
   get auto-escalated. This is the "T2 critic" lane — it should fire on
   1–10% of items, not 50%.

5. **Two independent T0 votes for high-stakes labels.** When a wrong
   label has real cost, run two T0 calls *with different prompts*
   (paraphrased, not identical). Disagreement → escalate. Agreement at
   high confidence → accept. This is still cheaper than one T2 call and
   catches the prompt-overfit failure mode.

6. **Aggregate in pure code.** The reducer that turns N swarm outputs
   into a final dataset must be deterministic Python/TS. Do not use an
   LLM as an aggregator unless the aggregation itself requires reasoning
   — that's a §4 case, not a §3 case.

7. **Cap parallelism at the provider's rate limit, not your CPU.** T0
   models will happily 429 you. Use a semaphore sized to ~80% of the
   tier's TPM ceiling and a token bucket for retries.

---

### 3.1 Where the swarm pattern actively *hurts*

For **creative / divergent** tasks — naming, copy, ad headlines, brand
ideation, brainstorming — invert everything. You want N high-temperature
samples from *one* model (not schema-locked, not deterministic), then a
T2 critic ranks them. Schema constraints + temperature 0 + parallel
voting collapses the diversity that's the whole point of the task.

Heuristic: if the success criterion is "interesting", swarm-pattern is
wrong. If it's "correct", swarm-pattern is right.

---

## 4. When T0 + critic genuinely isn't enough

Escalate the *whole pipeline* to T2 when:

- The task requires synthesizing across the *entire* dataset, not per-row.
- Output quality has tail risk (legal, medical, financial advice).
- The user explicitly asked for the smartest answer and is paying for it
  (Forge agents on `ws` / `admin` tier with explicit override).
- The cheap-tier eval shows >15% disagreement with a held-out human
  label set on this task class.

Escalate to T3 (extended thinking) when even T2 plateaus, and **time-box
it**. T3 is for one-shot critical decisions, not loops.

---

## 5. a0p-specific wiring

### 5.1 Energy registry seeds

`python/services/energy_registry.py` holds the per-provider model id
strings. To install a T0 default for a role, edit the seed JSON for the
provider, then PATCH `/api/energy/providers/{id}` (the validator + deep
merge fix from commit c4ab6a16 is what makes this safe per-role).

### 5.2 Per-role defaults

The five roles in `client/src/components/ProviderSeedCard.tsx`
(`conduct`, `perform`, `practice`, `record`, `derive`) each accept a
model assignment per provider. Recommended starting tiers:

| Role | Suggested tier | Rationale |
|------|----------------|-----------|
| `conduct` (orchestration / routing) | T0 → T1 | Picking the next step is a classification problem. |
| `perform` (main work) | T1 → T2 | The actual user-visible output. |
| `practice` (drafts, distillation) | T0 → T1 | Internal-only; never user-facing. |
| `record` (logging / summarization) | T0 | Pure compression. |
| `derive` (analysis / reasoning) | T2 | This is the role that earns its keep. |

Override per Forge agent character sheet when the agent's purpose
demands it (e.g. a research analyst persona pins `derive` to T3).

### 5.3 Orchestration modes

`python/services/inference_modes.py` already supports `single`,
`fan_out`, `council`, `daisy_chain`. To implement a swarm, register a
new mode (e.g. `swarm`) that:

- Accepts an explicit `tier` ("T0"/"T1"/"T2") rather than `providers`.
- Resolves `tier` to the cheapest available provider per the user's
  configured energy seeds.
- Batches input items, runs in parallel under a semaphore, returns the
  aggregated structured rows in `usage["responses"]` so the Fleet UI
  can show per-batch results.
- Emits one `provider_response` event per batch (see
  `a0p-fleet-runs` skill for the event vocabulary).

### 5.4 Tool-result distillation — already does this right

`python/services/tool_distill.py` pins the distiller to the active
provider so a Claude session uses claude-haiku to compress its own tool
results, not gpt-5-mini. Replicate that pattern any time you add an
in-loop summarization step. Cross-vendor distillation costs latency,
breaks prompt caching, and confuses the cost ledger.

### 5.5 Prompt caching is part of the tier choice

OpenAI Responses API and Anthropic both discount cached input by 50–90%.
A T1 model with a 10k-token cached system prompt is often cheaper than a
T0 model called fresh. When designing a swarm, prefer providers whose
caching makes the per-item cost competitive at your batch shape. The
provider docs (`anthropic-api`, `gemini-api`, `gpt-5-api`,
`grok-api` skills) cover the cache mechanics.

---

## 6. Cost math — the worked example

Sorting 1M tweets into 50 categories, ~80 input tokens each.

- **Naïve flagship (T2 Sonnet):** 1M × 80 × $3/MTok = **$240** (and
  several hours of latency at the rate limit).
- **T0 swarm (gpt-5-nano-class) with batches of 25:** 40k calls ×
  (25 × 80 + ~150 schema preamble) = ~85M tokens × $0.10/MTok = **$8.50**.
  ~1% escalate to T2 critic: 10k items × 80 × $3/MTok = **$2.40**.
  Total **~$11**, under an hour wall-clock.

A 22× cost reduction with *better* throughput, and the failure cases get
the smartest model on them rather than the average ones.

When the math doesn't pencil this way (e.g. the task per-item input is
already long, or the schema is a paragraph), the swarm advantage shrinks
— recompute before committing.

---

## 7. Anti-patterns

- **"Just use Claude for everything."** The default that turns a $50/mo
  budget into a $500/mo budget without measurable quality lift.
- **Free-text output from T0 models.** Every parse-failure round trip
  erases the cost win and adds latency variance.
- **No eval set.** If you cannot say "T0 is 92% on this task and T2 is
  95%", you are guessing. Build a 100-row gold set before you choose a
  tier; reuse it forever.
- **LLM as the aggregator over swarm output.** Pure code aggregation is
  faster, cheaper, and reproducible. Use an LLM here only when the
  aggregation step itself requires judgment.
- **Same-tier critic.** A T0 critic over T0 producers does not catch
  T0's systematic biases. Critic must be at least one tier up.
- **Single-vote labels on irreversible actions.** Sending an email,
  charging a card, deleting data — never on one T0 vote. Two-vote
  agreement *plus* T2 critic, or escalate the whole call.
- **Fan-out without rate limiting.** You will get 429'd, retry storms
  will double your cost, and the Fleet will fill with `error` events.
  Use a semaphore.
- **Ignoring prompt caching.** A 10k-token system prompt sent fresh to
  10k T0 calls is wasted money. Cache it once.
- **Cache-busting in the prefix.** `datetime.now()`, a per-user nonce, a
  freshly-generated UUID, or any other varying byte in the *cached
  prefix* silently destroys the cache and doubles your bill. Caches are
  byte-identical-prefix; put variability in the *suffix*.
- **Unpinned model versions.** "gemini-2.5-flash" today and in six
  months are different models with different accuracy on your task.
  Pin to dated versions in production seeds (`gemini-2.5-flash-2025-xx`)
  and re-run the §8 eval on every bump.
- **Estimating tokens by character count.** "It's about 80 tokens" is
  how a 1.5M call quietly becomes a 4M call. Use tiktoken (OpenAI),
  the Anthropic counter, or `count_tokens` (Gemini) before sizing any
  swarm budget.
- **Embedding when you should LLM, or LLM when you should embed.** If
  the question is "are these the same?" / "which bucket?", try
  embeddings first (§1.2). If the question requires reasoning about
  *why*, embeddings won't get you there.
- **Letting one Forge agent drain the budget.** Tier overrides on a
  character sheet need a *per-agent* budget cap, not just a per-call
  tier. One chatty research persona pinned to T3 can burn a user's
  whole month in an afternoon.

---

## 8. How to validate a tier choice (mini-protocol)

1. Build a 100-item gold set with ground-truth labels.
2. Run T0 with the chosen schema, batch size 1. Record accuracy and
   per-item cost.
3. Run T0 batched (10, 25, 50). Pick the largest batch where accuracy
   stays within 1% of batch-1.
4. Run T1 and T2 on the same set. If T1 doesn't beat T0 by ≥3% absolute,
   stay at T0. If T2 doesn't beat T1 by ≥3%, stay at T1.
5. Compute escalation rate at confidence < 0.6. If >10%, the prompt or
   schema needs work *before* you tune the tier.
6. Project to your real volume. If projected cost > budget, reduce
   confidence threshold (more escalation = more cost) or accept the
   accuracy of the cheaper tier.

Re-run this when you change the prompt, the schema, or the model
version. Provider model updates (gpt-5-mini → gpt-5-mini-2026-xx) can
shift accuracy by 5+ points either direction.

---

## 9. Quick reference — relevant files

```
python/services/energy_registry.py              # Provider seeds, model id strings
python/services/inference_modes.py              # Where to add a `swarm` mode
python/services/inference.py                    # Per-provider call sites; distiller pinning
python/services/tool_distill.py                 # In-vendor distillation pattern (replicate this)
python/routes/energy.py                         # PATCH validator + deep merge for seed edits
client/src/components/ProviderSeedCard.tsx      # Roles list, role→model assignment UI
client/src/components/chat-input.tsx            # MODES list; add `swarm` here when wiring
.agents/skills/anthropic-api/SKILL.md           # Cache + tier cost details
.agents/skills/gemini-api/SKILL.md              # Same
.agents/skills/gpt-5-api/SKILL.md               # Same
.agents/skills/grok-api/SKILL.md                # Same
.agents/skills/a0p-fleet-runs/SKILL.md          # Event vocabulary for swarm emit calls
```

Default down. Promote on evidence. Reserve flagships for the steps that
decide something.
