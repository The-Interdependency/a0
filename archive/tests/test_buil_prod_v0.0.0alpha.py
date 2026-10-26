# 168:44 0:0 0:0
"""Isolated build-entrypoint checks; no package installs or app startup occur."""

# === CHECKS ===
# id: check_production_build_locked_dependencies
#   proves: production_build_locked_dependencies
#   call: self::test_production_build_locked_dependencies
#   mutates: filesystem
#   cleanup: tempdir_teardown
# id: check_production_build_fail_closed
#   proves: production_build_fail_closed
#   call: self::test_production_build_fail_closed
#   mutates: filesystem
#   cleanup: tempdir_teardown
# id: check_production_build_environment
#   proves: production_build_environment
#   call: self::test_production_build_environment
#   mutates: filesystem
#   cleanup: tempdir_teardown
# id: check_container_recipe_reproducibility
#   proves: container_recipe_reproducibility
#   call: self::test_container_recipe_reproducibility
#   mutates: none
#   cleanup: none
# id: check_production_launcher_environment
#   proves: production_launcher_environment
#   call: self::test_production_launcher_environment
#   mutates: filesystem
#   cleanup: tempdir_teardown
# id: check_production_launcher_single_owner
#   proves: production_launcher_single_owner
#   call: self::test_production_launcher_single_owner
#   mutates: filesystem
#   cleanup: tempdir_teardown
# id: check_production_launcher_requires_local_runtime
#   proves: production_launcher_environment
#   call: self::test_production_launcher_requires_local_runtime
#   mutates: filesystem
#   cleanup: tempdir_teardown
# === END CHECKS ===

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _run_build(fail_stage: str = "") -> tuple[subprocess.CompletedProcess, list]:
    """Run a copied entrypoint with inert npm/uv stubs from outside its repo."""
    with tempfile.TemporaryDirectory(prefix="a0-build-test-") as temporary:
        base = Path(temporary)
        repo = base / "repo with spaces"
        scripts = repo / "scripts"
        scripts.mkdir(parents=True)
        script = scripts / "build-prod.sh"
        shutil.copyfile(ROOT / "scripts/build-prod.sh", script)
        # Sentinels detect an accidental wrapper-level lockfile rewrite.
        for lock in ("package-lock.json", "uv.lock"):
            (repo / lock).write_text("lock sentinel\n")
        bin_dir = base / "bin"
        bin_dir.mkdir()
        log = base / "calls.log"
        for command in ("npm", "uv"):
            stub = bin_dir / command
            stub.write_text(
                "#!/bin/bash\n"
                f"printf '%s|%s|%s|%s\\n' '{command}' \"$PWD\" \"$*\" "
                "\"${NODE_ENV-}\" >> \"$BUILD_TEST_LOG\"\n"
                f'if [[ "{command} $*" == "$FAIL_STAGE" ]]; then exit 42; fi\n'
            )
            stub.chmod(0o755)
        result = subprocess.run(
            ["/bin/bash", str(script)],
            cwd=base,
            env={
                **os.environ,
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
                "BUILD_TEST_LOG": str(log),
                "FAIL_STAGE": fail_stage,
                "NODE_ENV": "development",
                "REPL_ID": "test-replit-context",
                "NPM_CONFIG_OMIT": "dev",
            },
            text=True,
            capture_output=True,
            timeout=20,
        )
        calls = [line.split("|") for line in log.read_text().splitlines()]
        assert all(Path(call[1]) == repo for call in calls)
        for lock in ("package-lock.json", "uv.lock"):
            assert (repo / lock).read_text() == "lock sentinel\n"
        return result, calls


def test_production_build_locked_dependencies():
    result, calls = _run_build()
    assert result.returncode == 0, result.stderr
    assert [(call[0], call[2]) for call in calls] == [
        ("npm", "ci --include=dev"),
        ("uv", "sync --locked --no-dev"),
        ("npm", "run build"),
    ]


def test_production_build_fail_closed():
    stages = ["npm ci --include=dev", "uv sync --locked --no-dev", "npm run build"]
    for position, stage in enumerate(stages):
        result, calls = _run_build(stage)
        assert result.returncode == 42, (stage, result.stderr)
        assert len(calls) == position + 1, (stage, calls)


def test_production_build_environment():
    result, calls = _run_build()
    assert result.returncode == 0, result.stderr
    assert calls[-1][3] == "production"
    package = json.loads((ROOT / "package.json").read_text())
    assert package["scripts"]["build"] == "node --import tsx script/build.ts"


def test_container_recipe_reproducibility():
    """Check declared recipe policy, not an unexecuted Docker image's behavior."""
    dockerfile = (ROOT / "Dockerfile").read_text()
    stages = [line for line in dockerfile.splitlines() if line.startswith("FROM node:")]
    assert stages == [
        "FROM node:22-bookworm-slim AS builder",
        "FROM node:22-bookworm-slim AS runner",
    ]
    workflow = (ROOT / ".github/workflows/clean-build-check.yml").read_text()
    assert 'node-version: "22"' in workflow
    builder, runner = dockerfile.split("FROM node:22-bookworm-slim AS runner", 1)
    assert "RUN npm ci --include=dev" in builder
    assert "RUN NODE_ENV=production npm run build" in builder
    assert "RUN npm ci --omit=dev" in runner
    assert "uv sync --locked --no-dev" in runner
    assert "--frozen" not in runner
    assert 'CMD ["node", "dist/index.cjs"]' in runner
    # The lock's package tree remains the owner of exact dependency versions.
    package = json.loads((ROOT / "package.json").read_text())
    lock_root = json.loads((ROOT / "package-lock.json").read_text())["packages"][""]
    for field in ("dependencies", "devDependencies", "optionalDependencies", "engines"):
        assert lock_root[field] == package[field]



def _run_launcher(
    exit_status: int = 0, venv_state: str = "ready"
) -> tuple[subprocess.CompletedProcess, list, int]:
    """Observe inherited cwd/PATH and exec identity without launching the app."""
    with tempfile.TemporaryDirectory(prefix="a0-launcher-test-") as temporary:
        base = Path(temporary)
        repo = base / "repo with spaces"
        scripts = repo / "scripts"
        scripts.mkdir(parents=True)
        launcher = scripts / "start-prod.sh"
        shutil.copyfile(ROOT / "scripts/start-prod.sh", launcher)
        venv_bin = repo / ".venv" / "bin"
        venv_bin.mkdir(parents=True)
        global_bin = base / "global-bin"
        global_bin.mkdir()
        log = base / "calls.log"
        # Either Python stub records an unexpected launcher-owned process.
        for binary_dir in (venv_bin, global_bin):
            if binary_dir == venv_bin and venv_state == "missing":
                continue
            uvicorn = binary_dir / "uvicorn"
            uvicorn.write_text(
                '#!/bin/bash\nprintf "unexpected-python\\n" >> "$LAUNCH_TEST_LOG"\n'
            )
            mode = 0o644 if binary_dir == venv_bin and venv_state == "nonexecutable" else 0o755
            uvicorn.chmod(mode)
        node = global_bin / "node"
        node.write_text(
            '#!/bin/bash\n'
            'printf "%s|%s|%s|%s|%s|%s\\n" node "$PWD" "$*" '
            '"$NODE_ENV" "$(command -v uvicorn)" "$$" >> "$LAUNCH_TEST_LOG"\n'
            'exit "$LAUNCH_EXIT_STATUS"\n'
        )
        node.chmod(0o755)
        process = subprocess.Popen(
            ["/bin/bash", str(launcher)],
            cwd=base,
            env={
                **os.environ,
                "PATH": f"{global_bin}:{os.environ['PATH']}",
                "NODE_ENV": "development",
                "LAUNCH_TEST_LOG": str(log),
                "LAUNCH_EXIT_STATUS": str(exit_status),
            },
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            stdout, stderr = process.communicate(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate()
            raise
        result = subprocess.CompletedProcess(process.args, process.returncode, stdout, stderr)
        calls = [line.split("|") for line in log.read_text().splitlines()] if log.exists() else []
        if venv_state == "ready":
            assert len(calls) == 1, calls
            assert calls[0][1] == str(repo)
            assert calls[0][4] == str(venv_bin / "uvicorn")
        return result, calls, process.pid


def test_production_launcher_environment():
    result, calls, _ = _run_launcher()
    assert result.returncode == 0, result.stderr
    assert calls[0][0] == "node"
    assert calls[0][2] == "dist/index.cjs"
    assert calls[0][3] == "production"
    package = json.loads((ROOT / "package.json").read_text())
    assert package["scripts"]["start"] == "bash scripts/start-prod.sh"


def test_production_launcher_single_owner():
    result, calls, launcher_pid = _run_launcher(exit_status=37)
    assert result.returncode == 37, result.stderr
    assert int(calls[0][5]) == launcher_pid



def test_production_launcher_requires_local_runtime():
    for state in ("missing", "nonexecutable"):
        result, calls, _ = _run_launcher(venv_state=state)
        assert result.returncode == 1, result.stderr
        assert "Missing executable .venv/bin/uvicorn" in result.stderr
        assert "scripts/build-prod.sh" in result.stderr
        assert calls == [], (state, calls)

# 168:44 0:0 0:0
