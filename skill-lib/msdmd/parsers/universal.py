# 85:29
"""Universal msdmd parser — pure stdlib.

Implements the parser contract from ``msdmd/SKILL.md``: extracts every
``# === <BLOCK_NAME> ===`` … ``# === END <BLOCK_NAME> ===`` block from
a source file and returns its entries as flat dicts.

Comment marker is auto-detected by file extension. The block syntax
itself is identical across languages; only the per-line marker changes.

Public API:

    parse_text(text, block_name, marker="#") -> list[dict]
    parse_file(path, block_name) -> list[dict]
    walk_tree(root, block_name, *, skip=None) -> tuple[annotated, untested]

This module has zero non-stdlib dependencies and is safe to copy
verbatim into any project that wants msdmd support.
"""
from __future__ import annotations
import re
from pathlib import Path
from typing import Iterable

# extension → comment marker
_MARKERS: dict[str, str] = {
    ".py": "#", ".rb": "#", ".ex": "#", ".exs": "#", ".sh": "#",
    ".ts": "//", ".tsx": "//", ".js": "//", ".jsx": "//", ".mjs": "//",
    ".rs": "//", ".go": "//", ".java": "//", ".c": "//", ".cpp": "//",
    ".cc": "//", ".h": "//", ".hpp": "//", ".swift": "//", ".kt": "//",
    ".sql": "--", ".lua": "--", ".hs": "--",
}

_DEFAULT_SKIP = (
    "__pycache__", "node_modules", ".git", ".venv", "venv",
    "dist", "build", ".next", ".nuxt", "target", ".pytest_cache",
    ".mypy_cache", ".tox",
)


def marker_for(path: Path) -> str | None:
    """Return the comment marker for a file path, or None if unsupported."""
    return _MARKERS.get(path.suffix.lower())


def _block_regex(block_name: str, marker: str) -> re.Pattern[str]:
    m = re.escape(marker)
    name = re.escape(block_name)
    return re.compile(
        rf"^{m} === {name} ===\s*$(?P<body>.*?)^{m} === END {name} ===\s*$",
        re.MULTILINE | re.DOTALL,
    )


def parse_text(text: str, block_name: str, marker: str = "#") -> list[dict]:
    """Extract every entry from every matching block in ``text``.

    Entries are flat ``dict[str, str]`` keyed by field name. The first
    line of an entry must be ``id: <value>``; subsequent lines until
    the next ``id:`` (or block end) carry indented ``<key>: <value>``
    pairs.
    """
    block_re = _block_regex(block_name, marker)
    m = re.escape(marker)
    id_re = re.compile(rf"^\s*{m}\s*id:\s*(?P<id>\S+)\s*$")
    field_re = re.compile(rf"^\s*{m}\s+(?P<key>[a-z_]+):\s*(?P<val>.+?)\s*$")

    entries: list[dict] = []
    for block in block_re.finditer(text):
        current: dict[str, str] | None = None
        for line in block.group("body").splitlines():
            line = line.rstrip()
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


def parse_file(path: Path, block_name: str) -> list[dict]:
    """Parse a single file. Returns [] if the file's extension has no
    known comment marker or if the file can't be read."""
    marker = marker_for(path)
    if marker is None:
        return []
    try:
        return parse_text(path.read_text(encoding="utf-8"), block_name, marker)
    except (OSError, UnicodeDecodeError):
        return []


def walk_tree(
    root: Path,
    block_name: str,
    *,
    skip: Iterable[str] | None = None,
    extensions: Iterable[str] | None = None,
) -> tuple[list[tuple[Path, list[dict]]], list[Path]]:
    """Walk ``root`` and partition source files into (annotated, untested).

    ``annotated`` is a list of ``(path, entries)`` for every file that
    contains at least one entry of ``block_name``. ``untested`` is every
    other source file (still filtered by extension and skip-dirs) so
    coverage gaps remain observable.
    """
    skip_set = set(skip) if skip is not None else set(_DEFAULT_SKIP)
    ext_set = (
        set(e.lower() if e.startswith(".") else "." + e.lower() for e in extensions)
        if extensions is not None
        else set(_MARKERS.keys())
    )
    annotated: list[tuple[Path, list[dict]]] = []
    untested: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in skip_set for part in path.parts):
            continue
        if path.suffix.lower() not in ext_set:
            continue
        entries = parse_file(path, block_name)
        if entries:
            annotated.append((path, entries))
        else:
            untested.append(path)
    return annotated, untested
# 85:29
