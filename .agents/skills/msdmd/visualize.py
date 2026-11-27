# ratios: loc_comments=231:15 imports_exports=6:3 calls_definitions=104:9
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
import hashlib
import json
import re
from pathlib import Path

_SAFE_NODE_RE = re.compile(r"[^A-Za-z0-9_]")
_IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")
_COLLECTION_CALL_RE = re.compile(
    r"export\s+default\s+(?:defineMsdmdCollectionV2|defineMsdmdCollection)\s*\("
)


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
    match = _COLLECTION_CALL_RE.search(text)
    if match is None:
        raise ValueError(f"{path} is not JSON or a defineMsdmdCollection TypeScript collection point")
    i = match.end()
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


def _expand_fact_chunks(text: str) -> str:
    """Decode only the generator's literal JSON chunks; never evaluate JS."""
    token = "mergeMsdmdFactChunks("
    decoder = json.JSONDecoder()
    out: list[str] = []
    i = 0
    while i < len(text):
        if text[i] in "\"'":
            quote, start = text[i], i
            i += 1
            while i < len(text):
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == quote:
                    i += 1
                    break
                i += 1
            out.append(text[start:i])
        elif text.startswith(token, i):
            i += len(token)
            facts: list[dict] = []
            while True:
                while i < len(text) and text[i].isspace():
                    i += 1
                chunk, i = decoder.raw_decode(text, i)
                if not isinstance(chunk, list) or not all(isinstance(v, dict) for v in chunk):
                    raise ValueError("fact chunks must be literal JSON object arrays")
                facts.extend(chunk)
                while i < len(text) and text[i].isspace():
                    i += 1
                if i < len(text) and text[i] == ")":
                    i += 1
                    break
                if i >= len(text) or text[i] != ",":
                    raise ValueError("unterminated fact chunks")
                i += 1
            out.append(json.dumps(facts, ensure_ascii=False))
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def load_collection(path: Path) -> dict:
    """Load a collection from JSON, generated, or hand-authored TypeScript."""
    text = _strip_comments(path.read_text(encoding="utf-8")).strip()
    if text.startswith("{"):
        return json.loads(text)

    payload = _expand_fact_chunks(_extract_payload(text, path))
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return json.loads(_object_literal_to_json(payload))


def _node_id(value: str) -> str:
    """Return a collision-resistant Mermaid id for a qualified address."""
    normalized = _SAFE_NODE_RE.sub("_", value).strip("_")[:32] or "hmmm"
    return f"{normalized}_{hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]}"


def _label(value: str) -> str:
    return value.replace('"', "'")


def render_mermaid(collection: dict) -> str:
    """Render schema-1 or schema-2 ``collection`` as Mermaid flowchart text."""
    lines = ["flowchart TD"]
    repo = collection.get("repo", "repo")
    repo_node = _node_id(f"repository:{repo}")
    lines.append(f'  {repo_node}["{_label(str(repo))}"]')

    emitted_nodes = {repo_node}
    labels: dict[str, str] = {}
    for declaration in collection.get("declarations", []):
        address = str(declaration.get("address", declaration["id"]))
        node = _node_id(address)
        label = f'{declaration["id"]}\\n{declaration["block"]}\\n{declaration["file"]}'
        labels[address] = label
        if node not in emitted_nodes:
            lines.append(f'  {node}["{_label(label)}"]')
            lines.append(f"  {repo_node} --> {node}")
            emitted_nodes.add(node)

    for fact in collection.get("facts", []):
        subject = fact.get("subject", {})
        address = str(subject.get("address", fact.get("address", "hmmm")))
        labels.setdefault(
            address,
            f'{subject.get("identity", "hmmm")}\\n{subject.get("scope", fact.get("kind", "native"))}\\n{fact.get("source", {}).get("file", "hmmm")}',
        )

    for edge in collection.get("edges", []):
        source_address = str(edge["from"])
        target_address = str(edge["to"])
        source = _node_id(source_address)
        target = _node_id(target_address)
        if source not in emitted_nodes:
            lines.append(f'  {source}["{_label(labels.get(source_address, source_address))}"]')
            emitted_nodes.add(source)
        if target not in emitted_nodes:
            lines.append(f'  {target}["{_label(labels.get(target_address, target_address))}"]')
            emitted_nodes.add(target)
        lines.append(f'  {source} -- "{_label(str(edge["kind"]))}" --> {target}')

    for index, gap in enumerate(collection.get("gaps", []), start=1):
        node = f"gap_{index}"
        missing = ", ".join(gap.get("missing", []))
        label = f'{gap.get("file", "hmmm")}\\nmissing: {missing or "hmmm"}'
        lines.append(f'  {node}[["{_label(label)}"]]')
        lines.append(f"  {repo_node} -. gap .-> {node}")

    for index, diagnostic in enumerate(collection.get("diagnostics", []), start=1):
        if diagnostic.get("severity") != "error":
            continue
        node = f"diagnostic_{index}"
        label = f'{diagnostic.get("code", "hmmm")}\\n{diagnostic.get("status", "hmmm")}'
        lines.append(f'  {node}{{"{_label(label)}"}}')
        lines.append(f"  {repo_node} -. diagnostic .-> {node}")

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
# ratios: loc_comments=231:15 imports_exports=6:3 calls_definitions=104:9
