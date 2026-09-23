# 22:15 0:0 0:0
"""Canonical contract-runner witness for the continuous A0 harness.

Usage:
    uv run pytest -q python/tests/test_work_harness_contracts.py
The witness delegates to the focused behavioral suite so the contract graph and
ordinary pytest execution share one source of executable evidence.
"""

# === CHECKS ===
# id: check_work_harness_contracts
#   proves: harness_continuity_preserves_identity, harness_checkpoint_is_bounded, harness_explicit_pin_never_falls_back, harness_auto_fallback_replays_only_safe_turns
#   call: self::test_work_harness_contracts
#   requires: python3, pytest
#   timeout: 30
#   mutates: none
#   cleanup: none
# === END CHECKS ===

import os
from pathlib import Path
import subprocess
import sys


def test_work_harness_contracts() -> None:
    root = Path(__file__).resolve().parents[2]
    environment = dict(os.environ)
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "-q",
            "-p",
            "no:cacheprovider",
            "tests/test_work_harness_v0.0.0alpha.py",
        ],
        cwd=root,
        env=environment,
        check=True,
    )
# 22:15 0:0 0:0
