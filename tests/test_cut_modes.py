# N:M
# DOC module: tests.test_cut_modes
# DOC label: Cut-mode filter
# DOC description: Verifies tools_for_cut_mode produces the right tool subset
# for off / soft / hard, including the soft-block side-effect intersection.
import pytest

from python.services.cut_modes import tools_for_cut_mode, names_in


def _t(name: str) -> dict:
    return {"type": "function", "function": {"name": name, "description": ""}}


SIDE_EFFECTS = {
    "image_generate": {"billing", "external_account"},
    "github_write_file": {"external_account", "irreversible"},
    "bash_run": {"filesystem", "irreversible"},
    "skill_load": set(),
    "pcna_introspect": set(),
    "sub_agent_spawn": set(),
    "sub_agent_merge": set(),
}

ALL = [_t(n) for n in SIDE_EFFECTS]


def test_off_returns_all():
    out = tools_for_cut_mode("off", ALL, side_effects_index=SIDE_EFFECTS)
    assert names_in(out) == list(SIDE_EFFECTS)


def test_hard_only_two():
    out = tools_for_cut_mode("hard", ALL, side_effects_index=SIDE_EFFECTS)
    assert sorted(names_in(out)) == ["sub_agent_merge", "sub_agent_spawn"]


def test_soft_excludes_billing_and_irreversible():
    out = tools_for_cut_mode("soft", ALL, side_effects_index=SIDE_EFFECTS)
    names = set(names_in(out))
    assert "image_generate" not in names
    assert "github_write_file" not in names
    assert "bash_run" not in names
    assert "skill_load" in names
    assert "pcna_introspect" in names
    assert "sub_agent_spawn" in names


def test_invalid_mode_raises():
    with pytest.raises(ValueError):
        tools_for_cut_mode("nuclear", ALL, side_effects_index=SIDE_EFFECTS)
# N:M
