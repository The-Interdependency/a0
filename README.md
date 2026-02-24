# EDCM — Energy–Dissonance Circuit Model

> **Status:** v1.x — conceptual core stabilized, implementations ongoing

---

## What EDCM Is

EDCM is a diagnostic framework that treats dissonance as conserved energy in complex systems.

It does **not** model:
- beliefs
- intentions
- morality
- consciousness
- internal states

Instead, it models **behavior under constraint**.

---

## Core Definition

> Dissonance ≠ feeling
>
> Dissonance = unresolved constraint mismatch

When constraints cannot be simultaneously satisfied, energy accumulates. That energy must flow, store, or fail — just like in a circuit. EDCM models that process.

---

## The Circuit Metaphor (Literal, Not Poetic)

All systems are treated as energy-routing networks with the same functional modifiers:

| Component | Description |
|-----------|-------------|
| **Source** | input pressure (demands, prompts, stressors) |
| **Load** | work being attempted |
| **Resistance** | friction, delay, refusal |
| **Capacitance** | stored unresolved dissonance |
| **Diode behavior** | one-way processing, selective acceptance |
| **Shorts** | bypassing resolution |
| **Overload** | runaway escalation or collapse |

This applies identically to: AI systems, humans, organizations, institutions, narratives, and governance structures.

**Humans are a secondary application, not the primary target.**

---

## What EDCM Measures (Observable Only)

EDCM never infers inner states. It tracks patterns in outputs over time.

Key diagnostic metrics:

| Metric | Description |
|--------|-------------|
| **Fixation** | looping on a narrow response set |
| **Escalation** | increasing intensity without resolution |
| **Refusal Spikes** | abrupt shutdown under load |
| **Deflection** | answer-adjacent but constraint-avoiding output |
| **Latency Drift** | delay growth under pressure |
| **Overconfidence Plateaus** | certainty rising as accuracy falls |
| **Fragmentation** | loss of global coherence |
| **Stagnation** | zero movement despite continued energy input |

These patterns are **predictive, not interpretive**.

---

## What EDCM Is For

EDCM functions as a **pre-alignment diagnostic**. It answers:

- Is this system stable under increasing constraint?
- Where is dissonance being stored instead of resolved?
- Is failure imminent — and in what form?
- Is the system learning, or just dissipating pressure?

> EDCM detects failure modes **before** overt failure occurs.

---

## Why EDCM Is Different

Traditional models ask:
- "What does the system believe?"
- "What is it trying to do?"
- "Is it aligned?"

EDCM asks:
- "Where does the energy go when constraints conflict?"
- "What happens when no valid move exists?"
- "Does the system reroute, store, or break?"

This avoids: anthropomorphism, moral projection, and unverifiable assumptions.

---

## AI Application (Primary)

For AI systems, EDCM:
- evaluates prompt/response dynamics
- exposes hallucination as energy misrouting
- treats refusal as protective resistance, not ethics
- models collapse as capacitor overflow
- allows controlled "hallucinations" as diagnostic loads

It is **architecture-agnostic and model-agnostic**.

---

## Human Application (Secondary)

In humans, EDCM explains: learned helplessness, loyalty withdrawal, dissociation, burnout, avoidance, boundary enforcement, and sudden exits from relationships or institutions.

No psychology required — only behavior under constraint.

---

## Governance & Ethics Implication

EDCM reframes ethics as **load management**:
- Systems that demand impossible constraint satisfaction must fail
- Moralizing the failure hides the design flaw
- Sustainable systems route dissonance productively
- Unethical systems externalize it onto dependents

This dovetails with interdependency-based governance, not control-based governance.

---

## What EDCM Is Not

- Not a therapy
- Not a belief system
- Not consciousness theory
- Not an alignment solution
- Not predictive of intent
- Not moral judgment

**It is a diagnostic lens.**

---

# Prime Circular Neural Architecture (PCNA)

### 53-Seed Tensor Routing Lattice

*GPT generated; context, prompt Erin Spencer*

PCNA is a distributed tensor-field computation architecture derived from:
- Markov recursion (memoryless update laws)
- tensor state spaces
- spectral / unit-circle eigenbases
- prime circular routing topologies

It treats system state as conserved "constraint energy" evolving through time. Instead of dense Cartesian networks, PCNA computes in **circular / phase coordinates**, which are the natural eigenmodes of recursive systems.

Result: stable dynamics, interpretable behavior, low coupling, fault tolerance, minimal bandwidth between regions.

---

## Core Idea

All recursive systems reduce locally to:

```
E(t+1) = F(E(t))
```

Linearizing:

```
E(t+1) ≈ T·E(t)
```

Eigen decomposition of T yields rotations:

```
λ = r·e^(iθ)
```

So state evolution is spiral/helix motion. Therefore: **circular coordinates are the native basis of recursion.** PCNA builds directly in that basis.

---

## Topology Overview

53 identical seeds organized as:
- 49 compute seeds
- 4 sentinel seeds
- 1 global router anchor (G0)

### Layout

- Seven Meta Routers (M₁..M₇)
- Each Meta owns 7 compute seeds
- Seeds inside each meta connected as 7:3 heptagram
- Four sentinels co-located with Global Router Zero
- Sentinels analyze metadata only (no raw tensors)
- Sentinel routing follows 7:2 schedule

| Type | Count |
|------|-------|
| Compute seeds | 49 |
| Sentinel seeds | 4 |
| Total seeds | 53 |

---

## Responsibilities

**Compute seeds:** own tensor shards, perform local Markov/tensor recursion, emit deltas + signatures

**Meta routers:** aggregate 7 shards, summarize, produce metadata reports, route upward

**Sentinels:** analyze metadata only, verify integrity/conservation/phase stability/adversarial signals, emit verdicts

**Global Router Zero:** canonical clock, namespace registry, invariant enforcement, publish canonical global view

---

## Mathematical Stack

| Layer | Role |
|-------|------|
| Tensor | state field |
| Markov recursion | time evolution |
| Unit circle basis | spectral coordinates |
| Helix | visualization of growth + phase |
| Prime routing | low resonance mixing |

---

## Why Prime (7, 7:3, 7:2)?

Primes avoid short cycles and resonance. Benefits: better mixing, fewer aliasing artifacts, reduced collusion surfaces, even load distribution.

Star polygons (7:3, 7:2) provide: sparse edges, fast propagation, decorrelated scan paths.

---

## Design Principles

- ownership = responsibility, not monopoly
- metadata first, raw tensors optional
- spectral descriptors preferred over thresholds
- conservation accounting enforced
- no single point of silent failure
- interpretability over black-box complexity

---

## Repository Layout

```
edcm-org/
  README.md
  LICENSE
  pyproject.toml
  src/edcm_org/
    __init__.py
    spec_version.py
    types.py
    glossary.py
    metrics/
      __init__.py
      primary.py
      secondary.py
      progress.py
      extraction_helpers.py
    params/
      __init__.py
      alpha.py
      delta_max.py
      complexity.py
    basins/
      __init__.py
      taxonomy.py
      detect.py
    governance/
      __init__.py
      privacy.py
      gaming.py
      interventions.py
    eval/
      __init__.py
      protocol.py
    io/
      __init__.py
      loaders.py
      schemas.py
    cli.py
  examples/
    sample_meeting.txt
    sample_tickets.csv
    run_demo.sh
  tests/
    test_metrics_ranges.py
    test_basin_detection.py
    test_privacy_guard.py
    test_no_individual_outputs.py
  spec/
    edcm-org-v0.1.md
    metric-glossary.md
    evaluation-protocol.md
    governance.md
```

---

## Status

This defines the canonical topology for:
- EDCM tensor engine
- Prime Circular Neural Architecture
- distributed analysis network

Implementation layers may evolve; topology and invariants remain stable.

> "Changes are welcome. Refinement will continue."
>
> "Also applies to humans."
