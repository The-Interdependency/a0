# 121:44 0:0 0:0
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Iterable, Mapping

# === MODULE_BUILD ===
# id: platonic_agent_envelope
#   module_name: platonic
#   module_kind: schema
#   summary: represents an open maximal agent envelope and explicit bounded projections without defining inference as agent identity
#   owner: Erin Spencer
#   public_surface: AgentDimension, AgentProjection, PlatonicAgentEnvelope, candidate_platonic_agent
#   internal_surface: _ordered_unique
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_platonic_agent.py
#   rollout: import-only; no runtime agent lifecycle path changes
#   rollback: remove exports and this module; existing agent definitions remain unchanged
#   unresolved: exhaustive dimension set, UCNS representation of dimensions, projection-to-AgentDefinition policy
# === END MODULE_BUILD ===
#
# === CONTRACTS ===
# id: platonic_agent_open_extension
#   given: a declared envelope and a new non-colliding dimension
#   then: extension returns a new envelope while preserving the original
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
#   given: an envelope containing distinct identity and inference dimensions
#   then: projecting inference alone does not implicitly select or synthesize identity
#   class: boundary
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
    """One independently addressable dimension of the maximal agent envelope."""

    name: str
    description: str
    status: str = "candidate"
    authority: str = "a0"
    hmmm: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.name or not self.name.replace("_", "").isalnum():
            raise ValueError("dimension name must be non-empty snake-like text")
        if self.status not in _VALID_STATUSES:
            raise ValueError(f"unsupported dimension status: {self.status}")
        if not self.description:
            raise ValueError("dimension description is required")


@dataclass(frozen=True, slots=True)
class AgentProjection:
    """A bounded realization request from a PlatonicAgentEnvelope."""

    envelope_id: str
    bindings: Mapping[str, Any]
    selected: tuple[str, ...]
    omitted: tuple[str, ...]
    unresolved: tuple[str, ...]

    def __post_init__(self) -> None:
        object.__setattr__(self, "bindings", MappingProxyType(dict(self.bindings)))

    def as_dict(self) -> dict[str, Any]:
        return dict(self.bindings)


@dataclass(frozen=True, slots=True)
class PlatonicAgentEnvelope:
    """Open maximal envelope; no finite dimension list is claimed exhaustive."""

    envelope_id: str
    dimensions: tuple[AgentDimension, ...] = ()
    hmmm: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if not self.envelope_id:
            raise ValueError("envelope_id is required")
        names = tuple(d.name for d in self.dimensions)
        if len(names) != len(set(names)):
            raise ValueError("dimension names must be unique")

    @property
    def dimension_names(self) -> tuple[str, ...]:
        return tuple(d.name for d in self.dimensions)

    def dimension(self, name: str) -> AgentDimension:
        for dimension in self.dimensions:
            if dimension.name == name:
                return dimension
        raise KeyError(name)

    def extend(self, *dimensions: AgentDimension) -> "PlatonicAgentEnvelope":
        existing = set(self.dimension_names)
        incoming = [dimension.name for dimension in dimensions]
        collisions = existing.intersection(incoming)
        if collisions or len(incoming) != len(set(incoming)):
            names = ", ".join(sorted(collisions or {n for n in incoming if incoming.count(n) > 1}))
            raise ValueError(f"dimension already declared: {names}")
        return PlatonicAgentEnvelope(
            envelope_id=self.envelope_id,
            dimensions=self.dimensions + tuple(dimensions),
            hmmm=self.hmmm,
        )

    def project(
        self,
        bindings: Mapping[str, Any],
        *,
        selected: Iterable[str] | None = None,
    ) -> AgentProjection:
        declared = self.dimension_names
        selected_names = _ordered_unique(selected if selected is not None else bindings.keys())
        unknown = [name for name in _ordered_unique((*selected_names, *bindings.keys())) if name not in declared]
        if unknown:
            raise ValueError(f"undeclared dimension(s): {', '.join(unknown)}")

        missing_bindings = [name for name in selected_names if name not in bindings]
        unresolved = tuple(
            name
            for name in selected_names
            if name in missing_bindings or self.dimension(name).status == "hmmm"
        )
        selected_bindings = {name: bindings[name] for name in selected_names if name in bindings}
        omitted = tuple(name for name in declared if name not in selected_names)
        return AgentProjection(
            envelope_id=self.envelope_id,
            bindings=selected_bindings,
            selected=selected_names,
            omitted=omitted,
            unresolved=unresolved,
        )


def candidate_platonic_agent() -> PlatonicAgentEnvelope:
    """Return the current open candidate envelope; these dimensions are not exhaustive."""

    dimensions = (
        AgentDimension("identity", "who or what is addressed as the agent"),
        AgentDimension("boundaries", "constraints governing the agent's permitted transformations"),
        AgentDimension("memory", "state carried or reconstructed across transformations"),
        AgentDimension("perception", "ways the agent can receive distinctions from an environment"),
        AgentDimension("action", "ways the agent can alter an environment or its own state"),
        AgentDimension("goals", "directional or evaluative constraints on possible transformations"),
        AgentDimension("relations", "agent-to-self, agent-to-other, and agent-to-environment relations"),
        AgentDimension("inference", "processes or events that transform registered distinctions into further distinctions"),
        AgentDimension("provenance", "origin and lineage of state, claims, actions, and transformations"),
        AgentDimension("state_transition", "rules and history of change between agent states"),
        AgentDimension("embodiment", "substrate or interface through which an instance is realized"),
        AgentDimension("tools", "bounded external capabilities available to an instance"),
        AgentDimension("uncertainty", "represented unresolved constraints and confidence limits"),
    )
    return PlatonicAgentEnvelope(
        envelope_id="a0.agent.platonic",
        dimensions=dimensions,
        hmmm=(
            "the dimension set is deliberately open and not claimed exhaustive",
            "whether each dimension should later be represented as a UCNS object",
            "the exact projection contract from this envelope into durable AgentDefinition revisions",
            "which transformations preserve or fork agent identity",
        ),
    )
# 121:44 0:0 0:0
