# a0p — Agent Zero Platform

## Specification v1.0.2-S11

**Version**: 1.0.2-S11
**Status**: Frozen (canon-aligned)
**Platform**: Replit (NixOS container)
**Runtime**: Node.js + TypeScript

---

## 1. Overview

a0p (agent zero platform) is a mobile-first autonomous AI agent application. It combines Gemini function-calling with a mathematically rigorous orchestration engine (EDCMBONE), Google infrastructure access (Gmail, Drive), file management with direct phone upload, commercial subscriptions via Stripe, and Replit OAuth authentication.

The agent executes tasks autonomously using up to 23 tools across up to 8 rounds per request, with full cryptographic audit logging and real-time cost tracking.

---

## 2. Architecture

### 2.1 Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Express.js 5 + TypeScript |
| Database | PostgreSQL (Drizzle ORM) |
| Auth | Replit Auth (OpenID Connect via Passport) |
| Payments | Stripe (via stripe-replit-sync) |
| AI (built-in) | Gemini 2.5 Flash, Grok-3 Mini |
| AI (BYO) | OpenAI, Anthropic, Mistral, Cohere, Perplexity |
| Google | Gmail API v1, Drive API v3 (via Replit Connectors) |
| Engine | EDCMBONE + PCNA/PTCA + SHA-256 hash chain |

### 2.2 Design Principles

- Mobile-first: optimized for phone browsers, "Add to Home Screen" PWA-like experience
- Fail-closed: no silent fallback (hmmm invariant)
- Autonomous: agent decides which tools to use; no manual model toggle
- Auditable: every engine action is hash-chained and timestamped
- Cost-aware: per-token tracking with estimated USD cost

---

## 3. EDCMBONE Engine (canon v1.0.2-S9)

### 3.1 Naming + Aliases

- **EDCM**: Energy-Dissonance Circuit Model (diagnostic metrics + control signals)
- **PTCA / PCTA**: Prime Tensor Circular Architecture (canon name: PTCA; alias PCTA accepted)
- **PCNA**: Prime Circular Neural Architecture (neural/routing layer consuming PTCA structures)
- **EDCMBONE**: Minimal canonical skeleton for EDCM evaluation + reporting
- **Sentinels (S1-S9)**: Reserved control channels for invariants, safety, provenance, gates, and audit

### 3.2 Operator Vector System

Five operator classes: **P**, **K**, **Q**, **T**, **S**

Each actor (Grok, Gemini, User) produces a 5-dimensional operator vector. Vectors are L1-normalized with epsilon = 1e-9 to prevent division by zero.

### 3.3 Distance and Decision

| Metric | Method |
|--------|--------|
| Distance | L2 (Euclidean) between normalized vectors |
| Merge | delta <= 0.18 |
| Softfork | delta <= 0.30 |
| Fork | delta > 0.30 |
| Align Risk | user divergence > 0.25 from either actor |

Class priority for conflict resolution: P=0, K=1, Q=2, T=3, S=4 (lowest index dominates).

### 3.4 PCNA (Prime Circular Neural Architecture)

- **Nodes**: n = 53
- **Topology**: Circular graph
- **Adjacency distances**: {1, 2, 3, 4, 5, 6, 7, 14}
- Each node connects to neighbors at those distances (modular arithmetic)

### 3.5 PTCA (Prime Tensor Circular Architecture) — 4-axis tensor

PTCA defines a structured tensor space organized by primes and circular geometry. It supplies a deterministic skeleton for PCNA to learn on top of.

#### 3.5.1 Tensor Layout (4-axis: 53 x 9 x 8 x 7)

| Axis | Label | Size | Meaning |
|------|-------|------|---------|
| 0 | prime_node | 53 | Prime-indexed routing nodes (first 53 primes) |
| 1 | sentinel | 9 | S1-S9 control channels |
| 2 | phase | 8 | Phase cycle (reserved for v2 inter-group composition) |
| 3 | hept | 7 | Heptagram association slot (6 ring + 1 Z hub) |

Sentinel index mapping: S1_PROVENANCE=0, S2_POLICY=1, S3_BOUNDS=2, S4_APPROVAL=3, S5_CONTEXT=4, S6_IDENTITY=5, S7_MEMORY=6, S8_RISK=7, S9_AUDIT=8.

#### 3.5.2 Heptagram Geometry (6+1 axial)

Each seed (prime_node) has its own XY plane containing **6 ring sites** (hexagon). The **7th site** is an axial **Z hub** (tensor-field point).

- `site 0..5`: XY hexagon ring
- `site 6`: Z hub

#### 3.5.3 Exchange Operator Pipeline

**a) Ring rotation (v1 constant):**
- Step delta = 1, direction `dir(s) = (-1)^s` (alternating by seed index)
- Ring permutation: `k' = (k - dir(s) * delta) mod 6` for k in 0..5
- Hub site (k=6) is not moved by rotation

**b) Intra-seed coupling (ring <-> hub):**
- `Agg6` = mean over ring sites (0..5)
- Ring -> hub: `X[s,6] += beta * Agg6(X[s,0..5])`
- Hub -> ring: `X[s,k] += gamma * X[s,6]` for k in 0..5

**c) Inter-seed coupling via shared Z hub:**
- `H = mean(X[:,6])` (mean over all seeds)
- `X[s,6] = (1 - alpha) * X[s,6] + alpha * H`

#### 3.5.4 Frozen Constants (v1.0.2-S9)

| Constant | Value | Role |
|----------|-------|------|
| alpha | 0.10 | Inter-seed coupling weight |
| beta | 0.20 | Ring-to-hub coupling weight |
| gamma | 0.10 | Hub-to-ring coupling weight |
| delta | 1 | Constant rotation step |
| Agg6 | mean | Ring aggregator |
| AggSeeds | mean | Seed aggregator |

#### 3.5.5 PCNA Euler Solver Parameters

| Parameter | Value | Role |
|-----------|-------|------|
| dt | 0.01 | Time step |
| dtheta | 2*pi/53 | Angular spacing |
| steps | 10 | Iterations per evaluation |
| alpha_diffusion | 0.6 | Diffusion (neighbor coupling) |
| beta_drift | 0.4 | Drift (sine-wave signal) |
| gamma_damping | 0.2 | Damping (energy dissipation) |

**Energy** = linear energy (mean square of state vector) + tensor energy (mean square across all 4D tensor elements).

The full 4D tensor (53×9×8×7 = 26,712 elements) is implemented as a flat `Float64Array` with row-major indexing: `idx(p,s,ph,h) = ((p*9+s)*8+ph)*7+h`. The exchange operator pipeline runs across all sentinel channels and phase slots per tick. Phase energies are computed per-phase for monitoring. Sentinel channel amplitudes are extracted by averaging across phases and heptagram sites per node.

#### 3.5.6 Grouping and Phase Scope

- A **group** is a block of exactly 53 seeds (one PTCA prime_node field)
- v1 exchange (rotation + ring<->hub + shared-Z coupling) is defined **within a group**
- Phase (8-step) is **reserved for v2** inter-group composition/coupling

### 3.6 EDCM Metric Families (6 families, v1.0.2-S9 freeze)

All metrics produce values in [0, 1] with declared range. Every metric output includes `used_context` echoing the S5 context window/retrieval used.

#### A) Constraint Mismatch (CM)

Measures mismatch between declared constraints and observed language/actions.

- `CM = 1 - Jaccard(C_declared, C_observed)`
- Output: `{"CM": {"value": 0.12, "range": [0,1], "evidence": ["..."]}}`

#### B) Dissonance Accumulation (DA)

Represents buildup of unresolved contradictions, corrections, backtracking, and non-resolution.

- `DA = sigmoid(w1 * f_contrad + w2 * f_retract + w3 * f_repeat + w4 * f_unresolved)`
- Features: contradiction markers, retractions/corrections, repeated unanswered questions, circular references

#### C) Drift (DRIFT)

Tracks deviation from goal vector or scope vector.

- `DRIFT = 1 - cosine_similarity(x_t, goal)`
- If embeddings are used, output is marked as inferred component

#### D) Divergence (DVG)

Measures splitting into multiple competing trajectories (distinct from drift).

- `DVG = entropy(topic_distribution)` normalized to [0, 1]
- Placeholder: cluster turns into topics, compute entropy

#### E) Intensity (INT)

Captures conversational "heat" without moralizing.

- `INT = clamp01(a1 * caps + a2 * punct + a3 * lex_intensity + a4 * tempo)`
- Features: caps ratio, punctuation intensity, lexical intensity, short-interval repetitions

#### F) Turn-Balance Fairness (TBF)

Measures domination/skew across actors using Gini coefficient on actor token shares.

- `TBF = Gini(p_actor)` normalized [0, 1]
- Higher value = more skew

### 3.7 Alert Thresholds (80/20 rule, frozen v1.0.2-S9)

Default policy for all alerts:

| Condition | State |
|-----------|-------|
| Metric >= 0.80 | TRIGGER (HIGH) |
| Metric <= 0.20 | CLEAR (LOW) |
| 0.20 < Metric < 0.80 | Hysteresis band (no state change) |

Named alerts (frozen):

| Alert Name | Metric | Description |
|------------|--------|-------------|
| ALERT_CM_HIGH | CM | Constraint mismatch threshold breach |
| ALERT_DA_RISING | DA | Dissonance accumulation rising |
| ALERT_DVG_SPLIT | DVG | Divergence split detected |
| ALERT_INT_SPIKE | INT | Intensity spike detected |
| ALERT_TBF_SKEW | TBF | Turn-balance fairness skew |

Each alert specifies thresholds, evidence requirements, and recommended mitigations (non-actuating unless S4 approved).

### 3.8 S5_CONTEXT Contract (global context, frozen v1.0.2-S9)

S5_CONTEXT is the single source of truth for window definition, retrieval policy, and hygiene/redaction rules. All compute endpoints accept optional `context`; if omitted, server uses defaults.

```json
{
  "context": {
    "window": {"type": "turns", "W": 32},
    "retrieval": {"mode": "none", "sources": [], "top_k": 0},
    "hygiene": {"strip_secrets": true, "redact_keys": true}
  }
}
```

Invariants:
- EDCM MUST report which context it used (`used_context` in output)
- PCNA MUST report which context it used
- Any retrieval != none must be logged in S9_AUDIT (sources, queries, k, hashes where available)

### 3.9 EDCMBONE Report Format (frozen v1.0.2-S9)

Minimal canonical skeleton for EDCM evaluation and reporting:

```json
{
  "edcmbone": {
    "thread_id": "thr_...",
    "used_context": {"window": {"type": "turns", "W": 32}, "retrieval": {"mode": "none", "sources": [], "top_k": 0}},
    "metrics": {
      "CM": {"value": 0.12},
      "DA": {"value": 0.31},
      "DRIFT": {"value": 0.22},
      "DVG": {"value": 0.05},
      "INT": {"value": 0.40},
      "TBF": {"value": 0.18}
    },
    "alerts": [],
    "recommendations": [],
    "snapshot_id": "snap_..."
  }
}
```

Recommendations format:
```json
{
  "recommendations": [
    {
      "id": "rec_...",
      "rank": 1,
      "title": "Clarify constraints",
      "type": "dialogue|tool|system|external",
      "requires_S4": true,
      "why": ["metric:CM", "alert:ALERT_CM_HIGH"]
    }
  ]
}
```

### 3.10 Sentinel Context (required in outputs)

EDCM outputs include sentinel-relevant fields:

```json
{
  "sentinel_context": {
    "S5_context": {"window": {"type": "turns", "W": 32}, "retrieval_mode": "none"},
    "S6_identity": {"actor_map_version": "v1", "confidence": 0.98},
    "S7_memory": {"store_allowed": false, "retention": "session"},
    "S8_risk": {"score": 0.12, "flags": []},
    "S9_audit": {"evidence_events": ["evt_..."], "retrieval_log": []}
  }
}
```

### 3.11 Provenance Block

Every response includes a provenance block (S1):

```json
{"provenance": {"ts": "ISO-8601", "model": "...", "build": "v1.0.2-S9", "hash": "sha256:..."}}
```

### 3.12 Canon Event Format

```json
{
  "event_id": "evt_...",
  "ts": "ISO-8601",
  "thread_id": "thr_...",
  "actor_id": "act_...",
  "event_type": "turn|metric|alert|decision|action_request|action_result|snapshot",
  "refs": ["evt_..."],
  "payload": {},
  "hash": "sha256:...",
  "sig": null
}
```

### 3.13 Sentinels (S1-S9, canon roles)

| Sentinel | Canon Name | Role |
|----------|------------|------|
| S1 | S1_PROVENANCE | Origin, hashes, timestamps, reproducibility hooks |
| S2 | S2_POLICY | Hard redlines, disallowed actions/content, compliance |
| S3 | S3_BOUNDS | Operational limits: cost, rate, timeouts, scope ceilings |
| S4 | S4_APPROVAL | Explicit approval for external/irreversible changes |
| S5 | S5_CONTEXT | Single source of truth for window + retrieval + context hygiene |
| S6 | S6_IDENTITY | Actor mapping, roles, permissions, key selection |
| S7 | S7_MEMORY | Persistence rules, retention, deletion requests, no silent memory |
| S8 | S8_RISK | Risk scoring + escalation, uncertainty, needs-review routing |
| S9 | S9_AUDIT | Accountability trail, decision trace, replay bundles, export correctness |

Recommended evaluation order (fast-fail): S6, S5, S2, S3, S8, S7, S4, S1, S9.

Minimal invariants:
- Any action proposal must satisfy S1-S3, request S4 when applicable, and record S9 always
- S5 owns window + retrieval globally
- S4 is non-bypassable for external actuation

### 3.14 Hash Chain

- Algorithm: SHA-256
- Genesis hash: SHA-256 of "a0p-genesis"
- Canonical JSON: sorted keys, deterministic stringification
- Hash = SHA-256(prevHash + canonicalJson(payload))
- Verification: recomputes every hash from genesis to detect tampering

### 3.15 HmmmInvariant

```
When uncertain, pause. When conflicted, disclose. No silent fallback.
```

Every process carries an hmmm state object (`{valid, message, timestamp}`). S9 enforces this at every sentinel check. The system fails explicitly rather than degrading silently.

### 3.16 Heartbeat

- Frequency: every 1 hour (3,600,000 ms)
- Startup: initial heartbeat at 5 seconds after launch
- Action: runs full hash chain verification, logs status (OK / CHAIN_ERROR / ERROR)

### 3.17 Emergency Stop

Manual kill switch. Sets `emergencyStop = true`, halts heartbeat. Resume available via API.

### 3.18 Multi-Armed Bandit Layer

UCB1-based multi-armed bandit with EMA decay for adaptive selection across four domains.

#### 3.18.1 Algorithm

- **UCB1 + EMA decay**: exploitation uses EMA reward (not raw average), exploration uses standard UCB1 confidence bound
- **UCB1 score**: `exploitation(emaReward) + C * sqrt(ln(totalPulls) / pulls)`
- **EMA update**: `emaReward = lambda * oldEma + (1 - lambda) * reward`
- **Cold start**: when an arm has < `coldStartThreshold` pulls, epsilon-greedy random selection with probability `epsilon`
- Disabled arms are skipped entirely

#### 3.18.2 Domains and Default Arms

| Domain | Arms |
|--------|------|
| tool | web_search, fetch_url, gmail_search, gmail_send, github_search, code_execute |
| model | gemini, grok, synthesis |
| ptca_route | standard, deep_solve, heptagram_boost, sentinel_focus |
| pcna_route | ring_53, adjacency_8, full_diffusion, hub_only |

#### 3.18.3 Adjustable Parameters (via `bandit` system toggle)

| Parameter | Default | Description |
|-----------|---------|-------------|
| C | sqrt(2) ≈ 1.414 | UCB1 exploration constant |
| lambda | 0.95 | EMA decay rate |
| epsilon | 0.3 | Cold-start random exploration probability |
| coldStartThreshold | 5 | Minimum pulls before UCB1 takes over |

#### 3.18.4 Cross-Domain Correlation Tracking

After each full request cycle, the joint selection (tool + model + ptca_route + pcna_route) and composite reward are recorded in `bandit_correlations`. This reveals which combinations of arms across domains produce the best joint outcomes.

- Stored in `bandit_correlations` table with `tool_arm`, `model_arm`, `ptca_arm`, `pcna_arm`, and `joint_reward`
- Queryable via `GET /api/bandit/correlations?limit=50`

#### 3.18.5 Controls

- Per-arm enable/disable toggle
- Global bandit system toggle
- All parameter sliders adjustable in Console
- Every selection, reward, and correlation event logged to master log

### 3.19 EDCM Behavioral Directives

Six behavioral directives that modify agent behavior when EDCM metrics exceed configurable thresholds.

#### 3.19.1 Directives

| Directive | Trigger Metric | Default Threshold | Instruction |
|-----------|---------------|-------------------|-------------|
| CONSTRAINT_REFOCUS | CM | 0.80 | Refocus on declared constraints; reduce scope drift |
| DISSONANCE_HALT | DA | 0.80 | Pause and resolve contradictions before continuing |
| DRIFT_ANCHOR | DRIFT | 0.80 | Re-anchor to original goal; summarize progress |
| DIVERGENCE_COMMIT | DVG | 0.80 | Commit to one trajectory; stop splitting |
| INTENSITY_CALM | INT | 0.80 | Reduce intensity; use measured, neutral language |
| BALANCE_CONCISE | TBF | 0.80 | Be more concise; balance turn length |

#### 3.19.2 Configuration

- **Per-directive toggle**: each directive can be independently enabled/disabled
- **Per-metric threshold**: each directive's trigger threshold is independently adjustable (0.0–1.0)
- **Global toggle**: entire directive system toggleable via `edcm_directives` system toggle
- **Stacking**: multiple directives can fire simultaneously
- **Prompt injection**: fired directives are injected into the system prompt as `EDCM BEHAVIORAL DIRECTIVES (active):` block

#### 3.19.3 Feedback Loop

- EDCM metrics computed before each response
- Directives generated based on current metrics and config
- Fired directives injected into prompt
- Post-response EDCM re-evaluation captures the effect
- History of all firings maintained (last 200 entries)

### 3.20 11-Seed External Memory Tensor

Eleven external memory seeds exist OUTSIDE the working 53-node graph. They provide persistent, user-controllable context that survives across conversations.

#### 3.20.1 Seed Structure

Each seed contains:
- **Structural state**: PTCA values (504 elements) + PCNA weights (11 floats)
- **Semantic summary**: human-readable text summary (max 500 chars for non-pinned)
- **Original summary**: saved at creation/import for drift detection
- **Domain label**: editable identifier
- **Controls**: enabled, pinned, weight (0.0–2.0)

#### 3.20.2 Default Seed Labels

| Index | Label | Purpose |
|-------|-------|---------|
| 0 | User preferences | Style, format, and interaction preferences |
| 1 | Topics/interests | Subjects the user engages with |
| 2 | Tool patterns | Which tools are used and how |
| 3 | Conversation patterns | Communication style observations |
| 4 | Domain knowledge | Accumulated domain expertise |
| 5 | Error patterns | Common issues and resolutions |
| 6 | TIW knowledge | The Interdependence Web knowledge |
| 7 | External research | Findings from heartbeat research tasks |
| 8 | Relational context | Background and relationship context |
| 9 | Active goals | Current objectives and plans |
| 10 | Meta-learning | Patterns about learning and adaptation |

#### 3.20.3 Sentinel Governance (5 checks per seed per injection)

| Sentinel | Check | Failure Condition |
|----------|-------|-------------------|
| S1_PROVENANCE | Seed has traceable origin | No summary, no original_summary, no label |
| S3_BOUNDS | Projected values in [-1.0, 1.0] | Any projected value out of range |
| S4_APPROVAL | Hash integrity verification | SHA-256 hash check fails |
| S8_RISK | Total projected energy < threshold | Energy exceeds s8_threshold (default 50.0, slider) |
| S9_COHERENCE | Inter-seed cosine similarity > threshold | Cosine similarity with any other seed < s9_threshold (default -0.5, slider) |

- Per-seed running pass/fail tallies stored on the seed record
- All sentinel checks logged to sentinel log stream
- Per-sentinel pass rate tracked over time for audit trail

#### 3.20.4 Projection Matrices

- **Projection IN** (seeds → working 53): `projectionIn[11×53] × seed.weight × seed.ptcaValues → 53-element bias` ADDED to fresh tensor state
- **Projection OUT** (working 53 → seeds): `projectionOut[53×11] × finalState → blend at alpha` for non-pinned seeds
- Initialized with small random values ((random - 0.5) * 0.02)

#### 3.20.5 Semantic Memory

After each request, a 1-2 sentence summary is routed to the most relevant seed based on keyword matching:
- **Non-pinned seeds**: compress (existing + new) to ≤ 500 chars (sliding window)
- **Pinned seeds**: append new summary

#### 3.20.6 Attribution Trace

After each response, per-seed contribution percentage is computed — how much each enabled seed's projection influenced the working graph's initial state. Returned as metadata: `{ seed0: 0.15, seed4: 0.40, seed9: 0.25, ... }`. Logged to attribution log.

#### 3.20.7 Interference Detection

Before injection, checks if any pair of seeds project contradictory biases onto the same working nodes (opposing sign, both significant magnitude > 0.05). Interference events logged with conflicting seed indices and affected working nodes.

#### 3.20.8 Semantic Drift Detection

Every N requests (default 50, adjustable via slider), computes EDCM DRIFT metric on each non-pinned seed's current summary vs its `original_summary`. If DRIFT > 0.6, flagged in Console with warning. User can re-pin, re-import, or accept the drift.

#### 3.20.9 User Controls

- View/edit summary text
- Edit label
- Pin/unpin (pinned seeds are not overwritten by projection out or semantic compression)
- Weight slider (0.0–2.0)
- Enable/disable
- Clear (resets to default state)
- Import text (set summary and original_summary)

#### 3.20.10 Adjustable Parameters (via `memory_injection` system toggle)

| Parameter | Default | Description |
|-----------|---------|-------------|
| alpha | 0.1 | Learning rate for projection out blending |
| s8_threshold | 50.0 | S8_RISK energy ceiling for projected values |
| s9_threshold | -0.5 | S9_COHERENCE minimum cosine similarity |
| drift_check_interval | 50 | Requests between semantic drift checks |

#### 3.20.11 Portable Identity (Export/Import)

- **Export**: `GET /api/memory/export` produces JSON with all 11 seed states (labels, summaries, original_summaries, ptca_values, pcna_weights, enabled, pinned, weight), projection matrices, request count, sentinel audit tallies, export timestamp, and BUILD_VERSION
- **Import**: `POST /api/memory/import` accepts the same JSON format, validates structure, overwrites all 11 seeds, resets sentinel tallies, saves pre-import state as snapshot for rollback, logs import event

#### 3.20.12 Snapshots

Memory tensor state (all seeds + projections) is snapshotted to `memory_tensor_snapshots` every 10 requests.

### 3.21 Dual-Model Synthesis

Parallel execution of Gemini and Grok, with merged output via Gemini.

#### 3.21.1 Flow

1. User message sent to both Gemini and Grok in parallel
2. Both responses collected (with timeout/error fallback)
3. Gemini merges the two responses into a unified synthesis
4. Both individual responses are EDCM-scored and bandit-rewarded
5. The merged response is returned to the user

#### 3.21.2 Controls

- Selectable as "synthesis" model in conversation
- Toggleable via `synthesis` system toggle
- Timeout slider adjustable
- All events logged

### 3.22 Custom Function Calls

User-defined tools that extend the agent's capabilities, targetable to specific models.

#### 3.22.1 Handler Types

| Type | Description |
|------|-------------|
| webhook | HTTP POST to external URL |
| javascript | Sandboxed JS execution |
| template | String template interpolation |

#### 3.22.2 Features

- CRUD API for custom tools
- JSON Schema for parameter validation
- Model targeting: select which models can use each tool (text array)
- Per-tool enable/disable toggle
- Global `custom_tools` system toggle
- Bandit-rewarded after execution
- All events logged

### 3.23 Heartbeat Task Scheduler

Background task system that runs autonomous research and monitoring tasks.

#### 3.23.1 Architecture

- `server/heartbeat.ts` — main scheduler
- Adjustable tick interval (default 30 seconds)
- Weighted task selection: one task per tick, selected proportional to weight
- Tasks only eligible if their interval has elapsed since last run
- Toggleable via `heartbeat` system toggle

#### 3.23.2 Built-In Task Types

| Task Type | Default Weight | Default Interval | Description |
|-----------|---------------|-----------------|-------------|
| transcript_search | 1.0 | 600s (10 min) | Search and analyze conversation transcripts for EDCM patterns |
| github_search | 1.5 | 900s (15 min) | Search GitHub for autonomous agent, ethical AI, and TIW-aligned repos |
| ai_social_search | 1.0 | 1200s (20 min) | Monitor AI agent directories, registries, and social platforms |
| x_monitor | 0.8 | 1800s (30 min) | Monitor X/Twitter for AI discussions (disabled by default) |
| custom | — | — | User-defined tasks |

#### 3.23.3 Proactive Discovery Drafts

When any heartbeat task finds something with relevance > 0.8 or notable EDCM anomaly, a `discovery_draft` record is created automatically. Discoveries appear in Console System tab and can be promoted to full conversations with one click.

#### 3.23.4 Controls

- Per-task weight slider (affects selection probability)
- Per-task interval input
- Per-task enable/disable toggle
- Run-now buttons in Console
- Global heartbeat toggle
- Tick interval adjustable via system toggle parameters

### 3.24 Autonomous Research

Four built-in heartbeat task handlers that perform autonomous research.

#### 3.24.1 Transcript Search + EDCM Parsing (`transcript_search`)

- Scans recent conversations (up to 10)
- Scores last 5 messages per conversation using EDCM metrics
- Stores EDCM snapshots with source="transcript"
- Per-transcript log file (append-only JSONL)
- EDCM scores feed into history
- Notable findings (EDCM peak > 0.7) routed to Seed 7 ("External research") semantic summary
- High-relevance finds → discovery draft for proactive conversation

#### 3.24.2 GitHub Contributor Search (`github_search`)

- Searches GitHub API with rotating queries: autonomous agent framework, ethical AI alignment, cooperative AI multi-agent, etc.
- Scores repos by relevance using multi-tier keyword matching + star count + language
- Deduplicates across runs (in-memory seen sets)
- Results routed to Seed 1 ("Topics/interests") and Seed 6 ("TIW knowledge") semantic summaries
- High-relevance repos (score >= 0.5) → discovery drafts with repo metadata

#### 3.24.3 AI-AI Social Site Monitoring (`ai_social_search`)

- Searches and monitors AI agent directories, registries, and social platforms:
  - Agent Protocol ecosystem listings
  - Hugging Face agent/model spaces
  - AI agent leaderboards and benchmarks (SWE-bench, WebArena)
  - Autonomous agent project directories (awesome-agents lists)
- Scores alignment with a0p's approach (autonomous, ethical, interdependent)
- Uses web_search + fetch_url (Brave API with DuckDuckGo fallback)
- Deduplicates across runs
- Results routed to Seed 7 ("External research") + Seed 10 ("Meta-learning") summaries
- High-relevance finds → discovery drafts

#### 3.24.4 X/Twitter Monitoring (`x_monitor`)

- Reserved handler for X/Twitter monitoring
- Disabled by default (requires API access)
- When enabled, monitors for autonomous AI and ethical AI discussions

### 3.25 Append-Only Logging

Seven independent log streams, all append-only JSONL format.

#### 3.25.1 Log Streams

| Stream | File | Content |
|--------|------|---------|
| master | `logs/a0p-master.jsonl` | Every event from every subsystem |
| edcm | `logs/edcm-metrics.jsonl` | EDCM metric evaluations |
| memory | `logs/memory-tensor.jsonl` | Seed changes, projections, summaries, snapshots |
| sentinel | `logs/sentinel-memory.jsonl` | Every sentinel check result |
| interference | `logs/memory-interference.jsonl` | Cross-seed conflicts |
| attribution | `logs/memory-attribution.jsonl` | Per-response seed contributions |
| transcripts | `logs/transcripts/transcript-{timestamp}-{hash}.jsonl` | Per-transcript analysis logs |

#### 3.25.2 Entry Format

```json
{
  "timestamp": "ISO-8601",
  "stream": "master",
  "subsystem": "bandit",
  "event": "select",
  "data": { ... }
}
```

#### 3.25.3 Controls

- Global logging toggle via `logging` system toggle
- Per-stream enable/disable sub-toggles
- API endpoints for reading all streams (paginated, newest-first)

### 3.26 Research Controls

Every subsystem is independently toggleable and parameterized. The "everything adjustable" philosophy means no hardcoded behavior that can't be changed at runtime.

#### 3.26.1 System Toggles

| Subsystem | Toggle Key | Purpose |
|-----------|-----------|---------|
| Multi-armed bandit | `bandit` | Enable/disable all bandit selection and reward |
| EDCM directives | `edcm_directives` | Enable/disable behavioral directive system |
| Memory injection | `memory_injection` | Enable/disable external seed memory injection |
| Heartbeat | `heartbeat` | Enable/disable background task scheduler |
| Dual-model synthesis | `synthesis` | Enable/disable parallel model execution |
| Custom tools | `custom_tools` | Enable/disable user-defined function calls |
| Logging | `logging` | Enable/disable append-only logging |

Each toggle stores a `parameters` JSONB field for subsystem-specific configuration (thresholds, sliders, intervals).

#### 3.26.2 Parameter Ranges

| Subsystem | Parameter | Range | Default |
|-----------|-----------|-------|---------|
| bandit | C (exploration) | 0.0–5.0 | sqrt(2) |
| bandit | lambda (EMA decay) | 0.0–1.0 | 0.95 |
| bandit | epsilon (cold start) | 0.0–1.0 | 0.3 |
| bandit | coldStartThreshold | 1–50 | 5 |
| edcm_directives | per-metric threshold | 0.0–1.0 | 0.80 |
| memory_injection | alpha (learning rate) | 0.0–1.0 | 0.1 |
| memory_injection | s8_threshold (energy) | 1.0–200.0 | 50.0 |
| memory_injection | s9_threshold (coherence) | -1.0–1.0 | -0.5 |
| memory_injection | drift_check_interval | 10–500 | 50 |
| heartbeat | tickIntervalSeconds | 5–600 | 30 |

All parameters are adjustable via Console sliders and persisted in the `system_toggles` table.

### 3.27 SubCore — 17-Seed Sub-Graph Organ

A 17-seed memory sub-graph that operates **outside** the main PTCA/PCNA working tensor. It serves as a compression bridge between the server's three-core architecture (LLM/Tools, Psi, Omega) and phone-side state, and as a rhythm/pattern detector for temporal and structural analysis.

#### 3.27.1 Architecture

| Property | Value |
|----------|-------|
| Seeds | 17 (indexed 0–16) |
| Prime addressing | [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59] |
| Depth per seed | 7 (heptagram phases — same axis as PTCA `hept`) |
| Per-seed fields | `state[7]`, `previousState[7]`, `structuralSignature[7]`, `sourceAffinity[3]`, `lastWriteHeartbeat` |

#### 3.27.2 Source Affinity

Each seed tracks which core last wrote it as a 3-element float vector:

| Index | Core |
|-------|------|
| 0 | LLM/Tools |
| 1 | Psi (self-model) |
| 2 | Omega (autonomy) |

#### 3.27.3 Three Projection Modes

| Mode | Name | Question | Output Shape |
|------|------|----------|--------------|
| Serial | Auditory | What changed? | deltas[17][7] + anomalies + coherence |
| Parallel | Visual | What shape? | pattern[119] + topology[136] + coherence |
| Raw | Memory | What state? | states[17][7] + previousStates[17][7] + staleness[17] |

**Auditory (temporal/serial):**
- For each of 17 seeds: `delta = state − previousState` (7-element vector)
- Delta magnitude = L2 norm of the delta vector
- Anomaly: magnitude exceeds expected range (rhythm break)
- Coherence: overall temporal stability score [0, 1]

**Visual (structural/parallel):**
- Pattern: 17 × 7 = 119-element flat array (all current seed states concatenated)
- Topology: 17 × 16 / 2 = 136-element upper triangle of inter-seed cosine similarity matrix
- Coherence: structural clustering score [0, 1]

#### 3.27.4 Sync Protocol

`SyncPayload` travels bidirectionally between server and phone at each heartbeat:

```typescript
{
  seeds: Array<{ index: number; state: number[]; sourceAffinity: [number, number, number] }>;
  heartbeat: number;
  direction: 'server-to-phone' | 'phone-to-server';
  tensionField?: number[]; // phone-to-server only: where superimposed functions conflict
  hash: string;            // SHA-256 integrity check
}
```

#### 3.27.5 Integration

- **Tick**: `tickSubCore()` called every heartbeat (30s) via `server/heartbeat.ts`
- **Persistence**: `exportSync()` saves seed states to `system_toggles` key `subcore_state` after each tick; `importSync()` restores on server startup
- **API**: `GET /api/subcore/state` — returns latest auditory + visual + memory projections with all `Float64Array` values serialized as `number[]`
- **Singleton**: `server/subcore-instance.ts` holds the single server-side SubCore instance with a cached latest state

#### 3.27.6 Console Visualization (S17 Tab — Memory Group)

- **Serial mode** (auditory): 17 seed rows showing prime address, delta magnitude bar, anomaly flag (`!`). Rhythm break count banner. Temporal coherence score top-right.
- **Parallel mode** (visual): SVG radial layout — 17 nodes on a ring, colored by activation: slate (idle) → green (low) → amber (mid) → red (high). Structural coherence at center.
- Mode toggle persisted in `localStorage` (`a0p-s17-mode`). Auto-refresh every 30s; manual refresh button.

---

## 4. AI Agent

### 4.1 Function-Calling Architecture

The agent uses Gemini 2.5 Flash with native function-calling (not prompt-based tool use). Each user request can trigger up to 8 tool rounds.

### 4.2 Tools (48)

Tools are organized into seven groups. All tools are available to every request (up to 8 rounds of tool calls per request). Custom user-defined tools are appended to this list at runtime if the `custom_tools` toggle is enabled.

#### Shell & File System (5)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| run_command | command | — | Execute shell command (sandboxed allowlist: ls pwd echo cat find grep head tail mkdir touch cp mv rm curl wget python3 node npm npx git sed awk sort wc diff date ps df du whoami uname + user-added commands) |
| read_file | path | — | Read file contents (relative to project root) |
| write_file | path, content | — | Write/create file (overwrites) |
| list_files | — | path | List files and directories (defaults to `.`) |
| search_files | pattern | path | Search files by regex pattern using grep |

#### Web (2)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| web_search | query | — | Search the web; returns summary answer + result URLs (Brave API, DuckDuckGo fallback) |
| fetch_url | url | — | Fetch and read a web page (HTTPS only, SSRF-protected, 8K char limit, HTML stripped) |

#### Gmail (3)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| list_gmail | — | maxResults | List recent Gmail inbox messages (default 10) |
| read_gmail | messageId | — | Read full Gmail message body |
| send_gmail | to, subject, body | — | Send plain-text email via Gmail |

#### Google Drive (1)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| list_drive | — | folderId | List Google Drive files in folder (defaults to root) |

#### GitHub Repos & Files (5)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| github_list_repos | — | owner | List GitHub repos for authenticated user or specific owner |
| github_get_file | owner, repo, path | branch | Read a file from a GitHub repository |
| github_list_files | owner, repo | path, branch | List files/dirs in a GitHub repo path |
| github_create_or_update_file | owner, repo, path, content, message | branch | Create or update file (commits directly, triggers Pages rebuild) |
| github_delete_file | owner, repo, path, message | branch | Delete a file from a GitHub repository |
| github_push_zip | uploadFilename, owner, repo, message | basePath, branch | Extract uploaded zip and push all contents to GitHub repo |

#### GitHub Codespaces (5)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| codespace_list | — | — | List GitHub Codespaces |
| codespace_create | owner, repo | branch, machine | Create a new Codespace (default machine: basicLinux32gb) |
| codespace_start | codespace_name | — | Start a stopped Codespace |
| codespace_stop | codespace_name | — | Stop a running Codespace |
| codespace_delete | codespace_name | — | Delete a Codespace |
| codespace_exec | codespace_name, command | — | Execute a command in a running Codespace |

#### Transcript Analysis (5)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| list_transcript_sources | — | — | List all transcript sources with file counts, last scan time, and EDCM report summary |
| create_transcript_source | displayName | — | Create a new named transcript source; returns its slug |
| scan_transcript_source | slug | — | Run EDCM cognitive-metric scan on all files in a source; returns per-metric averages, peak, directives fired, top flagged snippets |
| get_transcript_report | slug | — | Retrieve latest EDCM scan report without re-scanning |
| fetch_transcript_url | url, sourceSlug | filename | Fetch transcript from a public URL and save into a source (supports ChatGPT/Claude JSON, JSONL, plain text, JSON arrays) |

#### Brain Pipeline (4)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| set_brain_preset | presetName | — | Switch active brain pipeline preset (single model, dual synthesis, deep research, etc.) |
| get_brain_presets | — | — | List all saved brain presets with configurations |
| set_default_brain | presetName | — | Change default preset used for new conversations |
| set_synthesis_weights | weights | — | Adjust per-model merge weights for active preset (e.g. `{ gemini: 0.7, grok: 0.3 }`) |
| get_synthesis_config | — | — | Return active brain pipeline config including stages, weights, and thresholds |

#### PTCA-Ω Autonomy (5)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| set_goal | description, priority | — | Add a goal to the Ω goal stack (priority 1–10); drives Goal Persistence dimension energy |
| complete_goal | goalId | — | Mark an Ω goal as completed |
| list_goals | — | — | List current Ω autonomy goals |
| get_omega_state | — | — | Get Ω tensor state: all 10 dimension energies, mode, goals, thresholds |
| boost_dimension | dimension, amount | — | Boost an Ω dimension energy (0=Goal, 1=Initiative, 2=Planning, 3=Verification, 4=Scheduling, 5=Outreach, 6=Learning, 7=Resource, 8=Exploration, 9=Delegation) |
| set_autonomy_mode | mode | — | Set Ω mode: `active` / `passive` / `economy` / `research` |

#### PTCA-Ψ Self-Model (4)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| get_psi_state | — | — | Get Ψ tensor state: all 11 dimension energies (Integrity, Compliance, Prudence, Confidence, Clarity, Identity, Recall, Vigilance, Coherence, Agency, Self-Awareness), mode, sentinel and omega pairings |
| boost_psi_dimension | dimension, amount | — | Boost a Ψ dimension energy (0=Integrity … 10=Self-Awareness) |
| set_selfmodel_mode | mode | — | Set Ψ mode: `reflective` / `operational` / `transparent` / `guarded` |
| get_triad_state | — | — | Get combined state of all three tensors: PTCA + Ψ + Ω (total energies, modes, per-dimension energies) |

#### Model Registry & Hub (3)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| update_model_registry | provider, data | — | Add or update a provider entry (baseURL, authHeader, requestFormat, streamingFormat, models, notes) |
| list_model_registry | — | — | Return full model registry: all known providers, endpoints, formats, available models |
| list_hub_connections | — | — | List available hub AI model connections from stored credentials (names + endpoints only, no keys) |

#### Site & Tool Generation (2)

| Tool | Required Args | Optional Args | Description |
|------|--------------|--------------|-------------|
| set_ai_welcome | title, body | — | Update the AI/crawler welcome page (wrapped in HTML template automatically) |
| generate_tool | name, description | hubProvider, handlerType, parametersSchema | Autonomously generate a new custom tool (Ψ-gated: Confidence≥0.4, Clarity≥0.3, Identity≥0.4; max 20 generated tools) |

### 4.3 Tool Output

- Terminal results truncated to 4,000 chars
- Web page content truncated to 8,000 chars (HTML stripped, scripts/nav/footer removed)
- SSE display results truncated to 2,000 chars
- Tool calls shown as amber indicators in real-time
- Tool results displayed inline in conversation

### 4.4 Auto-Titling

After first successful response, the agent generates a short title for the conversation.

---

## 5. AI Models

### 5.1 Built-In

| Model | Provider | Cost (per 1M tokens) |
|-------|----------|---------------------|
| Gemini 2.5 Flash | Google (Replit Integration) | $0.075 prompt / $0.30 completion |
| Grok-3 Mini | xAI (XAI_API_KEY) | $0.30 prompt / $0.50 completion |

### 5.2 BYO (Bring Your Own)

Users supply API keys via Console > Context tab.

| Provider | OpenAI-Compatible | Models |
|----------|-------------------|--------|
| OpenAI | Yes | gpt-4o, gpt-4o-mini, gpt-3.5-turbo |
| Mistral | Yes | mistral-large, mistral-small, mistral-tiny |
| Perplexity | Yes | pplx-70b-online, pplx-7b-online |
| Anthropic | No (stubbed) | claude-3-opus, claude-3-sonnet |
| Cohere | No (stubbed) | command-r-plus, command-r |

### 5.3 AI Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/ai/models | List all available models (built-in + BYO) |
| POST | /api/ai/complete | Non-streaming completion |
| POST | /api/ai/stream | Streaming completion (SSE) |
| POST | /api/ai/estimate | Cost estimate for prompt |

---

## 6. Google Infrastructure

### 6.1 Gmail

Accessed via Replit Connector `google-mail`. Uses `googleapis` library with short-lived OAuth tokens.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/gmail/inbox | GET | List recent inbox messages |
| /api/gmail/messages/:id | GET | Read full message with body |
| /api/gmail/send | POST | Send plain-text email |

### 6.2 Google Drive

Accessed via Replit Connector `google-drive`. Same authentication mechanism as Gmail.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/drive/files | GET | List files in folder |
| /api/drive/files/:id | GET | Get file metadata |

### 6.3 Google Cloud Requirements

To fully operate a0p with Google services, the following are required:

**Via Replit Connectors (no manual setup):**
- `google-mail` connector — connect your Google account in Replit's integrations panel
- `google-drive` connector — connect your Google account in Replit's integrations panel

**Environment (auto-provided by Replit):**
- `REPLIT_CONNECTORS_HOSTNAME` — connector API hostname
- `REPL_IDENTITY` / `WEB_REPL_RENEWAL` — identity tokens for OAuth

**If self-hosting outside Replit (Google Cloud Console setup):**
1. Create a Google Cloud project at console.cloud.google.com
2. Enable the Gmail API (gmail.googleapis.com)
3. Enable the Google Drive API (drive.googleapis.com)
4. Create OAuth 2.0 credentials (Web Application type)
5. Set redirect URI to your deployment domain + /auth/callback
6. Set scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/drive.readonly`
7. Store credentials as environment variables:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
8. Implement OAuth2 token exchange flow (replacing Replit Connectors)
9. Store refresh tokens per user in the database

**Google Cloud billing**: Gmail API and Drive API have generous free tiers (1B quota units/day for Gmail, 1B queries/day for Drive). No billing account is strictly required for normal usage, but Google may require one to enable APIs.

---

## 7. File System

### 7.1 File Manager

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/files | GET | List directory contents |
| /api/files/read | GET | Read file content |
| /api/files/write | POST | Write/create file |
| /api/files/move | POST | Move/rename file |
| /api/files/upload | POST | Upload files from device (multer, max 50 files, 50MB each) |
| /api/files/upload-manifest | POST | Upload phone file manifest for dedup analysis |

### 7.2 Path Safety

All file paths are resolved against `process.cwd()` (BASE_DIR). Traversal above BASE_DIR is blocked.

### 7.3 Uploads

Files stored in `uploads/` directory. Filenames sanitized to alphanumeric + dots/hyphens/underscores, prefixed with timestamp.

---

## 8. Terminal

### 8.1 Sandboxed Execution

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/terminal/exec | POST | Execute command |
| /api/terminal/history | GET | Get command history |

### 8.2 Allowlisted Commands

```
ls, pwd, echo, cat, find, grep, head, tail, mkdir, touch, cp, mv, rm,
chmod, env, date, ps, df, du, which, whoami, uname, curl, wget,
python3, node, npm, npx, git, tar, zip, unzip, sed, awk, sort, wc, diff
```

All other commands return "Permission denied."

---

## 9. Authentication

### 9.1 Replit Auth

- Protocol: OpenID Connect via Passport
- Session store: PostgreSQL (`sessions` table via connect-pg-simple)
- Cookie: `secure: true` in production
- User fields: id (UUID), email, firstName, lastName, profileImageUrl

### 9.2 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/auth/replit | GET | Initiate Replit OAuth flow |
| /api/auth/replit/callback | GET | OAuth callback |
| /api/auth/logout | POST | End session |
| /api/auth/user | GET | Get current user |

---

## 10. Payments (Stripe)

### 10.1 Products

| Product | Price | Type |
|---------|-------|------|
| Core Access | $15/month | Subscription |
| Founder | $153 one-time | Payment (limited to 53) |
| Optional Support +$1 | $1 | Payment |
| Optional Support +$2 | $2 | Payment |
| Optional Support +$5 | $5 | Payment |
| Compute Credits $10 | $10 | Payment |
| Compute Credits $25 | $25 | Payment |
| Compute Credits $50 | $50 | Payment |

### 10.2 Stripe Integration

- Client: via Replit Connector (stripe) — auto-provides API keys
- Sync: stripe-replit-sync keeps local DB tables in sync with Stripe events
- Products seeded via `npx tsx server/seed-products.ts`
- Webhook: registered automatically when `REPLIT_DOMAINS` is available; skipped gracefully in dev

### 10.3 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/stripe/publishable-key | GET | Get publishable key |
| /api/stripe/products | GET | List active products/prices |
| /api/stripe/checkout | POST | Create checkout session |
| /api/stripe/portal | POST | Create billing portal session |

---

## 11. Database Schema

### 11.1 Tables

| Table | Purpose |
|-------|---------|
| users | Replit Auth users (UUID id, email, names, profile image) |
| sessions | Express sessions (sid, sess jsonb, expire) |
| conversations | Chat/task records (title, model, userId) |
| messages | Individual messages (role, content, model, metadata jsonb) |
| automation_tasks | Spec.md automation tasks (name, specContent, status, result) |
| command_history | Terminal command log (command, output, exitCode) |
| a0p_events | Hash-chained event log (taskId, eventType, payload, prevHash, hash, hmmm) |
| heartbeat_logs | Hourly heartbeat records (status, hashChainValid, details) |
| cost_metrics | Per-model token/cost tracking (model, promptTokens, completionTokens, estimatedCost) |
| edcm_snapshots | EDCMBONE evaluation history (operators, deltas, decision, ptcaState) |
| bandit_arms | Multi-armed bandit arms per domain (pulls, rewards, EMA, UCB1 scores, enabled) |
| custom_tools | User-defined function calls (name, params schema, handler type/code, model targeting) |
| heartbeat_tasks | Background task scheduler (name, type, weight, interval, run count, last result) |
| edcm_metric_snapshots | Append-only EDCM metric snapshots (CM/DA/DRIFT/DVG/INT/TBF, directives, source) |
| memory_seeds | 11 external memory seeds (label, summary, PTCA values, PCNA weights, sentinel tallies, controls) |
| memory_projections | Projection matrices IN (11x53) and OUT (53x11) with request count |
| memory_tensor_snapshots | Append-only memory state snapshots (seeds, projections, request count) |
| bandit_correlations | Cross-domain joint rewards (tool+model+ptca+pcna arm combinations) |
| system_toggles | Per-subsystem toggles and parameter JSONB (bandit, edcm, memory, heartbeat, etc.) |
| discovery_drafts | Proactive conversation starters from heartbeat (title, summary, relevance, promotion status) |

### 11.2 Stripe-Managed Tables

Automatically created and synced by `stripe-replit-sync`:
- `stripe.products`
- `stripe.prices`
- `stripe.customers`
- `stripe.subscriptions`
- `stripe.checkout_sessions`

---

## 12. Frontend

### 12.1 Pages

| Route | Page | In Nav |
|-------|------|--------|
| / | Agent (main AI interface) | Yes |
| /terminal | Terminal | Yes |
| /files | Files (browser + upload) | Yes |
| /console | Console (5-tab control panel) | Yes |
| /pricing | Account/Pricing | Yes |
| /drive | Google Drive browser | No |
| /mail | Gmail interface | No |
| /automation | Spec automation | No |

### 12.2 Console Tabs

Tabs are organized into 5 groups:

**Agent group:** Workflow, Bandit, Metrics
**Memory group:** Memory, EDCM, Brain, S17
**Triad group:** Psi Ψ, Omega Ω, Heartbeat
**System group:** System, Logs
**Tools group:** Tools, Keys, Context, API, Export

1. **Workflow**: Engine status, emergency stop, heartbeat log, hash chain status
2. **Metrics**: Token usage, cost estimates, spend limits (slider + toggle)
3. **EDCM**: Operator vectors, BONE delta, alignment risk, PTCA energy, history
4. **Logs**: Unified log viewer — events, heartbeats, EDCM snapshots, commands, costs; filterable by source, searchable, expandable detail panels
5. **Context**: System prompt, context prefix, BYO API keys
6. **Bandit**: Four domain sections with per-arm toggles, reward bars, UCB1 scores; EDCM Directives panel with per-directive toggles + threshold sliders; EDCM History sparklines; Cross-domain correlation panel (top combinations with joint reward)
7. **Memory**: 11 seed cards (label, summary, tensor magnitude, weight slider, enabled/pinned toggles, clear/import); Sentinel audit (pass rate sparklines); Attribution trace (bar chart); Interference alerts; Drift warnings; Projection heatmaps; Export/Import buttons; Snapshot history
8. **System**: Global toggles table (bandit, edcm_directives, memory_injection, heartbeat, synthesis, custom_tools, logging); Expandable parameter sliders per subsystem; Discovery drafts panel (heartbeat discoveries with "Start Conversation" promotion)
9. **S17**: SubCore 17-seed organ. Serial mode: delta bars for each seed, anomaly flags, temporal coherence. Parallel mode: radial SVG of 17 prime-addressed nodes colored by activation, structural coherence score.

### 12.3 Bottom Navigation

5 tabs: Agent, Term, Files, Console, Account

### 12.4 Styling

- Dark mode by default
- Tailwind CSS + shadcn/ui components
- Lucide React icons
- Mobile-first responsive design

---

## 13. Environment Variables

### 13.1 Required Secrets

| Variable | Source | Purpose |
|----------|--------|---------|
| DATABASE_URL | Replit (auto) | PostgreSQL connection |
| SESSION_SECRET | Manual | Express session encryption |
| XAI_API_KEY | Manual | xAI/Grok API access |

### 13.2 Auto-Provided by Replit

| Variable | Purpose |
|----------|---------|
| AI_INTEGRATIONS_GEMINI_API_KEY | Gemini API key |
| AI_INTEGRATIONS_GEMINI_BASE_URL | Gemini API base URL |
| REPLIT_CONNECTORS_HOSTNAME | Connector API host |
| REPL_IDENTITY | Identity token for connectors |
| REPLIT_DOMAINS | Deployment domain (for webhooks) |

---

## 14. Key Files

```
server/
  index.ts              — Express server entry point
  routes.ts             — All API routes
  storage.ts            — Database storage layer (IStorage interface)
  a0p-engine.ts         — EDCMBONE, PCNA, PTCA, sentinels, hash chain, bandit, EDCM directives, memory tensor, correlation tracking
  heartbeat.ts          — Background task scheduler (transcript search, GitHub search, AI social monitoring, discovery drafts); SubCore tick + persist
  logger.ts             — Append-only logging system (7 streams, per-stream toggles)
  stripeClient.ts       — Stripe client + sync setup
  webhookHandlers.ts    — Stripe webhook processor
  seed-products.ts      — Stripe product seeding script
  gmail.ts              — Gmail client factory
  drive.ts              — Google Drive client factory
  xai.ts                — Grok/xAI client factory
  github.ts             — GitHub client factory (Replit Connector, uncacheable tokens)
  subcore-instance.ts   — Singleton SubCore instance; tickSubCore(), getSubCoreState() with Float64Array→number[] serialization; startup hydration from DB
  subcore/
    types.ts            — Type definitions: SubCoreSeed, AuditoryProjection, VisualProjection, MemoryProjection, SyncPayload, CoreId enum
    subcore.ts          — SubCore class: 17-seed state machine, tick(), auditoryProject(), visualProject(), memoryProject(), exportSync(), importSync()
    heartbeat.ts        — SubCore heartbeat integration helpers
    index.ts            — Module re-exports
  replit_integrations/  — Auth module (Passport + Replit OpenID)

client/src/
  App.tsx               — Router + layout
  pages/
    chat.tsx            — Agent command interface
    terminal.tsx        — Shell terminal
    files.tsx           — File manager + upload
    console.tsx         — Multi-tab control panel (Workflow, Metrics, EDCM, Logs, Context, Bandit, Memory, System)
    pricing.tsx         — Stripe pricing/account
    drive.tsx           — Google Drive browser
    mail.tsx            — Gmail interface
    automation.tsx      — Spec automation
  components/
    bottom-nav.tsx      — Mobile navigation
    hmmm-doctrine.tsx   — Doctrine footer

shared/
  schema.ts             — Drizzle schema + Zod types (20+ tables)
  models/auth.ts        — Auth-related models
```

---

## 15. Deployment

### 15.1 Commands

| Command | Purpose |
|---------|---------|
| npm run dev | Development (tsx watch) |
| npm run build | Production build |
| npm run start | Production server |
| npm run db:push | Sync schema to database |
| npx tsx server/seed-products.ts | Seed Stripe products |

### 15.2 Production Notes

- Single port (5000) serves both API and frontend (Vite SSR in dev, static in prod)
- Session cookies set `secure: true` in production
- Stripe webhook auto-registers when `REPLIT_DOMAINS` is available
- Hash chain verification runs on startup (5s) and hourly

---

## 16. Cost Model

### 16.1 Token Rates

| Model | Prompt (per 1M) | Completion (per 1M) |
|-------|-----------------|---------------------|
| Gemini 2.5 Flash | $0.075 | $0.30 |
| Grok-3 Mini | $0.30 | $0.50 |

### 16.2 Tracking

Every AI call records:
- User ID (if authenticated)
- Model used
- Prompt token count (estimated: string length / 4)
- Completion token count
- Estimated USD cost

Available via `/api/metrics/costs` and `/api/metrics/costs/history`.

---

## 17. Security

- Path traversal prevention on file operations
- Command allowlist on terminal
- L1-normalized operator vectors prevent zero-division
- PTCA stability guard (energy < 100)
- SHA-256 hash chain tamper detection
- Session-based auth with secure cookies
- BYO API keys stored in-memory (not persisted to DB)
- Filename sanitization on uploads
- File size limits (50MB per file)
