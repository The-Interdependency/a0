# 106:8
"""Contract test runner — see .local/skills/test-build/SKILL.md.

Walks python/ for `# === CONTRACTS ===` blocks, parses entries, imports
each `call:` target, and runs it. Reports per-contract status and lists
modules without any contract declarations so coverage gaps are visible.

Usage:
    python -m python.tests.contract_runner

Exits 0 if every contract passes, 1 otherwise.
"""
from __future__ import annotations
import asyncio
import importlib
import re
import sys
import traceback
from collections import Counter
from pathlib import Path
from typing import Any

CONTRACT_BLOCK = re.compile(
    r"^# === CONTRACTS ===\s*$(?P<body>.*?)^# === END CONTRACTS ===\s*$",
    re.MULTILINE | re.DOTALL,
)
ID_LINE = re.compile(r"^#\s*id:\s*(?P<id>\S+)\s*$")
FIELD_LINE = re.compile(r"^#\s+(?P<key>given|then|class|call):\s*(?P<val>.+)$")


def parse_block(body: str) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for raw in body.splitlines():
        line = raw.rstrip()
        m_id = ID_LINE.match(line)
        if m_id:
            if current:
                entries.append(current)
            current = {"id": m_id.group("id")}
            continue
        if current is None:
            continue
        m_field = FIELD_LINE.match(line)
        if m_field:
            current[m_field.group("key")] = m_field.group("val").strip()
    if current:
        entries.append(current)
    return entries


def scan_tree(root: Path) -> tuple[list[tuple[Path, list[dict]]], list[Path]]:
    annotated: list[tuple[Path, list[dict]]] = []
    untested: list[Path] = []
    for path in sorted(root.rglob("*.py")):
        parts = set(path.parts)
        if "__pycache__" in parts or "tests" in parts:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            continue
        all_entries: list[dict] = []
        for m in CONTRACT_BLOCK.finditer(text):
            all_entries.extend(parse_block(m.group("body")))
        if all_entries:
            annotated.append((path, all_entries))
        else:
            untested.append(path)
    return annotated, untested


async def run_one(entry: dict) -> dict:
    call = entry.get("call")
    if not call:
        return {**entry, "status": "ERROR", "error": "missing 'call' field"}
    module_path, _, func_name = call.rpartition(".")
    try:
        mod = importlib.import_module(module_path)
        fn: Any = getattr(mod, func_name)
    except Exception as e:
        return {**entry, "status": "ERROR", "error": f"import: {type(e).__name__}: {e}"}
    try:
        if asyncio.iscoroutinefunction(fn):
            await fn()
        else:
            fn()
    except AssertionError as e:
        return {**entry, "status": "FAIL", "error": str(e) or "assertion failed"}
    except Exception as e:
        return {**entry, "status": "ERROR", "error": f"{type(e).__name__}: {e}\n{traceback.format_exc()}"}
    return {**entry, "status": "PASS", "error": None}


async def main() -> int:
    root = Path(__file__).resolve().parent.parent
    annotated, untested = scan_tree(root)
    if not annotated:
        print("no CONTRACTS blocks found under python/")
        return 1
    results: list[dict] = []
    print(f"running {sum(len(e) for _, e in annotated)} contracts across "
          f"{len(annotated)} modules\n")
    for path, entries in annotated:
        rel = path.relative_to(root.parent)
        for entry in entries:
            r = await run_one(entry)
            r["module"] = str(rel)
            results.append(r)
            sym = {"PASS": "✓", "FAIL": "✗", "ERROR": "!"}[r["status"]]
            tail = "" if r["status"] == "PASS" else f"\n    └─ {r['error'].splitlines()[0]}"
            print(f"  {sym} {entry['id']:<40s}  ({rel}){tail}")
    counts = Counter(r["status"] for r in results)
    classes = Counter(r.get("class", "unclassified") for r in results)
    print(f"\n{counts['PASS']} pass / {counts['FAIL']} fail / "
          f"{counts['ERROR']} error    classes: "
          f"{', '.join(f'{c}={n}' for c, n in classes.most_common())}")
    if untested:
        print(f"\n{len(untested)} modules without CONTRACTS blocks "
              f"(coverage gap):")
        for p in untested[:20]:
            print(f"  · {p.relative_to(root.parent)}")
        if len(untested) > 20:
            print(f"  · … and {len(untested) - 20} more")
    return 0 if (counts["FAIL"] + counts["ERROR"]) == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
# 106:8
