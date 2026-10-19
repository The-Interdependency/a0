# 5:13
"""Bridge the offline validator suite into a0's python/tests contract graph.

Usage: python -m python.tests.contract_runner --only check_webmcp_validation
This invokes the same stdlib suite as unittest, without service/DB imports.
"""
# === CHECKS ===
# id: check_webmcp_validation
#   proves: webmcp_source_identity, webmcp_target_freshness, webmcp_validation_is_not_execution
#   call: self::check_webmcp_validation
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===

from pathlib import Path
import runpy


def check_webmcp_validation():
    path = Path(__file__).resolve().parents[3] / "tests/test_webmcp_validation.py"
    runpy.run_path(str(path))["check_webmcp_validation"]()
# 5:13
