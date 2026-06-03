# 174:15 0:0 0:0
"""
module_graph — live MODULE_BUILD coverage scanner for the a0p workspace.

Self-contained engine (no cross-repo import) derived from the meta-module-build
runner + msdmd universal parser in The-Interdependency/interdependent-lib. Walks
the workspace, parses MODULE_BUILD blocks, infers a flagged kind for unstamped
files, and emits a module-graph the console Module Graph tab renders.

Read-only: reads source files, never writes. Results are cached briefly so the
tree is not re-walked on every request.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

# Repo root: python/engine/module_graph.py -> parents[2].
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]

_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx"}
_MARKERS = {".py": "#", ".ts": "//", ".tsx": "//", ".js": "//", ".jsx": "//"}
_SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build",
    ".next", ".pytest_cache", ".mypy_cache", ".cache", ".pythonlibs",
    "tests", "test", ".agents", ".github", "attached_assets",
}
_NON_MODULE_NAMES = {"__init__.py", "__main__.py", "conftest.py", "setup.py"}

REQUIRED_FIELDS = (
    "module_name", "module_kind", "summary", "owner",
    "public_surface", "internal_surface", "tests", "rollout", "rollback",
)
BOUNDARY_FIELDS = (
    "auth_boundary", "storage_boundary", "network_boundary",
    "user_data_boundary", "admin_only",
)
VALID_KINDS = {
    "skill", "service", "route", "adapter", "engine", "instrument",
    "ui_panel", "schema", "migration", "worker", "experiment", "hmmm",
}

_KIND_HINTS = (
    ("/routes/", "route"), ("_api.py", "route"), ("/services/", "service"),
    ("/engine/", "engine"), ("/adapters/", "adapter"), ("/workers/", "worker"),
    ("/migrations/", "migration"), ("/models", "schema"), ("/schema", "schema"),
    ("/components/", "ui_panel"), ("/pages/", "ui_panel"), (".tsx", "ui_panel"),
)

_CACHE: dict | None = None
_CACHE_AT: float = 0.0
_TTL_SECONDS = 30.0


def _infer_kind(rel: str) -> str:
    p = "/" + rel.lower()
    for needle, kind in _KIND_HINTS:
        if needle in p:
            return kind
    return "hmmm"


_DOC_MODULE_RE = re.compile(r"^#\s*DOC\s+module:", re.MULTILINE)
_DOC_LABEL_RE = re.compile(r"^#\s*DOC\s+label:", re.MULTILINE)


def _has_doc_cover(text: str, marker: str) -> bool:
    """a0's native self-declaration: a `# DOC module:` + `# DOC label:` block.
    Counted as coverage alongside MODULE_BUILD so the visualizer honors a0's own
    metadata convention rather than demanding a redundant second block."""
    if marker != "#":
        return False
    return bool(_DOC_MODULE_RE.search(text) and _DOC_LABEL_RE.search(text))


def _parse_blocks(text: str, marker: str) -> list[dict]:
    m = re.escape(marker)
    block_re = re.compile(
        rf"^{m} === MODULE_BUILD ===\s*$(?P<body>.*?)^{m} === END MODULE_BUILD ===\s*$",
        re.MULTILINE | re.DOTALL,
    )
    id_re = re.compile(rf"^\s*{m}\s*id:\s*(?P<id>\S+)\s*$")
    field_re = re.compile(rf"^\s*{m}\s+(?P<key>[a-z_]+):\s*(?P<val>.+?)\s*$")
    entries: list[dict] = []
    for block in block_re.finditer(text):
        current: dict | None = None
        for line in block.group("body").splitlines():
            mid = id_re.match(line)
            if mid:
                if current is not None:
                    entries.append(current)
                current = {"id": mid.group("id")}
                continue
            if current is None:
                continue
            mf = field_re.match(line)
            if mf:
                current[mf.group("key")] = mf.group("val")
        if current is not None:
            entries.append(current)
    return entries


def _validate(entry: dict) -> list[str]:
    issues: list[str] = []
    for f in REQUIRED_FIELDS:
        if not entry.get(f):
            issues.append(f"missing required field: {f}")
    for f in BOUNDARY_FIELDS:
        if not entry.get(f):
            issues.append(f"missing boundary field: {f}")
    kind = entry.get("module_kind", "")
    if kind and kind not in VALID_KINDS:
        issues.append(f"unknown module_kind: {kind}")
    return issues


def _iter_source_files(root: Path):
    if root.name in _SKIP_DIRS:
        return
    try:
        children = sorted(root.iterdir())
    except OSError:
        return
    for child in children:
        if child.is_dir():
            if child.name not in _SKIP_DIRS:
                yield from _iter_source_files(child)
        elif child.is_file() and child.suffix.lower() in _EXTS:
            yield child


def _compute() -> dict:
    nodes: list[dict] = []
    for path in _iter_source_files(WORKSPACE_ROOT):
        if path.name in _NON_MODULE_NAMES:
            continue
        rel = str(path.relative_to(WORKSPACE_ROOT))
        marker = _MARKERS.get(path.suffix.lower(), "#")
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            text = ""
        entries = _parse_blocks(text, marker) if text else []
        if entries:
            for e in entries:
                nodes.append({
                    "id": e.get("id") or rel,
                    "path": rel,
                    "stamped": True,
                    "source": "module_build",
                    "module_kind": e.get("module_kind", "hmmm"),
                    "kind_inferred": False,
                    "owner": e.get("owner", ""),
                    "issues": _validate(e),
                })
        elif _has_doc_cover(text, marker):
            nodes.append({
                "id": rel,
                "path": rel,
                "stamped": True,
                "source": "doc",
                "module_kind": _infer_kind(rel),
                "kind_inferred": True,
                "owner": "",
                "issues": [],
            })
        else:
            nodes.append({
                "id": rel,
                "path": rel,
                "stamped": False,
                "source": None,
                "module_kind": _infer_kind(rel),
                "kind_inferred": True,
                "owner": "",
                "issues": ["coverage gap: no MODULE_BUILD or DOC declaration"],
            })

    stamped = sum(1 for n in nodes if n["stamped"])
    total = len(nodes)
    # gaps grouped by top-level directory
    gap_dirs: dict[str, int] = {}
    for n in nodes:
        if not n["stamped"]:
            top = n["path"].split("/")[0]
            gap_dirs[top] = gap_dirs.get(top, 0) + 1
    kinds: dict[str, int] = {}
    sources: dict[str, int] = {}
    for n in nodes:
        if n["stamped"]:
            kinds[n["module_kind"]] = kinds.get(n["module_kind"], 0) + 1
            src = n.get("source") or "unknown"
            sources[src] = sources.get(src, 0) + 1
    return {
        "modules": total,
        "stamped": stamped,
        "gaps": total - stamped,
        "coverage_pct": round(100 * stamped / total, 1) if total else 0.0,
        "kinds": kinds,
        "sources": sources,
        "gap_dirs": gap_dirs,
        "nodes": nodes,
    }


def scan(force: bool = False) -> dict:
    """Return the cached module-graph, recomputing if stale or ``force``."""
    global _CACHE, _CACHE_AT
    now = time.time()
    if force or _CACHE is None or (now - _CACHE_AT) > _TTL_SECONDS:
        _CACHE = _compute()
        _CACHE_AT = now
    return _CACHE
# 174:15 0:0 0:0
