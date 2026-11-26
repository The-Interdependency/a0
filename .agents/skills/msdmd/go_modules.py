# ratios: loc_comments=162:32 imports_exports=5:1 calls_definitions=63:5
"""Static Go module/workspace directives and recorded checksum extraction.

Usage: registered automatically for go.mod, go.work and go.sum by msdmd.collect.
No go command, package resolution, download or checksum verification occurs.
Preserve original directive tokens, order and comments alongside decoded values;
unknown directives remain unsupported rather than silently disappearing.
"""
# === MODULE_BUILD ===
# id: go_module_metadata_reader
#   module_name: go_modules
#   module_kind: instrument
#   summary: preserve scoped Go module requirements and workspace declarations
#   owner: The Interdependency skill-lib
#   public_surface: read_go_modules
#   internal_surface: inert string and directive parsing
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_go_metadata.py
#   rollout: schema 2 registration for Go module files
#   rollback: revert registry entry and consumer pin
# === END MODULE_BUILD ===
# === CONTRACTS ===
# id: go_module_declarations_preserve_scope
#   given: module requirements, replacements, workspace paths and checksums
#   then: retain directive identity, source location and unresolved resolution without running Go
# id: go_module_unknowns_fail_required_coverage
#   given: unknown directives or malformed Go module metadata
#   then: preserve unsupported or invalid standing and fail required collection
# === END CONTRACTS ===
from __future__ import annotations

from pathlib import Path
from typing import Any
import re


def _unquote(token: str) -> str:
    if token.startswith("`"):
        return token[1:-1].replace("\r", "")
    if not token.startswith('"'):
        return token
    source, result, index = token[1:-1], bytearray(), 0
    escapes = {"a": 7, "b": 8, "f": 12, "n": 10, "r": 13, "t": 9, "v": 11,
               "\\": 92, '"': 34}
    while index < len(source):
        char = source[index]
        index += 1
        if char != "\\":
            result.extend(char.encode("utf-8"))
            continue
        char = source[index]
        index += 1
        if char in escapes:
            result.append(escapes[char])
            continue
        count = {"x": 2, "u": 4, "U": 8}.get(char, 2 if char in "01234567" else 0)
        if not count:
            raise ValueError("invalid Go string escape")
        digits = source[index:index + count]
        index += count
        if len(digits) != count:
            raise ValueError("short Go string escape")
        octal = char in "01234567"
        if not re.fullmatch(r"[0-7]+" if octal else r"[0-9A-Fa-f]+", digits):
            raise ValueError("invalid Go string digits")
        value = int(char + digits if octal else digits, 8 if octal else 16)
        if octal or char == "x":
            result.append(value)
        else:
            result.extend(chr(value).encode("utf-8"))
    return result.decode("utf-8")


def _tokens(line: str) -> tuple[list[str], list[str], str]:
    raw, index, comment = [], 0, ""
    while index < len(line):
        if line[index].isspace():
            index += 1
            continue
        if line.startswith("//", index):
            comment = line[index:]
            break
        start = index
        if line[index] in {'"', "`"}:
            quote = line[index]
            index += 1
            while index < len(line) and line[index] != quote:
                index += 2 if quote == '"' and line[index] == "\\" else 1
            if index >= len(line):
                raise ValueError("unterminated quoted token")
            index += 1
        elif line[index] in "()[],":
            index += 1
        else:
            while index < len(line) and not line[index].isspace() and line[index] not in "()[],":
                if line.startswith("//", index):
                    break
                index += 1
        raw.append(line[start:index])
    return raw, [_unquote(token) for token in raw], comment


def read_go_modules(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    """Read declared metadata, preserving module and workspace boundaries."""
    from msdmd.readers import _fact, _diagnostic, _redact_sensitive

    rid = "go-module-files"
    context = dict(context, convention_version="directive-extraction-v1", dialect=path.name)
    facts, diagnostics, block = [], [], None
    allowed = ({"go", "toolchain", "use", "replace", "godebug"} if path.name == "go.work" else
               {"module", "go", "toolchain", "require", "exclude", "replace", "retract", "tool", "godebug", "ignore"})
    sums: dict[tuple[str, str], str] = {}

    def problem(code: str, number: int, *, unsupported: bool = False) -> None:
        diagnostics.append(_diagnostic(context, reader_id=rid, code=code,
            message="Go metadata has an unknown directive" if unsupported else "Go metadata has invalid directive syntax",
            status="unsupported" if unsupported else "invalid", severity="warning" if unsupported else "error",
            location={"start_line": number, "end_line": number}))

    def emit(kind: str, number: int, value: dict, convention: str) -> None:
        value, redactions = _redact_sensitive(value)
        if redactions:
            diagnostics.append(_diagnostic(context, reader_id=rid, code="sensitive_value_redacted",
                message="credential-bearing metadata withheld", status="redacted",
                location={"start_line": number, "end_line": number}))
        facts.append(_fact(context, reader_id=rid, kind=kind, scope="workspace" if path.name == "go.work" else "package",
            identity=context["file"], location={"start_line": number, "end_line": number},
            value=value, convention=convention))

    for number, line in enumerate(data.decode("utf-8").split("\n"), 1):
        if not line.strip():
            continue
        if path.name == "go.sum":
            parts = line.split()
            if len(parts) != 3 or not re.fullmatch(r"h1:[A-Za-z0-9+/]{43}=", parts[-1]):
                problem("invalid_go_sum", number)
                continue
            module, version, checksum = parts
            key = module, version
            if key in sums and sums[key] != checksum:
                problem("conflicting_go_checksums", number)
            sums[key] = checksum
            emit("recorded-checksum", number, {"module": module, "version": version,
                "checksum": checksum, "verification": "not-performed"}, "go.checksum-file")
            continue
        try:
            raw, tokens, comment = _tokens(line)
        except (ValueError, IndexError, UnicodeError):
            problem("invalid_go_module_tokens", number)
            continue
        if not tokens:
            if comment:
                emit("comment", number, {"text": comment}, "go.module-file")
            continue
        if tokens == [")"]:
            if block is None:
                problem("unmatched_go_module_block", number)
            block = None
            continue
        if len(tokens) == 2 and tokens[1] == "(" and block is None:
            block = tokens[0]
            if block not in allowed:
                problem("unknown_go_module_directive", number, unsupported=True)
            emit("directive-block", number, {"directive": block, "raw_tokens": raw, "comment": comment}, "go.module-file")
            continue
        directive, args = (block, tokens) if block else (tokens[0], tokens[1:])
        value = {"directive": directive, "arguments": args, "raw_tokens": raw,
                 "comment": comment, "block": block, "resolution": "not-performed"}
        emit("module-directive", number, value, "go.module-file")
        if directive not in allowed:
            problem("unknown_go_module_directive", number, unsupported=True)
            continue
        valid = not any(token in {"(", ")"} for token in tokens)
        valid &= bool(args)
        if directive in {"module", "go", "toolchain", "use", "tool", "godebug", "ignore"}:
            valid &= len(args) == 1
        elif directive in {"require", "exclude"}:
            valid &= len(args) == 2
        elif directive == "replace":
            valid &= args.count("=>") == 1
            if valid:
                split = args.index("=>")
                valid &= split in {1, 2} and len(args) - split - 1 in {1, 2}
        elif directive == "retract":
            valid &= len(args) == 1 or (len(args) == 5 and args[0] == "[" and args[2] == "," and args[4] == "]")
        if not valid:
            problem("invalid_go_module_directive", number)
            continue
        if directive == "module":
            emit("package-identity", number, {"module": args[0]}, "go.module-file")
        elif directive == "require":
            emit("dependency", number, {"module": args[0], "version": args[1],
                "class": "indirect" if comment.strip() == "// indirect" else "direct",
                "resolution": "not-performed"}, "go.module-file")
        elif directive == "replace":
            split = args.index("=>")
            emit("module-replacement", number, {"from": args[:split], "to": args[split + 1:],
                "resolution": "not-performed"}, "go.module-file")
        elif directive == "use":
            emit("workspace-member", number, {"path": args[0], "resolution": "not-performed"}, "go.workspace-file")
    if block is not None:
        problem("unclosed_go_module_block", max(1, len(data.split(b"\n"))))
    return facts, [], diagnostics
# ratios: loc_comments=162:32 imports_exports=5:1 calls_definitions=63:5
