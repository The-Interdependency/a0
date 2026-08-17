# Platonic Agent

Status: **PROVISIONAL architecture concept**. Implemented as an open projection envelope; not claimed complete, metaphysically established, or empirically validated.

## Domain claim

```yaml
surface_form: Platonic Agent
term_id: a0.agent.platonic
claiming_domain: a0 agent architecture
claimed_sense: the open maximal relational envelope of dimensions from which a bounded AgentDefinition or runtime agent may be projected
scope: a0 agent specification, definition, and instantiation work
claim_type: specialized
status: provisional
authority_source: maintainer direction plus this repository's agent-definition architecture
included_uses:
  - representing candidate dimensions an agent may possess or relate through
  - recording what a bounded projection selects, omits, or leaves unresolved
  - extending the candidate envelope without declaring the current list exhaustive
excluded_uses:
  - a claim that Plato's metaphysics is literally implemented
  - a synonym for ZFAE or any inference engine
  - a runtime AgentInstance, model provider, prompt, memory store, or character sheet
  - a proof that the candidate dimensions are necessary or sufficient for agency
neighboring_terms:
  - AgentDefinition
  - AgentInstance
  - AgentRun
  - ZFAE inference event
known_collisions:
  - philosophical uses of Platonic form
unresolved:
  - exhaustive dimension set
  - exact projection into durable AgentDefinition revisions
  - which transformations preserve, fork, or terminate agent identity
```

|∆|The term names a construction direction: maximal envelope first, bounded realization second. It does not import a philosophical ontology as evidence.|∆|

## Dependency order

```text
PlatonicAgentEnvelope        open maximal candidate object
        |
        | explicit projection
        v
AgentDefinition              durable bounded declaration
        |
        v
AgentInstance                one runtime incarnation
        |
        v
AgentRun                     one bounded execution lineage
```

The existing `AgentDefinition -> AgentInstance -> state/memory/run lineage` distinction remains intact. This layer sits above it; it does not replace it.

## ZFAE boundary

`inference` is one candidate dimension of the Platonic Agent. ZFAE owns the conceptual specification of one inference/self-awareness-event architecture used by a0. ZFAE does **not** thereby own agent identity, memory, tools, embodiment, goals, permissions, or the maximal agent envelope.

Therefore this is valid as a bounded projection:

```python
from python.agents import candidate_platonic_agent

envelope = candidate_platonic_agent()
projection = envelope.project({"inference": {"kind": "zfae"}})

assert projection.selected == ("inference",)
assert "identity" in projection.omitted
```

Selecting an inference event does not synthesize an identity.

## Current candidate dimensions

The executable scaffold currently names:

```text
identity
boundaries
memory
perception
action
goals
relations
inference
provenance
state_transition
embodiment
tools
uncertainty
```

These are **candidate distinctions, not a closed ontology**. `PlatonicAgentEnvelope.extend(...)` exists specifically so discovery can add a dimension without rewriting prior projections or pretending the earlier set was complete.

A later result may remove, split, combine, specialize, or supersede candidate dimensions. Such a result must preserve provenance and must not silently reinterpret older projections.

## Direction of investigation

The methodological direction is intentionally opposite the Tarot investigation:

```text
Tarot: observed cards / corpus -> reconstruct a maximal card object

a0:    maximal candidate agent object -> project bounded operational agents
```

That is a methodological relation only. a0 gains no Tarot runtime dependency, and this work is not a Tarot application.

## Executable contract

`python/agents/platonic.py` provides:

- `AgentDimension` — one independently addressable candidate dimension;
- `PlatonicAgentEnvelope` — immutable open envelope;
- `extend(...)` — returns a new envelope and never mutates the prior one;
- `project(...)` — produces a bounded projection with explicit `selected`, `omitted`, and `unresolved` dimensions;
- fail-closed behavior for bindings to undeclared dimensions;
- `candidate_platonic_agent()` — the current non-exhaustive candidate envelope.

The module is import-only in this slice. Existing runtime lifecycle, ZFAE definitions, spawn/merge behavior, persistence, privacy, and provider routing are unchanged.

## Usage guidance

Add a candidate distinction before projecting through it:

```python
from python.agents import AgentDimension, candidate_platonic_agent

envelope = candidate_platonic_agent().extend(
    AgentDimension(
        "social_role",
        "instance-specific social or institutional role",
        status="candidate",
    )
)

projection = envelope.project(
    {
        "identity": {"definition_id": "..."},
        "social_role": {"role": "mediator"},
    }
)
```

Do not use `extend(...)` to smuggle a semantic decision into code. Establish the domain-qualified meaning first; then add the dimension. Unknown meaning remains `hmmm`.

## Validation

Focused contracts require that:

1. extension is persistent and non-mutating;
2. projections expose selections, omissions, and unresolved dimensions;
3. undeclared dimensions fail closed;
4. inference alone never implies identity.

## hmmm

- What dimensions belong in the maximal object that are not yet legible to us?
- Is every property itself best represented as a UCNS object, and if so, under what semantic authorization?
- What is the exact projection relation from this envelope to versioned `AgentDefinition` fields?
- Which transformations preserve one agent, create a fork, or terminate identity?
- Which dimensions are universal to agency versus merely available to some projections?
