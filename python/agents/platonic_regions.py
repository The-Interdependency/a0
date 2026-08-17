# 198:39 0:0 1:1
"""Known a0 agent semantics subsumed by :class:`PlatonicAgent`.

Usage:
    from python.agents import candidate_platonic_agent

    agent = candidate_platonic_agent()
    definition = agent.region("definition")
    assert "AgentDefinition" in definition.surfaces

These mappings preserve existing distinctions; they do not replace runtime types or
transfer producer authority from ZFAE, PTCNA, or PCEA into a0.
"""

from __future__ import annotations

from .platonic import AgentSemanticRegion

# === MODULE_BUILD ===
# id: platonic_agent_regions
#   module_name: platonic_regions
#   module_kind: schema
#   summary: maps already-settled a0 agent semantics into named regions of the Platonic Agent without collapsing their existing boundaries
#   owner: Erin Spencer
#   public_surface: current_a0_agent_regions
#   internal_surface: _REGION_HMMM
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_platonic_agent.py
#   rollout: consumed by candidate_platonic_agent; no runtime behavior or persistence mutation
#   rollback: stop loading these region declarations; existing runtime surfaces remain unchanged
#   unresolved: exhaustive region set, final dimension membership per region, producer-to-region semantic adapters
# === END MODULE_BUILD ===
#
# === CONTRACTS ===
# id: platonic_agent_existing_separations_preserved
#   given: the current subsumed a0 semantic regions
#   then: PTCNA runtime state and run artifacts remain distinct from semantic memory and neither ZFAE inference nor provider relation becomes identity
#   class: boundary
# id: platonic_agent_existing_surfaces_subsumed
#   given: the settled a0 AgentDefinition, AgentInstance, AgentRun, memory, runtime-state, artifact, inference, provider, privacy, spawn/merge, and matching surfaces
#   then: each surface is addressable through a declared Platonic Agent semantic region
#   class: correctness
# === END CONTRACTS ===

_REGION_HMMM = (
    "dimension membership may refine without collapsing the named source semantics",
)


def current_a0_agent_regions() -> tuple[AgentSemanticRegion, ...]:
    """Return declared regions for existing a0 semantics; the set is not exhaustive."""

    return (
        AgentSemanticRegion(
            "definition",
            "durable owner-scoped declaration and versioned character-sheet semantics",
            (
                "identity",
                "boundaries",
                "goals",
                "inference",
                "memory",
                "tools",
                "relations",
                "provenance",
                "uncertainty",
            ),
            ("AgentDefinition", "DefinitionRevision", "CharacterSheet"),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "instance",
            "one runtime incarnation bound to a definition revision and runtime-state relation",
            (
                "identity",
                "boundaries",
                "inference",
                "memory",
                "state_transition",
                "embodiment",
                "provenance",
                "relations",
            ),
            ("AgentInstance", "RuntimeIncarnation"),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "run",
            "one bounded execution with lineage, context, inference, actions, and evidence",
            (
                "identity",
                "boundaries",
                "perception",
                "action",
                "goals",
                "inference",
                "tools",
                "memory",
                "provenance",
                "state_transition",
                "uncertainty",
                "relations",
            ),
            ("AgentRun", "RunLineage"),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "semantic_memory",
            "append-only source-bearing memory events, branches, promotion, privacy, and revision semantics",
            (
                "memory",
                "provenance",
                "boundaries",
                "uncertainty",
                "state_transition",
                "relations",
            ),
            ("SemanticMemory", "MemoryEvent", "MemoryBranch"),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "ptcna_runtime_state",
            "a0-side binding to producer-owned PTCNA runtime-state snapshots without absorbing PTCNA algebra",
            (
                "state_transition",
                "embodiment",
                "provenance",
                "relations",
                "boundaries",
            ),
            ("PTCNAState", "PTCNASnapshot"),
            hmmm=(
                *_REGION_HMMM,
                "PTCNA semantics remain producer-owned; this region subsumes only a0's agent-side binding",
            ),
        ),
        AgentSemanticRegion(
            "run_artifacts",
            "prompts, responses, tool calls, usage, checker findings, and outputs that remain evidence rather than automatic memory",
            (
                "perception",
                "action",
                "tools",
                "inference",
                "provenance",
                "state_transition",
                "uncertainty",
                "boundaries",
            ),
            (
                "RunArtifact",
                "Prompt",
                "Response",
                "ToolCall",
                "UsageRecord",
                "CheckerFinding",
            ),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "zfae_inference_binding",
            "a0-side realization of the inference dimension using the producer-owned ZFAE inference/self-awareness event",
            (
                "inference",
                "relations",
                "state_transition",
                "provenance",
                "boundaries",
                "uncertainty",
            ),
            ("ZFAE", "ZFAE_AGENT_DEF", "inference_event"),
            hmmm=(
                *_REGION_HMMM,
                "ZFAE conceptual authority remains in The-Interdependency/zfae",
            ),
        ),
        AgentSemanticRegion(
            "provider_relation",
            "bounded relation through which a model/provider supplies computational energy to inference without becoming agent identity",
            ("relations", "inference", "provenance", "boundaries"),
            ("EnergyProvider", "ModelProvider", "ProviderRouting"),
            hmmm=_REGION_HMMM,
        ),
        AgentSemanticRegion(
            "privacy_projection",
            "memory read, minimum-necessary projection, provider processing, disclosure, and audit constraints",
            (
                "boundaries",
                "memory",
                "relations",
                "provenance",
                "uncertainty",
                "action",
            ),
            (
                "Guardian/PCEA",
                "MemoryProjection",
                "AccessEvent",
                "DisclosureDecision",
            ),
            hmmm=(
                *_REGION_HMMM,
                "PCEA/Guardian primitive semantics remain producer-owned",
            ),
        ),
        AgentSemanticRegion(
            "spawn_merge",
            "branching and convergence semantics with distinct identity, runtime-state, memory, privacy, and audit decisions",
            (
                "identity",
                "state_transition",
                "memory",
                "provenance",
                "relations",
                "boundaries",
            ),
            ("SpawnOperation", "MergeOperation", "SubAgent"),
            hmmm=(
                *_REGION_HMMM,
                "PTCNA state merge does not authorize semantic-memory merge",
            ),
        ),
        AgentSemanticRegion(
            "resource_need_matching",
            "private resource/need candidate generation, consent-bearing introduction, and bounded disclosure",
            (
                "goals",
                "relations",
                "memory",
                "boundaries",
                "action",
                "provenance",
                "uncertainty",
            ),
            (
                "ResourceOffer",
                "NeedRequest",
                "MatchProposal",
                "IntroductionConsent",
                "Introduction",
            ),
            hmmm=_REGION_HMMM,
        ),
    )
# 198:39 0:0 1:1
