# 65:41 0:0 0:0
"""Run the credential-free repository checks, not the live application.

Usage: python scripts/subm_chec_offl_v0.0.0alpha.py
Install locked development dependencies first: npm ci; uv sync --locked.
The two excluded suites require a real PostgreSQL database or live servers.
Passing this command is not owner-use, deployment, or hackathon-track evidence.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_submission_offline_checks
#   module_name: submission_offline_checks
#   module_kind: instrument
#   summary: Runs the existing repository checks with a bounded, credential-free environment and discloses live-test exclusions.
#   owner: Erin Spencer
#   public_surface: command line exit status and stage output
#   internal_surface: check_environment, check_commands, run_checks
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: python/tests/test_subm_tool_v0.0.0alpha.py
#   rollout: explicit local command only
#   rollback: remove this command and its documentation; runtime is unchanged
#   unresolved: this is process-environment isolation, not an operating-system network sandbox
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: submission_checks_remove_ambient_credentials
#   given: the caller environment contains provider, database, administrator, or cloud credentials
#   then: check processes receive only explicitly permitted executable paths and disposable test configuration
#   class: safety
# id: submission_checks_fail_closed
#   given: a required executable is missing, a stage fails, or a process cannot start
#   then: the command exits nonzero and does not report complete verification
#   class: correctness
# id: submission_checks_disclose_scope
#   given: the offline repository verification command runs
#   then: output identifies omitted database and live-server tests and does not start the application or invoke dependency installers
#   class: evidence
# === END CONTRACTS ===

import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EXCLUSIONS = ("tests/test_artifacts.py", "tests/test_live_server.py")


def check_environment(root: Path, scratch: Path) -> dict[str, str]:
    """Build an allowlisted environment; never inherit service configuration."""
    return {
        "PATH": str(root / ".venv" / "bin") + os.pathsep + os.defpath,
        "HOME": str(scratch),
        "TMPDIR": str(scratch),
        "LANG": "C.UTF-8",
        "PYTHONPATH": str(root),
        "PYTHONNOUSERSITE": "1",
        "DATABASE_URL": "postgresql://a0_offline@127.0.0.1:1/a0_offline",
        "INTERNAL_API_SECRET": "offline-fixture-not-a-runtime-secret",
        "SESSION_SECRET": "offline-fixture-not-a-runtime-secret",
        "A0_STATE_PATH": str(scratch / "state.json"),
        "A0_LOG_DIR": str(scratch / "logs"),
        "NODE_ENV": "production",
    }


def check_commands(root: Path, node: str) -> list[tuple[str, list[str]]]:
    """Use installed executables directly: no npx downloads or uv sync."""
    python = str(root / ".venv" / "bin" / "python")
    return [
        ("Python offline tests", [python, "-m", "pytest", "-q", "tests", "python/tests",
                                  *(f"--ignore={path}" for path in EXCLUSIONS)]),
        ("Provider contract graph", [python, "-m", "python.tests.contract_runner",
                                    "--only", "check_openai_compatible_registry_wiring",
                                    "--only", "check_openai_compatible_repair_regressions"]),
        ("TypeScript", [node, "node_modules/typescript/bin/tsc"]),
        ("Public request boundary unit checks", [node, "--import", "tsx", "scripts/chec_publ_rate_v0.0.0alpha.ts", "--unit"]),
        ("Production bundle", [node, "--import", "tsx", "script/build.ts"]),
    ]


def run_checks(root: Path = ROOT) -> int:
    node = shutil.which("node")
    required = (root / ".venv/bin/python", root / "node_modules/typescript/bin/tsc",
                root / "node_modules/tsx/package.json")
    if not node or any(not path.is_file() for path in required):
        print("Missing locked development dependencies. Run npm ci and uv sync --locked first.", file=sys.stderr)
        return 2
    print("Scope: credential-free repository checks; no application startup.", flush=True)
    print("Excluded: tests/test_artifacts.py (PostgreSQL); tests/test_live_server.py (live servers).", flush=True)
    print("The PostgreSQL public-rate check, browser tests, and full application acceptance are also excluded.", flush=True)
    print("Contract graph scope is legacy CONTRACTS/CHECKS blocks, not complete native-metadata coverage.", flush=True)
    print("This is not a live owner-task test or a Replit-source parity check.", flush=True)
    with tempfile.TemporaryDirectory(prefix="a0-offline-") as directory:
        environment = check_environment(root, Path(directory))
        # Preserve only the resolved Node executable's directory, not ambient PATH.
        environment["PATH"] += os.pathsep + str(Path(node).parent)
        for label, command in check_commands(root, node):
            print(f"\n=== {label} ===", flush=True)
            try:
                result = subprocess.run(command, cwd=root, env=environment, check=False)
            except OSError as exc:
                print(f"ERROR: {label}: {type(exc).__name__}", file=sys.stderr)
                return 2
            if result.returncode:
                print(f"FAIL: {label} (exit {result.returncode})", file=sys.stderr)
                return 1
    print("\nPASS: all listed offline stages. Database, browser, live provider and owner-task acceptance remain separate.")
    return 0


if __name__ == "__main__":
    sys.exit(run_checks())
# 65:41 0:0 0:0
