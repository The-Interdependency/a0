# 113:18
#!/usr/bin/env python3
# 0:0
"""Stamp every Python and TypeScript/TSX project source file with a
code:comment annotation on its first and last line.

Run from the project root:
    python scripts/annotate.py [file ...]   # specific files
    python scripts/annotate.py              # all project source files

Format:
    # N:M   (Python .py)
    // N:M  (TypeScript .ts / .tsx)

N = non-blank, non-comment lines (must stay ≤ 400)
M = comment lines (# / // / block comments / docstrings)
Blank lines are counted in neither column.
The annotation lines themselves are excluded from both counts.
"""

import os
import re
import sys
from pathlib import Path

MAX_CODE_LINES = 400

PY_ANN = re.compile(r'^#\s*\d+:\d+\s*$')
TS_ANN = re.compile(r'^//\s*\d+:\d+\s*$')

SKIP_DIRS = {".git", "node_modules", "__pycache__", "dist", ".cache", ".local", ".venv"}


def _is_annotation(line: str, ext: str) -> bool:
    s = line.strip()
    return bool(PY_ANN.match(s) if ext == ".py" else TS_ANN.match(s))


def _count_python(lines: list[str]) -> tuple[int, int]:
    """Count (code, comment) lines in Python source."""
    code = comment = 0
    in_triple = False
    triple = None
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if in_triple:
            comment += 1
            if triple in s:
                in_triple = False
        elif s.startswith('"""') or s.startswith("'''"):
            comment += 1
            t = s[:3]
            if s.count(t) < 2:
                in_triple = True
                triple = t
        elif s.startswith('#'):
            comment += 1
        else:
            code += 1
    return code, comment


def _count_ts(lines: list[str]) -> tuple[int, int]:
    """Count (code, comment) lines in TypeScript source."""
    code = comment = 0
    in_block = False
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if in_block:
            comment += 1
            if '*/' in s:
                in_block = False
        elif s.startswith('/*'):
            comment += 1
            if '*/' not in s[2:]:
                in_block = True
        elif s.startswith('//'):
            comment += 1
        else:
            code += 1
    return code, comment


def annotate_file(path: Path) -> tuple[bool, int, int]:
    """Annotate a file. Returns (changed, code_lines, comment_lines)."""
    ext = path.suffix
    if ext not in ('.py', '.ts', '.tsx'):
        return False, 0, 0

    try:
        original = path.read_text(encoding='utf-8')
    except Exception as exc:
        print(f"  SKIP  {path}  ({exc})")
        return False, 0, 0

    lines = original.splitlines()

    working = lines[:]
    if working and _is_annotation(working[0], ext):
        working = working[1:]
    if working and _is_annotation(working[-1], ext):
        working = working[:-1]

    if ext == '.py':
        code, comment = _count_python(working)
        ann = f"# {code}:{comment}"
    else:
        code, comment = _count_ts(working)
        ann = f"// {code}:{comment}"

    new_text = '\n'.join([ann] + working + [ann]) + '\n'
    changed = new_text != original
    if changed:
        path.write_text(new_text, encoding='utf-8')

    return changed, code, comment


def collect_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix in ('.py', '.ts', '.tsx'):
                files.append(p)
    return sorted(files)


def main() -> None:
    root = Path(__file__).parent.parent.resolve()

    if len(sys.argv) > 1:
        targets = [Path(a).resolve() for a in sys.argv[1:]]
    else:
        targets = collect_files(root)

    over_budget: list[tuple[Path, int]] = []
    updated = 0

    for path in targets:
        changed, code, comment = annotate_file(path)
        rel = path.relative_to(root)
        tag = "UPDATED" if changed else "ok    "
        print(f"  {tag}  {rel}  [{code}:{comment}]")
        if changed:
            updated += 1
        if code > MAX_CODE_LINES:
            over_budget.append((rel, code))

    print(f"\n{updated}/{len(targets)} files updated.")

    if over_budget:
        print(f"\nWARNING — over {MAX_CODE_LINES}-line code budget:")
        for rel, n in over_budget:
            print(f"   {n} code lines  {rel}")


if __name__ == "__main__":
    main()
# 113:18
