# 35:7
# DOC module: tests.test_live_server
# DOC label: Live-server HTTP smoke
# DOC description: Hits the running Express+FastAPI stack on localhost:5000
# to verify the public surface is healthy. Skipped automatically if the
# server is not running, so CI runs without infra still pass the suite.
import os
import pytest
import httpx

BASE = os.environ.get("A0P_TEST_BASE", "http://localhost:5000")


def _server_alive() -> bool:
    try:
        httpx.get(f"{BASE}/api/v1/ui/structure", timeout=2.0)
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _server_alive(),
    reason=f"no server on {BASE} — start the workflow to enable live tests",
)


def test_ui_structure_returns_tabs():
    r = httpx.get(f"{BASE}/api/v1/ui/structure", timeout=5.0)
    assert r.status_code == 200
    data = r.json()
    assert "tabs" in data
    tab_ids = {t.get("tab_id") for t in data["tabs"]}
    # Sanity: a few tabs we know should exist after recent work.
    for required in ("agents", "forge", "sigma", "liminals"):
        assert required in tab_ids, f"missing tab: {required}"


def test_docs_endpoint_returns_module_metadata():
    r = httpx.get(f"{BASE}/api/v1/docs", timeout=5.0)
    if r.status_code == 404:
        pytest.skip("docs endpoint not exposed in this build")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, (list, dict))


def test_internal_header_required_on_python_direct_call():
    # Hitting Python directly without the internal header should be rejected.
    try:
        r = httpx.get("http://localhost:8001/api/v1/ui/structure", timeout=2.0)
    except Exception:
        pytest.skip("python backend not reachable on 8001 in this environment")
    assert r.status_code in (401, 403), f"expected reject, got {r.status_code}"
# 35:7
