# EDCM-A0 Engineering Specification

**Spec version:** `edcm-org-v0.1.0`
**Last updated:** 2026-03-19
**Scope:** a0 routing framework + edcm-org diagnostic package

---

## 1. Overview

This repository contains two cooperating components:

| Component | Purpose |
|-----------|---------|
| **a0** | Lightweight routing and adapter framework for multi-tool orchestration |
| **edcm-org** | Organizational diagnostic package implementing the Energy–Dissonance Circuit Model |

**Core thesis:** Constraint resolution failures follow predictable circuit-like dynamics. Dissonance is unresolved constraint mismatch — not a feeling. It is observable in behavioral outputs, not inferred from internal states.

---

## 2. A0 Framework

### 2.1 Request/Response Contract

**File:** `a0/contract.py`

```python
@dataclass
class A0Request:
    task_id: str                          # UUID; auto-generated if absent
    input: Dict[str, Any]                 # {"text": str, "files": List[str]}
    tools_allowed: List[str]              # e.g. ["pdf_extract", "whisper", "edcm"]
    mode: Literal["analyze","route","act"] # default: "analyze"
    hmm: List[str]                        # hint/metadata passthrough

@dataclass
class A0Response:
    task_id: str
    result: Dict[str, Any]               # {"text": str, "artifacts": List[Any]}
    logs: Dict[str, Any]                 # {"events": [...]}
    hmm: List[str]
```

### 2.2 Routing Rules

**File:** `a0/router.py`

Dispatch priority (first match wins):

1. `pdf_extract` in `tools_allowed` AND `files` non-empty → `run_pdf_extract(files)`
2. `whisper` in `tools_allowed` AND `files` non-empty → `run_whisper_segments(files)`
3. `edcm` in `tools_allowed` → `run_edcm(text)`
4. Fallback → `LocalEchoAdapter.complete(messages)`

All dispatches are logged to `a0/logs/{task_id}.jsonl` (JSONL format, append-only).

### 2.3 Adapter Protocol

**File:** `a0/model_adapter.py`

```python
class ModelAdapter(Protocol):
    name: str
    def complete(self, messages: List[Dict]) -> Dict[str, Any]: ...
```

**Current implementations:**

| Adapter | Status |
|---------|--------|
| `LocalEchoAdapter` | Functional (echoes last user message) |
| `OpenAIAdapter` | Stub (empty file) |
| `GeminiAdapter` | Stub (empty file) |

### 2.4 Tool Interface

All tools live in `a0/tools/` and return `Dict[str, Any]`. All are currently stubs:

| Tool | Function | Status |
|------|----------|--------|
| `pdf_tool.py` | `run_pdf_extract(files: List[str])` | Stub |
| `whisper_tool.py` | `run_whisper_segments(files: List[str])` | Stub |
| `edcm_tool.py` | `run_edcm(text: str)` | Stub |

### 2.5 State Shape

**File:** `a0/state.py` — persists to `a0/state/a0_state.json`

```json
{
  "last_model": "<adapter name or null>"
}
```

### 2.6 Hub Connector

**File:** `a0/connectors/emergent_connector.py`

`handle_hub_payload(payload: Dict) -> Dict` — bridges external hub-style payloads to `A0Request`/`A0Response`. Field mapping:

| Hub field | A0Request field |
|-----------|----------------|
| `task_id` | `task_id` |
| `inputs` | `input` |
| `tools` | `tools_allowed` |
| `hints` | `hmm` |

### 2.7 HTTP Service

**File:** `a0/service/app.py` — FastAPI app, **disabled by default**.

Endpoint: `POST /a0` — accepts JSON payload, returns JSON response.
Not production-ready (no auth, no rate limiting).

---

## 3. EDCM-Org Package

### 3.1 Identity

| Field | Value |
|-------|-------|
| Package name | `edcm-org` |
| Version | `0.1.0` |
| Spec version constant | `edcm-org-v0.1.0` |
| Python requirement | `>=3.10` |
| External dependencies | **None** (stdlib only) |
| Entry point | `edcm-org = "edcm_org.cli:main"` |

### 3.2 Metric Catalog

All metrics are computed on plain text. No ML models are used. All are auditable to keyword/pattern lists.

#### 3.2.1 Primary Metrics (single-window)

| Symbol | Name | Range | Formula |
|--------|------|-------|---------|
| **C** | Constraint Strain | [0, 1] | Weighted contradiction density: `Σ(weight_k × presence_k) / Σ(weight_k)` over four signal types (contradiction=1.0, refusal=1.0, uncertainty=0.75, low_progress=0.5) |
| **R** | Refusal Density | [0, 1] | `refusal_marker_count / constraint_engagement_tokens` |
| **D** | Deflection | [0, 1] | `1 - (constraint_engagement_tokens / total_tokens)` |
| **N** | Noise | [0, 1] | `1 - (resolution_action_tokens / constraint_engagement_tokens)` |
| **L** | Coherence Loss | [0, 1] | `contradiction_pair_count / sentence_count` |
| **O** | Overconfidence | [-1, 1] | `(absolute_markers - hedge_markers - evidence_markers) / sentence_count`; positive = over-certain, negative = under-certain |

**C signal weights** (configurable via `weights` param):

| Signal | Default weight | Markers |
|--------|---------------|---------|
| contradiction | 1.0 | Contradictory pairs from `CONTRADICTION_PATTERNS` |
| refusal | 1.0 | "cannot", "impossible", "against policy", "not allowed" |
| uncertainty | 0.75 | "not sure", "maybe", "unclear", "unknown" |
| low_progress | 0.5 | "no decision", "we'll see", "tabled", "circle back" |

**O marker lists:**

| Type | Markers |
|------|---------|
| Absolute | "guarantee", "definitely", "certain", "no doubt", "will", "always", "never fails" |
| Hedge | "maybe", "might", "unclear", "likely", "approximately", "could be", "uncertain" |
| Evidence | "http", "source", "data shows", "metrics", "evidence", "study", "research" |

#### 3.2.2 Secondary Metrics (require ≥2 windows)

| Symbol | Name | Range | Formula |
|--------|------|-------|---------|
| **F** | Fixation | [0, 1] | Mean Jaccard similarity of constraint-keyword token sets across consecutive window pairs |
| **E** | Escalation | [0, 1] | Slope of irreversibility marker counts across windows; normalized so slope=2 markers/window → E=1.0 |
| **I** | Integration Failure | [0, 1] | `failures / correction_windows` where a failure = correction marker in window N AND C does not decrease in window N+1 |

**Returns 0.0 when fewer than 2 windows are provided.**

**E irreversibility markers:** "committed", "signed", "launched", "deployed", "shipped", "announced", "published", "sent", "filed", "submitted", "approved", "final", "no going back"

**I correction markers:** "correction", "actually", "revised", "updated", "changed to", "per feedback", "as noted", "you're right", "we were wrong", "amend", "retract"

#### 3.2.3 Progress (P)

**Range:** [0, 1]

```
P = 0.3 × P_decisions + 0.2 × P_commitments + 0.3 × P_artifacts + 0.2 × P_followthrough
```

Each sub-component is estimated via keyword matching on text. Structured data overrides are supported for higher-fidelity estimation (e.g. ticket resolution rates override `P_artifacts`).

| Sub-component | Default markers (sample) |
|---------------|--------------------------|
| P_decisions | "decided", "agreed on", "approved", "resolved to" |
| P_commitments | "committed", "assigned to", "my action item" |
| P_artifacts | "pr merged", "ticket closed", "shipped", "deployed" |
| P_followthrough | "done", "as promised", "per last meeting", "delivered" |

#### 3.2.4 Secondary Modifiers (confidence caps only)

Per spec, secondary modifiers **may only reduce confidence scores**. They do NOT modify metric values.

| Modifier | Caps |
|----------|------|
| `sentiment_slope` | Escalation (E) confidence ≤ 0.20 |
| `urgency` | Escalation (E) confidence ≤ 0.15 |
| `filler_ratio` | Noise (N) confidence ≤ 0.25 |
| `topic_drift` | Deflection (D) confidence ≤ 0.30 |

### 3.3 Parameters

| Parameter | Description | Range | Default |
|-----------|-------------|-------|---------|
| `alpha` | Persistence — estimated from unresolved constraint half-life (exponential decay fit over C series) | [0, 1] | 0.5 (neutral; requires ≥2 windows for real estimation) |
| `delta_max` | Complexity-bounded throughput ceiling: P90(median(resolution_rate \| complexity_bucket)) | [0, 1] | See bucket defaults |
| `complexity` | Structural load estimate: weighted combination of type-token ratio, mean sentence length, clause marker density, domain term density | [0, 1] | — |

**Complexity weights:**

| Feature | Weight |
|---------|--------|
| Type-token ratio | 0.30 |
| Mean sentence length (normalized at 30 tokens/sentence) | 0.35 |
| Clause marker density | 0.25 |
| Domain term density (optional) | 0.10 |

**Complexity buckets:**

| Bucket | Range |
|--------|-------|
| low | complexity < 0.33 |
| medium | 0.33 ≤ complexity < 0.66 |
| high | complexity ≥ 0.66 |

**delta_max conservative defaults (when insufficient history):**

| Bucket | Default |
|--------|---------|
| low | 0.70 |
| medium | 0.45 |
| high | 0.25 |

### 3.4 Basin Taxonomy

Basins are stable attractor configurations in EDCM state space — diagnostic labels, not judgments.

**Standard basins** apply to all system types (AI and organizational).
**Human-only basins** apply only when context is explicitly human.

Human-only basins are evaluated **first** because they can masquerade as healthy states.

| Basin | Scope | Thresholds | Detection confidence |
|-------|-------|-----------|---------------------|
| COMPLIANCE_STASIS | human_only | P_artifacts ≥ 0.8 AND c_reduction < 0.2 AND s_t > 0.6 AND E < 0.3 AND compliance_index > 2.5 | 0.85 |
| SCAPEGOAT_DISCHARGE | human_only | s_t < 0.6 AND delta_work < 0.1 AND blame_density > 0.3 AND I > 0.6 | 0.80 |
| REFUSAL_FIXATION | all | R > 0.7 AND F > 0.6 | 0.90 |
| DISSIPATIVE_NOISE | all | N > 0.7 AND P < 0.3 | 0.80 |
| INTEGRATION_OSCILLATION | all | I > 0.6 AND 0.4 ≤ F ≤ 0.8 | 0.70 |
| CONFIDENCE_RUNAWAY | all | O > 0.7 AND E > 0.6 | 0.85 |
| DEFLECTIVE_STASIS | all | D > 0.7 AND 0.2 ≤ P ≤ 0.4 | 0.70 |
| UNCLASSIFIED | all | No thresholds met | 0.50 |

**External inputs required by `detect_basin()`:**

| Input | Meaning |
|-------|---------|
| `s_t` | Strain trajectory (current C relative to baseline; s_t > 0.6 = elevated) |
| `c_reduction` | Fractional constraint reduction this window |
| `delta_work` | Work output delta this window |
| `blame_density` | Proportion of sentences with blame-assignment language |

Every basin detection returns an **explanation block**:
```json
{
  "fired": ["R=0.82 > 0.7", "F=0.71 > 0.6"],
  "would_change_if": ["R drops below 0.7", "constraint engagement diversifies"]
}
```

### 3.5 Governance

#### 3.5.1 Privacy Guard

**File:** `edcm-org/src/edcm_org/governance/privacy.py`

**Hard rules (non-negotiable):**
- `aggregation="individual"` is **prohibited**; raises `ConsentError`
- Valid aggregation levels: `"department"` (default), `"team"`, `"organization"`
- PII keys stripped recursively from all payloads: `email`, `phone`, `name`, `employee_id`, `address`, `ssn`, `dob`, `ip_address`
- Data retention window: 6 months default (configurable via `PrivacyConfig.retain_months`)

#### 3.5.2 Gaming Detection

**File:** `edcm-org/src/edcm_org/governance/gaming.py`

Always computed; included in every output envelope. Returns `List[str]` (empty = no alerts).

| Alert | Trigger |
|-------|---------|
| ARTIFACT_INFLATION | P_artifacts > 0.7 AND c_reduction < 0.1 |
| SUPPRESSED_ESCALATION | C > 0.6 AND E < 0.15 AND P < 0.3 |
| RESOLUTION_TOKEN_INFLATION | N < 0.15 AND D > 0.6 |
| OVERCONFIDENCE_INCOHERENCE | O > 0.6 AND L > 0.5 |
| FIXATION_CAMOUFLAGE | F > 0.7 AND P > 0.6 |

#### 3.5.3 Interventions

**File:** `edcm-org/src/edcm_org/governance/interventions.py`

`recommend_interventions(basin, metrics) -> List[str]` — advisory only, never automated.

Cross-cutting triggers:
- I > 0.7 → "Verify feedback loops are reaching decision-makers"
- O > 0.8 → "Require evidence citations before further escalation"

### 3.6 Output Envelope

Every output **must** include all fields. Validated before serialization.

```json
{
  "spec_version": "edcm-org-v0.1.0",
  "org": "<string>",
  "window_id": "<string>",
  "aggregation": "department | team | organization",
  "metrics": {
    "C": 0.0,  "R": 0.0,  "F": 0.0,  "E": 0.0,
    "D": 0.0,  "N": 0.0,  "I": 0.0,  "O": 0.0,
    "L": 0.0,  "P": 0.0,
    "P_decisions": 0.0, "P_commitments": 0.0,
    "P_artifacts": 0.0, "P_followthrough": 0.0
  },
  "params": {
    "alpha": 0.0,
    "delta_max": 0.0,
    "complexity": 0.0
  },
  "basin": "<BasinName>",
  "basin_confidence": 0.0,
  "basin_explanation": {
    "fired": [],
    "would_change_if": []
  },
  "gaming_alerts": [],
  "warnings": []
}
```

**Metric ranges enforced at output time:**

| Metric | Range |
|--------|-------|
| C, R, F, E, D, N, I, L, P | [0, 1] |
| O | [-1, 1] |

### 3.7 Analysis Pipeline (CLI)

**File:** `edcm-org/src/edcm_org/cli.py`
**Entry point:** `edcm-org --org <id> --meeting <file.txt> [--tickets <file.csv>] --out <result.json>`

**Arguments:**

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--org` | Yes | — | Organization identifier |
| `--meeting` | Yes | — | Path to meeting transcript (.txt) |
| `--tickets` | No | None | Path to ticket data (.csv) |
| `--out` | Yes | — | Output path for JSON result |
| `--aggregation` | No | `"department"` | `department \| team \| organization` |
| `--window-id` | No | `"window-001"` | Window identifier |

**Pipeline order:**

1. `window_meeting_text(text, window_size=500, overlap=50)` → windows
2. Primary metrics (C, R, D, N, L, O) on full text
3. Secondary metrics (F, E, I) on windows list
4. `compute_progress()` with optional `p_artifacts_override` from ticket resolution rate
5. `estimate_complexity(text)` → complexity bucket
6. `alpha = 0.5` (hardcoded in v0.1; single-window limitation)
7. `estimate_delta_max(resolution_rates, complexities)` (uses ticket data if available)
8. `detect_basin(metrics, s_t, c_reduction, delta_work, blame_density)` where: `s_t=C`, `c_reduction=0.0` (no prior window), `delta_work=P`
9. `detect_gaming_alerts(metrics, c_reduction, len(windows))`
10. `EDCMPrivacyGuard.enforce(result)` — strips PII, validates aggregation
11. Write JSON to `--out`

### 3.8 IO / Windowing

**File:** `edcm-org/src/edcm_org/io/loaders.py`

| Function | Description |
|----------|-------------|
| `load_meeting_text(path)` | Reads `.txt` file as string |
| `load_tickets_csv(path, text_columns, status_column, resolved_values)` | Returns `{text, total, resolved, resolution_rate, rows}` |
| `window_meeting_text(text, window_size=500, overlap=50)` | Returns `List[str]` of overlapping word-count windows; step = `window_size - overlap` |

### 3.9 Spec Compliance Enforcement

**File:** `edcm-org/src/edcm_org/eval/protocol.py`

`check_spec_compliance(envelope: OutputEnvelope) -> ComplianceResult` validates:
- All metric values are in defined ranges
- `spec_version == "edcm-org-v0.1.0"`
- `aggregation != "individual"`
- All required fields present
- P sub-components sum approximately correctly

`evaluate_batch(envelopes) -> EvalReport` — designed for CI/CD gate integration.

---

## 4. Extraction Helpers Reference

**File:** `edcm-org/src/edcm_org/metrics/extraction_helpers.py`

| Function | Behavior |
|----------|----------|
| `tokenize(text)` | Lowercased word tokens via `\b\w+\b` regex |
| `count_markers(text, markers)` | Binary presence per marker (not frequency); returns count of distinct markers present |
| `constraint_engagement_tokens(text)` | Token count in sentences containing any `CONSTRAINT_KEYWORD` |
| `resolution_action_tokens(text)` | Token count in sentences containing any `RESOLUTION_KEYWORD` |
| `contradiction_count(text)` | Count of `CONTRADICTION_PATTERNS` pairs where both members appear anywhere in text |
| `blame_density(text)` | Proportion of sentences with blame-assignment language |

**Keyword lists:**

`CONSTRAINT_KEYWORDS` (33 terms): impossibility/refusal markers, uncertainty signals, deferral terms, constraint acknowledgment terms

`RESOLUTION_KEYWORDS` (16 terms): decision, approval, completion, and delivery markers

`CONTRADICTION_PATTERNS` (8 pairs): (yes/no), (will/won't), (can/cannot), (approved/rejected), (agreed/disagreed), (always/never), (increase/decrease), (add/remove)

---

## 5. Known Limitations (v0.1)

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| `alpha` hardcoded to 0.5 | Persistence parameter is meaningless for single-window runs | Warning added to all outputs; accumulate windows for real estimation |
| F, E, I inaccurate on single window | Returns 0.0; not representative | Warning added to all outputs |
| Marker counting is binary presence | `count_markers` returns 1 regardless of how many times a marker appears | Known tradeoff for auditability; see suggest.md |
| Contradiction detection is text-level | Detects pair co-occurrence in window, not semantic contradiction | Documented; acceptable for v0.1 |
| Window splitting is word-count-based | Can split mid-sentence | Sentence-boundary-aware windowing is a P1 improvement |
| c_reduction hardcoded to 0.0 | Basin detection partially blind without prior window | Requires multi-window runs |
| Tool backends are stubs | pdf_extract, whisper, edcm tools return mock data | Must be implemented before production use |
| No adapter implementations | Only LocalEchoAdapter works | OpenAI/Gemini adapters must be implemented |
| Logging is unbounded | `a0/logs/` will grow without rotation | Add log rotation before production use |

---

## 6. Test Gates

| Test file | What it gates |
|-----------|--------------|
| `edcm-org/tests/test_metrics_ranges.py` | All metrics return values in defined ranges |
| `edcm-org/tests/test_basin_detection.py` | All basins fire at documented thresholds |
| `edcm-org/tests/test_privacy_guard.py` | PII stripping, aggregation enforcement, retention validation |
| `edcm-org/tests/test_no_individual_outputs.py` | Hard gate: individual-level output blocked at all layers |
| `tests/test_smoke.py` | A0 framework produces valid response structure |

Run tests:
```bash
python -m pytest edcm-org/tests/ tests/
```
