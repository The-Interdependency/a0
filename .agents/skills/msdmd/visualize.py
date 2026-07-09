# ratios: loc_comments=63:8 imports_exports=5:3 calls_definitions=40:5
"""Render an msdmd collection as a small Mermaid relationship graph.

The input may be raw JSON or the generated TypeScript shape emitted by
``msdmd.collect.render_typescript``. This helper is intentionally minimal:
it visualizes the normalized ``edges`` array from a ``MsdmdCollection`` and
adds gap nodes for visible coverage gaps.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

_TS_COLLECTION_RE = re.compile(r"defineMsdmdCollection\((?P<payload>.*)\);\s*$", re.DOTALL)
_SAFE_NODE_RE = re.compile(r"[^A-Za-z0-9_]")


def load_collection(path: Path) -> dict:
    """Load a collection from JSON or generated TypeScript."""
    text = path.read_text(encoding="utf-8")
    stripped = text.strip()
    if stripped.startswith("{"):
        return json.loads(stripped)

    match = _TS_COLLECTION_RE.search(stripped)
    if not match:
        raise ValueError(f"{path} is not JSON or generated defineMsdmdCollection TypeScript")
    return json.loads(match.group("payload"))


def _node_id(value: str) -> str:
    normalized = _SAFE_NODE_RE.sub("_", value).strip("_")
    return normalized or "hmmm"


def _label(value: str) -> str:
    return value.replace('"', "'")


def render_mermaid(collection: dict) -> str:
    """Render ``collection`` as Mermaid flowchart text."""
    lines = ["flowchart TD"]
    repo = collection.get("repo", "repo")
    lines.append(f'  repo["{_label(str(repo))}"]')

    emitted_nodes = {"repo"}
    for declaration in collection.get("declarations", []):
        node = _node_id(str(declaration["id"]))
        label = f'{declaration["id"]}\\n{declaration["block"]}\\n{declaration["file"]}'
        if node not in emitted_nodes:
            lines.append(f'  {node}["{_label(label)}"]')
            lines.append(f"  repo --> {node}")
            emitted_nodes.add(node)

    for edge in collection.get("edges", []):
        source = _node_id(str(edge["from"]))
        target = _node_id(str(edge["to"]))
        if source not in emitted_nodes:
            lines.append(f'  {source}["{_label(str(edge["from"]))}"]')
            emitted_nodes.add(source)
        if target not in emitted_nodes:
            lines.append(f'  {target}["{_label(str(edge["to"]))}"]')
            emitted_nodes.add(target)
        lines.append(f'  {source} -- "{_label(str(edge["kind"]))}" --> {target}')

    for index, gap in enumerate(collection.get("gaps", []), start=1):
        node = f"gap_{index}"
        missing = ", ".join(gap.get("missing", []))
        label = f'{gap.get("file", "hmmm")}\\nmissing: {missing or "hmmm"}'
        lines.append(f'  {node}[["{_label(label)}"]]')
        lines.append(f"  repo -. gap .-> {node}")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", type=Path, help="collection .json or generated .ts file")
    parser.add_argument("--out", type=Path, help="output .mmd path; stdout when omitted")
    args = parser.parse_args()

    rendered = render_mermaid(load_collection(args.collection))
    if args.out:
        args.out.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=63:8 imports_exports=5:3 calls_definitions=40:5
