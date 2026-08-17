# 15:7 0:0 0:0
# N:M
# DOC module: tests.test_edcm_uses_package
# DOC label: a0 uses current EDCM
# DOC description: The EDCM service reports the exactly pinned package version.
from importlib.metadata import version as _pkg_version

from python.services import edcm as edcm_svc


def test_edcm_module_pins_current_version():
    assert hasattr(edcm_svc, "EDCM_VERSION")
    assert edcm_svc.EDCM_VERSION == _pkg_version("edcm")


def test_compute_metrics_returns_canonical_keys():
    # compute_metrics takes (responses: list[dict], context: str) — the old
    # text=/baseline= signature was retired with the orchestration refactor.
    responses = [{"provider": "test", "content": "a b c a b c d e f g"}]
    out = edcm_svc.compute_metrics(responses, "a b c d e f g h i j")
    assert isinstance(out, dict)
    for k in edcm_svc.METRIC_NAMES:
        assert k in out, f"missing canonical metric {k}"


def test_edcm_score_tool_schema_mentions_edcm():
    from python.services.tools import edcm_score as edcm_tool
    desc = edcm_tool.SCHEMA["function"]["description"]
    assert "edcm" in desc.lower()
# N:M
# 15:7 0:0 0:0
