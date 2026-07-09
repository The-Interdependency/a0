# ratios: loc_comments=141:7 imports_exports=6:3 calls_definitions=35:6
"""Generate repo-level msdmd collection-point TypeScript.

This is a small stdlib helper for consuming repos that want to generate a
`<reponame>_msdmd.ts` aggregation file from module-local msdmd blocks.
It uses the universal parser and emits data shaped by `msdmd/collection.ts`.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable

from msdmd.parsers.universal import walk_tree

DEFAULT_BLOCK_NAMES = (
    "DOCS",
    "CAPABILITIES",
    "DEPENDENCIES",
    "OWNERS",
    "CONTRACTS",
    "MODULE_BUILD",
    "BOUNDARIES",
    "RATIOS",
    "LLMS",
    "FRONTEND_META",
)

EDGE_FIELDS = {
    "requires": "requires",
    "exposes": "exposes",
    "owner": "owns",
    "covers": "covers",
    "call": "calls",
    "boundaries": "risk",
}


def _split_targets(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _declaration(file: Path, root: Path, block: str, entry: dict) -> dict:
    fields = {str(key): str(value) for key, value in entry.items() if key != "id"}
    return {
        "file": file.relative_to(root).as_posix(),
        "block": block,
        "id": str(entry["id"]),
        "fields": fields,
    }


def _edges_for(declaration: dict) -> list[dict]:
    edges: list[dict] = []
    fields = declaration["fields"]
    source = declaration["id"]
    for field, kind in EDGE_FIELDS.items():
        value = fields.get(field)
        if not value or value == "hmmm":
            continue
        for target in _split_targets(value):
            edges.append(
                {
                    "from": source,
                    "to": target,
                    "kind": kind,
                    "source_block": declaration["block"],
                    "source_id": source,
                }
            )
    return edges


def collect(
    root: Path,
    repo: str,
    *,
    block_names: Iterable[str] = DEFAULT_BLOCK_NAMES,
    expected_blocks: Iterable[str] = (),
    source_commit: str | None = None,
) -> dict:
    """Collect msdmd declarations and optional coverage gaps under ``root``."""
    root = root.resolve()
    block_names = tuple(block_names)
    expected_blocks = tuple(expected_blocks)

    declarations: list[dict] = []
    missing_by_file: dict[str, set[str]] = {}

    for block in block_names:
        annotated, _ = walk_tree(root, block)
        for file, entries in annotated:
            for entry in entries:
                if "id" not in entry:
                    continue
                declarations.append(_declaration(file.resolve(), root, block, entry))

    for block in expected_blocks:
        _, missing_files = walk_tree(root, block)
        for file in missing_files:
            relative = file.resolve().relative_to(root).as_posix()
            missing_by_file.setdefault(relative, set()).add(block)

    declarations.sort(key=lambda item: (item["file"], item["block"], item["id"]))
    gaps = [
        {"file": file, "missing": sorted(missing)}
        for file, missing in sorted(missing_by_file.items())
    ]
    edges = [edge for declaration in declarations for edge in _edges_for(declaration)]
    edges.sort(key=lambda item: (item["source_block"], item["source_id"], item["kind"], item["to"]))

    collection = {
        "repo": repo,
        "declarations": declarations,
        "gaps": gaps,
        "edges": edges,
    }
    if source_commit:
        collection["source_commit"] = source_commit
    return collection


def render_typescript(collection: dict, *, import_path: str) -> str:
    """Render a collection as a `<reponame>_msdmd.ts` module."""
    payload = json.dumps(collection, indent=2, sort_keys=True)
    return (
        f'import {{ defineMsdmdCollection }} from "{import_path}";\n\n'
        f"export default defineMsdmdCollection({payload});\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."), help="repo root to scan")
    parser.add_argument("--repo", required=True, help="repository slug for the collection")
    parser.add_argument("--out", type=Path, help="output .ts path; stdout when omitted")
    parser.add_argument(
        "--block",
        action="append",
        dest="blocks",
        help="block name to collect; may be repeated; defaults to all known blocks",
    )
    parser.add_argument(
        "--expected-block",
        action="append",
        default=[],
        help="block expected on every source file for gap reporting; may be repeated",
    )
    parser.add_argument(
        "--import-path",
        default="./.agents/skills/msdmd/collection",
        help="TypeScript import path for defineMsdmdCollection",
    )
    parser.add_argument("--source-commit", help="source commit SHA to record")
    args = parser.parse_args()

    collection = collect(
        args.root,
        args.repo,
        block_names=args.blocks or DEFAULT_BLOCK_NAMES,
        expected_blocks=args.expected_block,
        source_commit=args.source_commit,
    )
    rendered = render_typescript(collection, import_path=args.import_path)
    if args.out:
        args.out.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=141:7 imports_exports=6:3 calls_definitions=35:6
