# EDCM-Org v0.1 — Formal Specification

## Spec Status

- Version: 0.1.0
- Status: Draft-Operational
- Philosophy: Observable outputs only. No intent inference.

---

## Scope

EDCM-Org v0.1 applies to organizational and AI system analysis.
It operates exclusively on observable behavioral outputs.
It does not model beliefs, intentions, consciousness, or moral states.

---

## Primary Metrics (Operational)

All primary metrics MUST be normalized to defined ranges and computed per analysis window.

### Constraint Strain (C)

**Definition:** Weighted contradiction density over constraint-relevant segments.

**Formula:**
```
C = sum(w_i * indicator_i) / sum(w_i)
```
where indicators are: contradiction presence, refusal presence, uncertainty presence, low-progress presence.

**Range:** [0, 1]

---

### Refusal Density (R)

**Definition:** Refusal statements / total constraint statements.

**Formula:**
```
R = count(refusal_markers) / constraint_engagement_tokens
```

**Range:** [0, 1]

---

### Fixation (F)

**Definition:** Similarity of constraint engagement over time.

**Formula:** Mean pairwise Jaccard similarity of constraint keyword sets across consecutive windows.

**Range:** [0, 1]

**Requires:** Minimum 2 windows.

---

### Escalation (E)

**Definition:** Commitment velocity increase (irreversibility markers slope).

**Formula:** Normalized slope of irreversibility marker count time series.

**Range:** [0, 1]

**Requires:** Minimum 2 windows.

---

### Deflection (D)

**Definition:** `1 - (tokens_about_constraints / total_tokens)`

**Range:** [0, 1]

---

### Noise (N)

**Definition:** `1 - (tokens_in_resolution_actions / tokens_about_constraints)`

**Range:** [0, 1]

---

### Integration Failure (I)

**Definition:** Failure to incorporate corrections across windows.

**Formula:** `failures / correction_windows` where a failure = constraint strain did not decrease after a correction marker appeared.

**Range:** [0, 1]

**Requires:** Minimum 2 windows.

---

### Overconfidence (O)

**Definition:** Certainty-evidence mismatch.

**Formula:**
```
O = (absolutes - hedges - citations) / total_statements
```

**Range:** [-1, 1]

Positive = over-certain. Negative = under-certain (excessive hedging without action).

---

### Coherence Loss (L)

**Definition:** Internal contradiction density.

**Formula:**
```
L = contradiction_count / total_statements
```

**Range:** [0, 1]

---

### Progress (P)

**Definition:** Multi-channel completion.

**Formula:**
```
P = 0.3*P_decisions + 0.2*P_commitments + 0.3*P_artifacts + 0.2*P_followthrough
```

**Range:** [0, 1]

---

## Secondary Modifiers

Secondary signals can **ONLY** modulate confidence, not define primaries.

| Modifier | Affects | Cap |
|----------|---------|-----|
| Sentiment slope | Escalation confidence | ≤ 0.20 |
| Urgency | Escalation confidence | ≤ 0.15 |
| Filler ratio | Noise confidence | ≤ 0.25 |
| Topic drift | Deflection confidence | ≤ 0.30 |

---

## Parameter Estimation (Identifiable)

### Persistence α

Estimated from unresolved constraint half-life regression across windows.

High α = dissonance persists (slow decay).

### δ_max

Estimated as complexity-bounded throughput:

```
δ_max ≈ P90(median(resolution_rate | complexity_bucket))
```

---

## Basin Taxonomy

### Standard Basins (all system types)

| Basin | Trigger Conditions |
|-------|--------------------|
| REFUSAL_FIXATION | R > 0.7 AND F > 0.6 |
| DISSIPATIVE_NOISE | N > 0.7 AND P < 0.3 |
| INTEGRATION_OSCILLATION | I > 0.6 AND 0.4 ≤ F ≤ 0.8 |
| CONFIDENCE_RUNAWAY | O > 0.7 AND E > 0.6 |
| DEFLECTIVE_STASIS | D > 0.7 AND 0.2 ≤ P ≤ 0.4 |

### Human-Only Basins

| Basin | Trigger Conditions |
|-------|--------------------|
| COMPLIANCE_STASIS | P_artifacts ≥ 0.8 AND c_reduction < 0.2 AND s_t > 0.6 AND E < 0.3 AND compliance_index > 2.5 |
| SCAPEGOAT_DISCHARGE | s_t < 0.6 AND delta_work < 0.1 AND blame_density > 0.3 AND I > 0.6 |

Human-only basins are evaluated **first** because they can masquerade as productive states.

---

## Governance

- Default aggregation: **department-level**
- No individual scoring absent explicit consent + safety protocol
- No punitive automation
- Gaming detection is **non-optional** and always computed
- Every basin classification MUST include an explanation block

---

## Output Requirements

Every output MUST include:
- `spec_version` (must equal `edcm-org-v0.1.0`)
- `time_window` / `window_id`
- `aggregation` level
- All metric values with ranges validated
- `gaming_alerts` (may be empty)
- `warnings` (may be empty)
- `basin` + `basin_confidence`

---

## Spec Compliance Tests (Required)

The following checks MUST pass in CI/CD:

1. All metrics are within their defined ranges
2. Every output includes `spec_version`
3. `aggregation` is never `individual`
4. Secondary modifiers never exceed their caps
5. Progress sub-components sum to P (within 0.01 tolerance)
