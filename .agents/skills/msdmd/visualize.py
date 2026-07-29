# ratios: loc_comments=167:13 imports_exports=5:3 calls_definitions=70:8
"""Render an msdmd collection as a small Mermaid relationship graph.

The input may be raw JSON, the generated TypeScript shape emitted by
``msdmd.collect.render_typescript``, or a hand-authored collection point
(unquoted keys, trailing commas, ``//`` comments, single-quoted strings,
and the ``ratios:`` seal after the closing ``});`` all parse). This helper
is intentionally minimal: it visualizes the normalized ``edges`` array from
a ``MsdmdCollection`` and adds gap nodes for visible coverage gaps.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

_SAFE_NODE_RE = re.compile(r"[^A-Za-z0-9_]")
_IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
_CALL_MARKER = "defineMsdmdCollection("


def _strip_comments(text: str) -> str:
    """Remove ``//`` and ``/* */`` comments outside string literals."""
    out: list[str] = []
    i, n = 0, len(text)
    quote = ""
    while i < n:
        ch = text[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = ""
            i += 1
            continue
        if ch in "\"'":
            quote = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and text[i + 1 : i + 2] == "/":
            while i < n and text[i] != "\n":
                i += 1
            continue
        if ch == "/" and text[i + 1 : i + 2] == "*":
            end = text.find("*/", i + 2)
            i = n if end < 0 else end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _extract_payload(text: str, path: Path) -> str:
    """Return the argument of ``defineMsdmdCollection(...)`` in ``text``."""
    start = text.find(_CALL_MARKER)
    if start < 0:
        raise ValueError(f"{path} is not JSON or a defineMsdmdCollection TypeScript collection point")
    i = start + len(_CALL_MARKER)
    depth, j, quote = 1, i, ""
    while j < len(text):
        ch = text[j]
        if quote:
            if ch == "\\":
                j += 2
                continue
            if ch == quote:
                quote = ""
        elif ch in "\"'":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[i:j]
        j += 1
    raise ValueError(f"{path} has an unterminated defineMsdmdCollection call")


def _object_literal_to_json(text: str) -> str:
    """Convert a comment-free TS/JS object literal to parseable JSON."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch in "\"'":
            buf: list[str] = []
            j = i + 1
            while j < n:
                c = text[j]
                if c == "\\" and j + 1 < n:
                    buf.append(c)
                    buf.append(text[j + 1])
                    j += 2
                    continue
                if c == ch:
                    j += 1
                    break
                buf.append(c)
                j += 1
            content = "".join(buf)
            if ch == "'":
                content = content.replace("\\'", "'").replace('"', '\\"')
            out.append(f'"{content}"')
            i = j
            continue
        if ch in "}]":
            k = len(out) - 1
            while k >= 0 and out[k].isspace():
                k -= 1
            if k >= 0 and out[k] == ",":
                del out[k]
            out.append(ch)
            i += 1
            continue
        match = _IDENT_RE.match(text, i)
        if match:
            ident = match.group(0)
            j = match.end()
            while j < n and text[j].isspace():
                j += 1
            out.append(f'"{ident}"' if j < n and text[j] == ":" else ident)
            i = match.end()
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def load_collection(path: Path) -> dict:
    """Load a collection from JSON, generated, or hand-authored TypeScript."""
    text = _strip_comments(path.read_text(encoding="utf-8")).strip()
    if text.startswith("{"):
        return json.loads(text)

    payload = _extract_payload(text, path)
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return json.loads(_object_literal_to_json(payload))


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
# ratios: loc_comments=167:13 imports_exports=5:3 calls_definitions=70:8
