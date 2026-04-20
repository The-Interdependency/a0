# 43:5
# DOC module: tests.test_skills
# DOC label: Skill subsystem
# DOC description: Smoke tests for the a0-native skill loader, manifest
# rendering, recommend ranking, and load-by-name. Catches regressions in
# the cache-stable manifest used by the doctrine prefix.
import pytest

from python.services.tool_executor import (
    _discover_a0_skills,
    get_a0_skill_manifest,
    get_a0_skill_body,
    _skill_recommend,
    _skill_load,
    TOOL_SCHEMAS_CHAT,
)


def test_discovers_at_least_four_a0_skills():
    specs = _discover_a0_skills()
    assert len(specs) >= 4
    for name in ("deep-research", "file-converter", "github-solution-finder", "infographic-builder"):
        assert name in specs, f"missing a0-native skill: {name}"


def test_manifest_is_alphabetically_sorted_for_cache_stability():
    manifest = get_a0_skill_manifest()
    lines = [ln for ln in manifest.splitlines() if ln.startswith("- **")]
    names = [ln.split("**")[1] for ln in lines]
    assert names == sorted(names), "manifest must be alphabetical for prefix-cache stability"


def test_manifest_contains_descriptions():
    manifest = get_a0_skill_manifest()
    assert "deep-research" in manifest
    assert " — " in manifest, "manifest entries must include description after em-dash"


def test_skill_body_loads_for_known_skill():
    body = get_a0_skill_body("deep-research")
    assert body is not None
    assert len(body) > 100, "body suspiciously short — frontmatter strip may have eaten it"


def test_skill_body_returns_none_for_unknown_skill():
    assert get_a0_skill_body("does-not-exist") is None


def test_recommend_ranks_relevant_skill_first():
    out = _skill_recommend("find a python library on github for parsing pdfs")
    first_line = next(ln for ln in out.splitlines() if ln.startswith("- "))
    assert "github-solution-finder" in first_line, f"expected github-solution-finder first, got: {first_line}"


def test_recommend_handles_empty_query():
    out = _skill_recommend("")
    assert "empty" in out.lower() or "match" in out.lower() or "no" in out.lower()


def test_skill_load_unknown_returns_help():
    out = _skill_load("nonexistent-skill")
    assert "available" in out.lower() or "not found" in out.lower()


def test_skill_tools_registered_in_chat_schema():
    names = {t["function"]["name"] for t in TOOL_SCHEMAS_CHAT if "function" in t}
    assert "skill_recommend" in names
    assert "skill_load" in names
# 43:5
