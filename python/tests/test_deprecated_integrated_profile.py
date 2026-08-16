from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_deprecated_profile_has_no_archived_or_moving_org_dependency() -> None:
    pyproject = (ROOT / "pyproject.toml").read_text(encoding="utf-8")

    assert "edcmbone>=" not in pyproject
    assert "The-Interdependency/interdependent-lib.git@main" not in pyproject
    assert "The-Interdependency/PCEA.git@main" not in pyproject
    assert "PCEA.git@2896194d2de52ce8666ea288ec9e820d0498d119" in pyproject


def test_deprecation_names_bounded_replacement_and_hmmm() -> None:
    record = (ROOT / "DEPRECATION.md").read_text(encoding="utf-8")

    assert "**DEPRECATED**" in record
    assert "a0-betatest" in record
    assert "No feature-equivalence claim transfers" in record
    assert "## hmmm" in record
