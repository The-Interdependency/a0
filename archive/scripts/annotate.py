# 269:50 0:0 0:0
#!/usr/bin/env python3
"""Stamp every Python and TypeScript/TSX file with a three-metric annotation.

Run from the project root:
    python scripts/annotate.py [file ...]   # specific files (preserves C:D / I:O)
    python scripts/annotate.py              # full scan — recomputes all three

Annotation format (first AND last line of every file):
    # N:M C:D I:O   (Python)
    // N:M C:D I:O  (TypeScript / TSX)

  N:M  code lines : comment lines          (internal density)
  C:D  consumed   : declared               (surface utility)
  I:O  fan-in     : fan-out                (graph position)

N  = non-blank, non-comment code lines (budget: ≤ 400)
M  = comment / docstring lines
D  = declared # DOC endpoint: lines (.py); exported symbols (.ts/.tsx)
C  = declared items actually consumed in client/src/ or server/
I  = files that import this file (fan-in)
O  = project-internal modules this file imports (fan-out)

Single-file mode re-stamps N:M and preserves existing C:D / I:O.
Full-scan mode recomputes all three metrics via an inverted import index
(O(total lines), not O(N²)).
"""

import os
import re
import sys
from pathlib import Path

MAX_CODE_LINES = 400

# Accepts one to three N:M pairs — handles old single-pair and new three-pair format.
PY_ANN = re.compile(r'^#\s*\d+:\d+(\s+\d+:\d+){0,2}\s*$')
TS_ANN = re.compile(r'^//\s*\d+:\d+(\s+\d+:\d+){0,2}\s*$')

SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", "dist",
    ".cache", ".local", ".venv", ".agents", "attached_assets",
    ".pythonlibs",
}


# ── annotation helpers ─────────────────────────────────────────────────────────

def _is_annotation(line: str, ext: str) -> bool:
    s = line.strip()
    return bool(PY_ANN.match(s) if ext == ".py" else TS_ANN.match(s))


def _strip_ann(lines: list[str], ext: str) -> list[str]:
    w = lines[:]
    if w and _is_annotation(w[0], ext):
        w = w[1:]
    if w and _is_annotation(w[-1], ext):
        w = w[:-1]
    return w


def _read_existing_cd_io(lines: list[str], ext: str):
    """Return ((C,D),(I,O)) from an existing annotation line, or (None,None)."""
    if not lines:
        return None, None
    s = lines[0].strip()
    prefix = "#" if ext == ".py" else "//"
    if not s.startswith(prefix):
        return None, None
    pairs = s[len(prefix):].strip().split()
    if len(pairs) < 3:
        return None, None
    try:
        def _p(tok: str):
            a, b = tok.split(":")
            return int(a), int(b)
        return _p(pairs[1]), _p(pairs[2])
    except Exception:
        return None, None


# ── code / comment counting ────────────────────────────────────────────────────

def _count_python(lines: list[str]) -> tuple[int, int]:
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
        elif s.startswith("#"):
            comment += 1
        else:
            code += 1
    return code, comment


def _count_ts(lines: list[str]) -> tuple[int, int]:
    code = comment = 0
    in_block = False
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if in_block:
            comment += 1
            if "*/" in s:
                in_block = False
        elif s.startswith("/*"):
            comment += 1
            if "*/" not in s[2:]:
                in_block = True
        elif s.startswith("//"):
            comment += 1
        else:
            code += 1
    return code, comment


# ── per-file static metric extraction ─────────────────────────────────────────

def _py_endpoints(lines: list[str]) -> list[str]:
    """Paths from '# DOC endpoint: METHOD /path | ...' lines."""
    paths = []
    for line in lines:
        m = re.match(r"\s*#\s*DOC\s+endpoint:\s+\w+\s+(/[^\s|]+)", line)
        if m:
            paths.append(m.group(1).rstrip("/"))
    return paths


def _py_fanout(lines: list[str]) -> int:
    """Unique relative imports — project-internal out-edges."""
    mods: set[str] = set()
    for line in lines:
        m = re.match(r"\s*from\s+(\.[\w.]*)\s+import", line)
        if m:
            mods.add(m.group(1))
    return len(mods)


def _ts_declared(lines: list[str]) -> int:
    """Exported symbols in a TypeScript/TSX file."""
    count = 0
    for line in lines:
        s = line.strip()
        if re.match(
            r"^export\s+(default\s+)?(function|const|class|interface|type|enum)\b", s
        ):
            count += 1
        elif re.match(r"^export default [^{]", s):
            count += 1
    return count


def _ts_fanout(lines: list[str]) -> int:
    """Unique local/alias imports — project-internal out-edges."""
    mods: set[str] = set()
    for line in lines:
        m = re.match(r"""\s*import\s+.*\s+from\s+['"]([.@][^'"]+)['"]""", line)
        if m:
            mods.add(m.group(1))
    return len(mods)


# ── cross-reference index (single linear pass) ────────────────────────────────

def build_index(all_files: list[Path], root: Path) -> dict:
    """Compute all three metrics. Fan-in uses an inverted index — O(total lines)."""

    index: dict[str, dict] = {}
    texts: dict[str, str] = {}

    # Pass 1 — per-file static analysis
    for path in all_files:
        try:
            text = path.read_text(encoding="utf-8")
        except Exception:
            text = ""
        texts[str(path)] = text
        lines = text.splitlines()
        ext = path.suffix
        working = _strip_ann(lines, ext)

        if ext == ".py":
            endpoints = _py_endpoints(working)
            fan_out = _py_fanout(working)
            declared = len(endpoints)
        else:
            endpoints = []
            fan_out = _ts_fanout(working)
            declared = _ts_declared(working)

        index[str(path)] = {
            "ext": ext,
            "stem": path.stem,
            "declared": declared,
            "consumed": 0,
            "fan_out": fan_out,
            "fan_in": 0,
            "endpoints": endpoints,
        }

    # Pass 2 — build inverted import index in one linear scan
    # stem_importers[stem] = set of file path strings that import that stem
    stem_importers: dict[str, set[str]] = {}

    for src_path in all_files:
        src_str = str(src_path)
        src_ext = src_path.suffix
        src_text = texts.get(src_str, "")

        for line in src_text.splitlines():
            s = line.strip()
            if src_ext == ".py":
                # Relative import: "from .billing import ..." or "from ..routes.billing import ..."
                m = re.match(r"from\s+([.]+[\w.]*)\s+import", s)
                if m:
                    mod_path = m.group(1)
                    # Last dotted segment is the module stem
                    parts = [p for p in mod_path.split(".") if p]
                    if parts:
                        stem_importers.setdefault(parts[-1], set()).add(src_str)
            elif src_ext in (".ts", ".tsx"):
                # Local import: from './foo' or from '../components/foo'
                m = re.match(r"""\s*import\s+.*from\s+['"]([.][^'"]+)['"]""", s)
                if m:
                    raw = m.group(1)
                    # Stem = last path segment, extension stripped
                    seg = raw.rstrip("/").split("/")[-1]
                    stem = re.sub(r"\.\w+$", "", seg)
                    if stem:
                        stem_importers.setdefault(stem, set()).add(src_str)

    # Assign fan-in from inverted index
    for path in all_files:
        importers = stem_importers.get(path.stem, set())
        importers.discard(str(path))
        index[str(path)]["fan_in"] = len(importers)

    # Pass 3 — consumed endpoints (scan client/src + server once)
    consumer_text = _read_consumer_text(root)
    for path_str, data in index.items():
        if data["ext"] == ".py" and data["endpoints"]:
            data["consumed"] = sum(
                1 for ep in data["endpoints"] if ep in consumer_text
            )
        elif data["ext"] in (".ts", ".tsx"):
            # For TS files consumed == fan-in
            data["consumed"] = data["fan_in"]

    return index


def _read_consumer_text(root: Path) -> str:
    """Concatenate all TS/JS files in client/src and server for endpoint lookup."""
    parts: list[str] = []
    for subdir in ("client/src", "server"):
        d = root / subdir
        if not d.exists():
            continue
        for fp in d.rglob("*"):
            if fp.suffix in (".ts", ".tsx", ".js"):
                try:
                    parts.append(fp.read_text(encoding="utf-8"))
                except Exception:
                    pass
    return "\n".join(parts)


# ── file stamping ──────────────────────────────────────────────────────────────

def annotate_file(
    path: Path,
    metrics: dict | None = None,
) -> tuple[bool, int, int]:
    """Stamp a file. Returns (changed, code_lines, comment_lines).

    metrics — pre-computed dict from build_index.
    If None (single-file mode), existing C:D / I:O are preserved; N:M recomputed.
    """
    ext = path.suffix
    if ext not in (".py", ".ts", ".tsx"):
        return False, 0, 0

    try:
        original = path.read_text(encoding="utf-8")
    except Exception as exc:
        print(f"  SKIP  {path}  ({exc})")
        return False, 0, 0

    lines = original.splitlines()

    if metrics is not None:
        c, d = metrics.get("consumed", 0), metrics.get("declared", 0)
        i, o = metrics.get("fan_in", 0), metrics.get("fan_out", 0)
        cd_str = f" {c}:{d}"
        io_str = f" {i}:{o}"
    else:
        cd_pair, io_pair = _read_existing_cd_io(lines, ext)
        cd_str = f" {cd_pair[0]}:{cd_pair[1]}" if cd_pair else ""
        io_str = f" {io_pair[0]}:{io_pair[1]}" if io_pair else ""

    working = _strip_ann(lines, ext)

    if ext == ".py":
        code, comment = _count_python(working)
        ann = f"# {code}:{comment}{cd_str}{io_str}"
    else:
        code, comment = _count_ts(working)
        ann = f"// {code}:{comment}{cd_str}{io_str}"

    new_text = "\n".join([ann] + working + [ann]) + "\n"
    changed = new_text != original
    if changed:
        path.write_text(new_text, encoding="utf-8")

    return changed, code, comment


# ── file collection ────────────────────────────────────────────────────────────

def collect_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = Path(dirpath) / fn
            if p.suffix in (".py", ".ts", ".tsx"):
                files.append(p)
    return sorted(files)


# ── entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    root = Path(__file__).parent.parent.resolve()
    specific = len(sys.argv) > 1

    if specific:
        targets = [Path(a).resolve() for a in sys.argv[1:]]
        index = None
    else:
        targets = collect_files(root)
        print(f"  {len(targets)} files found — building cross-reference index...")
        index = build_index(targets, root)
        print("  index built.")

    over_budget: list[tuple[Path, int]] = []
    updated = 0

    for path in targets:
        m = index.get(str(path)) if index else None
        changed, code, comment = annotate_file(path, m)
        rel = path.relative_to(root)
        tag = "UPDATED" if changed else "ok    "

        if m:
            c, d = m.get("consumed", 0), m.get("declared", 0)
            i, o = m.get("fan_in", 0), m.get("fan_out", 0)
            print(f"  {tag}  {rel}  [{code}:{comment} {c}:{d} {i}:{o}]")
        else:
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
# 269:50 0:0 0:0
