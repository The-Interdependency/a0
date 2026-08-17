# Platonic Agent

Status: **PROVISIONAL architecture concept with executable subsumption mechanics**. The object is intentionally open; neither the present dimensions nor the present semantic-region map are claimed exhaustive, metaphysically established, or empirically validated.

## Domain claim

```yaml
surface_form: Platonic Agent
term_id: a0.agent.platonic
claiming_domain: a0 agent architecture
claimed_sense: the open maximal relational agent object that subsumes presently legible a0 agent semantics as distinct regions and permits bounded projections or realizations of those regions
scope: a0 agent specification, definition, instantiation, runtime, memory, inference, provider, privacy, lifecycle, and matching semantics
claim_type: specialized
status: provisional
authority_source: maintainer direction plus source-backed a0 agent/runtime semantics
included_uses:
  - representing candidate dimensions an agent may possess or relate through
  - subsuming existing AgentDefinition, AgentInstance, AgentRun, memory, runtime-state, artifact, inference, provider, privacy, spawn/merge, and resource-matching semantics without collapsing them
  - recording what a bounded projection selects, omits, or leaves unresolved
  - extending dimensions or semantic regions without declaring the current map exhaustive
excluded_uses:
  - a claim that Plato's metaphysics is literally implemented
  - a synonym for ZFAE, PTCNA, PCEA, a model provider, or any single runtime surface
  - a claim that one semantic region is the whole agent
  - a proof that the candidate dimensions or current region memberships are necessary or sufficient for agency
neighboring_terms:
  - AgentDefinition
  - AgentInstance
  - AgentRun
  - semantic memory
  - PTCNA runtime state
  - ZFAE inference event
known_collisions:
  - philosophical uses of Platonic form
unresolved:
  - exhaustive dimension set
  - exhaustive semantic-region map
  - exact durable serialization of region projections
  - which transformations preserve, fork, or terminate agent identity
```

|∆|The term names a construction direction: maximal agent object first, bounded realization second. It does not import a philosophical ontology as evidence.|∆|

## Subsumption, not hierarchy

The earlier first-slice wording that the Platonic Agent "sits above" existing agent semantics is superseded.

The stronger relation is:

```text
existing a0 agent semantics ⊂ PlatonicAgent
```

`AgentDefinition`, `AgentInstance`, `AgentRun`, semantic memory, PTCNA runtime-state binding, run artifacts, ZFAE inference binding, provider relation, privacy projection, spawn/merge, and resource↔need matching are **already-legible regions inside the Platonic Agent**.

They remain distinct because subsumption is not collapse.

```text
PlatonicAgent
├── definition             -> AgentDefinition / DefinitionRevision / CharacterSheet
├── instance               -> AgentInstance / RuntimeIncarnation
├── run                    -> AgentRun / RunLineage
├── semantic_memory        -> MemoryEvent / MemoryBranch
├── ptcna_runtime_state    -> PTCNAState / PTCNASnapshot
├── run_artifacts          -> prompt / response / tool / usage / checker evidence
├── zfae_inference_binding -> a0-side realization of ZFAE inference
├── provider_relation      -> bounded computational-energy provider relation
├── privacy_projection     -> read / project / process / disclose / audit semantics
├── spawn_merge            -> branching and convergence with separate merge authorities
└── resource_need_matching -> candidate match / consent / introduction / disclosure
```

The backend foundation's existing sequence:

```text
AgentDefinition -> AgentInstance -> PTCNA state + Memory branch + AgentRun lineage
```

remains an operational relationship among realized regions. It is **not** a second agent ontology outside the Platonic Agent.

## Distinctions preserved under subsumption

The following existing a0 constraints remain load-bearing:

```text
Definition identity != instance identity != run identity
PTCNA runtime state != semantic memory
run artifact != semantic memory
ZFAE inference event != agent identity
provider/model != agent identity
knowledge != disclosure authority
PTCNA state merge != semantic-memory merge authority
runtime integration != producer semantic authority
```

The executable map makes several of these structural:

- `ptcna_runtime_state` does not contain the `memory` dimension;
- `run_artifacts` does not contain the `memory` dimension;
- `zfae_inference_binding` does not contain the `identity` dimension;
- `provider_relation` does not contain the `identity` dimension.

These exclusions protect the existing semantics while the larger object grows.

## ZFAE boundary

`inference` remains one candidate dimension of the Platonic Agent. ZFAE owns the conceptual specification of the inference/self-awareness event used by a0; a0 owns the whole-agent object and its a0-side binding to that producer-owned event.

Therefore:

```text
ZFAE semantics ⊂ inference region ⊂ PlatonicAgent
```

without implying:

```text
ZFAE == PlatonicAgent
```

or transferring ZFAE conceptual authority into a0.

## Current candidate dimensions

The executable object currently names:

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

These are candidate distinctions, not a closed ontology. `PlatonicAgent.extend(...)` adds a newly legible dimension without mutating prior objects. `PlatonicAgent.subsume(...)` adds a semantic region only when that region's dimensions are already declared; an undeclared dimension fails closed.

## Projection and realization

Projection now means selecting or realizing distinctions **already contained in the Platonic Agent**, not translating between separate ontologies.

A direct dimension projection remains valid:

```python
from python.agents import candidate_platonic_agent

agent = candidate_platonic_agent()
projection = agent.project({"inference": {"kind": "zfae"}})

assert projection.selected == ("inference",)
assert "identity" in projection.omitted
```

A known semantic region can be projected explicitly:

```python
projection = agent.project_region(
    "definition",
    {"identity": {"definition_id": "def-1"}},
)

assert projection.region == "definition"
assert "memory" in projection.unresolved
```

That projection is visibly incomplete rather than being treated as a complete agent merely because one runtime record can be created.

## Direction of investigation

The methodological direction remains intentionally opposite the Tarot investigation:

```text
Tarot: observed cards / corpus -> reconstruct a maximal card object

a0:    maximal agent object -> project bounded operational realizations
```

Tarot is the reverse methodological probe, not an a0 runtime dependency and not a Tarot application.

## Executable contract

`python/agents/platonic.py` owns the maximal-object mechanics:

- `AgentDimension` — independently addressable candidate dimension;
- `AgentSemanticRegion` — named integrated region of already-legible agent semantics;
- `PlatonicAgent` — immutable, open maximal candidate object;
- `extend(...)` — adds dimensions without mutating the prior object;
- `subsume(...)` — adds semantic regions without mutating the prior object;
- `project(...)` — direct bounded projection with explicit selected/omitted/unresolved dimensions;
- `project_region(...)` — region realization with unresolved bindings exposed;
- `regions_for_surface(...)` — recovers which Platonic-Agent region contains a known a0 semantic surface;
- fail-closed behavior for undeclared dimensions and invalid region mappings.

`python/agents/platonic_regions.py` owns the current mapping of pre-existing a0 semantics into the Platonic Agent. Keeping this map separate from the core object prevents the present implementation inventory from being mistaken for the maximal object's final shape.

No storage schema, runtime lifecycle, ZFAE execution, provider routing, privacy policy, PTCNA behavior, or merge operation is changed by this subsumption slice.

## Usage guidance

To recover an existing semantic surface:

```python
from python.agents import candidate_platonic_agent

agent = candidate_platonic_agent()
regions = agent.regions_for_surface("AgentDefinition")
assert tuple(region.name for region in regions) == ("definition",)
```

To add a newly legible dimension, establish its domain-qualified meaning first and then call `extend(...)`. To add a newly recovered existing semantic cluster, use `subsume(...)` only after every named dimension is already part of the Platonic Agent. Unknown meaning remains `hmmm`; do not widen the object silently to make a mapping pass.

## Validation pressure

The first subsumption gate requires that:

1. existing semantic surfaces are recoverable as Platonic-Agent regions;
2. region addition is persistent and non-mutating;
3. regions cannot reference undeclared dimensions;
4. partial region projections expose incompletion;
5. PTCNA state, semantic memory, and run artifacts remain distinct;
6. ZFAE inference and provider relations do not acquire agent identity by subsumption.

Passing these contracts establishes only that the software representation preserves the declared distinctions. It does not establish that the present Platonic-Agent ontology is complete or true.

## hmmm

- What agent dimensions are not yet legible to us?
- What already-existing a0 semantics remain unmapped into the current region set?
- Is every property or region itself best represented as a UCNS object, and if so, under what semantic authorization?
- What is the exact durable serialization/realization contract for each region?
- Which region memberships are universal to agency versus contingent on an a0 realization?
- Which transformations preserve one agent, create a fork, or terminate identity?
