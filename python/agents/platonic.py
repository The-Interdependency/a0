# 237:60 0:0 2:1
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Iterable, Mapping

# === MODULE_BUILD ===
# id: platonic_agent_object
#   module_name: platonic
#   module_kind: schema
#   summary: represents an open maximal agent object that subsumes existing a0 agent semantics as explicit regions and bounded projections
#   owner: Erin Spencer
#   public_surface: AgentDimension, AgentSemanticRegion, AgentProjection, PlatonicAgent, candidate_platonic_agent
#   internal_surface: _ordered_unique
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_platonic_agent.py
#   rollout: import-only semantic subsumption map; runtime storage, lifecycle, privacy, provider, and inference behavior remain unchanged
#   rollback: remove the region map and exports; existing runtime semantics remain intact
#   unresolved: exhaustive dimension set, exhaustive region map, UCNS representation, durable realization serialization, identity continuity
# === END MODULE_BUILD ===
#
# === CONTRACTS ===
# id: platonic_agent_open_extension
#   given: a declared Platonic Agent and a new non-colliding dimension
#   then: extension returns a new Platonic Agent while preserving the original
#   class: correctness
#
# id: platonic_agent_projection_explicit
#   given: a projection request over declared dimensions
#   then: selected, omitted, and unresolved dimensions remain explicit and ordered
#   class: correctness
#
# id: platonic_agent_unknown_dimension_fails_closed
#   given: a projection binding for an undeclared dimension
#   then: projection raises ValueError instead of silently inventing semantics
#   class: boundary
#
# id: platonic_agent_inference_not_identity
#   given: a Platonic Agent containing distinct identity and inference dimensions
#   then: projecting inference alone does not implicitly select or synthesize identity
#   class: boundary
#
# id: platonic_agent_region_subsumption
#   given: an existing a0 agent semantic surface mapped as a non-colliding region
#   then: subsumption returns a new Platonic Agent containing that region while preserving the original
#   class: correctness
#
# id: platonic_agent_region_dimensions_fail_closed
#   given: a semantic region references a dimension the Platonic Agent does not declare
#   then: construction fails instead of silently widening the agent ontology
#   class: boundary
#
# id: platonic_agent_region_projection_explicit
#   given: a declared semantic region and a partial set of bindings
#   then: projection selects that region's declared dimensions and exposes every missing binding as unresolved
#   class: correctness
# === END CONTRACTS ===

_VALID_STATUSES = frozenset({"candidate", "declared", "hmmm"})


def _ordered_unique(values: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return tuple(ordered)


@dataclass(frozen=True, slots=True)
class AgentDimension:
    """One independently addressable dimension of the maximal agent object."""

    name: str
    description: str
    status: str = "candidate"
    hmmm: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.name or not self.name.replace("_", "").isalnum():
            raise ValueError("dimension name must be non-empty snake-like text")
        if self.status not in _VALID_STATUSES:
            raise ValueError(f"unsupported dimension status: {self.status}")
        if not self.description:
            raise ValueError("dimension description is required")


@dataclass(frozen=True, slots=True)
class AgentSemanticRegion:
    """A named, already-legible region of agent semantics inside PlatonicAgent."""

    name: str
    description: str
    dimensions: tuple[str, ...]
    surfaces: tuple[str, ...]
    status: str = "declared"
    hmmm: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.name or not self.name.replace("_", "").isalnum():
            raise ValueError("region name must be non-empty snake-like text")
        if self.status not in _VALID_STATUSES:
            raise ValueError(f"unsupported region status: {self.status}")
        if not self.description:
            raise ValueError("region description is required")
        if not self.dimensions:
            raise ValueError("region must name at least one agent dimension")
        if len(self.dimensions) != len(set(self.dimensions)):
            raise ValueError("region dimensions must be unique")
        if not self.surfaces:
            raise ValueError("region must name at least one existing or conceptual surface")


@dataclass(frozen=True, slots=True)
class AgentProjection:
    """A bounded realization request from a PlatonicAgent."""

    agent_id: str
    bindings: Mapping[str, Any]
    selected: tuple[str, ...]
    omitted: tuple[str, ...]
    unresolved: tuple[str, ...]
    region: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "bindings", MappingProxyType(dict(self.bindings)))

    def as_dict(self) -> dict[str, Any]:
        return dict(self.bindings)


@dataclass(frozen=True, slots=True)
class PlatonicAgent:
    """Open maximal agent object; current dimensions and regions are not exhaustive."""

    agent_id: str
    dimensions: tuple[AgentDimension, ...] = ()
    regions: tuple[AgentSemanticRegion, ...] = ()
    hmmm: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.agent_id:
            raise ValueError("agent_id is required")
        names = tuple(d.name for d in self.dimensions)
        if len(names) != len(set(names)):
            raise ValueError("dimension names must be unique")
        region_names = tuple(region.name for region in self.regions)
        if len(region_names) != len(set(region_names)):
            raise ValueError("region names must be unique")
        declared = set(names)
        for region in self.regions:
            unknown = [name for name in region.dimensions if name not in declared]
            if unknown:
                raise ValueError(
                    f"region {region.name} references undeclared dimension(s): "
                    f"{', '.join(unknown)}"
                )

    @property
    def dimension_names(self) -> tuple[str, ...]:
        return tuple(d.name for d in self.dimensions)

    @property
    def region_names(self) -> tuple[str, ...]:
        return tuple(region.name for region in self.regions)

    def dimension(self, name: str) -> AgentDimension:
        for dimension in self.dimensions:
            if dimension.name == name:
                return dimension
        raise KeyError(name)

    def region(self, name: str) -> AgentSemanticRegion:
        for region in self.regions:
            if region.name == name:
                return region
        raise KeyError(name)

    def regions_for_surface(self, surface: str) -> tuple[AgentSemanticRegion, ...]:
        return tuple(region for region in self.regions if surface in region.surfaces)

    def extend(self, *dimensions: AgentDimension) -> "PlatonicAgent":
        existing = set(self.dimension_names)
        incoming = [dimension.name for dimension in dimensions]
        collisions = existing.intersection(incoming)
        if collisions or len(incoming) != len(set(incoming)):
            duplicate = {name for name in incoming if incoming.count(name) > 1}
            names = ", ".join(sorted(collisions or duplicate))
            raise ValueError(f"dimension already declared: {names}")
        return PlatonicAgent(
            agent_id=self.agent_id,
            dimensions=self.dimensions + tuple(dimensions),
            regions=self.regions,
            hmmm=self.hmmm,
        )

    def subsume(self, *regions: AgentSemanticRegion) -> "PlatonicAgent":
        existing = set(self.region_names)
        incoming = [region.name for region in regions]
        collisions = existing.intersection(incoming)
        if collisions or len(incoming) != len(set(incoming)):
            duplicate = {name for name in incoming if incoming.count(name) > 1}
            names = ", ".join(sorted(collisions or duplicate))
            raise ValueError(f"region already declared: {names}")
        return PlatonicAgent(
            agent_id=self.agent_id,
            dimensions=self.dimensions,
            regions=self.regions + tuple(regions),
            hmmm=self.hmmm,
        )

    def project(
        self,
        bindings: Mapping[str, Any],
        *,
        selected: Iterable[str] | None = None,
        region: str | None = None,
    ) -> AgentProjection:
        declared = self.dimension_names
        selected_names = _ordered_unique(selected if selected is not None else bindings.keys())
        unknown = [
            name
            for name in _ordered_unique((*selected_names, *bindings.keys()))
            if name not in declared
        ]
        if unknown:
            raise ValueError(f"undeclared dimension(s): {', '.join(unknown)}")

        missing_bindings = [name for name in selected_names if name not in bindings]
        unresolved = tuple(
            name
            for name in selected_names
            if name in missing_bindings or self.dimension(name).status == "hmmm"
        )
        selected_bindings = {
            name: bindings[name] for name in selected_names if name in bindings
        }
        omitted = tuple(name for name in declared if name not in selected_names)
        return AgentProjection(
            agent_id=self.agent_id,
            bindings=selected_bindings,
            selected=selected_names,
            omitted=omitted,
            unresolved=unresolved,
            region=region,
        )

    def project_region(
        self,
        name: str,
        bindings: Mapping[str, Any],
    ) -> AgentProjection:
        region = self.region(name)
        return self.project(bindings, selected=region.dimensions, region=region.name)


def candidate_platonic_agent() -> PlatonicAgent:
    """Return the current open candidate object with known a0 semantics subsumed."""

    from .platonic_regions import current_a0_agent_regions

    dimensions = (
        AgentDimension(
            "identity",
            "distinct identifiers and continuity claims for an agent, definition, instance, run, or role without collapsing those identities",
        ),
        AgentDimension(
            "boundaries",
            "constraints governing permitted transformations, access, disclosure, and actuation",
        ),
        AgentDimension(
            "memory",
            "state carried, acquired, revised, projected, or reconstructed across transformations",
        ),
        AgentDimension(
            "perception",
            "ways the agent can receive distinctions from an environment or other object",
        ),
        AgentDimension(
            "action",
            "ways the agent can alter an environment, relation, or its own state",
        ),
        AgentDimension(
            "goals",
            "directional, evaluative, or task constraints on possible transformations",
        ),
        AgentDimension(
            "relations",
            "agent-to-self, agent-to-other, agent-to-provider, and agent-to-environment relations",
        ),
        AgentDimension(
            "inference",
            "processes or events that transform registered distinctions into further distinctions",
        ),
        AgentDimension(
            "provenance",
            "origin and lineage of state, claims, actions, projections, and transformations",
        ),
        AgentDimension(
            "state_transition",
            "rules and history of change, branching, merging, retirement, and continuation",
        ),
        AgentDimension(
            "embodiment",
            "substrate, state engine, or interface through which an instance is realized",
        ),
        AgentDimension(
            "tools",
            "bounded external capabilities available to a realization",
        ),
        AgentDimension(
            "uncertainty",
            "represented unresolved constraints, epistemic standing, confidence limits, and hmmm",
        ),
    )
    agent = PlatonicAgent(
        agent_id="a0.agent.platonic",
        dimensions=dimensions,
        hmmm=(
            "the dimension set is deliberately open and not claimed exhaustive",
            "the semantic-region map begins with existing a0 semantics and is not claimed exhaustive",
            "whether each dimension or region should later be represented as a UCNS object",
            "the exact serialization of region projections into durable runtime records",
            "which transformations preserve one agent, create a fork, or terminate identity",
        ),
    )
    return agent.subsume(*current_a0_agent_regions())
# 237:60 0:0 2:1
