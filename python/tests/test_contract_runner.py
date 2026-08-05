# 79:50 0:0 0:0
"""Negative and timeout evidence for the CONTRACTS/CHECKS graph runner.

This conventional pytest filename is also the executable target imported by
the repository contract runner. The checks are self-contained and touch no
database, network, secrets, or user data.
"""
# === CHECKS ===
# id: check_contract_graph_rejects_incomplete_linkage
#   proves: contract_graph_rejects_incomplete_linkage
#   call: self::test_audit_graph_rejects_incomplete_linkage
#   requires: python3
#   timeout: 10
#   mutates: none
#   cleanup: none
#
# id: check_contract_graph_enforces_declared_timeout
#   proves: contract_graph_enforces_declared_timeout
#   call: self::test_execute_check_enforces_timeout
#   requires: python3
#   timeout: 10
#   mutates: none
#   cleanup: none
# === END CHECKS ===
from __future__ import annotations

import asyncio
from pathlib import Path

from python.tests import contract_runner as runner


def _contract(identifier: str, *, source_call: str | None = None) -> runner.Declaration:
    fields = {
        "id": identifier,
        "given": "a synthetic declaration graph",
        "then": "the graph satisfies its stated obligation",
        "class": "correctness",
    }
    if source_call is not None:
        fields["call"] = source_call
    return runner.Declaration(path=Path(__file__), fields=fields)


def _check(
    identifier: str,
    proves: str,
    call: str,
    *,
    timeout: str = "10",
) -> runner.Declaration:
    return runner.Declaration(
        path=Path(__file__),
        fields={
            "id": identifier,
            "proves": proves,
            "call": call,
            "requires": "python3",
            "timeout": timeout,
            "mutates": "none",
            "cleanup": "none",
        },
    )


def test_audit_graph_rejects_incomplete_linkage() -> None:
    orphan = _contract("synthetic_orphan_contract")
    source_owned_call = _contract(
        "synthetic_source_call_contract",
        source_call="python.tests.test_contract_runner.test_audit_graph_rejects_incomplete_linkage",
    )
    unknown = _check(
        "synthetic_unknown_check",
        "synthetic_missing_contract",
        "self::test_audit_graph_rejects_incomplete_linkage",
    )
    unresolved = _check(
        "synthetic_unresolved_check",
        "synthetic_orphan_contract",
        "self::function_that_does_not_exist",
    )

    _effective, gaps, _warnings = runner.audit_graph(
        [orphan, source_owned_call],
        [unknown, unresolved],
    )

    assert any("claims unknown contract" in gap for gap in gaps)
    assert any("call does not resolve" in gap for gap in gaps)
    assert any("owns deprecated call topology" in gap for gap in gaps)


async def _slow_contract_probe() -> None:
    await asyncio.sleep(0.05)


async def test_execute_check_enforces_timeout() -> None:
    check = _check(
        "synthetic_timeout_check",
        "contract_graph_enforces_declared_timeout",
        "self::_slow_contract_probe",
        timeout="0.001",
    )
    result = await runner._execute_check(check)
    assert result["status"] == "ERROR"
    assert "TimeoutError" in str(result["error"])
# 79:50 0:0 0:0
