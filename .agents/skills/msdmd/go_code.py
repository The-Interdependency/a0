# ratios: loc_comments=158:35 imports_exports=8:1 calls_definitions=62:5
"""Read Go source metadata without compiling, importing or running directives.

Usage: ``read_go(path, supplied_bytes, context)`` through ``msdmd.collect``.
The pinned tree-sitter grammar owns syntax; this reader owns qualified symbol
and comment attachment. Raw signatures, struct tag literals and directives stay
source-linked. Build selection, types, tag semantics and imports are not resolved.
"""
# === MODULE_BUILD ===
# id: go_metadata_reader
#   module_name: go_code
#   module_kind: instrument
#   summary: collect native Go metadata from immutable source bytes
#   owner: The Interdependency skill-lib
#   public_surface: read_go
#   internal_surface: AST ownership and comment attachment
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_go_metadata.py
#   rollout: schema 2 Go reader registration
#   rollback: revert reader registration and consumer pin
# === END MODULE_BUILD ===
# === CONTRACTS ===
# id: go_native_source_is_inert
#   given: Go source including directives and block-shaped strings
#   then: recover actual declarations and comments without executing target code or treating strings as comments
# id: go_native_scope_is_preserved
#   given: Go declarations, receiver methods, fields and adjacent or detached comments
#   then: retain qualified owners, raw source spans and distinct attachment kinds
# id: go_reader_failure_is_visible
#   given: invalid source or unavailable parser runtime
#   then: required collection fails with explicit diagnostics
# === END CONTRACTS ===
from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import re
from typing import Any

_DECLARATIONS = frozenset({"function_declaration", "method_declaration", "type_spec",
    "type_alias", "var_spec", "const_spec", "field_declaration", "method_elem"})


def read_go(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    """Extract the fixture-backed Go grammar subset; supplied source is inert."""
    from tree_sitter import Language, Parser
    import tree_sitter_go
    from msdmd.readers import _fact, _diagnostic

    data.decode("utf-8")  # Reject invalid UTF-8 before accepting recovered syntax.
    tree = Parser(Language(tree_sitter_go.language())).parse(data)
    rid = "go-tree-sitter"
    context = dict(context, convention_version="tree-sitter-go@0.25.0", dialect="Go")
    facts, diagnostics = [], []
    counts: dict[tuple[str, str], int] = defaultdict(int)
    owners: dict[int, tuple[str, str]] = {}
    nodes, stack = [], [tree.root_node]
    while stack:
        node = stack.pop()
        nodes.append(node)
        stack.extend(reversed(node.named_children))

    def text(node: Any) -> str:
        return data[node.start_byte:node.end_byte].decode("utf-8")

    def emit(node: Any, kind: str, identity: str, value: Any, scope: str = "symbol",
             end: Any = None, convention: str = "go.source-metadata") -> None:
        last = end if end is not None else node
        fact = _fact(context, reader_id=rid, kind=kind, scope=scope, identity=identity,
            location={"start_line": node.start_point.row + 1, "end_line": last.end_point.row + 1,
                      "start_byte": node.start_byte, "end_byte": last.end_byte},
            value=value, convention=convention)
        key = (kind, identity)
        fact["address"] = fact["subject"]["address"] + "/fact/" + kind + "/" + str(counts[key])
        counts[key] += 1
        facts.append(fact)

    if tree.root_node.has_error:
        diagnostics.append(_diagnostic(context, reader_id=rid, code="go_grammar_error",
            message="Pinned Go grammar could not parse this source completely; facts are partial, not a compiler verdict",
            status="invalid", severity="error"))
    package = next((n for n in tree.root_node.named_children if n.type == "package_clause"), None)
    package_name = text(package.named_children[0]) if package and package.named_children else "hmmm"
    if package is None:
        diagnostics.append(_diagnostic(context, reader_id=rid, code="go_package_missing",
            message="Go source has no package clause", status="invalid", severity="error"))
    else:
        owners[package.id] = (package_name, "package")
        emit(package, "package-declaration", package_name, {"name": package_name}, "package")

    def enclosing(node: Any) -> tuple[str, str]:
        parent = node.parent
        while parent is not None:
            if parent.id in owners:
                return owners[parent.id]
            parent = parent.parent
        return package_name, "module"

    def base_type(node: Any) -> str:
        if node.type in {"type_identifier", "qualified_type"}:
            return text(node)
        child = node.child_by_field_name("type")
        if child is None:
            child = next((c for c in node.named_children if c.type not in {"identifier", "comment"}), None)
        return base_type(child) if child is not None else text(node)

    for node in nodes:
        if node.type in {"type_declaration", "var_declaration", "const_declaration"}:
            if any(c.type == "(" for c in node.children):
                parent, _ = enclosing(node)
                key = ("group", parent + "." + node.type)
                identity = key[1] + ":" + str(counts[key])
                counts[key] += 1
                owners[node.id] = (identity, "declaration-group")
                emit(node, "declaration-group", identity, {"syntax_kind": node.type}, "declaration-group")
        if node.type in _DECLARATIONS:
            names = [text(n) for n in node.children_by_field_name("name") if n.is_named]
            if not names and node.type == "field_declaration":
                typ = node.child_by_field_name("type")
                names = [base_type(typ)] if typ else []
            if not names:
                continue
            parent, parent_scope = enclosing(node)
            if parent_scope == "declaration-group":
                parent, _ = enclosing(node.parent)
            receiver = node.child_by_field_name("receiver")
            if receiver:
                receiver_type = receiver.named_children[0].child_by_field_name("type")
                parent = package_name + "." + base_type(receiver_type)
            identity = parent + "." + ",".join(names)
            owners[node.id] = (identity, "symbol")
            container = node.parent
            if container and container.type in {"type_declaration", "var_declaration", "const_declaration"}:
                if not any(c.type == "(" for c in container.children):
                    owners[container.id] = (identity, "symbol")
            body = node.child_by_field_name("body")
            value = {"names": names, "qualified_name": identity, "syntax_kind": node.type,
                "signature": data[node.start_byte:body.start_byte if body else node.end_byte].decode("utf-8").strip(),
                "exported_names": [name for name in names if name[0].isupper()],
                "build_selection": "not-evaluated"}
            if receiver:
                value["receiver"] = text(receiver)
            tag = node.child_by_field_name("tag")
            if tag:
                value["struct_tag_literal"] = text(tag)
                value["tag_semantics"] = "not-evaluated"
            emit(node, "symbol-declaration", identity, value)
        if node.type == "import_spec":
            import_path = node.child_by_field_name("path")
            alias = node.child_by_field_name("name")
            emit(node, "import-declaration", package_name, {"path_literal": text(import_path),
                "alias": text(alias) if alias else None, "resolution": "not-performed"}, "module")

    comments = [node for node in nodes if node.type == "comment"]
    groups: list[list[Any]] = []
    for node in comments:
        previous = groups[-1][-1] if groups else None
        first = groups[-1][0] if groups else None
        leading_group = first is not None and not data[data.rfind(b"\n", 0, first.start_byte) + 1:first.start_byte].strip()
        if (previous is not None and previous.parent == node.parent
                and (leading_group or node.start_point.row == previous.end_point.row)
                and node.start_point.row <= previous.end_point.row + 1
                and not data[previous.end_byte:node.start_byte].strip()):
            groups[-1].append(node)
        else:
            groups.append([node])
    for group in groups:
        first, last = group[0], group[-1]
        identity, scope = enclosing(first)
        attachment = "enclosing" if scope == "symbol" else "module"
        following = last.next_named_sibling
        preceding = first.prev_named_sibling
        prefix = data[data.rfind(b"\n", 0, first.start_byte) + 1:first.start_byte]
        if (not prefix.strip() and following is not None and following.id in owners
                and following.start_point.row <= last.end_point.row + 1
                and not data[last.end_byte:following.start_byte].strip()):
            identity, scope = owners[following.id]
            attachment = "leading-documentation"
        elif (preceding is not None and preceding.id in owners
                and preceding.end_point.row == first.start_point.row):
            identity, scope = owners[preceding.id]
            attachment = "trailing-comment"
        raw = data[first.start_byte:last.end_byte].decode("utf-8")
        emit(first, "comment", identity, {"text": raw, "attachment": attachment}, scope, last)
        doc_parts = []
        for node in group:
            comment = text(node)
            directive = re.fullmatch(r"//(?:(go:[^\s]+|line)\s*(.*)|\s+(\+build)\s+(.*))", comment)
            if directive:
                name = directive[1] or directive[3]
                emit(node, "source-directive", identity, {"name": name,
                    "arguments": directive[2] if directive[1] else directive[4],
                    "text": comment, "execution": "not-performed",
                    "before_package": package is not None and node.end_byte < package.start_byte}, scope)
            else:
                doc_parts.append(comment)
            for match in re.finditer(r"SPDX-(License-Identifier|FileCopyrightText):\s*([^\n*]+)", comment):
                emit(node, "license-declaration", package_name,
                    {"tag": "SPDX-" + match[1], "value": match[2].strip()}, "module", convention="spdx.source-header")
        if attachment == "leading-documentation" and doc_parts:
            emit(first, "documentation-comment", identity, {"text": "\n".join(doc_parts),
                "attachment": attachment, "rendering": "raw-comments"}, scope, last, "go.doc-comment")
    return facts, [], diagnostics
# ratios: loc_comments=158:35 imports_exports=8:1 calls_definitions=62:5
