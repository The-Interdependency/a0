# 76:10 0:0 0:0
# DOC module: tests.test_a0_package
# DOC label: a0 package import + CLI smoke
# DOC description: Imports every module under the a0/ package to catch
# import-time breaks (e.g. an unguarded optional dependency), verifies the
# subagent registry is populated without the optional claude_agent_sdk, and
# runs the a0.a0 CLI end-to-end through stdin/stdout.
import importlib
import json
import pkgutil
from pathlib import Path
import subprocess
import sys
import tomllib

import pytest

import a0


A0_MODULES = sorted(
    m.name for m in pkgutil.walk_packages(a0.__path__, prefix="a0.")
)


def test_module_discovery_nonempty():
    # Guards against the walk silently finding nothing (which would make the
    # parametrized import test below vacuously pass).
    assert len(A0_MODULES) > 20, f"only discovered {len(A0_MODULES)} a0 modules"


@pytest.mark.parametrize("modname", A0_MODULES)
def test_a0_submodule_imports_clean(modname):
    importlib.import_module(modname)


def test_subagent_registry_populated_without_sdk():
    # claude_agent_sdk is an optional dependency; the definitions must still
    # load and carry their data when it is absent.
    from a0.adapters import ALL_SUBAGENTS, MODE_SUBAGENTS

    assert set(ALL_SUBAGENTS) == {"phi", "psi", "omega", "jury", "bandit"}
    for mode in ("analyze", "route", "act"):
        assert mode in MODE_SUBAGENTS
        assert len(MODE_SUBAGENTS[mode]) > 0
    bandit = ALL_SUBAGENTS["bandit"]
    assert bandit.tools and bandit.model


def test_handle_round_trips_in_process(tmp_path, monkeypatch):
    import a0.state
    import a0.router

    monkeypatch.setattr(a0.state, "STATE_PATH", tmp_path / "a0_state.json")
    monkeypatch.setattr(a0.router, "LOG_DIR", tmp_path / "logs")

    from a0.contract import A0Request, normalize_hmmm

    req = A0Request(
        task_id="unit-1",
        input={"text": "hello", "files": [], "metadata": {}},
        tools_allowed=["none"],
        mode="analyze",
        hmmm=normalize_hmmm(["hmm"]),
    )
    resp = a0.router.handle(req)
    assert resp.task_id == "unit-1"
    assert resp.result is not None


def test_a0_cli_smoke(tmp_path):
    import os

    payload = {
        "task_id": "smoke1",
        "input": {"text": "hello a0", "files": [], "metadata": {}},
        "tools_allowed": ["none"],
        "mode": "analyze",
        "hmmm": ["hmm"],
    }
    env = {
        **os.environ,
        "A0_STATE_PATH": str(tmp_path / "a0_state.json"),
        "A0_LOG_DIR": str(tmp_path / "logs"),
    }
    proc = subprocess.run(
        [sys.executable, "-m", "a0.a0"],
        input=json.dumps(payload).encode("utf-8"),
        stdout=subprocess.PIPE,
        env=env,
        check=True,
    )
    out = json.loads(proc.stdout.decode("utf-8"))
    assert out["task_id"] == "smoke1"
    assert "result" in out


def test_instance_fanout_propagates_resolved_provider_id():
    root = Path(__file__).resolve().parents[1]
    api = (root / "python/routes/instances_api.py").read_text(encoding="utf-8")
    ui = (root / "client/src/components/chat-input.tsx").read_text(encoding="utf-8")
    assert '"provider_id": provider_id' in api
    assert "i.provider_id ?? VENDOR_TO_PROVIDER[i.vendor]" in ui


def test_provider_registry_json_is_declared_as_package_data():
    root = Path(__file__).resolve().parents[1]
    config = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    packaged = config["tool"]["setuptools"]["package-data"]["python.config"]
    assert {"providers.json", "pricing.json"}.issubset(packaged)
# 76:10 0:0 0:0
