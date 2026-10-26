# 49:0 0:0 0:0
import importlib.util
from pathlib import Path


_MOD_PATH = Path(__file__).resolve().parents[1] / "python" / "services" / "interdependent_bootstrap.py"
_spec = importlib.util.spec_from_file_location("interdependent_bootstrap", _MOD_PATH)
ib = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(ib)


class _Dist:
    def __init__(self, version: str, files):
        self.version = version
        self.files = files


def test_check_interdependent_core_ready(monkeypatch):
    monkeypatch.setattr(ib, "_first_installed_dist_name", lambda: "interdependent-core")
    monkeypatch.setattr(ib.md, "distribution", lambda _: _Dist("1.2.3", [Path("pkg/mod.py")]))
    monkeypatch.setattr(ib.importlib, "import_module", lambda _: object())
    got = ib.check_interdependent_core()
    assert got["status"] == "ready"
    assert got["payload_py"] == 1


def test_check_interdependent_core_missing(monkeypatch):
    monkeypatch.setattr(ib, "_first_installed_dist_name", lambda: None)
    got = ib.check_interdependent_core()
    assert got["status"] == "missing"


def test_require_interdependent_core_ready_raises(monkeypatch):
    monkeypatch.setattr(ib, "_first_installed_dist_name", lambda: "interdependent-core")
    monkeypatch.setattr(ib.md, "distribution", lambda _: _Dist("0.1.0", []))

    def _always_fail(_):
        raise ModuleNotFoundError

    monkeypatch.setattr(ib.importlib, "import_module", _always_fail)
    try:
        ib.require_interdependent_core_ready()
        raise AssertionError("expected RuntimeError")
    except RuntimeError as exc:
        assert "status=metadata_only" in str(exc)


def test_check_interdependent_core_ready_without_payload_files(monkeypatch):
    monkeypatch.setattr(ib, "_first_installed_dist_name", lambda: "interdependent-lib")
    monkeypatch.setattr(ib.md, "distribution", lambda _: _Dist("0.1.0", []))
    monkeypatch.setattr(ib.importlib, "import_module", lambda _: object())
    got = ib.check_interdependent_core()
    assert got["status"] == "ready"
    assert got["payload_py"] == 0


def test_check_interdependent_core_import_error_is_reported(monkeypatch):
    monkeypatch.setattr(ib, "_first_installed_dist_name", lambda: "interdependent-core")
    monkeypatch.setattr(ib.md, "distribution", lambda _: _Dist("0.1.0", [Path("pkg/mod.py")]))

    def _runtime_fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(ib.importlib, "import_module", _runtime_fail)
    got = ib.check_interdependent_core()
    assert got["status"] == "error"
    assert got["error"] == "boom"
# 49:0 0:0 0:0
