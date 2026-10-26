# 129:33 0:0 0:0
"""Self-contained source/check harness witnesses; no database or provider use.

All subprocess Git operations use disposable repositories only.
"""
from __future__ import annotations

# === CHECKS ===
# id: check_submission_environment_isolated
#   proves: submission_checks_remove_ambient_credentials
#   call: self::test_submission_environment_isolated
#   requires: python3
#   timeout: 10
#   mutates: environment
#   cleanup: patch_dict_restore
# id: check_submission_stages_fail_closed
#   proves: submission_checks_fail_closed, submission_checks_disclose_scope
#   call: self::test_submission_stages_fail_closed
#   requires: python3
#   timeout: 20
#   mutates: temporary_files
#   cleanup: tempdir_teardown
# id: check_submission_source_exact
#   proves: submission_source_commit_identity, submission_source_excludes_local_files
#   call: self::test_submission_source_exact
#   requires: python3, git
#   timeout: 20
#   mutates: temporary_files
#   cleanup: tempdir_teardown
# id: check_submission_source_refusals
#   proves: submission_source_fail_closed, submission_source_commit_identity
#   call: self::test_submission_source_refusals
#   requires: python3, git
#   timeout: 20
#   mutates: temporary_files
#   cleanup: tempdir_teardown
# === END CHECKS ===

from contextlib import redirect_stdout, redirect_stderr
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str):
    path = ROOT / "scripts" / f"{name}_v0.0.0alpha.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


checks = _load("subm_chec_offl")
source = _load("subm_src_pack")


def _git(root: Path, *arguments: str) -> bytes:
    return subprocess.run(["git", "-C", str(root), *arguments], check=True,
                          capture_output=True, timeout=10).stdout


def _repo(base: Path) -> Path:
    root = base / "repo"
    root.mkdir()
    _git(root, "init", "-q")
    _git(root, "config", "user.email", "fixture@example.invalid")
    _git(root, "config", "user.name", "Source fixture")
    (root / "LICENSE").write_text("fixture license\n")
    (root / "app.py").write_text("print('fixture')\n")
    (root / ".gitignore").write_text(".env\n")
    _git(root, "add", "LICENSE", "app.py", ".gitignore")
    _git(root, "commit", "-qm", "fixture")
    return root


def _raises(kind, function, *arguments):
    try:
        function(*arguments)
    except kind:
        return
    raise AssertionError(f"expected {kind.__name__}")


def test_submission_environment_isolated():
    secrets = {"OPENAI_API_KEY": "private", "DATABASE_URL": "production",
               "ADMIN_PASSWORD": "private", "GITHUB_TOKEN": "private",
               "NODE_OPTIONS": "--require=unsafe", "PYTHONPATH": "/unsafe",
               "PGSERVICE": "production", "AWS_PROFILE": "private"}
    with patch.dict(os.environ, secrets):
        environment = checks.check_environment(Path("/repo"), Path("/scratch"))
    for name in secrets:
        assert name not in environment or environment[name] != secrets[name]
    assert environment["DATABASE_URL"].startswith("postgresql://a0_offline@127.0.0.1:1/")
    assert environment["HOME"] == "/scratch"
    commands = checks.check_commands(Path("/repo"), "/usr/bin/node")
    flattened = [argument for _, command in commands for argument in command]
    assert "--ignore=tests/test_artifacts.py" in flattened
    assert "--ignore=tests/test_live_server.py" in flattened
    rate_command = next(command for label, command in commands if label == "Public request boundary unit checks")
    assert rate_command[-2:] == ["scripts/chec_publ_rate_v0.0.0alpha.ts", "--unit"]
    assert not {"npx", "npm", "uv", "uvicorn", "db:push"}.intersection(flattened)


def test_submission_stages_fail_closed():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for name in (".venv/bin/python", "node_modules/typescript/bin/tsc", "node_modules/tsx/package.json"):
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")
        for outcome, expected in [(subprocess.CompletedProcess([], 7), 1),
                                  (FileNotFoundError(), 2)]:
            output = io.StringIO()
            with patch.object(checks.shutil, "which", return_value="/usr/bin/node"), \
                 patch.object(checks.subprocess, "run") as run, redirect_stdout(output), redirect_stderr(output):
                if isinstance(outcome, Exception):
                    run.side_effect = outcome
                else:
                    run.return_value = outcome
                assert checks.run_checks(root) == expected
            assert run.call_count == 1
            assert "Excluded:" in output.getvalue()
            assert "PASS: all listed" not in output.getvalue()
        with patch.object(checks.shutil, "which", return_value=None), \
             patch.object(checks.subprocess, "run") as run, redirect_stderr(io.StringIO()):
            assert checks.run_checks(root) == 2
            run.assert_not_called()


def test_submission_source_exact():
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        root = _repo(base)
        (root / ".env").write_text("SECRET=never-export")
        (root / "private-untracked.txt").write_text("never-export")
        with patch.object(source, "git", wraps=source.git) as calls, \
             patch.dict(os.environ, {"GIT_DIR": "/not-the-source-repository"}):
            first = source.export_source(root, base / "first")
        assert any(call.args[1:] == ("rev-parse", f"{first['commit']}^{{tree}}") for call in calls.call_args_list)
        second = source.export_source(root, base / "second")
        assert first == second
        archive = base / "first" / first["archive"]
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == first["archive_sha256"]
        assert first["commit"] == _git(root, "rev-parse", "HEAD").decode().strip()
        assert first["tree"] == _git(root, "rev-parse", "HEAD^{tree}").decode().strip()
        assert first["tracked_file_count"] == 3
        with tarfile.open(archive, "r:gz") as bundle:
            names = bundle.getnames()
            assert not any(name.endswith(("/.env", "/private-untracked.txt")) for name in names)
            assert bundle.extractfile(f"a0-{first['commit']}/app.py").read() == (root / "app.py").read_bytes()
        receipt = base / "first" / f"a0-{first['commit']}-source.json"
        assert json.loads(receipt.read_text()) == first
        _raises(FileExistsError, source.export_source, root, base / "first")
        _raises(ValueError, source.export_source, root, root / "output")


def test_submission_source_refusals():
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)
        root = _repo(base)
        (root / "app.py").write_text("changed\n")
        _raises(ValueError, source.export_source, root, base / "dirty")
        _git(root, "checkout", "--", "app.py")
        (root / ".gitattributes").write_text("app.py export-ignore\n")
        _git(root, "add", ".gitattributes")
        _git(root, "commit", "-qm", "export exclusion")
        _raises(ValueError, source.export_source, root, base / "omitted")
        (root / ".gitattributes").write_text("")
        (root / "app.py").write_text("version https://git-lfs.github.com/spec/v1\noid sha256:fixture\nsize 5\n")
        _git(root, "add", ".gitattributes", "app.py")
        _git(root, "commit", "-qm", "external object")
        _raises(ValueError, source.export_source, root, base / "lfs")
        commit = _git(root, "rev-parse", "HEAD").decode().strip()
        _git(root, "update-index", "--add", "--cacheinfo", f"160000,{commit},external")
        _git(root, "commit", "-qm", "submodule")
        _raises(ValueError, source.export_source, root, base / "submodule")
# 129:33 0:0 0:0
