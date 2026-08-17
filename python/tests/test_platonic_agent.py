# 113:73 0:0 0:0
# === CHECKS ===
# id: check_platonic_agent_open_extension
#   proves: platonic_agent_open_extension
#   call: self::test_extension_preserves_original_agent
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_projection_explicit
#   proves: platonic_agent_projection_explicit
#   call: self::test_projection_exposes_selected_omitted_and_unresolved
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_unknown_dimension_fails_closed
#   proves: platonic_agent_unknown_dimension_fails_closed
#   call: self::test_unknown_dimension_fails_closed
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_inference_not_identity
#   proves: platonic_agent_inference_not_identity
#   call: self::test_inference_projection_does_not_create_identity
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_region_subsumption
#   proves: platonic_agent_region_subsumption
#   call: self::test_region_subsumption_preserves_original_agent
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_region_dimensions_fail_closed
#   proves: platonic_agent_region_dimensions_fail_closed
#   call: self::test_region_cannot_reference_undeclared_dimension
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_existing_separations_preserved
#   proves: platonic_agent_existing_separations_preserved
#   call: self::test_subsumption_preserves_existing_noncollapse_boundaries
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_existing_surfaces_subsumed
#   proves: platonic_agent_existing_surfaces_subsumed
#   call: self::test_existing_agent_semantic_surfaces_have_regions
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_region_projection_explicit
#   proves: platonic_agent_region_projection_explicit
#   call: self::test_region_projection_exposes_incomplete_realization
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===

from __future__ import annotations

import pytest

from python.agents.platonic import (
    AgentDimension,
    AgentSemanticRegion,
    PlatonicAgent,
    candidate_platonic_agent,
)


def test_extension_preserves_original_agent() -> None:
    base = candidate_platonic_agent()
    extended = base.extend(
        AgentDimension(
            "social_role",
            "instance-specific social or institutional role",
        )
    )

    assert "social_role" not in base.dimension_names
    assert extended.dimension_names == (*base.dimension_names, "social_role")
    assert extended.region_names == base.region_names


def test_projection_exposes_selected_omitted_and_unresolved() -> None:
    agent = candidate_platonic_agent()
    projection = agent.project(
        {
            "identity": {"definition_id": "def-1"},
            "inference": {"kind": "zfae"},
        },
        selected=("identity", "inference", "memory"),
    )

    assert projection.selected == ("identity", "inference", "memory")
    assert projection.as_dict() == {
        "identity": {"definition_id": "def-1"},
        "inference": {"kind": "zfae"},
    }
    assert projection.unresolved == ("memory",)
    assert "boundaries" in projection.omitted
    assert projection.region is None


def test_unknown_dimension_fails_closed() -> None:
    agent = candidate_platonic_agent()

    with pytest.raises(ValueError, match="undeclared dimension"):
        agent.project({"telepathy": True})


def test_inference_projection_does_not_create_identity() -> None:
    agent = candidate_platonic_agent()
    projection = agent.project({"inference": {"kind": "zfae"}})

    assert projection.selected == ("inference",)
    assert "identity" in projection.omitted
    assert "identity" not in projection.bindings


def test_region_subsumption_preserves_original_agent() -> None:
    base = PlatonicAgent(
        agent_id="test.agent",
        dimensions=(AgentDimension("identity", "addressable identity"),),
    )
    region = AgentSemanticRegion(
        "definition",
        "durable declaration",
        ("identity",),
        ("AgentDefinition",),
    )

    subsumed = base.subsume(region)

    assert base.region_names == ()
    assert subsumed.region_names == ("definition",)
    assert subsumed.region("definition") == region


def test_region_cannot_reference_undeclared_dimension() -> None:
    region = AgentSemanticRegion(
        "invalid",
        "invalid semantic mapping",
        ("memory",),
        ("InvalidSurface",),
    )

    with pytest.raises(ValueError, match="undeclared dimension"):
        PlatonicAgent(
            agent_id="test.agent",
            dimensions=(AgentDimension("identity", "addressable identity"),),
            regions=(region,),
        )


def test_subsumption_preserves_existing_noncollapse_boundaries() -> None:
    agent = candidate_platonic_agent()

    assert "memory" not in agent.region("ptcna_runtime_state").dimensions
    assert "memory" not in agent.region("run_artifacts").dimensions
    assert "identity" not in agent.region("zfae_inference_binding").dimensions
    assert "identity" not in agent.region("provider_relation").dimensions
    assert "PTCNASnapshot" in agent.region("ptcna_runtime_state").surfaces
    assert "MemoryEvent" in agent.region("semantic_memory").surfaces


def test_existing_agent_semantic_surfaces_have_regions() -> None:
    agent = candidate_platonic_agent()
    expected = {
        "AgentDefinition": "definition",
        "AgentInstance": "instance",
        "AgentRun": "run",
        "MemoryEvent": "semantic_memory",
        "PTCNASnapshot": "ptcna_runtime_state",
        "RunArtifact": "run_artifacts",
        "ZFAE": "zfae_inference_binding",
        "EnergyProvider": "provider_relation",
        "MemoryProjection": "privacy_projection",
        "SpawnOperation": "spawn_merge",
        "MatchProposal": "resource_need_matching",
    }

    for surface, region_name in expected.items():
        assert tuple(region.name for region in agent.regions_for_surface(surface)) == (
            region_name,
        )


def test_region_projection_exposes_incomplete_realization() -> None:
    agent = candidate_platonic_agent()
    projection = agent.project_region(
        "definition",
        {"identity": {"definition_id": "def-1"}},
    )

    assert projection.region == "definition"
    assert projection.selected == agent.region("definition").dimensions
    assert projection.as_dict() == {"identity": {"definition_id": "def-1"}}
    assert "boundaries" in projection.unresolved
    assert "memory" in projection.unresolved
    assert "embodiment" in projection.omitted
# 113:73 0:0 0:0
