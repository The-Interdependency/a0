# ratios: loc_comments=218:33 imports_exports=6:7 calls_definitions=86:10
"""ratios skill executor — recompute the canonical ratios and gate on drift.

Reference runner for the ``ratios`` skill. It reads the single-line RATIOS
declaration (``<marker> ratios: loc_comments=N:M imports_exports=N:M
calls_definitions=N:M``) from a file's opening and closing source boundaries,
recomputes each ratio from the source, and fails on:

  * drift      — a recorded ratio no longer matches what the source computes;
  * misplaced  — a RATIOS declaration not on both source boundaries;
  * gaps       — (only under ``--strict``) computer-supported files with no
                 RATIOS at all.

``value: hmmm`` is reported as pending, never a failure. A recorded id with no
registered computer is reported as unverifiable (informational). Pure stdlib;
the single-line reader is reused from the msdmd universal parser, not forked.
The bundled computers are Python-specific. Parser support for another language
does not silently opt that language into Python metric semantics.

Usage:
    python ratios_check.py path/to/module.py      # verify one file
    python ratios_check.py --root .               # walk a tree
    python ratios_check.py --root . --strict      # gaps also fail (CI gate)
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# Make the sibling ``msdmd`` skill importable whether run from a repo root or
# from a vendored ``.agents/skills/ratios/`` directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from msdmd.parsers.universal import (  # noqa: E402
    RATIO_IDS,
    marker_for,
    parse_ratios,
    ratios_placement,
)

_SKIP = {
    "tests", "__pycache__", "node_modules", ".git", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "target", ".pytest_cache",
    ".mypy_cache", ".tox",
}

# Legacy fenced block (tolerated so transitional files don't pollute the
# counts) plus the canonical single-line form, both self-excluded.
_RATIOS_FENCE = re.compile(
    r"^#\s*===\s*RATIOS\s*===.*?^#\s*===\s*END\s+RATIOS\s*===",
    re.MULTILINE | re.DOTALL,
)
_RATIOS_LINE = re.compile(r"^\s*(?:#|//|--)\s*ratios:.*$", re.MULTILINE)

_IMPORT_RE = re.compile(r"^\s*(?:import\s|from\s+\S+\s+import\s)")
_TOP_DEF_RE = re.compile(r"^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)")
_NESTED_METHOD_RE = re.compile(r"^\s{4}(?:async\s+)?def\s+\w+")
_CALL_RE = re.compile(r"\b\w+\(")
_DOCSTRING_OPEN = re.compile(r'^\s*([rRbBuUfF]{0,2})("""|\'\'\')')


def _strip_ratios_lines(text: str) -> str:
    """Remove every RATIOS declaration so ratios self-exclude from counts."""
    text = _RATIOS_FENCE.sub("", text)
    text = _RATIOS_LINE.sub("", text)
    return text


def _classify_lines(text: str) -> dict[str, list[int]]:
    """Partition line indices into code / comment / docstring / blank."""
    lines = text.splitlines()
    out: dict[str, list[int]] = {"code": [], "comment": [], "docstring": [], "blank": []}
    in_doc = False
    quote: str | None = None
    for i, raw in enumerate(lines):
        stripped = raw.strip()
        if not stripped:
            out["blank"].append(i)
            continue
        if in_doc:
            out["docstring"].append(i)
            if quote and quote in raw:
                in_doc = False
                quote = None
            continue
        m = _DOCSTRING_OPEN.match(raw)
        if m and stripped.startswith(("'''", '"""')):
            q = m.group(2)
            out["docstring"].append(i)
            rest = raw[m.end():]
            if q in rest:
                continue
            in_doc = True
            quote = q
            continue
        if stripped.startswith("#"):
            out["comment"].append(i)
            continue
        out["code"].append(i)
    return out


def compute_loc_comments(text: str) -> str:
    """N:M where N = code lines, M = comment + docstring lines."""
    cls = _classify_lines(_strip_ratios_lines(text))
    n = len(cls["code"])
    m = len(cls["comment"]) + len(cls["docstring"])
    return f"{n}:{m}"


def compute_imports_exports(text: str) -> str:
    """import_count : public-export count (+1 if __all__ present)."""
    text = _strip_ratios_lines(text)
    lines = text.splitlines()
    import_count = sum(1 for line in lines if _IMPORT_RE.match(line))
    export_count = 0
    for line in lines:
        m = _TOP_DEF_RE.match(line)
        if m:
            name = m.group(1) or m.group(2)
            if name and not name.startswith("_"):
                export_count += 1
    if "__all__" in text:
        export_count += 1
    return f"{import_count}:{export_count}"


def compute_calls_definitions(text: str) -> str:
    """call-site lines : definition lines (top-level + one nesting level)."""
    text = _strip_ratios_lines(text)
    def_count = 0
    call_count = 0
    for line in text.splitlines():
        stripped = line.strip()
        if _TOP_DEF_RE.match(line) or _NESTED_METHOD_RE.match(line):
            def_count += 1
            continue
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith(("'''", '"""', "'", '"')):
            continue
        if _CALL_RE.search(line):
            call_count += 1
    return f"{call_count}:{def_count}"


COMPUTERS = {
    "loc_comments": compute_loc_comments,
    "imports_exports": compute_imports_exports,
    "calls_definitions": compute_calls_definitions,
}

# The named-form computers above use Python imports, definitions, docstrings,
# and call syntax. Other parser-supported languages remain discoverable without
# becoming false strict-mode gaps or receiving Python-shaped verification.
COMPUTER_EXTENSIONS = {".py"}


def _iter_source(root: Path):
    """Yield every source file under ``root`` with a known comment marker."""
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP]
        for fn in sorted(filenames):
            p = Path(dirpath) / fn
            if marker_for(p) is not None:
                yield p


def _verify_file(path: Path, base: Path, rep: dict) -> None:
    marker = marker_for(path)
    if marker is None:
        return
    rel = str(path.relative_to(base)) if path != base else path.name
    text = path.read_text(encoding="utf-8", errors="ignore")
    entries = parse_ratios(text, marker)
    if not entries:
        if path.suffix.lower() in COMPUTER_EXTENSIONS:
            rep["gaps"].append(rel)
        else:
            rep["outside_computer_scope"].append(rel)
        return
    rep["covered"] += 1

    opening_ok, closing_ok = ratios_placement(text, marker)
    if not (opening_ok and closing_ok):
        rep["misplaced"].append(
            {"file": rel, "opening": opening_ok, "closing": closing_ok}
        )

    if path.suffix.lower() not in COMPUTER_EXTENSIONS:
        for entry in entries:
            value = (entry.get("value") or "").strip()
            if value == "hmmm":
                rep["pending"].append(
                    {"file": rel, "id": entry.get("id", ""), "reason": "language computer unavailable"}
                )
                continue
            rep["unverifiable"].append(
                {
                    "file": rel,
                    "id": entry.get("id", ""),
                    "value": value,
                    "reason": f"no named-form computer for {path.suffix.lower()}",
                }
            )
        return

    for entry in entries:
        cid = entry.get("id", "")
        value = (entry.get("value") or "").strip()
        if value == "hmmm":
            rep["pending"].append({"file": rel, "id": cid})
            continue
        comp = COMPUTERS.get(cid)
        if comp is None:
            rep["unverifiable"].append({"file": rel, "id": cid, "value": value})
            continue
        try:
            actual = comp(text)
        except Exception as ex:  # pragma: no cover - defensive
            rep["drift"].append({"file": rel, "id": cid, "recorded": value, "computed": f"<error: {ex}>"})
            continue
        if actual != value:
            rep["drift"].append({"file": rel, "id": cid, "recorded": value, "computed": actual})
        else:
            rep["verified"].append({"file": rel, "id": cid, "value": value})


def run(target: Path) -> dict:
    """Verify one file or every source file under a directory."""
    target = target.resolve()
    rep: dict = {
        "skill": "ratios", "root": str(target), "scanned": 0, "covered": 0,
        "gaps": [], "drift": [], "misplaced": [], "pending": [],
        "verified": [], "unverifiable": [], "outside_computer_scope": [],
    }
    if target.is_file():
        rep["scanned"] = 1
        _verify_file(target, target, rep)
    else:
        for path in _iter_source(target):
            rep["scanned"] += 1
            _verify_file(path, target, rep)
    rep["gaps_count"] = len(rep["gaps"])
    rep["drift_count"] = len(rep["drift"])
    rep["misplaced_count"] = len(rep["misplaced"])
    rep["pending_count"] = len(rep["pending"])
    rep["outside_computer_scope_count"] = len(rep["outside_computer_scope"])
    rep["verified_count"] = len(rep["verified"])
    return rep


def summary(rep: dict) -> str:
    return (
        f"ratios . {rep['scanned']} files . "
        f"{rep['covered']} covered / {rep['gaps_count']} gaps . "
        f"{rep['verified_count']} verified . {rep['drift_count']} drift . "
        f"{rep['misplaced_count']} misplaced . "
        f"{rep['pending_count']} hmmm . {len(rep['unverifiable'])} unverifiable"
        f" . {rep['outside_computer_scope_count']} outside-computer-scope"
    )


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    strict = "--strict" in argv
    argv = [a for a in argv if a != "--strict"]
    if argv and argv[0] == "--root":
        argv = argv[1:]
    target = Path(argv[0]) if argv else Path(".")

    rep = run(target)
    print(summary(rep))
    for d in rep["drift"][:30]:
        print(f"  drift: {d['file']} :: {d['id']}: recorded {d['recorded']} != computed {d['computed']}")
    for m in rep["misplaced"][:30]:
        print(
            f"  misplaced: {m['file']}: "
            f"opening={m['opening']} closing={m['closing']}"
        )
    if strict:
        for g in rep["gaps"][:30]:
            print(f"  gap: {g}")

    fail = rep["drift_count"] or rep["misplaced_count"] or (strict and rep["gaps_count"])
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=218:33 imports_exports=6:7 calls_definitions=86:10
