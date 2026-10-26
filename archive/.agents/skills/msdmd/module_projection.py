# ratios: loc_comments=910:128 imports_exports=14:10 calls_definitions=259:54
# === MODULE_BUILD ===
# id: msdmd_python_module_projection
#   module_name: module_projection
#   module_kind: instrument
#   summary: derives deterministic per-module JSONL metadata with structural symbol attachment from Python source without executing it
#   owner: The Interdependency skill-lib
#   public_surface: project_python_module, render_jsonl, project_tree, write_projections, check_projections
#   internal_surface: Python symbol discovery, comment grouping, structural attachment, freshness computation
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_module_projection.py
#   rollout: explicit python -m msdmd.module_projection --write invocation
#   rollback: remove the runner and generated projection directories; native sources remain authoritative
# === END MODULE_BUILD ===
# === CAPABILITIES ===
# id: python_module_metadata_projection
#   exposes: deterministic JSONL projection, Python symbol identities, native docstrings, structurally attached comments, freshness key
#   summary: creates one generated metadata sidecar per Python module while keeping source locations navigational rather than identity-bearing
#   limitations: Python source only; call graphs, runtime behavior, cross-revision rename identity, and non-Python readers remain hmmm
# === END CAPABILITIES ===
# === CONTRACTS ===
# id: module_projection_line_shift_stability
#   given: blank or comment lines are inserted without changing declaration structure
#   then: metadata remains attached to the same qualified symbol identity after regeneration
#   class: identity
#
# id: module_projection_never_executes_source
#   given: inspected Python source contains executable top-level code
#   then: projection parses bytes without importing or executing the inspected module
#   class: safety
#
# id: module_projection_freshness_binds_source_and_reader
#   given: source bytes, schema, reader implementation, support manifest, or effective Python AST grammar changes
#   then: the deterministic projection freshness key changes
#   class: provenance
# === END CONTRACTS ===
"""Generate deterministic, structurally attached Python module metadata.

This runner is the first executable native-reader slice of MSDMD.  Native
source remains authoritative; generated JSONL files are disposable projections.
Each projection binds the source digest, reader digest, schema version, effective
Python AST grammar, symbols, docstrings, comments, source spans, and attachment
method.

Usage::

    python -m msdmd.module_projection \
        --root . --repo The-Interdependency/example \
        --out-dir .msdmd/modules --write

    python -m msdmd.module_projection \
        --root . --repo The-Interdependency/example \
        --out-dir .msdmd/modules --check

Use ``--source path/to/module.py`` one or more times to limit the selected
modules.  A complete-tree ``--write`` replaces declared projection files and
removes stale JSONL projections below ``--out-dir``; a selected write never
prunes files outside its selection.  ``--check`` performs no writes and fails
when a selected projection is missing, stale, or invalid.  Complete-tree checks
also reject unexpected projections.  No inspected module is imported or
executed.

Attachment rules:

* a comment group immediately preceding a declaration at the same lexical
  depth is leading trivia for that declaration;
* otherwise a comment inside a declaration, including comments before or
  between its decorators and trailing indented suite comments before lexical
  dedent, belongs to the nearest enclosing declaration;
* headers, MSDMD fences, RATIOS, encoding cookies, and unattached comments stay
  at module scope;
* native module/class/function docstrings attach directly to their AST owner.

Interrupted, unclosed, or name-mismatched MSDMD fences, opening fences inside
an open block, and closing fences without an opening produce diagnostics instead
of spanning intervening code or being accepted as a block.  A mismatch
(wrong-name close or nested opening) yields one diagnostic: one later close per
affected block name, orphaned by that already-reported mismatch, is suppressed
until the next opening of that name.  An interrupted fence may also report its
later closing fence as unmatched.  This is stricter than the
universal block parser, which matches each requested block name independently.

Source lines are split only at Python newlines (LF, CRLF, and CR); U+2028, NEL,
form feed, and other Unicode separators remain inside their physical line.
Line and byte ranges are navigational facts for the pinned source digest.  They
never form a symbol identity, so inserting lines cannot change ownership.  Byte
offsets index the UTF-8 re-encoding of the decoded source text, so they differ
from raw file offsets for BOM-prefixed or non-UTF-8 sources.
Projection files are written as exact UTF-8 bytes with LF record terminators on
every platform.
"""
from __future__ import annotations

import argparse
import ast
import codecs
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import tokenize
from typing import Iterable, Iterator, Sequence


SCHEMA_ID = "urn:the-interdependency:msdmd:module-projection:1"
SCHEMA_VERSION = "1.0.0"
READER_ID = "the-interdependency.msdmd.python-ast-tokenize"
READER_VERSION = "1.0.0"
PROJECTION_SUFFIX = ".msdmd.jsonl"

DEFAULT_SKIP_DIRS = frozenset(
    {
        ".git",
        ".agents",
        ".venv",
        "__pycache__",
        "build",
        "dist",
        "node_modules",
        "target",
        "venv",
    }
)

_COOKIE_RE = re.compile(br"^[ \t\f]*#.*?coding[:=][ \t]*([-_.a-zA-Z0-9]+)")
_BLANK_OR_COMMENT_RE = re.compile(br"^[ \t\f]*(?:[#\r\n]|$)")
_FENCE_RE = re.compile(r"^===\s+(END\s+)?([A-Z][A-Z0-9_]*)\s+===$")
# Python recognizes only LF, CRLF, and CR as source newlines.  str.splitlines()
# additionally splits on U+2028, U+2029, NEL, form feed, and other separators,
# which would desynchronize line indexes from AST and tokenize positions.
_PYTHON_NEWLINE_RE = re.compile(r"\r\n|\r|\n")
_PYTHON_NEWLINE_BYTES_RE = re.compile(br"\r\n|\r|\n")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _reader_sha256() -> str:
    return _sha256(Path(__file__).read_bytes())


def _schema_sha256() -> str:
    return _sha256(Path(__file__).with_name("module-projection.schema.json").read_bytes())


def _reader_manifest_sha256() -> str:
    return _sha256(Path(__file__).with_name("python-module-reader.json").read_bytes())


def _runtime_identity() -> dict[str, str]:
    return {
        "python_implementation": sys.implementation.name,
        "python_version": ".".join(str(value) for value in sys.version_info[:3]),
        "ast_feature_version": f"{sys.version_info.major}.{sys.version_info.minor}",
    }


def _python_source_lines(text: str) -> list[str]:
    """Split decoded source at Python newlines only, keeping line endings."""

    lines: list[str] = []
    start = 0
    for match in _PYTHON_NEWLINE_RE.finditer(text):
        lines.append(text[start:match.end()])
        start = match.end()
    if start < len(text):
        lines.append(text[start:])
    return lines


def _python_source_byte_lines(source: bytes) -> list[bytes]:
    """Split raw source bytes at Python newlines only, keeping line endings."""

    lines: list[bytes] = []
    start = 0
    for match in _PYTHON_NEWLINE_BYTES_RE.finditer(source):
        lines.append(source[start:match.end()])
        start = match.end()
    if start < len(source):
        lines.append(source[start:])
    return lines


def _byte_line_reader(source: bytes):
    """Return a readline callable that yields Python-newline-delimited lines."""

    iterator = iter(_python_source_byte_lines(source))

    def readline() -> bytes:
        return next(iterator, b"")

    return readline


def _line_start_bytes(lines: Sequence[str]) -> list[int]:
    offsets = [0]
    total = 0
    for line in lines:
        total += len(line.encode("utf-8"))
        offsets.append(total)
    return offsets


def _byte_offset(lines: Sequence[str], starts: Sequence[int], line: int, column: int) -> int:
    if line < 1:
        return 0
    line_index = min(line - 1, max(len(lines) - 1, 0))
    prefix = lines[line_index][:column] if lines else ""
    return starts[line_index] + len(prefix.encode("utf-8"))


def _span(
    lines: Sequence[str],
    starts: Sequence[int],
    start_line: int,
    start_column: int,
    end_line: int,
    end_column: int,
) -> dict:
    return {
        "start": {
            "line": start_line,
            "column": start_column,
            "byte": _byte_offset(lines, starts, start_line, start_column),
        },
        "end": {
            "line": end_line,
            "column": end_column,
            "byte": _byte_offset(lines, starts, end_line, end_column),
        },
    }


def _node_span(node: ast.AST, lines: Sequence[str], starts: Sequence[int]) -> dict:
    def character_column(line: int, utf8_byte_column: int) -> int:
        if not lines:
            return 0
        line_index = min(max(line - 1, 0), len(lines) - 1)
        prefix = lines[line_index].encode("utf-8")[:utf8_byte_column]
        return len(prefix.decode("utf-8"))

    start_line = int(getattr(node, "lineno", 1))
    end_line = int(getattr(node, "end_lineno", start_line))
    return _span(
        lines,
        starts,
        start_line,
        character_column(start_line, int(getattr(node, "col_offset", 0))),
        end_line,
        character_column(end_line, int(getattr(node, "end_col_offset", 0))),
    )


def _module_address(repo: str, source_path: str) -> str:
    return f"python:{repo}:{source_path}::<module>"


@dataclass(frozen=True)
class Symbol:
    node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef
    qualified_name: str
    kind: str
    depth: int
    header_line: int
    identity: str
    signature: str
    signature_sha256: str
    parent_identity: str | None

    @property
    def start_line(self) -> int:
        return int(self.node.lineno)

    @property
    def end_line(self) -> int:
        return int(self.node.end_lineno or self.node.lineno)

    @property
    def column(self) -> int:
        return int(self.node.col_offset)


@dataclass(frozen=True)
class CommentGroup:
    tokens: tuple[tokenize.TokenInfo, ...]

    @property
    def start_line(self) -> int:
        return self.tokens[0].start[0]

    @property
    def start_column(self) -> int:
        return self.tokens[0].start[1]

    @property
    def end_line(self) -> int:
        return self.tokens[-1].end[0]

    @property
    def end_column(self) -> int:
        return self.tokens[-1].end[1]

    @property
    def text_lines(self) -> tuple[str, ...]:
        values = []
        for token in self.tokens:
            text = token.string[1:]
            if text.startswith(" "):
                text = text[1:]
            values.append(text)
        return tuple(values)


@dataclass(frozen=True)
class CommentDiagnostic:
    code: str
    message: str
    line: int | None = None


def _signature(node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) -> tuple[str, str]:
    type_params = [ast.unparse(item) for item in getattr(node, "type_params", [])]
    type_suffix = f"[{', '.join(type_params)}]" if type_params else ""
    if isinstance(node, ast.ClassDef):
        arguments = [ast.unparse(base) for base in node.bases]
        arguments.extend(ast.unparse(keyword) for keyword in node.keywords)
        text = (
            f"class {node.name}{type_suffix}({', '.join(arguments)})"
            if arguments
            else f"class {node.name}{type_suffix}"
        )
        identity_tree = {
            "kind": "class",
            "bases": [ast.dump(base, include_attributes=False) for base in node.bases],
            "keywords": [ast.dump(item, include_attributes=False) for item in node.keywords],
            "type_params": [
                ast.dump(item, include_attributes=False)
                for item in getattr(node, "type_params", [])
            ],
        }
    else:
        prefix = "async def" if isinstance(node, ast.AsyncFunctionDef) else "def"
        arguments = ast.unparse(node.args)
        returns = f" -> {ast.unparse(node.returns)}" if node.returns is not None else ""
        text = f"{prefix} {node.name}{type_suffix}({arguments}){returns}"
        identity_tree = {
            "kind": "async_function" if isinstance(node, ast.AsyncFunctionDef) else "function",
            "arguments": ast.dump(node.args, include_attributes=False),
            "returns": ast.dump(node.returns, include_attributes=False) if node.returns else None,
            "type_params": [
                ast.dump(item, include_attributes=False)
                for item in getattr(node, "type_params", [])
            ],
        }
    return text, _sha256(_canonical_json(identity_tree).encode("utf-8"))


def _kind(node: ast.AST, parent_kind: str | None) -> str:
    if isinstance(node, ast.ClassDef):
        return "class"
    if parent_kind == "class":
        return "async_method" if isinstance(node, ast.AsyncFunctionDef) else "method"
    return "async_function" if isinstance(node, ast.AsyncFunctionDef) else "function"


def _header_line(node: ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) -> int:
    decorators = [int(item.lineno) for item in node.decorator_list]
    return min([int(node.lineno), *decorators])


def _discover_symbols(tree: ast.Module, repo: str, source_path: str) -> list[Symbol]:
    discovered: list[tuple[ast.AST, str, str, int, int, str, str, str | None]] = []

    def visit_node(
        node: ast.AST,
        names: tuple[str, ...],
        parent_kind: str | None,
        parent_key: str | None,
        depth: int,
    ) -> None:
        if isinstance(node, (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            qualified = ".".join((*names, node.name))
            kind = _kind(node, parent_kind)
            signature, signature_digest = _signature(node)
            base = f"python:{repo}:{source_path}::{kind}:{qualified}"
            discovered.append(
                (node, qualified, kind, depth, _header_line(node), signature, signature_digest, parent_key)
            )
            for child in node.body:
                visit_node(child, (*names, node.name), kind, base, depth + 1)
            return

        # Control-flow nodes and their non-statement suite containers do not
        # create lexical symbol scopes. Recurse through match_case,
        # ExceptHandler, and equivalent AST nodes while stopping at each
        # discovered declaration boundary above.
        for child in ast.iter_child_nodes(node):
            visit_node(child, names, parent_kind, parent_key, depth)

    for statement in tree.body:
        visit_node(statement, (), None, None, 0)

    counts: dict[str, int] = {}
    for _, qualified, kind, _, _, _, _, _ in discovered:
        base = f"python:{repo}:{source_path}::{kind}:{qualified}"
        counts[base] = counts.get(base, 0) + 1

    occurrence: dict[tuple[str, str], int] = {}
    identities_by_base: dict[str, list[str]] = {}
    symbols: list[Symbol] = []
    for node, qualified, kind, depth, header, signature, signature_digest, parent_base in discovered:
        base = f"python:{repo}:{source_path}::{kind}:{qualified}"
        if counts[base] == 1:
            identity = base
        else:
            duplicate_key = (base, signature_digest)
            ordinal = occurrence.get(duplicate_key, 0) + 1
            occurrence[duplicate_key] = ordinal
            suffix = signature_digest[:12]
            identity = f"{base}~{suffix}" if ordinal == 1 else f"{base}~{suffix}.{ordinal}"
        identities_by_base.setdefault(base, []).append(identity)
        parent_identity = None
        if parent_base is not None:
            candidates = identities_by_base.get(parent_base, [])
            parent_identity = candidates[-1] if candidates else parent_base
        symbols.append(
            Symbol(
                node=node,
                qualified_name=qualified,
                kind=kind,
                depth=depth,
                header_line=header,
                identity=identity,
                signature=signature,
                signature_sha256=signature_digest,
                parent_identity=parent_identity,
            )
        )
    return symbols


def _encoding_cookie_line(source: bytes) -> int | None:
    reader = _byte_line_reader(source)
    first = reader()
    if first.startswith(codecs.BOM_UTF8):
        first = first[len(codecs.BOM_UTF8):]
    if _COOKIE_RE.match(first):
        return 1
    if not _BLANK_OR_COMMENT_RE.match(first):
        return None
    return 2 if _COOKIE_RE.match(reader()) else None


def _comment_groups(
    lines: Sequence[str],
    encoding_cookie_line: int | None,
) -> tuple[list[CommentGroup], list[CommentDiagnostic]]:
    comments: list[tokenize.TokenInfo] = []
    diagnostics: list[CommentDiagnostic] = []
    # Tokenize the decoded Python-newline line map with each terminator
    # normalized to LF.  A raw byte readline would deliver a CR-only file as one
    # line, desynchronizing comment positions from AST line numbers.  Line
    # numbers and in-line columns are unchanged by terminator normalization.
    normalized = iter(_PYTHON_NEWLINE_RE.sub("\n", line) for line in lines)
    try:
        for token in tokenize.generate_tokens(lambda: next(normalized, "")):
            if token.type == tokenize.COMMENT:
                comments.append(token)
    except (SyntaxError, tokenize.TokenError) as exc:
        diagnostics.append(
            CommentDiagnostic(
                code="python_tokenize_error",
                message=str(exc),
            )
        )

    groups: list[list[tokenize.TokenInfo]] = []
    current: list[tokenize.TokenInfo] = []
    in_msdmd_fence = False
    open_fence_name: str | None = None
    # Closing fences left orphaned by an already-diagnosed mismatch are
    # follow-on noise: suppress one close per affected block name, until the
    # next opening of that name, so a mismatch yields one diagnostic.
    # Interrupted fences are not covered.  The projection remains invalid.
    suppressed_closes: dict[str, int] = {}

    def flush() -> None:
        nonlocal current
        if current:
            groups.append(current)
            current = []

    for token in comments:
        payload = token.string[1:].lstrip()
        fence = _FENCE_RE.match(payload)
        is_fence = fence is not None
        is_end_fence = bool(fence and fence.group(1))
        fence_name = fence.group(2) if fence else None
        is_singleton_convention = (
            payload.startswith("ratios:")
            or (token.start[0] == 1 and token.string.startswith("#!"))
            or token.start[0] == encoding_cookie_line
        )

        if in_msdmd_fence:
            contiguous = (
                bool(current)
                and token.start[0] == current[-1].end[0] + 1
                and token.start[1] == current[-1].start[1]
            )
            if contiguous:
                current.append(token)
                if is_fence and (not is_end_fence or fence_name != open_fence_name):
                    # A closing fence must name the open block; an opening
                    # fence inside an open block is equally unpaired.  Neither
                    # may be accepted as a well-formed MSDMD block.
                    start_line = current[0].start[0]
                    closing = "closing" if is_end_fence else "opening"
                    diagnostics.append(
                        CommentDiagnostic(
                            code="msdmd_fence_mismatched",
                            message=(
                                f"MSDMD fence {open_fence_name} starting on line {start_line} "
                                f"meets {closing} fence {fence_name} on line {token.start[0]}"
                            ),
                            line=token.start[0],
                        )
                    )
                    affected = [open_fence_name] if is_end_fence else [open_fence_name, fence_name]
                    for name in affected:
                        if name is not None:
                            suppressed_closes[name] = suppressed_closes.get(name, 0) + 1
                    flush()
                    in_msdmd_fence = False
                    open_fence_name = None
                elif is_fence:
                    flush()
                    in_msdmd_fence = False
                    open_fence_name = None
                continue
            start_line = current[0].start[0]
            diagnostics.append(
                CommentDiagnostic(
                    code="msdmd_fence_interrupted",
                    message=f"MSDMD fence starting on line {start_line} is interrupted or unclosed",
                    line=start_line,
                )
            )
            flush()
            in_msdmd_fence = False
            open_fence_name = None
        if is_fence and not is_end_fence:
            flush()
            current = [token]
            in_msdmd_fence = True
            open_fence_name = fence_name
            # A new opening of this name ends any suppression left by an
            # earlier mismatch, so later genuine orphans remain visible.
            suppressed_closes.pop(fence_name, None)
            continue
        if is_fence and fence_name is not None and suppressed_closes.get(fence_name, 0):
            suppressed_closes[fence_name] -= 1
            flush()
            groups.append([token])
            continue
        if is_fence:
            diagnostics.append(
                CommentDiagnostic(
                    code="msdmd_fence_unmatched_close",
                    message=(
                        f"MSDMD closing fence {fence_name} on line {token.start[0]} "
                        "has no matching opening fence"
                    ),
                    line=token.start[0],
                )
            )
            flush()
            groups.append([token])
            continue
        if is_singleton_convention:
            flush()
            groups.append([token])
            continue
        if (
            current
            and token.start[0] == current[-1].end[0] + 1
            and token.start[1] == current[-1].start[1]
        ):
            current.append(token)
        else:
            flush()
            current = [token]
    if in_msdmd_fence:
        start_line = current[0].start[0]
        diagnostics.append(
            CommentDiagnostic(
                code="msdmd_fence_unclosed",
                message=f"MSDMD fence starting on line {start_line} is unclosed",
                line=start_line,
            )
        )
    flush()
    return [CommentGroup(tuple(group)) for group in groups], diagnostics


def _special_comment_kind(
    group: CommentGroup,
    encoding_cookie_line: int | None,
) -> str | None:
    lines = group.text_lines
    if group.start_line == 1 and group.tokens[0].string.startswith("#!"):
        return "shebang"
    if group.start_line == encoding_cookie_line:
        return "encoding_cookie"
    if any(line.strip().startswith("ratios:") for line in lines):
        return "msdmd_ratios"
    if any(_FENCE_RE.match(line.strip()) for line in lines):
        return "msdmd_block"
    return None


def _leading_subject(group: CommentGroup, symbols: Sequence[Symbol]) -> Symbol | None:
    candidates = [
        symbol
        for symbol in symbols
        if symbol.column == group.start_column and symbol.header_line == group.end_line + 1
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda symbol: (symbol.header_line, -symbol.depth))


def _lexical_end_line(symbol: Symbol, lines: Sequence[str]) -> int:
    end_line = symbol.end_line
    for line_number in range(symbol.end_line + 1, len(lines) + 1):
        raw = lines[line_number - 1]
        if not raw.strip():
            continue
        indentation = len(raw) - len(raw.lstrip(" \t\f"))
        if indentation <= symbol.column:
            break
        end_line = line_number
    return end_line


def _enclosing_subject(
    group: CommentGroup,
    symbols: Sequence[Symbol],
    lines: Sequence[str],
) -> Symbol | None:
    # A declaration's lexical region begins at its first decorator, so comments
    # before or between decorators (and inside decorator expressions) belong to
    # the decorated declaration rather than drifting to an outer scope.
    candidates = [
        symbol
        for symbol in symbols
        if symbol.header_line <= group.start_line
        and group.end_line <= _lexical_end_line(symbol, lines)
        and (
            group.start_line <= symbol.end_line
            or group.start_column > symbol.column
        )
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda symbol: (symbol.depth, symbol.start_line, -symbol.end_line))


def _symbol_record(symbol: Symbol, lines: Sequence[str], starts: Sequence[int]) -> dict:
    decorators = [ast.unparse(item) for item in symbol.node.decorator_list]
    source_span = _node_span(symbol.node, lines, starts)
    if symbol.node.decorator_list:
        source_span["start"] = _span(
            lines,
            starts,
            symbol.header_line,
            symbol.column,
            symbol.header_line,
            symbol.column,
        )["start"]
    return {
        "record_type": "symbol",
        "id": symbol.identity,
        "kind": symbol.kind,
        "qualified_name": symbol.qualified_name,
        "parent": symbol.parent_identity,
        "signature": symbol.signature,
        "signature_sha256": symbol.signature_sha256,
        "decorators": decorators,
        "standing": "syntactically_observed",
        "source_span": source_span,
    }


def _docstring_record(
    owner: ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef,
    subject: str,
    subject_kind: str,
    lines: Sequence[str],
    starts: Sequence[int],
) -> dict | None:
    if not owner.body:
        return None
    statement = owner.body[0]
    if not (
        isinstance(statement, ast.Expr)
        and isinstance(statement.value, ast.Constant)
        and isinstance(statement.value.value, str)
    ):
        return None
    return {
        "record_type": "metadata",
        "metadata_kind": "documentation",
        "convention": "python.docstring.pep257",
        "subject": subject,
        "subject_kind": subject_kind,
        "attachment": "native_docstring",
        "standing": "declared",
        "text": statement.value.value,
        "source_span": _node_span(statement, lines, starts),
    }


def _comment_record(
    group: CommentGroup,
    subject: str,
    subject_kind: str,
    attachment: str,
    metadata_kind: str,
    lines: Sequence[str],
    starts: Sequence[int],
) -> dict:
    return {
        "record_type": "metadata",
        "metadata_kind": metadata_kind,
        "convention": "python.line-comment",
        "subject": subject,
        "subject_kind": subject_kind,
        "attachment": attachment,
        "standing": "syntactically_observed",
        "text": "\n".join(group.text_lines),
        "source_span": _span(
            lines,
            starts,
            group.start_line,
            group.start_column,
            group.end_line,
            group.end_column,
        ),
    }


def _freshness_key(
    repo: str,
    source_path: str,
    source_sha256: str,
    reader_sha256: str,
    schema_sha256: str,
    reader_manifest_sha256: str,
    source_revision: str,
    runtime_identity: dict[str, str],
) -> str:
    identity = {
        "schema": SCHEMA_ID,
        "schema_version": SCHEMA_VERSION,
        "repo": repo,
        "source_path": source_path,
        "source_sha256": source_sha256,
        "source_revision": source_revision,
        "reader": READER_ID,
        "reader_version": READER_VERSION,
        "reader_sha256": reader_sha256,
        "schema_sha256": schema_sha256,
        "reader_manifest_sha256": reader_manifest_sha256,
        **runtime_identity,
    }
    return _sha256(_canonical_json(identity).encode("utf-8"))


def project_python_module(
    path: Path,
    *,
    root: Path,
    repo: str,
    revision: str | None = None,
) -> list[dict]:
    """Return deterministic projection records for one Python source file.

    ``path`` must resolve within ``root``.  Invalid syntax produces a module
    record plus a diagnostic record; the source is never imported or executed.
    """

    root = root.resolve()
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(root).as_posix()
    except ValueError as exc:
        raise ValueError(f"source escapes root: {path}") from exc

    return project_python_bytes(resolved.read_bytes(), source_path=relative, repo=repo, revision=revision)


def project_python_bytes(
    source: bytes, *, source_path: str, repo: str, revision: str | None = None,
) -> list[dict]:
    """Project an already-bounded immutable buffer; never reopen the inspected file.

    The path is provenance only. Both the standalone file runner and unified
    collector call this same syntax/attachment implementation.
    """
    relative = Path(source_path).as_posix()
    if Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise ValueError("source_path must be repository-relative")
    source_sha256 = _sha256(source)
    reader_sha256 = _reader_sha256()
    schema_sha256 = _schema_sha256()
    reader_manifest_sha256 = _reader_manifest_sha256()
    runtime_identity = _runtime_identity()
    source_revision = revision or "hmmm"
    header = {
        "record_type": "module",
        "schema": SCHEMA_ID,
        "schema_version": SCHEMA_VERSION,
        "schema_sha256": schema_sha256,
        "repo": repo,
        "source_revision": source_revision,
        "source_path": relative,
        "source_sha256": source_sha256,
        "source_encoding": "hmmm",
        "reader": READER_ID,
        "reader_version": READER_VERSION,
        "reader_sha256": reader_sha256,
        "reader_manifest_sha256": reader_manifest_sha256,
        **runtime_identity,
        "freshness_key_sha256": _freshness_key(
            repo,
            relative,
            source_sha256,
            reader_sha256,
            schema_sha256,
            reader_manifest_sha256,
            source_revision,
            runtime_identity,
        ),
        "module_id": _module_address(repo, relative),
        "status": "complete",
        "hmmm": [] if revision else ["repository revision not supplied"],
    }

    try:
        source_encoding = tokenize.detect_encoding(_byte_line_reader(source))[0]
        header["source_encoding"] = source_encoding
        decoded = source.decode(source_encoding)
        tree = ast.parse(
            decoded,
            filename=relative,
            type_comments=True,
            feature_version=(sys.version_info.major, sys.version_info.minor),
        )
    except (SyntaxError, UnicodeDecodeError) as exc:
        header["status"] = "invalid"
        header["hmmm"].append("source could not be parsed as Python")
        diagnostic = {
            "record_type": "diagnostic",
            "code": "python_parse_error",
            "severity": "error",
            "message": str(exc),
            "source_path": relative,
            "line": getattr(exc, "lineno", None),
            "column": getattr(exc, "offset", None),
        }
        return [header, diagnostic]

    lines = _python_source_lines(decoded) or [""]
    starts = _line_start_bytes(lines)
    module_id = header["module_id"]
    symbols = _discover_symbols(tree, repo, relative)
    records: list[dict] = [header]
    records.extend(_symbol_record(symbol, lines, starts) for symbol in symbols)

    module_doc = _docstring_record(tree, module_id, "module", lines, starts)
    if module_doc is not None:
        records.append(module_doc)
    for symbol in symbols:
        doc = _docstring_record(
            symbol.node,
            symbol.identity,
            symbol.kind,
            lines,
            starts,
        )
        if doc is not None:
            records.append(doc)

    encoding_cookie_line = _encoding_cookie_line(source)
    groups, comment_diagnostics = _comment_groups(lines, encoding_cookie_line)
    for diagnostic in comment_diagnostics:
        header["status"] = "invalid"
        hmmm = (
            "comments could not be tokenized completely"
            if diagnostic.code == "python_tokenize_error"
            else "MSDMD comment fence is malformed"
        )
        if hmmm not in header["hmmm"]:
            header["hmmm"].append(hmmm)
        records.append(
            {
                "record_type": "diagnostic",
                "code": diagnostic.code,
                "severity": "error",
                "message": diagnostic.message,
                "source_path": relative,
                "line": diagnostic.line,
            }
        )

    for group in groups:
        special = _special_comment_kind(group, encoding_cookie_line)
        if special is not None:
            records.append(
                _comment_record(
                    group,
                    module_id,
                    "module",
                    "module_convention",
                    special,
                    lines,
                    starts,
                )
            )
            continue
        leading = _leading_subject(group, symbols)
        if leading is not None:
            records.append(
                _comment_record(
                    group,
                    leading.identity,
                    leading.kind,
                    "leading_trivia",
                    "comment",
                    lines,
                    starts,
                )
            )
            continue
        enclosing = _enclosing_subject(group, symbols, lines)
        if enclosing is not None:
            records.append(
                _comment_record(
                    group,
                    enclosing.identity,
                    enclosing.kind,
                    "nearest_enclosing_symbol",
                    "comment",
                    lines,
                    starts,
                )
            )
            continue
        records.append(
            _comment_record(
                group,
                module_id,
                "module",
                "module_scope",
                "comment",
                lines,
                starts,
            )
        )

    return records


def render_jsonl(records: Sequence[dict]) -> str:
    """Render records as deterministic JSON Lines text with LF terminators.

    Callers persist ``content.encode("utf-8")`` exactly; see
    ``write_projections``.
    """

    return "".join(f"{_canonical_json(record)}\n" for record in records)


def _iter_python_sources(root: Path, selected: Sequence[Path] = ()) -> Iterator[Path]:
    root = root.resolve()
    if selected:
        resolved = sorted({path.resolve() for path in selected})
        for path in resolved:
            path.relative_to(root)
            if path.suffix != ".py" or not path.is_file():
                raise ValueError(f"selected source is not a Python file: {path}")
            yield path
        return

    def walk(directory: Path) -> Iterator[Path]:
        for child in sorted(directory.iterdir(), key=lambda item: item.name):
            if child.is_symlink():
                continue
            if child.is_dir():
                if child.name in DEFAULT_SKIP_DIRS:
                    continue
                yield from walk(child)
            elif child.is_file() and child.suffix == ".py":
                yield child

    yield from walk(root)


def project_tree(
    root: Path,
    repo: str,
    *,
    sources: Sequence[Path] = (),
    revision: str | None = None,
) -> dict[str, str]:
    """Return ``relative sidecar path -> deterministic JSONL`` for Python files."""

    root = root.resolve()
    projections: dict[str, str] = {}
    for source in _iter_python_sources(root, sources):
        relative = source.relative_to(root).as_posix()
        projections[f"{relative}{PROJECTION_SUFFIX}"] = render_jsonl(
            project_python_module(source, root=root, repo=repo, revision=revision)
        )
    return projections


def _projection_target(out_dir: Path, relative: str) -> Path:
    if not relative.endswith(PROJECTION_SUFFIX):
        raise ValueError(f"projection path must end with {PROJECTION_SUFFIX}: {relative}")
    target = (out_dir / relative).resolve()
    try:
        target.relative_to(out_dir)
    except ValueError as exc:
        raise ValueError(f"projection path escapes output directory: {relative}") from exc
    return target


def write_projections(
    out_dir: Path,
    projections: dict[str, str],
    *,
    prune: bool = False,
) -> list[Path]:
    """Atomically write projections, optionally pruning a complete output set."""

    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    expected = {_projection_target(out_dir, relative) for relative in projections}
    if prune:
        for stale in sorted(out_dir.rglob(f"*{PROJECTION_SUFFIX}")):
            if stale not in expected:
                stale.unlink()
    written: list[Path] = []
    for relative, content in sorted(projections.items()):
        target = _projection_target(out_dir, relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        content_bytes = content.encode("utf-8")
        if not target.exists() or target.read_bytes() != content_bytes:
            temporary: Path | None = None
            try:
                # Binary mode: text mode would translate LF to os.linesep
                # (CRLF on Windows) and break byte-exact write/check convergence.
                with tempfile.NamedTemporaryFile(
                    mode="wb",
                    dir=target.parent,
                    prefix=f".{target.name}.",
                    suffix=".tmp",
                    delete=False,
                ) as stream:
                    stream.write(content_bytes)
                    stream.flush()
                    os.fsync(stream.fileno())
                    temporary = Path(stream.name)
                temporary.replace(target)
                temporary = None
            finally:
                if temporary is not None and temporary.exists():
                    temporary.unlink()
        written.append(target)
    return written


def check_projections(
    out_dir: Path,
    projections: dict[str, str],
    *,
    check_unexpected: bool = False,
) -> list[str]:
    """Return deterministic freshness and diagnostic findings without writing."""

    out_dir = out_dir.resolve()
    findings: list[str] = []
    expected = {_projection_target(out_dir, relative) for relative in projections}
    actual = set(out_dir.rglob(f"*{PROJECTION_SUFFIX}")) if out_dir.exists() else set()
    for missing in sorted(expected - actual):
        findings.append(f"missing:{missing.relative_to(out_dir).as_posix()}")
    if check_unexpected:
        for unexpected in sorted(actual - expected):
            findings.append(f"unexpected:{unexpected.relative_to(out_dir).as_posix()}")
    for relative, expected_content in sorted(projections.items()):
        target = _projection_target(out_dir, relative)
        if target.exists() and target.read_bytes() != expected_content.encode("utf-8"):
            findings.append(f"stale:{relative}")
        first = json.loads(expected_content.split("\n", 1)[0])
        if first["status"] != "complete":
            findings.append(f"invalid:{relative}")
    return findings


def _selected_sources(root: Path, values: Iterable[str]) -> list[Path]:
    return [root / value for value in values]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."), help="authorized source root")
    parser.add_argument("--repo", required=True, help="repository authority slug")
    parser.add_argument("--revision", help="exact source revision; omitted remains visible as hmmm")
    parser.add_argument("--out-dir", type=Path, required=True, help="generated projection root")
    parser.add_argument(
        "--source",
        action="append",
        default=[],
        help="repository-relative Python source to project; repeat to select several",
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="write fresh projections")
    mode.add_argument("--check", action="store_true", help="fail on missing, stale, unexpected, or invalid projections")
    args = parser.parse_args(argv)

    root = args.root.resolve()
    projections = project_tree(
        root,
        args.repo,
        sources=_selected_sources(root, args.source),
        revision=args.revision,
    )
    complete_scope = not args.source
    if args.write:
        written = write_projections(args.out_dir, projections, prune=complete_scope)
        invalid = [
            relative
            for relative, content in projections.items()
            if json.loads(content.split("\n", 1)[0])["status"] != "complete"
        ]
        print(f"msdmd module projections: wrote {len(written)}")
        for relative in invalid:
            print(f"INVALID {relative}")
        return 1 if invalid else 0

    findings = check_projections(
        args.out_dir,
        projections,
        check_unexpected=complete_scope,
    )
    status = "pass" if not findings else "fail"
    print(f"msdmd module projections: {status} ({len(projections)} modules, {len(findings)} findings)")
    for finding in findings:
        print(finding)
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
# ratios: loc_comments=910:128 imports_exports=14:10 calls_definitions=259:54
