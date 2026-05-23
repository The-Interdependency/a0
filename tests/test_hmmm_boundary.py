# 24:0
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from a0.contract import A0Request, A0Response, DEFAULT_HMMM_BOUNDARY, normalize_hmmm


def test_normalize_hmmm_accepts_iterables_and_enforces_boundary():
    assert normalize_hmmm(("alpha", "", "beta")) == ["alpha", "beta", DEFAULT_HMMM_BOUNDARY]


def test_dataclasses_enforce_boundary_post_init():
    req = A0Request(task_id="t1", input={"text": "x"}, hmmm=["marker"])
    resp = A0Response(task_id="t1", result={"text": "ok"}, hmmm=[])
    assert req.hmmm[-1] == DEFAULT_HMMM_BOUNDARY
    assert resp.hmmm == [DEFAULT_HMMM_BOUNDARY]


def test_cli_returns_structured_error_on_invalid_json():
    proc = subprocess.run(
        [sys.executable, "-m", "a0.a0"],
        input=b"{invalid",
        stdout=subprocess.PIPE,
        check=True,
    )
    out = json.loads(proc.stdout.decode("utf-8"))
    assert out["task_id"] == "task_invalid_json"
    assert "Invalid JSON payload" in out["result"]["error"]
    assert DEFAULT_HMMM_BOUNDARY in out["hmmm"]
# 24:0
