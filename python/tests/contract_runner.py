# 233:73 0:0 0:0
"""Contract/check graph auditor and executor — see test-build/SKILL.md.

Source modules own `CONTRACTS`; test modules own executable `CHECKS`. The
runner audits the graph without importing test modules, then executes each
resolved check with its declared timeout. Legacy source-side `call:` fields are
accepted only as a visible migration adapter for untouched modules.

Usage:
    python -m python.tests.contract_runner

Exit 0 only when the declaration graph closes and every executed check passes.
"""
from __future__ import annotations

import ast
import asyncio
import importlib
import importlib.util
import sys
import traceback
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = ROOT / "python"
TEST_ROOT = PYTHON_ROOT / "tests"
PARSER_PATH = ROOT / ".agents" / "skills" / "msdmd" / "parsers" / "universal.py"
SOURCE_SKIP = {
    ".git", ".venv", "venv", "node_modules", "dist", "build", "target",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".tox", ".agents",
    "tests", "attached_assets",
}


@dataclass(frozen=True)
class Declaration:
    path: Path
    fields: dict[str, str]
    legacy: bool = False

    @property
    def id(self) -> str:
        return self.fields["id"]


def _load_universal_parser():
    spec = importlib.util.spec_from_file_location("a0_msdmd_universal", PARSER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load universal parser: {PARSER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PARSER = _load_universal_parser()


def _module_name(path: Path) -> str:
    return ".".join(path.relative_to(ROOT).with_suffix("").parts)


def _defined_functions(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }


def _resolve_call_no_exec(check: Declaration) -> tuple[Path, str, str]:
    call = check.fields.get("call", "")
    if call.startswith("self::"):
        function = call.removeprefix("self::")
        module = _module_name(check.path)
        target_path = check.path
    else:
        module, separator, function = call.rpartition(".")
        if not separator or not module or not function:
            raise LookupError(f"invalid call target: {call!r}")
        target_path = ROOT.joinpath(*module.split(".")).with_suffix(".py")
    if not target_path.is_file():
        raise LookupError(f"target module file not found: {target_path.relative_to(ROOT)}")
    if function not in _defined_functions(target_path):
        raise LookupError(
            f"target function not defined in {target_path.relative_to(ROOT)}: {function}"
        )
    return target_path, module, function


def _source_declarations() -> tuple[list[Declaration], list[Path]]:
    annotated, gaps = PARSER.walk_tree(
        ROOT,
        "CONTRACTS",
        skip=SOURCE_SKIP,
        extensions={".py"},
    )
    declarations = [
        Declaration(path=path, fields=dict(entry))
        for path, entries in annotated
        for entry in entries
    ]
    return declarations, gaps


def _check_declarations() -> list[Declaration]:
    annotated, _gaps = PARSER.walk_tree(
        TEST_ROOT,
        "CHECKS",
        extensions={".py"},
    )
    return [
        Declaration(path=path, fields=dict(entry))
        for path, entries in annotated
        for entry in entries
    ]


def _split_ids(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _legacy_check(contract: Declaration) -> Declaration | None:
    call = contract.fields.get("call")
    if not call:
        return None
    return Declaration(
        path=contract.path,
        legacy=True,
        fields={
            "id": f"legacy_check_{contract.id}",
            "proves": contract.id,
            "call": call,
            "timeout": "30",
            "mutates": "hmmm",
            "cleanup": "hmmm",
        },
    )


def audit_graph(
    contracts: list[Declaration],
    checks: list[Declaration],
) -> tuple[list[Declaration], list[str], list[str]]:
    gaps: list[str] = []
    warnings: list[str] = []

    contract_by_id: dict[str, Declaration] = {}
    for contract in contracts:
        if contract.id in contract_by_id:
            gaps.append(f"duplicate contract id: {contract.id}")
        contract_by_id[contract.id] = contract
        for field in ("given", "then"):
            if not contract.fields.get(field):
                gaps.append(f"contract {contract.id} missing {field}")

    check_by_id: dict[str, Declaration] = {}
    for check in checks:
        if check.id in check_by_id:
            gaps.append(f"duplicate check id: {check.id}")
        check_by_id[check.id] = check
        for field in ("proves", "call", "mutates", "cleanup"):
            if not check.fields.get(field):
                gaps.append(f"check {check.id} missing {field}")

    proving: dict[str, list[Declaration]] = defaultdict(list)
    for check in checks:
        for contract_id in _split_ids(check.fields.get("proves", "")):
            if contract_id not in contract_by_id:
                gaps.append(f"check {check.id} claims unknown contract: {contract_id}")
            else:
                proving[contract_id].append(check)

    effective_checks = list(checks)
    for contract in contracts:
        if contract.fields.get("deprecated"):
            warnings.append(f"deprecated contract skipped: {contract.id}")
            continue
        if proving.get(contract.id):
            if contract.fields.get("call"):
                warnings.append(
                    f"source call is deprecated and ignored where CHECKS exist: {contract.id}"
                )
            continue
        legacy = _legacy_check(contract)
        if legacy is None:
            gaps.append(f"contract has no CHECKS witness: {contract.id}")
            continue
        effective_checks.append(legacy)
        proving[contract.id].append(legacy)
        warnings.append(f"legacy source call adapter: {contract.id}")

    for check in effective_checks:
        try:
            _resolve_call_no_exec(check)
        except Exception as exc:
            gaps.append(f"check {check.id} call does not resolve: {exc}")

    return effective_checks, gaps, warnings


async def _execute_check(check: Declaration) -> dict[str, Any]:
    timeout_raw = check.fields.get("timeout", "30")
    try:
        timeout = float(timeout_raw)
        if timeout <= 0:
            raise ValueError
    except ValueError:
        return {
            "check": check,
            "status": "ERROR",
            "error": f"invalid timeout: {timeout_raw!r}",
        }

    try:
        _target_path, module_name, function_name = _resolve_call_no_exec(check)
        module = importlib.import_module(module_name)
        function: Any = getattr(module, function_name)
    except Exception as exc:
        return {
            "check": check,
            "status": "ERROR",
            "error": f"import: {type(exc).__name__}: {exc}",
        }

    async def invoke() -> None:
        if asyncio.iscoroutinefunction(function):
            await function()
        else:
            await asyncio.to_thread(function)

    try:
        await asyncio.wait_for(invoke(), timeout=timeout)
    except AssertionError as exc:
        return {
            "check": check,
            "status": "FAIL",
            "error": str(exc) or "assertion failed",
        }
    except Exception as exc:
        return {
            "check": check,
            "status": "ERROR",
            "error": f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
        }
    return {"check": check, "status": "PASS", "error": None}


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


async def main() -> int:
    contracts, uncovered_modules = _source_declarations()
    checks = _check_declarations()
    effective_checks, gaps, warnings = audit_graph(contracts, checks)

    print(
        f"auditing {len(contracts)} contracts and {len(checks)} declared checks "
        f"across {len({item.path for item in contracts})} source modules\n"
    )
    for warning in warnings:
        print(f"  WARN {warning}")
    for gap in gaps:
        print(f"  GAP  {gap}")
    if gaps:
        print(f"\n{len(gaps)} graph gap(s); no checks executed")
        return 1

    results: list[dict[str, Any]] = []
    print(f"\nexecuting {len(effective_checks)} checks\n")
    for check in effective_checks:
        result = await _execute_check(check)
        results.append(result)
        symbol = {"PASS": "✓", "FAIL": "✗", "ERROR": "!"}[result["status"]]
        legacy = " [legacy]" if check.legacy else ""
        tail = ""
        if result["status"] != "PASS":
            tail = f"\n    └─ {str(result['error']).splitlines()[0]}"
        print(f"  {symbol} {check.id:<48s} ({_rel(check.path)}){legacy}{tail}")

    counts = Counter(result["status"] for result in results)
    classes = Counter(
        contract.fields.get("class", "unclassified") for contract in contracts
    )
    print(
        f"\n{counts['PASS']} pass / {counts['FAIL']} fail / "
        f"{counts['ERROR']} error    contracts: "
        f"{', '.join(f'{name}={count}' for name, count in classes.most_common())}"
    )
    if uncovered_modules:
        print(f"\n{len(uncovered_modules)} source modules without CONTRACTS (coverage gap):")
        for path in uncovered_modules[:20]:
            print(f"  · {_rel(path)}")
        if len(uncovered_modules) > 20:
            print(f"  · … and {len(uncovered_modules) - 20} more")
    legacy_count = sum(1 for check in effective_checks if check.legacy)
    if legacy_count:
        print(f"\nhmmm: {legacy_count} contract(s) still use the legacy source-call adapter")
    return 0 if counts["FAIL"] + counts["ERROR"] == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
# 233:73 0:0 0:0
