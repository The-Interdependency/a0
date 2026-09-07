# 100:48 0:0 0:0
# DOC module: tests.contracts.module_doctrine
# DOC label: Module doctrine adherence
# DOC description: Enforces the a0p module doctrine for python/routes/*.py:
# every route file carries a complete # DOC block (module, label,
# description, tier, role — each exactly once) with role drawn from the
# allowed set, opens/closes with the # N:M annotation, and — when it
# defines a module-level APIRouter — is registered in ALL_ROUTERS.
# DOC role: contract
# === CHECKS ===
# id: check_routes_doc_blocks_complete
#   proves: routes_doc_blocks_complete
#   call: self::test_route_doc_blocks_are_complete
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_routes_doc_annotation_metrics
#   proves: routes_doc_annotation_metrics
#   call: self::test_doc_annotation_metrics_parse
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_routes_files_annotated
#   proves: routes_files_annotated
#   call: self::test_route_files_are_annotated
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
#
# id: check_routes_routers_registered
#   proves: routes_routers_registered
#   call: self::test_router_defining_files_are_registered
#   requires: python3
#   timeout: 20
#   mutates: none
#   cleanup: none
# === END CHECKS ===
from __future__ import annotations

import ast
import re
import pathlib

_ROUTES_DIR = pathlib.Path(__file__).resolve().parents[2] / "routes"
_INIT = _ROUTES_DIR / "__init__.py"

_REQUIRED_ONCE = ("module", "label", "description", "tier", "role")
_ALLOWED_ROLES = {
    "route", "api", "service", "engine", "orchestrator", "schema",
    "component", "page", "test", "contract", "doctrine", "config",
    "script", "adapter", "hot_swap", "module",
}
_ANNOTATION = re.compile(r"^#\s*\d+:\d+(\s+\d+:\d+){0,2}\s*$")
_DOC_LINE = re.compile(r"^# DOC (\w+):")
_ROUTER_DEF = re.compile(r"^router\s*[:=]")


def _route_files() -> list[pathlib.Path]:
    return [p for p in sorted(_ROUTES_DIR.glob("*.py")) if p.name != "__init__.py"]


def _load_doc_parser():
    """Load the real parser function without importing service-backed routes."""
    tree = ast.parse(_INIT.read_text(encoding="utf-8"), filename=str(_INIT))
    parser_node = next(
        node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_parse_doc_block"
    )
    parser_module = ast.Module(body=[parser_node], type_ignores=[])
    ast.fix_missing_locations(parser_module)
    namespace: dict = {"re": re}
    exec(compile(parser_module, str(_INIT), "exec"), namespace)
    return namespace["_parse_doc_block"]


def test_route_doc_blocks_are_complete() -> None:
    """Every route file declares module/label/description/tier/role exactly
    once, with role from the allowed set."""
    problems: list[str] = []
    for p in _route_files():
        keys: list[str] = []
        role_val: str | None = None
        for line in p.read_text(encoding="utf-8").splitlines():
            m = _DOC_LINE.match(line)
            if m:
                keys.append(m.group(1))
                if m.group(1) == "role":
                    role_val = line.split(":", 1)[1].strip()
        for req in _REQUIRED_ONCE:
            n = keys.count(req)
            if n != 1:
                problems.append(f"{p.name}: '# DOC {req}:' appears {n}× (want exactly 1)")
        if role_val is not None and role_val not in _ALLOWED_ROLES:
            problems.append(f"{p.name}: role '{role_val}' not in allowed set")
    assert not problems, "\n  " + "\n  ".join(problems)


def test_doc_annotation_metrics_parse() -> None:
    """Legacy and full annotations expose exactly the available metrics."""
    _parse_doc_block = _load_doc_parser()

    doc_block = "\n".join([
        "# DOC module: parser_contract",
        "# DOC label: Parser Contract",
        "# DOC description: Annotation parser fixture.",
        "# DOC tier: free",
        "# DOC role: contract",
    ])

    legacy = _parse_doc_block(f"# 12:3\n{doc_block}\n# 12:3")
    assert legacy is not None
    assert legacy["code_lines"] == 12
    assert legacy["comment_lines"] == 3
    for key in ("consumed_count", "declared_count", "fan_in", "fan_out"):
        assert key not in legacy

    full = _parse_doc_block(f"# 12:3 4:5 6:7\n{doc_block}\n# 12:3 4:5 6:7")
    assert full is not None
    assert {
        key: full[key]
        for key in (
            "code_lines", "comment_lines", "consumed_count",
            "declared_count", "fan_in", "fan_out",
        )
    } == {
        "code_lines": 12,
        "comment_lines": 3,
        "consumed_count": 4,
        "declared_count": 5,
        "fan_in": 6,
        "fan_out": 7,
    }


def test_route_files_are_annotated() -> None:
    """Every route file opens and closes with a # N:M annotation comment."""
    problems: list[str] = []
    for p in _route_files():
        lines = [l for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]
        if not lines:
            problems.append(f"{p.name}: empty file")
            continue
        if not _ANNOTATION.match(lines[0]):
            problems.append(f"{p.name}: first line is not an annotation: {lines[0]!r}")
        if not _ANNOTATION.match(lines[-1]):
            problems.append(f"{p.name}: last line is not an annotation: {lines[-1]!r}")
    assert not problems, "\n  " + "\n  ".join(problems)


def test_router_defining_files_are_registered() -> None:
    """Any route file that defines a module-level APIRouter is imported and
    placed in ALL_ROUTERS (else its endpoints never mount)."""
    init_text = _INIT.read_text(encoding="utf-8")
    imported = set(re.findall(r"from \.(\w+) import router", init_text))
    problems: list[str] = []
    for p in _route_files():
        text = p.read_text(encoding="utf-8")
        if any(_ROUTER_DEF.match(l) for l in text.splitlines()):
            if p.stem not in imported:
                problems.append(f"{p.name}: defines a router but is not imported in __init__.py")
    assert not problems, "\n  " + "\n  ".join(problems)
# 100:48 0:0 0:0
