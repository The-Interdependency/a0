# spec.md — EDCM + PTCA/PCTA + PCNA (v1.0.2-S9 freeze)

Attribution: GPT generated; context, prompt Erin Spencer

Status: **FROZEN (v1.0.2-S9)**  
Scope: Canon definitions + invariants + math + implementation interfaces.  
Non-goals: Narrative, metaphysics, marketing copy, populated lexicons (allowed as empty lists), production infra details beyond interfaces.

---

## 0) Naming + Aliases (frozen)

- **EDCM**: Energy–Dissonance Circuit Model (diagnostic metrics + control signals)
- **PTCA / PCTA**: Prime Tensor Circular Architecture  
  - Canon name: **PTCA** (Prime Tensor Circular Architecture)  
  - Alias accepted: **PCTA** (same thing; keep both in code comments for compatibility)
- **PCNA**: Prime Circular Neural Architecture (neural/routing layer that can consume PTCA structures)
- **EDCMBONE**: Minimal canonical skeleton for EDCM evaluation + reporting
- **Sentinels (S1–S9)**: reserved control channels for invariants, safety, provenance, gates, and audit

Invariant: naming must be stable across files; if alias is used, it must map to canon.

---

## 1) Canon Invariants (system-level)

### 1.1 Lossless logging
- Every interaction is representable as an **append-only event stream**.
- No destructive edits to past events; “corrections” are new events referencing prior IDs.
- Export must be able to reproduce the diagnostic state at any point in time.

### 1.2 Separation of concerns
- EDCM produces **metrics + alerts + recommendations**.
- PTCA defines **structural tensor spaces** and deterministic mappings.
- PCNA performs **learned routing / inference** constrained by sentinels + gates.

### 1.3 Determinism boundaries
- Deterministic components: parsing, normalization, feature extraction, metric calculation, mappings.
- Stochastic components: any model inference (LLMs, embeddings, learned gates).
- Outputs must explicitly mark which parts are deterministic vs inferred.

### 1.4 Sentinel gates (S1–S9)
- **S1_PROVENANCE**: what happened; origin; hashes; timestamps; reproducibility hooks
- **S2_POLICY**: hard redlines; disallowed actions/content; compliance constraints
- **S3_BOUNDS**: operational limits; cost/rate/timeouts/scope ceilings
- **S4_APPROVAL**: explicit approval required for external action / irreversible changes
- **S5_CONTEXT**: **single source of truth** for window + retrieval + context hygiene
- **S6_IDENTITY**: actor mapping; roles; permissions/tenancy; key selection
- **S7_MEMORY**: persistence rules; retention; deletion requests; “no silent memory”
- **S8_RISK**: risk scoring + escalation; uncertainty; “needs review” routing
- **S9_AUDIT**: accountability trail; decision trace; replay bundles; export correctness

Minimal invariants:
- Any action proposal must satisfy S1–S3, request S4 when applicable, and record S9 always.
- S5 owns window + retrieval globally.

Recommended evaluation order (fast-fail):
1) S6_IDENTITY
2) S5_CONTEXT
3) S2_POLICY
4) S3_BOUNDS
5) S8_RISK
6) S7_MEMORY
7) S4_APPROVAL
8) S1_PROVENANCE
9) S9_AUDIT

---

## 2) Data Model (canonical)

### 2.1 Entities
- **Actor**: user, agent, sub-agent, tool, external model, system.
- **Turn**: an actor message unit inside a thread.
- **Thread**: ordered sequence of turns (conversation).
- **Event**: append-only record capturing state transitions or observations.

### 2.2 Canon event schema (JSON)
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

### 2.3 Snapshot schema
A snapshot is a deterministic reconstruction target:
```json
{
  "snapshot_id": "snap_...",
  "ts": "ISO-8601",
  "thread_id": "thr_...",
  "state": {
    "edcm": {},
    "ptca": {},
    "pcna": {}
  },
  "derived_from": ["evt_..."],
  "hash": "sha256:..."
}
```

---

## 3) S5_CONTEXT (global context contract)

S5_CONTEXT is the single source of truth for:
- window definition
- retrieval policy
- hygiene/redaction rules

All compute endpoints (EDCM, PCNA, a0 synthesis if it computes) accept optional `context`.
If omitted, server uses defaults.

```json
{
  "context": {
    "window": {"type": "turns", "W": 32},
    "retrieval": {
      "mode": "none",
      "sources": [],
      "top_k": 0
    },
    "hygiene": {
      "strip_secrets": true,
      "redact_keys": true
    }
  }
}
```

Invariants:
- EDCM MUST report which context it used.
- PCNA MUST report which context it used.
- Any retrieval != none must be logged in S9_AUDIT (sources, queries, k, hashes where available).

---

## 4) EDCM (Energy–Dissonance Circuit Model)

### 4.1 Purpose
EDCM quantifies conversational/system “energy,” “dissonance,” and constraint mismatch as measurable signals, producing:
- metrics (continuous)
- alerts (thresholded)
- recommended actions (ranked)
- explanatory traces (why)

EDCM is **diagnostic**, not a truth oracle.

### 4.2 Canon inputs
- Turns (text) + metadata (actor, timestamps, tool use)
- Optional: audio transcript, latency, token counts, costs
- Optional: structured constraints (policies, budgets, goals, scope)
- Optional: `context` (S5 contract)

### 4.3 Canon outputs
- `metrics`: scalar values in [0,1] or real-valued with declared range
- `alerts`: named triggers with severity and evidence
- `recommendations`: prioritized list of actions, each requiring S4 if external
- `used_context`: sanitized echo of S5 context window/retrieval used

### 4.4 Normalization primitives (frozen)
Let:
- `T` = number of turns in window
- `N_tokens(actor)` = tokens by actor in window
- `N_tokens_total` = total tokens in window
- `p_actor = N_tokens(actor) / max(1, N_tokens_total)`  (actor share)

Windowing:
- window is defined by `context.window` (S5 owns it)
- time-based windows may be added later as `context.window.type="time"`

All metrics must declare:
- used_context
- whether they are per-turn, per-actor, or global

### 4.5 Core EDCM metric families (v1.0.2-S9 freeze)

#### A) Constraint mismatch (CM)
Measures mismatch between declared constraints and observed language/actions.

- Inputs:
  - `C_declared`: set of constraints (scope, policy, budget, safety)
  - `C_observed`: extracted constraints from text/actions
- Score:
  - `CM = 1 - Jaccard(C_declared, C_observed)` (placeholder; replace with weighted variant later)

Output fields:
```json
{"CM": {"value": 0.0, "range": [0,1], "used_context": {"window": {"type":"turns","W":32}}, "evidence": ["..."]}}
```

#### B) Dissonance accumulation (DA)
Represents buildup of unresolved contradictions, corrections, backtracking, and non-resolution.

Placeholder deterministic features:
- contradiction markers
- retractions/corrections
- repeated unanswered questions
- circular references without closure

Canonical form:
- `DA = sigmoid( w1*f_contrad + w2*f_retract + w3*f_repeat + w4*f_unresolved )`

#### C) Regulated motion / drift (DRIFT)
Tracks deviation from goal vector or scope vector.

Let:
- `g` = goal embedding / features (deterministic stand-in allowed: keyword vector)
- `x_t` = content vector at time t
- `cos = cosine_similarity(x_t, g)`

- `DRIFT = 1 - cos`  (if embeddings used, mark as inferred component)

#### D) Divergence (DVG)
Divergence is not drift. Drift is “moving away from goal.” Divergence is “splitting into multiple competing trajectories.”

Placeholder:
- cluster turns into topics (k)
- `DVG = entropy(topic_distribution)` normalized to [0,1]

#### E) Intensity / valence proxy (INT)
Captures “heat” without moralizing.

Placeholder features:
- profanity/epithet lists (**allowed empty**)
- punctuation intensity
- caps ratio
- short-interval repetitions
- sentiment (if model-based, mark inferred)

Form:
- `INT = clamp01( a1*caps + a2*punct + a3*lex_intensity + a4*tempo )`

#### F) Turn-balance fairness (TBF)
Measures domination/skew across actors.

Use Gini coefficient on actor token shares:
- `TBF = Gini(p_actor)` normalized [0,1]
Interpretation: higher = more skew.

### 4.6 Alerts (threshold triggers)

### 4.6.1 Default alert thresholds (80/20; frozen v1.0.2)

Default policy for all alerts:
- **TRIGGER (HIGH)** when the associated metric value **>= 0.80**
- **CLEAR (LOW)** when the associated metric value **<= 0.20**
- Values in (0.20, 0.80) are treated as **hysteresis band** (no state change).

Invariant:
- Any deviation from 80/20 thresholds for a specific alert requires an explicit per-alert override and a version bump.

Alerts are named. Each alert must specify:
- thresholds
- evidence requirements
- recommended mitigations (non-actuating unless S4)

Examples (names frozen, thresholds placeholders):
- `ALERT_CM_HIGH`
- `ALERT_DA_RISING`
- `ALERT_DVG_SPLIT`
- `ALERT_INT_SPIKE`
- `ALERT_TBF_SKEW`

### 4.7 Recommendations format (frozen)
```json
{
  "recommendations": [
    {
      "id": "rec_...",
      "rank": 1,
      "title": "Clarify constraints",
      "type": "dialogue|tool|system|external",
      "requires_S4": true,
      "why": ["metric:CM", "alert:ALERT_CM_HIGH"],
      "proposed_action": {"kind": "ask_user", "payload": {"question": "..."}}
    }
  ]
}
```

### 4.8 Sentinel integration (required fields)
EDCM outputs must include sentinel-relevant fields:
- S5: used_context (window + retrieval)
- S6: actor map and attribution confidence (if applicable)
- S8: risk indicators (separate from INT)
- S9: evidence event IDs for each alert/recommendation

Canonical block:
```json
{
  "sentinel_context": {
    "S5_context": {"window": {"type":"turns","W":32}, "retrieval_mode":"none"},
    "S6_identity": {"actor_map_version":"v1", "confidence":0.98},
    "S7_memory": {"store_allowed": false, "retention": "n/a"},
    "S8_risk": {"score": 0.12, "flags":[]},
    "S9_audit": {"evidence_events":["evt_..."], "retrieval_log":[]}
  }
}
```

---

## 5) PTCA / PCTA (Prime Tensor Circular Architecture)

### 5.1 Purpose
PTCA defines a **structured tensor space** organized by primes and circular geometry to:
- index signals / features / roles
- create repeatable routing maps
- enforce sentinel constraints and invariants
- supply a deterministic skeleton for PCNA to learn on top of

### 5.2 Canon objects
- **Tensor**: an n-dimensional array with declared axes and semantics.
- **Prime field**: a set of prime-indexed nodes `P = {p1, p2, ...}`.
- **Circle map**: mapping integers → angles on unit circle.
- **Heptagram associations**: 7-fold structural motif (grouping, adjacency, cycles).

### 5.3 Prime indexing (frozen)
Let `π(k)` be the k-th prime.  
PTCA uses prime indices as **addressing keys**.

Invariant: addresses are stable; changes require new version namespace.

### 5.4 Angle mapping (unit circle)
Two canonical maps (choose one per module; declare which):

1) **mod-360**:
- `θ(n) = 2π * ((n mod 360) / 360)`

2) **prime-ray index**:
- `θ(π(k)) = 2π * ((k mod R) / R)` where `R` is number of rays (placeholder default 99)

### 5.5 Tensor layout (canonical template; **separate sentinel axis**)
A PTCA tensor must declare:
- `name`
- `axes` list (each axis has label + size + meaning)
- `indexing` (prime-indexed? cyclic? categorical?)
- `sentinel_index` mapping on its own axis (S1..S9)

Template:
```json
{
  "tensor": {
    "name": "ptca_core",
    "axes": [
      {"label": "prime_node", "size": 53, "meaning": "prime-indexed routing nodes"},
      {"label": "sentinel", "size": 9, "meaning": "S1..S9 control channels"},
      {"label": "phase", "size": 8, "meaning": "phase cycle"},
      {"label": "hept", "size": 7, "meaning": "heptagram association slot"}
    ],
    "indexing": {"prime_node": "first_53_primes"},
    "sentinel_index": {
      "0": "S1_PROVENANCE",
      "1": "S2_POLICY",
      "2": "S3_BOUNDS",
      "3": "S4_APPROVAL",
      "4": "S5_CONTEXT",
      "5": "S6_IDENTITY",
      "6": "S7_MEMORY",
      "7": "S8_RISK",
      "8": "S9_AUDIT"
    }
  }
}
```

### 5.6 The “53 seed” convention (frozen placeholder)

### 5.6.1 Grouping and phase scope (clarification; frozen v1.0.1)

- A **group** is a block of exactly **53 seeds** (one PTCA prime_node field).
- **v1** exchange (rotation + ring↔hub + shared-Z coupling) is defined **within a group**.
- **Phase (8-step)** is **reserved for v2** and is explicitly intended to operate **between groups of 53 seeds** (inter-group composition / coupling), not as a within-group ring rotation driver.

Invariant:
- Within-group rotation remains constant in v1 (`Δ=1`).
- Any inter-group phase coupling introduced later must be logged under S9_AUDIT with: group IDs, phase index, and operator hash.
- A default PTCA prime-node axis size is **53**.
- Rationale is not specified here; this is a frozen design choice in v1.0.2-S9.

Invariant:
- If a build uses a different seed count, it must declare `seed_count` and version bump.

### 5.7 Heptagram association (7-fold, geometry-driven; v1 constant rotation)

Canonical interpretation (v1.0.0-ready):
- Each seed (prime_node) has its own XY plane containing **6 ring sites** (a hexagon).
- The **7th site** is an axial **Z hub** (tensor-field point).
- All seeds share a conceptual coupling through a **global hub** (Z), but do not share each other’s XY planes.

Represent as a `site` axis with size 7:
- `site = 0..5` : XY hexagon ring
- `site = 6` : Z hub

Exchange is defined by a deterministic **operator pipeline** (no integer offset list `d_j`):

1) **Constant ring rotation (v1)**  
For each seed `s`, rotate ring sites by a constant step `Δ=1` per exchange tick, with an alternating gear direction:
- `dir(s) = (-1)^s` (alternating +1 / -1 by seed index)
- ring permutation: `k' = (k - dir(s)*Δ) mod 6` for k in 0..5
- hub site `k=6` is not moved by rotation

2) **Intra-seed coupling (ring ↔ hub)**  
Let `Agg6` be mean over ring sites (0..5). Apply deterministic mixing:
- ring → hub: `X[s,6] += β * Agg6(X[s,0..5])`
- hub → ring: for each k in 0..5, `X[s,k] += γ * X[s,6]`

3) **Inter-seed coupling via shared Z hub**  
Let `H = AggSeeds(X[:,6])` where `AggSeeds` is mean over seeds. Apply:
- `X[s,6] = (1-α)*X[s,6] + α*H`

Frozen v1 constants (declared here; numeric defaults may be chosen and then frozen):
- `Δ = 1` (constant; phase-driven rotation is reserved for v2)
- `dir(s) = (-1)^s`
- `Agg6 = mean`, `AggSeeds = mean`
- coupling weights `α, β, γ` are constants in config and MUST be logged in S9

Numeric defaults (FROZEN v1): `α=0.10`, `β=0.20`, `γ=0.10`.

Invariant:
- “Heptagram” is **6+1 axial**, not 7 coplanar points.
- Adjacency is defined by the operator pipeline above (not by a `d_j` offset set).

### 5.8 PTCA outputs consumed by PCNA
- adjacency lists / sparse matrices
- sentinel channel tensor (separate axis)
- phase-cycle indexing
- constraint channels for gating

---

## 6) PCNA (Prime Circular Neural Architecture)

### 6.1 Purpose
PCNA is a neural routing and synthesis architecture that:
- reads structured PTCA tensors and EDCM metrics
- routes content through prime-indexed nodes / circular phases
- produces responses, decisions, or tool calls
- remains bounded by sentinel gates S1–S9

### 6.2 Canon components (conceptual)
- **Encoder**: turn → feature vector(s)
- **Router**: feature → distribution over prime nodes (respecting masks)
- **Phase cycler**: time/phase indexer (8-phase default placeholder)
- **Aggregator**: combines routed features
- **Decoder**: generates text/action proposals
- **Gate stack**: S1–S9 checks + budget constraints

### 6.3 Routing math (canonical)
Let:
- `x` = encoded features
- `A` = PTCA adjacency (N×N) over prime nodes
- `m` = allow-mask over prime nodes (N) (0=blocked,1=allowed)
- `r = softmax(Wx + b)`  (distribution over prime nodes)

Apply mask:
- `r' = normalize(r ⊙ m)`

Propagate once (graph step):
- `r_next = normalize( Aᵀ r' )`

PCNA may do K steps; K must be declared.

### 6.4 Sentinel conditioning (separate axis; not routed)
Build gate vector `g_s` length 9 (one per sentinel). Deterministic where possible:
- S5 from `context` contract
- S6 from actor/role resolution
- S2/S3/S7 from declared policies/bounds/memory rules
- S8 from risk score

Use `g_s` to:
- block/allow actions
- require review / approval
- force output mode (draft-only vs actuation proposal)
- stamp provenance/audit

Invariant:
- Sentinel conditioning may change eligibility and output mode, but must be reported in S9_AUDIT.

### 6.5 Hard constraint: Approval and audit
Before any **external** actuation:
- Must pass S2 policy + S3 bounds
- Must request/receive S4 approval
- Must record S1 provenance and S9 audit

Invariant: S4 is non-bypassable.

### 6.6 PCNA outputs (canonical)
- `draft_text`
- `action_proposal[]` (tool calls, exports, billing ops, outreach, etc.)
- `routing_trace` (optional)
- `edcm_context` used (window + metric snapshot IDs)
- `used_context` (S5)

Output schema:
```json
{
  "pcna_result": {
    "draft_text": "...",
    "action_proposals": [
      {"type": "tool_call", "tool": "X", "payload": {}, "requires_S4": true}
    ],
    "trace": {
      "seed_count": 53,
      "steps": 1,
      "top_nodes": [{"idx": 11, "p": 31, "weight": 0.19}]
    },
    "used_snapshot": "snap_..."
  }
}
```

---

## 7) API Surface (Hub / a0-oriented; Replit-ready)

### 7.1 Auth (frozen default)
- **Auth required** for any endpoint that:
  - reads history/export
  - triggers synthesis/compute
  - accesses billing/donations
  - writes events/snapshots

Public endpoints (no-auth) allowed only for:
- health check
- static public metadata (version string)

### 7.2 Endpoint groups (canonical)
1) **a0 / model fan-out**
- `POST /v1/a0/prompt` (selected models or all)
- `POST /v1/a0/synthesize` (combine multi-model outputs into one result)
- `GET /v1/a0/history` (thread list, filters)
- `GET /v1/a0/export` (events + snapshot)

2) **EDCM**
- `POST /v1/edcm/eval` (evaluate window; accepts `context`)
- `GET /v1/edcm/metrics` (by snapshot/thread)
- `GET /v1/edcm/alerts`

3) **PTCA/PCNA**
- `GET /v1/ptca/schema` (tensor schema + mappings)
- `POST /v1/pcna/route` (routing inference; accepts `context`)
- `POST /v1/pcna/draft` (draft text + proposals; accepts `context`)

4) **System**
- `GET /health`
- `GET /version`

### 7.3 Request/Response constraints
- Every write returns an `event_id`.
- Every compute returns a `snapshot_id` or references an existing one.
- Every response includes `provenance` block (S1) and `audit` block (S9).

Provenance fragment:
```json
{"provenance":{"ts":"...","model":"...","build":"v1.0.2-S9","hash":"sha256:..."}}
```

Canonical response fragment:
```json
{
  "used_context": {"window":{"type":"turns","W":32},"retrieval":{"mode":"none","sources":[],"top_k":0}},
  "sentinel_context": {
    "S5_context": {"window":{"type":"turns","W":32},"retrieval_mode":"none"},
    "S6_identity": {"actor_map_version":"v1","confidence":0.98},
    "S7_memory": {"store_allowed": false, "retention": "n/a"},
    "S8_risk": {"score": 0.12, "flags":[]},
    "S9_audit": {"evidence_events":["evt_..."], "retrieval_log":[]}
  },
  "provenance": {"ts":"...","model":"...","build":"v1.0.2-S9","hash":"sha256:..."}
}
```

---

## 8) Placeholders (explicitly unestablished, reserved)

### 8.1 EDCM lexicons (empty allowed)
- profanity list: `[]`
- epithet list: `[]`
- vulgarity list: `[]`
- violence verbs list: `["kill","shoot","murder","stab"]` (placeholder; editable later)
- contextual phrase rules: `[]`

### 8.2 Thresholds (frozen v1.0.2)
- Default alert thresholds use the **80/20 rule**: trigger >=0.80, clear <=0.20, hysteresis otherwise.

### 8.3 PTCA exchange operator constants (frozen; v1 numeric defaults set)
- Rotation is constant for v1 (`Δ=1`, `dir(s)=(-1)^s`).
- Aggregators are frozen: `Agg6=mean`, `AggSeeds=mean`.
- Coupling weights are frozen for v1 and MUST be logged in S9: `α=0.10`, `β=0.20`, `γ=0.10`.
- Phase-driven rotation is reserved for v2.

### 8.4 Retrieval mode taxonomy (reserved)
- `none` is implemented.
- `keyword|vector|hybrid` reserved for later; must be S9-audited when enabled.

---

## 9) Testing + Validation (canonical)

### 9.1 Deterministic tests
- same input events ⇒ same EDCM metrics
- export/import round trip reproduces snapshots (hash match)

### 9.2 Gate tests
- S4 required paths cannot bypass approval
- no-auth cannot access protected endpoints
- retrieval usage must appear in S9 audit

### 9.3 Drift vs divergence tests
- drift test: topic stays single but moves off goal vector
- divergence test: splits into 2+ topic clusters with high entropy

---

## 10) Versioning (frozen)

- This file: **spec.md v1.0.2-S9**
- Any change to:
  - schemas
  - metric formulas (beyond threshold tuning)
  - seed count
  - sentinel behavior
  - context contract
requires version bump.

---

## 11) Minimal “EDCMBONE” report format (frozen)

```json
{
  "edcmbone": {
    "thread_id": "thr_...",
    "used_context": {"window": {"type":"turns","W":32}, "retrieval": {"mode":"none","sources":[],"top_k":0}},
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

---

## hmm (marker for unresolved constraints)

- hmm set: **active**
- Items:
  1) Coupling weights frozen for v1: `α=0.10`, `β=0.20`, `γ=0.10`.
  2) Calibrate alert thresholds with real transcripts.
  3) Decide embeddings policy for DRIFT (deterministic keyword vector vs inferred embeddings).
  4) Define retrieval modes taxonomy when enabling retrieval (keyword/vector/hybrid) and log it in S9.
