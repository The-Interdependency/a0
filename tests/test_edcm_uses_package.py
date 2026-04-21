# N:M
# DOC module: tests.test_edcm_uses_package
# DOC label: EDCM uses edcmbone
# DOC description: After the edcmbone swap-in, the EDCM service must report
# the installed edcmbone version on every score response.
import edcmbone

from python.services import edcm as edcm_svc


def test_edcm_module_pins_edcmbone_version():
    assert hasattr(edcm_svc, "EDCMBONE_VERSION")
    assert edcm_svc.EDCMBONE_VERSION == edcmbone.__version__


def test_compute_metrics_returns_canonical_keys():
    out = edcm_svc.compute_metrics(
        text="a b c a b c d e f g",
        baseline="a b c d e f g h i j",
    )
    assert isinstance(out, dict)
    for k in edcm_svc.METRIC_NAMES:
        assert k in out, f"missing canonical metric {k}"


def test_edcm_score_tool_schema_mentions_edcmbone():
    from python.services.tools import edcm_score as edcm_tool
    desc = edcm_tool.SCHEMA["function"]["description"]
    assert "edcmbone" in desc.lower()
# N:M
