# EDCM-Org Metric Glossary

See also: `src/edcm_org/glossary.py` for programmatic access.

---

## Core Concept

**Dissonance** = unresolved constraint mismatch. Not a feeling, not a judgment.
Energy that accumulates when constraints cannot be simultaneously satisfied.

---

## Primary Metrics

| Symbol | Name | Range | Description |
|--------|------|-------|-------------|
| C | Constraint Strain | [0,1] | Weighted contradiction density over constraint-relevant segments |
| R | Refusal Density | [0,1] | Refusal statements / total constraint statements |
| F | Fixation | [0,1] | Similarity of constraint engagement over time |
| E | Escalation | [0,1] | Commitment velocity increase (irreversibility markers slope) |
| D | Deflection | [0,1] | 1 - (tokens_about_constraints / total_tokens) |
| N | Noise | [0,1] | 1 - (tokens_in_resolution_actions / tokens_about_constraints) |
| I | Integration Failure | [0,1] | Failure to incorporate corrections across windows |
| O | Overconfidence | [-1,1] | Certainty-evidence mismatch |
| L | Coherence Loss | [0,1] | Internal contradiction density |
| P | Progress | [0,1] | 0.3*P_d + 0.2*P_c + 0.3*P_a + 0.2*P_f |

## Progress Sub-Components

| Symbol | Name | Weight |
|--------|------|--------|
| P_d | P_decisions | 0.30 |
| P_c | P_commitments | 0.20 |
| P_a | P_artifacts | 0.30 |
| P_f | P_followthrough | 0.20 |

---

## Circuit Metaphor Terms

| Term | Circuit Analog | EDCM Meaning |
|------|---------------|--------------|
| Source | Voltage source | Input pressure: demands, prompts, stressors |
| Load | Resistive load | Work being attempted |
| Resistance | Resistor | Friction, delay, refusal |
| Capacitance | Capacitor | Stored unresolved dissonance |
| Short | Short circuit | Bypassing the resolution step |
| Overload | Blown fuse | Runaway escalation or collapse |
| Diode behavior | Rectifier | One-way processing, selective acceptance |

---

## System Parameters

| Symbol | Name | Description |
|--------|------|-------------|
| α | Persistence | Unresolved constraint half-life. High = slow decay. |
| δ_max | Max throughput | P90(median(resolution_rate \| complexity_bucket)) |
| κ | Complexity | Cognitive/structural load of the window |

---

## Basin Names

| Basin | Scope | Short Description |
|-------|-------|-------------------|
| REFUSAL_FIXATION | All | Loops on refusals under load |
| DISSIPATIVE_NOISE | All | High activity, near-zero resolution |
| INTEGRATION_OSCILLATION | All | Corrections acknowledged but not integrated |
| CONFIDENCE_RUNAWAY | All | Escalating commitment + rising certainty |
| DEFLECTIVE_STASIS | All | Partial progress masking avoidance |
| COMPLIANCE_STASIS | Human-only | Artifacts produced without constraint resolution |
| SCAPEGOAT_DISCHARGE | Human-only | Dissonance externalized as blame |
| UNCLASSIFIED | All | Below detection threshold |
