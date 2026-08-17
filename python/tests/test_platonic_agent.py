# 35:33 0:0 0:0
# === CHECKS ===
# id: check_platonic_agent_open_extension
#   proves: platonic_agent_open_extension
#   call: self::test_extension_is_persistent_and_non_mutating
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_platonic_agent_projection_explicit
#   proves: platonic_agent_projection_explicit
#   call: self::test_projection_records_selected_omitted_and_unresolved
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
#   call: self::test_inference_projection_does_not_imply_identity
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import pytest

from python.agents.platonic import AgentDimension, candidate_platonic_agent


def test_extension_is_persistent_and_non_mutating() -> None:
    base = candidate_platonic_agent()
    extended = base.extend(
        AgentDimension("social_role", "instance-specific social or institutional role")
    )
    assert "social_role" not in base.dimension_names
    assert extended.dimension_names[:-1] == base.dimension_names
    assert extended.dimension_names[-1] == "social_role"


def test_projection_records_selected_omitted_and_unresolved() -> None:
    envelope = candidate_platonic_agent().extend(
        AgentDimension("future_dimension", "not yet resolved", status="hmmm")
    )
    projection = envelope.project(
        {"identity": {"id": "agent-1"}, "inference": {"kind": "zfae"}},
        selected=("identity", "inference", "future_dimension"),
    )
    assert projection.selected == ("identity", "inference", "future_dimension")
    assert projection.unresolved == ("future_dimension",)
    assert "memory" in projection.omitted
    assert projection.as_dict() == {
        "identity": {"id": "agent-1"},
        "inference": {"kind": "zfae"},
    }


def test_unknown_dimension_fails_closed() -> None:
    envelope = candidate_platonic_agent()
    with pytest.raises(ValueError, match="undeclared dimension"):
        envelope.project({"telepathy": True})


def test_inference_projection_does_not_imply_identity() -> None:
    envelope = candidate_platonic_agent()
    projection = envelope.project({"inference": {"kind": "zfae"}})
    assert projection.selected == ("inference",)
    assert "identity" in projection.omitted
    assert "identity" not in projection.bindings
# 35:33 0:0 0:0
