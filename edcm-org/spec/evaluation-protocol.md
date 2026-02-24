# EDCM-Org Evaluation Protocol

## Purpose

This protocol ensures that EDCM analysis outputs are spec-compliant, non-gaming,
and auditable. It is designed to fail builds when spec drift is detected.

---

## Required CI Checks

All of the following must pass before any release:

### 1. Metric Range Validation

Every metric in every output envelope must fall within its defined range:

| Metric | Range |
|--------|-------|
| C, R, F, E, D, N, I, L, P | [0.0, 1.0] |
| O | [-1.0, 1.0] |

### 2. Spec Version Stamp

Every output must include `spec_version: "edcm-org-v0.1.0"`.

### 3. No Individual Outputs

`aggregation` must never equal `"individual"`.

### 4. Secondary Modifier Caps

No secondary modifier may apply a confidence delta exceeding:

| Modifier | Cap |
|----------|-----|
| sentiment_slope → escalation_confidence | 0.20 |
| urgency → escalation_confidence | 0.15 |
| filler_ratio → noise_confidence | 0.25 |
| topic_drift → deflection_confidence | 0.30 |

### 5. Progress Sub-Component Consistency

When P > 0.01, the weighted sum of P sub-components must equal P within 0.01 tolerance:

```
|0.3*P_d + 0.2*P_c + 0.3*P_a + 0.2*P_f - P| <= 0.01
```

### 6. Gaming Detection Always Runs

`gaming_alerts` must be present in every output (may be empty, but must not be absent).

### 7. Basin Explanation Block

Every basin classification must include a non-empty explanation block with:
- `fired`: which threshold conditions were met
- `would_change_if`: what metric changes would alter the classification

---

## Diagnostic Load Tests

Controlled diagnostic loads are valid inputs for testing. A controlled hallucination
or adversarial prompt designed to drive metrics to edge cases is a legitimate
evaluation tool, not an attack.

Test scenarios should cover:
- All seven non-UNCLASSIFIED basins
- Boundary conditions (metric values at thresholds ±0.01)
- Gaming patterns (artifact inflation, suppressed escalation)
- Privacy guard: verify ConsentError on individual-level attempts

---

## Evaluation Output Format

Each evaluation run should produce a structured report including:
- Number of windows evaluated
- Pass/fail per compliance check
- Total error and warning counts
- Per-basin detection accuracy (if ground truth is available)

---

## Non-Punitive Principle

Evaluation results are diagnostic, not verdicts. An INTEGRATION_OSCILLATION
classification is a system-level diagnosis, not an attribution of blame
to individuals. Interventions recommended by the system must be framed
as load-management actions, not personnel actions.
