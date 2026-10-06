# ratios: loc_comments=964:66 imports_exports=22:5 calls_definitions=300:32
# === MODULE_BUILD ===
# id: msdmd_native_reader_registry
#   module_name: readers
#   module_kind: instrument
#   summary: statically extracts supported native metadata conventions into provenance-bearing MSDMD facts
#   owner: The Interdependency skill-lib
#   public_surface: READER_MANIFESTS, readers_for, reader_for, read_native
#   internal_surface: convention-specific pure readers and source-qualified fact helpers
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: tests/test_native_collection.py
#   rollout: enable through msdmd.collect schema 2 collections
#   rollback: retain schema 1 block-only consumers while removing the schema 2 runner claim
# === END MODULE_BUILD ===
"""Static native metadata readers used by :mod:`msdmd.collect`.

Usage guidance:
    Call ``read_native(path, bytes, context)`` only with bytes already bounded
    by the collector. Readers never import inspected Python, execute scripts,
    expand templates, or resolve network references. ``READER_MANIFESTS`` is
    emitted in every collection so consumers can negotiate the exact supported
    subset instead of treating file recognition as full language support.

The registry intentionally implements conventions exercised by skill-lib and
the MSDMD worked example: Python syntax/docstrings/imports, RATIOS boundary
lines, JSON documents, TOML manifests, Markdown YAML frontmatter, safe YAML and
JavaScript/TypeScript subsets, GitHub CODEOWNERS, shell declarations, systemd
units, Git ignore rules, Python requirements files, bounded license detection,
SVG document metadata, and root ``llms.txt`` structure. Unmatched inputs stay
visible in the collection discovery ledger as unsupported ``hmmm`` scope.
"""
from __future__ import annotations

from functools import lru_cache
import datetime as dt
import hashlib
import io
import json
import math
import re
import shlex
import sys
import tokenize
import tomllib
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

from msdmd.parsers.universal import marker_for, parse_ratios, ratios_placement
from msdmd.formats import is_json_schema_uri, parse_json, parse_yaml, parse_xml
from msdmd.grammar_code import read_grammar
from msdmd.native_code import read_python as _read_python, read_typescript as _read_typescript
from msdmd.standards import read_standards

READER_MANIFESTS: tuple[dict[str, Any], ...] = ({'reader_id': 'python-ast',
  'version': '2.0.0',
  'entry_point': 'msdmd.readers:_read_python',
  'dependencies': ['python-stdlib:ast', 'python-stdlib:tokenize', 'docstring-parser==0.18.0'],
  'convention': 'python.source-metadata',
  'specification': 'https://docs.python.org/3/reference/',
  'supported_versions': ['Python 3 syntax accepted by the running ast parser'],
  'feature_subset': ['qualified symbols and signatures',
                     'AST/token comment attachment shared with module_projection',
                     'ReST/Google/NumPy docstring fields',
                     'lexically scoped imports',
                     'literal __all__'],
  'detection': ['.py', '.pyi', '.pyw'],
  'scope_attachment': 'module and qualified symbol',
  'unknown_field_policy': 'preserve source expression or emit dynamic-unresolved diagnostic',
  'execution_policy': 'parse only; never import or evaluate',
  'support': 'implemented-and-tested',
  'known_limitations': ['runtime effects and dynamic imports/exports are not executed']},
 {'reader_id': 'msdmd-ratios',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_ratios',
  'dependencies': ['msdmd.parsers.universal'],
  'convention': 'msdmd.ratios-line',
  'specification': 'The-Interdependency/skill-lib ratios/SKILL.md',
  'supported_versions': ['named ratios line v1'],
  'feature_subset': ['opening/closing placement', 'named ratio/value preservation'],
  'detection': ['supported line-comment source containing ratios:'],
  'scope_attachment': 'file boundary occurrence',
  'unknown_field_policy': 'preserve hmmm as an explicit value',
  'execution_policy': 'text parse only; never run ratio computers',
  'support': 'implemented-and-tested'},
 {'reader_id': 'json-stdlib',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_json',
  'dependencies': ['python-stdlib:json'],
  'convention': 'json.document',
  'specification': 'RFC 8259',
  'supported_versions': ['RFC 8259 JSON'],
  'feature_subset': ['complete typed document tree', 'package.json dependency classes'],
  'detection': ['.json'],
  'scope_attachment': 'document and JSON Pointer',
  'unknown_field_policy': 'preserve in typed document tree',
  'execution_policy': 'parse only; no reference resolution',
  'support': 'implemented-and-tested'},
 {'reader_id': 'toml-stdlib',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_toml',
  'dependencies': ['python-stdlib:tomllib'],
  'convention': 'toml.document',
  'specification': 'TOML 1.0.0 and Python packaging metadata specifications',
  'supported_versions': ['TOML accepted by the running tomllib parser'],
  'feature_subset': ['complete typed document tree', 'pyproject project/build dependency classes'],
  'detection': ['.toml'],
  'scope_attachment': 'document and TOML key path',
  'unknown_field_policy': 'preserve in typed document tree',
  'execution_policy': 'parse only; never invoke build backends',
  'support': 'implemented-and-tested'},
 {'reader_id': 'markdown-frontmatter',
  'version': '2.0.0',
  'entry_point': 'msdmd.readers:_read_markdown',
  'dependencies': ['PyYAML==6.0.3'],
  'convention': 'markdown.yaml-frontmatter',
  'specification': 'https://yaml.org/spec/1.2.2/',
  'supported_versions': ['YAML 1.2 core scalar subset with typed scalar-key preservation'],
  'feature_subset': ['nested frontmatter and typed values', 'safe acyclic aliases', 'multiline scalars'],
  'detection': ['.md', '.mdx'],
  'scope_attachment': 'document',
  'unknown_field_policy': 'preserve typed tree; reject duplicate keys, custom tags, cyclic aliases and merge '
                          'dialects',
  'execution_policy': 'text parse only; never execute MDX',
  'support': 'implemented-and-tested'},
 {'reader_id': 'yaml-core',
  'version': '2.0.0',
  'entry_point': 'msdmd.readers:_read_yaml',
  'dependencies': ['PyYAML==6.0.3'],
  'convention': 'yaml.core',
  'specification': 'https://yaml.org/spec/1.2.2/',
  'supported_versions': ['YAML 1.2 core with typed scalar-key preservation'],
  'feature_subset': ['typed nested mappings/sequences',
                     'flow syntax',
                     'acyclic aliases',
                     'multiline scalars'],
  'known_limitations': ['custom tags, merge keys and cyclic aliases rejected; keys retain lexical strings'],
  'detection': ['.yml', '.yaml'],
  'scope_attachment': 'document and structural path',
  'unknown_field_policy': 'diagnose unsupported syntax; preserve raw source by digest',
  'execution_policy': 'text parse only; no tags, templates, actions, or includes',
  'support': 'implemented-and-tested'},
 {'reader_id': 'typescript-compiler',
  'version': '2.0.0',
  'entry_point': 'msdmd.readers:_read_typescript',
  'dependencies': ['Node.js', 'typescript==5.8.3'],
  'convention': 'typescript.source-metadata',
  'specification': 'https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html',
  'supported_versions': ['TypeScript 5.8.3 parser accepting JS/JSX/TS/TSX/MJS/MTS/CTS/CJS'],
  'feature_subset': ['syntax-tree symbol ownership',
                     'multiline signatures',
                     'imports and reexports',
                     'compiler JSDoc tags with unknown tag text preserved'],
  'known_limitations': ['not a TSDoc validator',
                        'no type checking, config loading, import resolution or target execution'],
  'detection': ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts'],
  'scope_attachment': 'compiler AST module/symbol',
  'unknown_field_policy': 'retain raw documentation tags and report parse diagnostics',
  'execution_policy': 'trusted parser worker only; inspected code never executed',
  'support': 'implemented-and-tested'},
 {'reader_id': 'github-codeowners',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_codeowners',
  'dependencies': [],
  'convention': 'github.codeowners',
  'specification': 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners',
  'supported_versions': ['GitHub CODEOWNERS line grammar'],
  'feature_subset': ['ordered pattern and owner extraction'],
  'detection': ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS'],
  'scope_attachment': 'ordered path rule',
  'unknown_field_policy': 'diagnose malformed rules; do not infer operational ownership',
  'execution_policy': 'text parse only',
  'support': 'implemented-and-tested'},
 {'reader_id': 'shell-static',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_shell',
  'dependencies': [],
  'convention': 'shell.source-metadata',
  'specification': 'POSIX shebang convention and ShellCheck directives',
  'supported_versions': ['declaration extraction only'],
  'feature_subset': ['shebang', 'ShellCheck directives'],
  'detection': ['.sh', '.bash', '.zsh', '.fish', 'extensionless shebang scripts'],
  'scope_attachment': 'file',
  'unknown_field_policy': 'preserve directive text',
  'execution_policy': 'text parse only; never source or execute',
  'support': 'implemented-and-tested'},
 {'reader_id': 'systemd-unit',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_systemd',
  'dependencies': [],
  'convention': 'systemd.unit',
  'specification': 'https://www.freedesktop.org/software/systemd/man/latest/systemd.syntax.html',
  'supported_versions': ['section/key/value declaration extraction'],
  'feature_subset': ['ordered sections', 'repeated directives', 'continuation lines'],
  'detection': ['.service', '.socket', '.timer', '.path', '.target'],
  'scope_attachment': 'unit section and directive occurrence',
  'unknown_field_policy': 'preserve key/value and order without interpreting runtime effect',
  'execution_policy': 'text parse only; never invoke systemd',
  'support': 'implemented-and-tested'},
 {'reader_id': 'gitignore-lines',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_gitignore',
  'dependencies': [],
  'convention': 'git.ignore',
  'specification': 'https://git-scm.com/docs/gitignore',
  'supported_versions': ['ordered pattern declarations'],
  'feature_subset': ['pattern order', 'negation', 'anchoring', 'directory-only flag'],
  'detection': ['.gitignore'],
  'scope_attachment': 'repository path rule',
  'unknown_field_policy': 'preserve pattern text without evaluating matches',
  'execution_policy': 'text parse only; never invoke Git matching',
  'support': 'implemented-and-tested'},
 {'reader_id': 'python-requirements',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_requirements',
  'dependencies': [],
  'convention': 'python.requirements-file',
  'specification': 'PyPA requirements file format',
  'supported_versions': ['one-line requirement and option subset'],
  'feature_subset': ['requirement text', 'package name', 'options', 'ordered source lines'],
  'known_limitations': ['does not resolve includes, environment markers, URLs, or indexes'],
  'detection': ['requirements*.txt', 'constraints*.txt'],
  'scope_attachment': 'requirements document line',
  'unknown_field_policy': 'preserve text and redact URL credentials',
  'execution_policy': 'text parse only; never install or resolve packages',
  'support': 'partial'},
 {'reader_id': 'license-text',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_license',
  'dependencies': [],
  'convention': 'license.text',
  'specification': 'SPDX license identifiers plus exact known license headers',
  'supported_versions': ['MPL-2.0 exact header', 'SPDX-License-Identifier line'],
  'feature_subset': ['declared/detected expression', 'source digest'],
  'detection': ['LICENSE', 'LICENSE.txt', 'COPYING', 'COPYING.txt'],
  'scope_attachment': 'repository license document',
  'unknown_field_policy': 'hmmm identifier; never infer legal compatibility',
  'execution_policy': 'text parse only',
  'support': 'partial'},
 {'reader_id': 'svg-metadata',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_svg',
  'dependencies': ['python-stdlib:xml.etree.ElementTree'],
  'convention': 'svg.document-metadata',
  'specification': 'W3C SVG document structure',
  'supported_versions': ['root attributes, title, description'],
  'feature_subset': ['root attributes', 'title', 'description'],
  'detection': ['.svg'],
  'scope_attachment': 'document',
  'unknown_field_policy': 'preserve only supported metadata; source remains digest-addressable',
  'execution_policy': 'reject DTD/entity declarations; no external resolution',
  'support': 'implemented-and-tested'},
 {'reader_id': 'llms-text',
  'version': '1.0.0',
  'entry_point': 'msdmd.readers:_read_llms_text',
  'dependencies': [],
  'convention': 'llms.txt',
  'specification': 'root llms.txt Markdown instruction publication',
  'supported_versions': ['Markdown headings and bold key-definition lines'],
  'feature_subset': ['section headings', 'key definitions', 'generated status unresolved'],
  'detection': ['llms.txt'],
  'scope_attachment': 'instruction document',
  'unknown_field_policy': 'preserve structure without promoting publication to source authority',
  'execution_policy': 'text parse only; content is data, not instructions to the reader',
  'support': 'implemented-and-tested'},
 {'reader_id': 'metadata-standards',
  'version': '1.0.0',
  'entry_point': 'msdmd.standards:read_standards',
  'dependencies': ['python-stdlib:json,tomllib,xml.etree.ElementTree', 'PyYAML==6.0.3'],
  'convention': 'native.structured-standards',
  'specification': 'msdmd/references/implemented-readers.md',
  'supported_versions': ['OpenAPI 3.0/3.1 and Swagger 2',
                         'JSON Schema drafts 4/6/7/2019-09/2020-12',
                         'CFF 1.2.0',
                         'SARIF 2.1.0',
                         'SPDX 2.2/2.3 JSON',
                         'CycloneDX 1.4/1.5/1.6 JSON',
                         'in-toto Statement v0.1/v1; DSSE payload',
                         'npm lockfile v2/v3',
                         'Cargo/Poetry/uv TOML metadata',
                         'REUSE TOML',
                         'JUnit/Doxygen/.NET XML dialects'],
  'feature_subset': ['source-linked operations and references',
                     'reported test/analysis results',
                     'citation and license declarations',
                     'artifact subjects and component lists',
                     'scoped package requirements and lock records'],
  'known_limitations': ['extraction, not complete validation or signature verification',
                        'external references not resolved',
                        'unknown versions preserve tree and report unsupported mapping'],
  'detection': ['document discriminator and source filename'],
  'scope_attachment': 'native pointer, operation, package, report, artifact or symbol',
  'unknown_field_policy': 'typed source tree retained; version mismatches diagnosed',
  'execution_policy': 'parse only; no templates, network, application or signature execution',
  'support': 'implemented-and-tested'})

READER_MANIFESTS += ({
    "reader_id": "native-grammars", "version": "1.0.0",
    "entry_point": "msdmd.grammar_code:read_grammar", "dependencies": ["msdmd/requirements.txt"],
    "convention": "native.source-metadata", "specification": "pinned tree-sitter language grammars",
    "supported_versions": ["Rust grammar 0.24.2", "Java grammar 0.23.5", "C grammar 0.24.2", "C++ grammar 0.23.4"],
    "feature_subset": ["named declarations", "Rustdoc/Javadoc/Doxygen raw docs and repeated tags", "imports", "attributes", "SPDX headers"],
    "detection": [".rs", ".java", ".c", ".cc", ".cpp", ".cxx", ".hpp", ".hxx", ".h (ambiguous)"],
    "scope_attachment": "lexical symbols and adjacent documentation",
    "unknown_field_policy": "preserve raw documentation and syntax; diagnose macro/conditional context",
    "execution_policy": "parse only; no compiler, macro expansion or annotation processing", "support": "partial",
},)
_MANIFESTS = {item["reader_id"]: item for item in READER_MANIFESTS}
_PYTHON_SUFFIXES = {".py", ".pyi", ".pyw"}
_MARKDOWN_SUFFIXES = {".md", ".mdx"}
_YAML_SUFFIXES = {".yml", ".yaml"}
_TYPESCRIPT_SUFFIXES = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"}
_SHELL_SUFFIXES = {".sh", ".bash", ".zsh", ".fish"}
_SYSTEMD_SUFFIXES = {".service", ".socket", ".timer", ".path", ".target"}
_GENERATED_MARKER = "Generated by tools/build_codex_plugin_skills.py; do not edit."
_SENSITIVE_KEY_RE = re.compile(r"(?:^|[_-])(?:secret|token|password|passwd|authorization|api[_-]?key|private[_-]?key|credential|client[_-]?secret|access[_-]?key)(?:$|[_-])", re.IGNORECASE)
_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")
_URL_USERINFO_RE = re.compile(r"(\b[a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]+@")
# camel/Pascal names are secret-bearing only when the sensitive word is the
# final token, so modifiers such as tokenUrl, passwordHash, apiKeyPrefix,
# accessKeyId, tokenCount, tokenLimit, tokenType, secretName and
# privateKeyPath describe a secret without carrying one and are kept.
_SENSITIVE_FINAL_TOKENS = frozenset({"secret", "token", "password", "passwd", "authorization", "credential", "credentials"})
_SENSITIVE_FINAL_PAIRS = frozenset({("api", "key"), ("private", "key"), ("access", "key"), ("secret", "key")})


def _is_sensitive_key(name: Any) -> bool:
    """Match secret-bearing names in snake, kebab, camel and Pascal case."""
    text = str(name)
    if _SENSITIVE_KEY_RE.search(text):
        return True
    tokens = [token.lower() for token in re.split(r"[^A-Za-z0-9]+", _CAMEL_BOUNDARY_RE.sub("_", text)) if token]
    if len(tokens) < 2:
        return False
    return tokens[-1] in _SENSITIVE_FINAL_TOKENS or (tokens[-2], tokens[-1]) in _SENSITIVE_FINAL_PAIRS


def _sanitize_url_credentials(value: str) -> str:
    """Withhold URL userinfo such as ``scheme://user:password@host``."""
    return _URL_USERINFO_RE.sub(r"\1[redacted]@", value)


def _digest(value: bytes | str) -> str:
    data = value if isinstance(value, bytes) else value.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _json_safe(value: Any) -> Any:
    """Preserve non-JSON native scalar types with explicit tagged values."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else {"$type": "nonfinite-float", "value": repr(value)}
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return {"$type": f"toml-{type(value).__name__}", "value": value.isoformat()}
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return {"$type": f"unsupported:{type(value).__name__}", "value": repr(value)}


def _redact_sensitive(value: Any, pointer: str = "") -> tuple[Any, list[str]]:
    """Redact values owned by plainly secret-bearing field names."""
    redacted: list[str] = []
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in value.items():
            child_pointer = f"{pointer}/{key}"
            if _is_sensitive_key(key):
                result[str(key)] = {"$redacted": True, "reason": "sensitive-field-name"}
                redacted.append(child_pointer)
            else:
                result[str(key)], child_redacted = _redact_sensitive(item, child_pointer)
                redacted.extend(child_redacted)
        return result, redacted
    if isinstance(value, list):
        result_list: list[Any] = []
        for index, item in enumerate(value):
            child, child_redacted = _redact_sensitive(item, f"{pointer}/{index}")
            result_list.append(child)
            redacted.extend(child_redacted)
        return result_list, redacted
    if isinstance(value, str):
        sanitized = _sanitize_url_credentials(value)
        if sanitized != value:
            return sanitized, [pointer]
    return value, redacted


def _redaction_diagnostic(context: dict[str, Any], reader_id: str, pointers: list[str]) -> dict[str, Any] | None:
    if not pointers:
        return None
    return _diagnostic(
        context,
        reader_id=reader_id,
        code="sensitive_fields_redacted",
        message=f"withheld {len(pointers)} sensitive field value(s)",
        status="redacted",
        severity="warning",
    )


def _quoted(value: str, *, path: bool = False) -> str:
    return quote(value, safe="/" if path else "")


def _source(context: dict[str, Any], location: dict[str, Any]) -> dict[str, Any]:
    return {
        "repository": context["repo"],
        "revision": context["revision"],
        "file": context["file"],
        "content_sha256": context["content_sha256"],
        "location": location,
    }


def _subject_address(context: dict[str, Any], scope: str, identity: str) -> str:
    return (
        f"msdmd://{_quoted(context['repo'])}@{_quoted(context['revision'])}/{_quoted(context['file'], path=True)}"
        f"#subject/{_quoted(scope)}/{_quoted(identity)}"
    )


def _fact(
    context: dict[str, Any],
    *,
    reader_id: str,
    kind: str,
    scope: str,
    identity: str,
    location: dict[str, Any],
    value: Any,
    native_id: str | None = None,
    convention: str | None = None,
    standing: str = "syntactically-observed",
    projection: dict[str, Any] | None = None,
) -> dict[str, Any]:
    subject = _subject_address(context, scope, identity)
    pointer = location.get("pointer") or f"lines:{location.get('start_line', '?')}-{location.get('end_line', '?')}"
    native_component = f"/{_quoted(native_id)}" if native_id is not None else ""
    address = f"{subject}/fact/{_quoted(kind)}/{_quoted(str(pointer))}{native_component}"
    result = {
        "address": address,
        "origin": "native",
        "kind": kind,
        "source": _source(context, location),
        "subject": {
            "address": subject,
            "scope": scope,
            "identity": identity,
        },
        "convention": {
            "namespace": convention or _MANIFESTS[reader_id]["convention"],
            "version": context.get("convention_version", "hmmm"),
            "dialect": context.get("dialect", "hmmm"),
        },
        "native": {"id": native_id, "value": _json_safe(value)},
        "standing": standing,
        "extraction": {
            "reader_id": reader_id,
            "reader_version": _MANIFESTS[reader_id]["version"],
            "support": _MANIFESTS[reader_id]["support"],
            "configuration_sha256": context["configuration_sha256"],
        },
    }
    if projection is not None:
        result["projection"] = projection
    return result


def _diagnostic(
    context: dict[str, Any],
    *,
    reader_id: str,
    code: str,
    message: str,
    status: str,
    severity: str = "warning",
    location: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "status": status,
        "message": message,
        "source": _source(context, location or {"pointer": "document"}),
        "reader_id": reader_id,
    }


def _edge(source: str, target: str, kind: str, *, standing: str = "syntactically-observed") -> dict[str, Any]:
    return {
        "from": source,
        "to": target,
        "kind": kind,
        "standing": standing,
        "target_resolution": "external-or-unresolved",
    }


def _read_ratios(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "msdmd-ratios"
    marker = marker_for(path)
    if marker is None:
        return [], [], []
    context = dict(context, convention_version="named ratios line v1", dialect=f"line-comment:{marker}")
    try:
        if path.suffix.lower() in _PYTHON_SUFFIXES:
            encoding, _ = tokenize.detect_encoding(io.BytesIO(data).readline)
            source = data.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")
            comments = [""] * len(source.split("\n"))
            for token in tokenize.generate_tokens(io.StringIO(source).readline):
                if token.type == tokenize.COMMENT:
                    comments[token.start[0] - 1] = token.string
            text = "\n".join(comments)
        else:
            source = data.decode("utf-8")
            text = context.get("comment_source", source)
    except (SyntaxError, UnicodeDecodeError, tokenize.TokenError, IndentationError) as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_ratios_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    diagnostics: list[dict] = []
    occurrence: Counter[str] = Counter()
    for line_number, line in enumerate(text.splitlines(), start=1):
        for entry in parse_ratios(line, marker):
            ratio_id = str(entry["id"])
            occurrence[ratio_id] += 1
            identity = f"{ratio_id}[{occurrence[ratio_id]}]"
            facts.append(_fact(context, reader_id=reader_id, kind="composition-ratio", scope="file", identity=identity, location={"start_line": line_number, "end_line": line_number}, value={"ratio": ratio_id, "value": str(entry["value"]), "occurrence": occurrence[ratio_id]}, native_id=ratio_id, convention="msdmd.ratios-line", standing="declared"))
    if facts:
        opening, closing = ratios_placement(source, marker)
        if not opening or not closing:
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="misplaced_ratios_boundary", message=f"opening={opening} closing={closing}", status="invalid", severity="error"))
    return facts, [], diagnostics


def _read_json(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "json-stdlib"
    context = dict(context, convention_version="RFC 8259", dialect="json")
    try:
        value = parse_json(data)
    except (UnicodeDecodeError, ValueError) as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="invalid_json", message=str(exc), status="invalid", severity="error")]
    value, redacted = _redact_sensitive(value)
    if path.name == "package.json":
        convention = "npm.package-json"
    elif path.name.endswith(".schema.json") or (isinstance(value, dict) and is_json_schema_uri(value.get("$schema"))):
        convention = "json.schema"
        context["convention_version"] = str(value.get("$schema", "hmmm")) if isinstance(value, dict) else "hmmm"
    elif isinstance(value, dict) and "openapi" in value:
        convention = "openapi.document"
        context["convention_version"] = str(value["openapi"])
    elif context["file"] == "skills.json":
        convention = "skill-lib.skills-index"
    elif context["file"] == ".codex-plugin/plugin.json":
        convention = "codex.plugin-manifest"
    elif context["file"] == ".claude-plugin/marketplace.json":
        convention = "claude.plugin-marketplace"
    else:
        convention = "json.document"
    facts = [_fact(context, reader_id=reader_id, kind="structured-document", scope="document", identity=context["file"], location={"pointer": ""}, value=value, convention=convention)]
    edges: list[dict] = []
    if path.name == "package.json" and isinstance(value, dict):
        subject = _subject_address(context, "document", context["file"])
        for field, kind in (("dependencies", "runtime"), ("devDependencies", "development"), ("peerDependencies", "peer"), ("optionalDependencies", "optional")):
            dependencies = value.get(field, {})
            if isinstance(dependencies, dict):
                for name, constraint in dependencies.items():
                    facts.append(_fact(context, reader_id=reader_id, kind="dependency", scope="package", identity=str(value.get("name", context["file"])), location={"pointer": f"/{field}/" + str(name).replace("~", "~0").replace("/", "~1")}, value={"name": name, "constraint": constraint, "class": kind}, native_id=name, convention=convention, projection={"mapping_version": "npm-dependencies@1", "relation": "depends_on", "loss": "none"}))
                    edges.append(_edge(subject, f"npm-package:{name}", f"depends_on:{kind}"))
    diagnostic = _redaction_diagnostic(context, reader_id, redacted)
    return facts, edges, [diagnostic] if diagnostic else []


def _read_toml(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "toml-stdlib"
    context = dict(context, convention_version="TOML 1.0.0", dialect="toml")
    try:
        value = tomllib.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="invalid_toml", message=str(exc), status="invalid", severity="error")]
    value, redacted = _redact_sensitive(value)
    convention = "python.pyproject" if path.name == "pyproject.toml" else "toml.document"
    facts = [_fact(context, reader_id=reader_id, kind="structured-document", scope="document", identity=context["file"], location={"pointer": ""}, value=value, convention=convention)]
    edges: list[dict] = []
    if path.name == "pyproject.toml":
        project = value.get("project", {}) if isinstance(value, dict) else {}
        package = str(project.get("name", context["file"])) if isinstance(project, dict) else context["file"]
        subject = _subject_address(context, "package", package)
        groups: list[tuple[str, Any, str]] = [
            ("/project/dependencies", project.get("dependencies", []) if isinstance(project, dict) else [], "runtime"),
            ("/build-system/requires", value.get("build-system", {}).get("requires", []) if isinstance(value.get("build-system", {}), dict) else [], "build"),
        ]
        optional = project.get("optional-dependencies", {}) if isinstance(project, dict) else {}
        if isinstance(optional, dict):
            groups.extend((f"/project/optional-dependencies/{group}", deps, f"optional:{group}") for group, deps in optional.items())
        for pointer, dependencies, kind in groups:
            if not isinstance(dependencies, list):
                continue
            for index, dependency in enumerate(dependencies):
                if not isinstance(dependency, str):
                    continue
                name = re.split(r"[<>=!~;\[\s]", dependency, maxsplit=1)[0]
                facts.append(_fact(context, reader_id=reader_id, kind="dependency", scope="package", identity=package, location={"pointer": f"{pointer}/{index}"}, value={"requirement": dependency, "name": name, "class": kind}, native_id=name, convention=convention, projection={"mapping_version": "pyproject-dependencies@1", "relation": "depends_on", "loss": "marker retained in requirement"}))
                edges.append(_edge(subject, f"python-package:{name}", f"depends_on:{kind}"))
    diagnostic = _redaction_diagnostic(context, reader_id, redacted)
    return facts, edges, [diagnostic] if diagnostic else []


def _read_markdown(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    reader_id = "markdown-frontmatter"
    text = data.decode("utf-8-sig").replace("\r\n", "\n")
    if not text.startswith("---\n"):
        return [], [], []
    match = re.search(r"^---[ \t]*$", text[4:], re.M)
    if match is None:
        raise ValueError("unterminated YAML frontmatter")
    raw = text[4:4 + match.start()]
    value = parse_yaml(raw.encode("utf-8"))
    value, redacted = _redact_sensitive(value)
    context = dict(context, convention_version="YAML 1.2 core", dialect="yaml-frontmatter")
    facts = [_fact(context, reader_id=reader_id, kind="frontmatter", scope="document", identity=context["file"],
        location={"start_line": 1, "end_line": raw.count("\n") + 2},
        value={"fields": value, "raw_source": "source-reference", "generated": _GENERATED_MARKER in text},
        convention="markdown.yaml-frontmatter", standing="derived" if _GENERATED_MARKER in text else "declared")]
    diagnostic = _redaction_diagnostic(context, reader_id, redacted)
    return facts, [], [diagnostic] if diagnostic else []


def _read_yaml(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    reader_id = "yaml-core"
    value, redacted = _redact_sensitive(parse_yaml(data))
    context = dict(context, convention_version="YAML 1.2 core", dialect="yaml-core-string-keys")
    fact = _fact(context, reader_id=reader_id, kind="structured-document", scope="document", identity=context["file"],
        location={"pointer": ""}, value=value, convention="yaml.document")
    diagnostic = _redaction_diagnostic(context, reader_id, redacted)
    return [fact], [], [diagnostic] if diagnostic else []


def _read_codeowners(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "github-codeowners"
    context = dict(context, convention_version="GitHub current documented grammar", dialect="github")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    diagnostics: list[dict] = []
    for line_number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        try:
            parts = shlex.split(raw, comments=True, posix=True)
        except ValueError as exc:
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="invalid_codeowners_rule", message=str(exc), status="invalid", severity="error", location={"start_line": line_number, "end_line": line_number}))
            continue
        if not parts:
            continue
        if parts[0].startswith("!") or "[" in parts[0] or "\\#" in raw:
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="unsupported_codeowners_pattern",
                message="GitHub CODEOWNERS does not support this ignore-pattern feature", status="unsupported"))
        facts.append(_fact(context, reader_id=reader_id, kind="review-ownership", scope="path-rule", identity=f"rule:{len(facts)}", location={"start_line": line_number, "end_line": line_number}, value={"pattern": parts[0], "owners": parts[1:], "precedence": line_number, "authority": "review-assignment-only", "provider_source": "active" if context.get("codeowners_source") == context["file"] else "shadowed"}, native_id=parts[0], convention="github.codeowners", projection={"mapping_version": "github-codeowners@1", "canonical_field": "review_owners", "loss": "does not imply operational ownership or permissions"}))
    return facts, [], diagnostics


def _read_shell(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "shell-static"
    context = dict(context, convention_version="source declaration v1", dialect=path.suffix.lstrip(".") or "shebang")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    lines = text.splitlines()
    if lines and lines[0].startswith("#!"):
        facts.append(_fact(context, reader_id=reader_id, kind="interpreter", scope="file", identity=context["file"], location={"start_line": 1, "end_line": 1}, value={"shebang": lines[0][2:].strip()}, native_id="shebang", convention="posix.shebang"))
    for number, line in enumerate(lines, start=1):
        match = re.match(r"^\s*#\s*shellcheck\s+(?P<body>.+?)\s*$", line, re.IGNORECASE)
        if match:
            facts.append(_fact(context, reader_id=reader_id, kind="tool-directive", scope="file", identity=context["file"], location={"start_line": number, "end_line": number}, value={"tool": "shellcheck", "directive": match.group("body")}, native_id=f"shellcheck:{number}", convention="shellcheck.directive"))
    return facts, [], []


def _redact_systemd_environment(value: str) -> tuple[str, bool, bool]:
    """Redact every assignment in the supported, non-escaped word subset.

    Unknown quoting/escaping withholds the entire value rather than
    applying shell rules to systemd syntax or publishing possible secrets.
    """
    parts: list[str] = []
    position = 0
    redacted = False
    while position < len(value):
        start = position
        while position < len(value) and value[position].isspace():
            position += 1
        parts.append(value[start:position])
        if position == len(value):
            break
        start = position
        quote_char = value[position] if value[position] in (chr(34), chr(39)) else ''
        if quote_char:
            end = value.find(quote_char, position + 1)
            if end < 0 or (end + 1 < len(value) and not value[end + 1].isspace()):
                return '<redacted>', True, True
            word = value[position + 1:end]
            position = end + 1
        else:
            while position < len(value) and not value[position].isspace():
                position += 1
            word = value[start:position]
            if chr(34) in word or chr(39) in word:
                return '<redacted>', True, True
        if chr(92) in word:
            return '<redacted>', True, True
        name, separator, assigned = word.partition('=')
        if not separator or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name):
            return '<redacted>', True, True
        if _is_sensitive_key(name):
            parts.append(quote_char + name + '=<redacted>' + quote_char)
            redacted = True
        else:
            sanitized = _sanitize_url_credentials(assigned)
            if sanitized != assigned:
                parts.append(quote_char + name + '=' + sanitized + quote_char)
                redacted = True
            else:
                parts.append(value[start:position])
    return ''.join(parts), redacted, False


# systemd.exec credential directives whose value carries literal secret data.
_SYSTEMD_CREDENTIAL_DATA_KEYS = {'setcredential', 'setcredentialencrypted'}


def _read_systemd(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "systemd-unit"
    context = dict(context, convention_version="systemd.syntax current documented grammar", dialect=path.suffix.lstrip("."))
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    diagnostics: list[dict] = []
    section = "hmmm"
    logical = ""
    logical_start = 1
    occurrence: dict[tuple[str, str], int] = {}
    for number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith(("#", ";")):
            continue
        if not logical:
            logical_start = number
        if stripped.endswith(chr(92)):
            logical += stripped[:-1] + ' '
            continue
        logical += stripped
        line = logical
        logical = ""
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if "=" not in line:
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="invalid_systemd_directive", message="expected key=value", status="invalid", severity="error", location={"start_line": logical_start, "end_line": number}))
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        published_value = value
        location = {'start_line': logical_start, 'end_line': number}
        if key.lower() == 'environment':
            published_value, redacted, unsupported = _redact_systemd_environment(value)
            if redacted:
                diagnostics.append(_diagnostic(context, reader_id=reader_id, code='sensitive_fields_redacted',
                    message='withheld potentially sensitive systemd Environment values', status='redacted', location=location))
            if unsupported:
                diagnostics.append(_diagnostic(context, reader_id=reader_id, code='unsupported_systemd_environment_syntax',
                    message='Environment quoting or escaping is outside the supported subset; value withheld', status='unsupported', location=location))
        elif key.lower() in _SYSTEMD_CREDENTIAL_DATA_KEYS:
            # ID:DATA -- keep the credential identifier, never its data.
            credential_id, separator, _ = value.partition(':')
            published_value = credential_id + ':<redacted>' if separator else '<redacted>'
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code='sensitive_fields_redacted',
                message='withheld systemd credential data', status='redacted', location=location))
        else:
            published_value = _sanitize_url_credentials(value)
            if published_value != value:
                diagnostics.append(_diagnostic(context, reader_id=reader_id, code='sensitive_fields_redacted',
                    message='withheld systemd URL credentials', status='redacted', location=location))
        identity_key = (section, key)
        occurrence[identity_key] = occurrence.get(identity_key, 0) + 1
        identity = f"{section}.{key}[{occurrence[identity_key]}]"
        facts.append(_fact(context, reader_id=reader_id, kind="unit-directive", scope="configuration", identity=identity, location={"start_line": logical_start, "end_line": number}, value={"section": section, "key": key, "value": published_value, "occurrence": occurrence[identity_key]}, native_id=key, convention="systemd.unit"))
    if logical:
        diagnostics.append(_diagnostic(context, reader_id=reader_id, code="truncated_systemd_continuation", message="file ends during a continuation", status="invalid", severity="error"))
    return facts, [], diagnostics


def _read_gitignore(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "gitignore-lines"
    context = dict(context, convention_version="gitignore current documented grammar", dialect="gitignore")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    order = 0
    for line_number, raw in enumerate(text.splitlines(), start=1):
        # Git ignores unescaped trailing spaces. Count backslash parity so
        # an escaped space survives, including before later unescaped spaces.
        while raw.endswith(' '):
            prefix = raw[:-1]
            if (len(prefix) - len(prefix.rstrip('\\'))) % 2:
                break
            raw = prefix
        if not raw or raw.startswith("#"):
            continue
        order += 1
        negated = raw.startswith("!") and not raw.startswith("\\!")
        pattern = raw[1:] if negated else raw
        facts.append(_fact(context, reader_id=reader_id, kind="ignore-rule", scope="path-rule", identity=f"rule:{order}", location={"start_line": line_number, "end_line": line_number}, value={"pattern": pattern, "negated": negated, "anchored": pattern.startswith("/"), "directory_only": pattern.endswith("/"), "order": order}, native_id=pattern, convention="git.ignore", standing="declared"))
    return facts, [], []


_REQUIREMENT_NAME_RE = re.compile(r"^(?P<name>[A-Za-z0-9][A-Za-z0-9._-]*)")
# Direct URL, VCS and local-path forms carry no leading distribution name.
_REQUIREMENT_DIRECT_RE = re.compile(
    r"^(?:[A-Za-z][A-Za-z0-9+.-]*://|(?:git|hg|svn|bzr)\+|file:|\.{1,2}(?:/|\\|$)|/|\\|~|[A-Za-z]:[\\/])", re.IGNORECASE)
_REQUIREMENT_ARCHIVE_RE = re.compile(r"\.(?:whl|zip|tar\.gz|tar\.bz2|tar\.xz|tgz|tar)(?:[#?]|$)", re.IGNORECASE)
# PEP 508 direct reference with an explicit name: ``name[extras] @ url``.
_REQUIREMENT_NAMED_REFERENCE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\s*(?:\[[^\]]*\])?\s*@")


def _is_unnamed_direct_requirement(line: str) -> bool:
    if _REQUIREMENT_NAMED_REFERENCE_RE.match(line):
        return False
    first = line.split(maxsplit=1)[0] if line.split() else ""
    return bool(_REQUIREMENT_DIRECT_RE.match(first) or _REQUIREMENT_ARCHIVE_RE.search(first))


def _requirement_logical_lines(text: str) -> tuple[list[tuple[int, int, str]], int | None]:
    """Join pip backslash continuations into ``(start, end, line)`` records.

    As in pip, a line whose stripped text starts with ``#`` never continues,
    so a commented line ending in a backslash cannot swallow the next
    requirement. Returns the records and the line of a dangling trailing
    continuation at end of file, if any.
    """
    records: list[tuple[int, int, str]] = []
    pending: str | None = None
    start = 0
    line_number = 0
    for line_number, raw in enumerate(text.splitlines(), start=1):
        if pending is None:
            start = line_number
            pending = ""
        if raw.endswith("\\") and not raw.lstrip().startswith("#"):
            pending += raw[:-1]
            continue
        if raw.lstrip().startswith("#") and pending:
            # A comment line ends the continuation and contributes nothing.
            records.append((start, line_number, pending))
        else:
            records.append((start, line_number, pending + raw))
        pending = None
    dangling = None
    if pending is not None:
        records.append((start, line_number, pending))
        dangling = line_number
    return records, dangling


def _read_requirements(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "python-requirements"
    context = dict(context, convention_version="PyPA requirements file subset v1", dialect="requirements")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    edges: list[dict] = []
    diagnostics: list[dict] = []
    subject = _subject_address(context, "requirements-document", context["file"])
    order = 0
    records, dangling = _requirement_logical_lines(text)
    if dangling is not None:
        diagnostics.append(_diagnostic(context, reader_id=reader_id, code="dangling_requirement_continuation",
            message="file ends with a backslash continuation; the final requirement may be incomplete",
            status="ambiguous", severity="warning", location={"start_line": dangling, "end_line": dangling}))
    for start_line, line_number, raw in records:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        order += 1
        location = {"start_line": start_line, "end_line": line_number}
        published = re.sub(r"(?<=://)[^/@\s]+@", "<redacted>@", stripped)
        if published != stripped:
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="sensitive_fields_redacted", message="withheld requirement URL credentials", status="redacted", severity="warning", location=location))
        if published.startswith("-"):
            if published.startswith(('-r', '-c')) or re.match(r'^--(?:requirement|constraint)(?:[=\s]|$)', published):
                diagnostics.append(_diagnostic(context, reader_id=reader_id, code='unresolved_requirement_include',
                    message='included requirements/constraints are declared but not resolved', status='dynamic-unresolved',
                    location=location))
            facts.append(_fact(context, reader_id=reader_id, kind="requirements-option", scope="requirements-document", identity=f"option:{order}", location=location, value={"text": published, "order": order}, native_id=f"option:{order}", convention="python.requirements-file", standing="declared"))
            continue
        if _is_unnamed_direct_requirement(published):
            # A URL/VCS/path requirement names no distribution; never invent one.
            name = "hmmm"
            diagnostics.append(_diagnostic(context, reader_id=reader_id, code="unresolved_direct_requirement_name",
                message="direct URL, VCS or path requirement declares no distribution name; name not inferred",
                status="dynamic-unresolved", location=location))
        else:
            match = _REQUIREMENT_NAME_RE.match(published)
            name = match.group("name") if match else "hmmm"
        facts.append(_fact(context, reader_id=reader_id, kind="dependency", scope="requirements-document", identity=f"requirement:{order}", location=location, value={"requirement": published, "name": name, "class": "runtime-or-unresolved", "order": order}, native_id=name if name != "hmmm" else None, convention="python.requirements-file", standing="declared", projection={"mapping_version": "requirements-lines@1", "relation": "depends_on", "loss": "resolution and environment markers not evaluated"}))
        if name != "hmmm":
            edges.append(_edge(subject, f"python-package:{name}", "depends_on:runtime-or-unresolved"))
    return facts, edges, diagnostics


def _read_license(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "license-text"
    context = dict(context, convention_version="detector v1", dialect="license-text")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    spdx_match = re.search(r"SPDX-License-Identifier:\s*(?P<value>[^\r\n]+)", text)
    if spdx_match:
        expression = spdx_match.group("value").strip()
        method = "declared-spdx-line"
    elif text.startswith("Mozilla Public License Version 2.0"):
        expression = "MPL-2.0"
        method = "exact-known-header"
    else:
        expression = "hmmm"
        method = "unrecognized-text"
    fact = _fact(context, reader_id=reader_id, kind="license-declaration", scope="document", identity=context["file"], location={"pointer": "document"}, value={"expression": expression, "detection_method": method, "legal_interpretation": "not-performed", "text": "source-reference"}, native_id=expression if expression != "hmmm" else None, convention="license.text", standing="declared" if method == "declared-spdx-line" else "derived")
    diagnostics = [] if expression != "hmmm" else [_diagnostic(context, reader_id=reader_id, code="unrecognized_license_text", message="license identifier remains hmmm", status="ambiguous", severity="warning")]
    return [fact], [], diagnostics


def _read_svg(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = 'svg-metadata'
    context = dict(context, convention_version='SVG document subset v1', dialect='xml')
    try:
        root = parse_xml(data)
    except (UnicodeDecodeError, ValueError, ET.ParseError) as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code='invalid_svg_xml',
            message=type(exc).__name__ + '; SVG rejected by bounded XML parser', status='invalid', severity='error')]
    if root.tag.rsplit('}', 1)[-1] != 'svg':
        return [], [], [_diagnostic(context, reader_id=reader_id, code='unexpected_svg_root',
            message='expected svg root', status='invalid', severity='error')]
    title = None
    description = None
    for child in root:
        child_name = child.tag.rsplit('}', 1)[-1]
        if child_name == 'title' and title is None:
            title = ''.join(child.itertext()).strip()
        elif child_name == 'desc' and description is None:
            description = ''.join(child.itertext()).strip()
    value, redactions = _redact_sensitive({'attributes': dict(root.attrib), 'title': title, 'description': description})
    diagnostic = _redaction_diagnostic(context, reader_id, redactions)
    return [_fact(context, reader_id=reader_id, kind='document-metadata', scope='document', identity=context['file'],
        location={'pointer': '/svg'}, value=value, convention='svg.document-metadata')], [], [diagnostic] if diagnostic else []


_LLMS_HEADING_RE = re.compile(r"^(?P<marks>#{1,6})\s+(?P<title>.+?)\s*$")
_LLMS_DEFINITION_RE = re.compile(r"^-\s+\*\*(?P<term>.+?)\*\*\s*=\s*(?P<definition>.+?)\s*$")


def _read_llms_text(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[dict], list[dict], list[dict]]:
    reader_id = "llms-text"
    context = dict(context, convention_version="Markdown structural subset v1", dialect="llms.txt")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [], [], [_diagnostic(context, reader_id=reader_id, code="undecodable_source", message=str(exc), status="invalid", severity="error")]
    facts: list[dict] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        heading = _LLMS_HEADING_RE.match(line)
        if heading:
            title = heading.group("title")
            facts.append(_fact(context, reader_id=reader_id, kind="instruction-section", scope="document-section", identity=f"heading:{line_number}", location={"start_line": line_number, "end_line": line_number}, value={"level": len(heading.group("marks")), "title": title, "generated": "hmmm"}, native_id=title, convention="llms.txt", standing="declared"))
            continue
        definition = _LLMS_DEFINITION_RE.match(line)
        if definition:
            term = definition.group("term")
            facts.append(_fact(context, reader_id=reader_id, kind="key-definition", scope="instruction-definition", identity=term, location={"start_line": line_number, "end_line": line_number}, value={"term": term, "definition": definition.group("definition"), "generated": "hmmm"}, native_id=term, convention="llms.txt", standing="declared"))
    return facts, [], []


@lru_cache(maxsize=1)
def implementation_digest() -> str:
    """Identity of all executable reader inputs, independent of inspected files."""
    names = ("readers.py", "native_code.py", "grammar_code.py", "formats.py", "standards.py", "module_projection.py", "typescript-reader.cjs", "requirements.txt", "package.json", "package-lock.json", "module-projection.schema.json", "python-module-reader.json", "parsers/universal.py")
    digest = hashlib.sha256()
    for name in names:
        digest.update(name.encode())
        digest.update((Path(__file__).parent / name).read_bytes())
    return digest.hexdigest()


Reader = Callable[[Path, bytes, dict[str, Any]], tuple[list[dict], list[dict], list[dict]]]


def readers_for(path: Path, data: bytes | None = None) -> list[tuple[str, Reader]]:
    """Return every compatible reader selected for ``path``."""
    suffix = path.suffix.lower()
    relative = path.as_posix()
    selected: list[tuple[str, Reader]] = []
    if path.name == "CODEOWNERS" and relative in {"CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"}:
        selected.append(("github-codeowners", _read_codeowners))
    elif suffix in _PYTHON_SUFFIXES:
        selected.append(("python-ast", _read_python))
    elif suffix in {".json", ".sarif", ".ipynb"}:
        selected.append(("json-stdlib", _read_json))
    elif suffix == ".toml" or path.name in {"Cargo.lock", "poetry.lock", "uv.lock"}:
        selected.append(("toml-stdlib", _read_toml))
    elif suffix in _MARKDOWN_SUFFIXES:
        selected.append(("markdown-frontmatter", _read_markdown))
    elif suffix in _YAML_SUFFIXES or suffix == ".cff":
        selected.append(("yaml-core", _read_yaml))
    elif suffix in _TYPESCRIPT_SUFFIXES:
        selected.append(("typescript-compiler", _read_typescript))
    elif suffix in {".rs", ".java", ".c", ".cc", ".cpp", ".cxx", ".hpp", ".hxx", ".h"}:
        selected.append(("native-grammars", read_grammar))
    elif suffix in _SHELL_SUFFIXES:
        selected.append(("shell-static", _read_shell))
    elif suffix in _SYSTEMD_SUFFIXES:
        selected.append(("systemd-unit", _read_systemd))
    elif path.name == ".gitignore":
        selected.append(("gitignore-lines", _read_gitignore))
    elif (path.name.startswith("requirements") or path.name.startswith("constraints")) and suffix == ".txt":
        selected.append(("python-requirements", _read_requirements))
    elif path.name in {"LICENSE", "LICENSE.txt", "COPYING", "COPYING.txt"} or (path.parent.name == "LICENSES" and suffix == ".txt"):
        selected.append(("license-text", _read_license))
    elif suffix == ".svg":
        selected.append(("svg-metadata", _read_svg))
    elif path.name == "llms.txt":
        selected.append(("llms-text", _read_llms_text))
    elif not suffix and data is not None and data.startswith(b"#!"):
        selected.append(("shell-static", _read_shell))
    if suffix in {".json", ".sarif", ".ipynb", ".yaml", ".yml", ".cff", ".toml", ".xml", ".spdx", ".license"} or path.name in {"Cargo.lock", "poetry.lock", "uv.lock"}:
        selected.append(("metadata-standards", read_standards))
    if data is not None and b"ratios:" in data and marker_for(path) is not None:
        selected.append(("msdmd-ratios", _read_ratios))
    return selected


def reader_for(path: Path, data: bytes | None = None) -> tuple[str, Reader] | None:
    """Return the primary reader for compatibility; prefer :func:`readers_for`."""
    selected = readers_for(path, data)
    return selected[0] if selected else None


def read_native(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list[str], list[dict], list[dict], list[dict]]:
    """Read one immutable source buffer with every applicable native reader."""
    reader_ids: list[str] = []
    facts: list[dict] = []
    edges: list[dict] = []
    diagnostics: list[dict] = []
    for reader_id, reader in readers_for(path, data):
        if reader_id == "metadata-standards" and any(d.get("severity") == "error" for d in diagnostics):
            continue
        reader_ids.append(reader_id)
        local_context = dict(context)
        try:
            if reader_id == "msdmd-ratios" and path.suffix.lower() in _TYPESCRIPT_SUFFIXES | {".rs", ".java", ".c", ".cc", ".cpp", ".cxx", ".hpp", ".hxx", ".h"}:
                lines = [""] * len(data.decode("utf-8-sig").split("\n"))
                for f in facts:
                    if f["kind"] == "comment" and f["extraction"]["reader_id"] in {"typescript-compiler", "native-grammars"}:
                        for offset, line in enumerate(f["native"]["value"]["text"].split("\n")):
                            index = f["source"]["location"]["start_line"] - 1 + offset
                            if index < len(lines):
                                lines[index] = line
                local_context["comment_source"] = "\n".join(lines)
            local_context["configuration_sha256"] = _digest(json.dumps({"reader_id": reader_id, "reader_version": _MANIFESTS[reader_id]["version"]}, sort_keys=True))
            reader_facts, reader_edges, reader_diagnostics = reader(path, data, local_context)
        except (ImportError, FileNotFoundError) as exc:
            reader_facts, reader_edges = [], []
            reader_diagnostics = [_diagnostic(local_context, reader_id=reader_id,
                code="reader_dependency_unavailable", message=type(exc).__name__ + "; install declared reader dependencies",
                status="unsupported")]
        except Exception as exc:
            # Malformed inputs do not stop independent files. Do not publish exception
            # text: parser messages can contain source literals or credentials.
            reader_facts, reader_edges = [], []
            reader_diagnostics = [_diagnostic(local_context, reader_id=reader_id,
                code="native_reader_error", message=type(exc).__name__ + "; input rejected by " + reader_id,
                status="invalid", severity="error")]
        for fact in reader_facts:
            fact["extraction"]["implementation_sha256"] = implementation_digest()

        facts.extend(reader_facts)
        edges.extend(reader_edges)
        diagnostics.extend(reader_diagnostics)
    # The same complete owning tree is emitted once even when a standard adapter
    # adds a more precise root classification than the generic syntax reader.
    roots = [f for f in facts if f["extraction"]["reader_id"] == "metadata-standards" and f["source"]["location"] == {"pointer": ""}]
    if roots:
        superseding = any((root.get("projection") or {}).get("supersedes") == "structured-document" for root in roots)
        facts = [f for f in facts if not (f["kind"] == "structured-document" and f["extraction"]["reader_id"] != "metadata-standards"
            and (superseding or any(f["native"]["value"] == root["native"]["value"] for root in roots)))]
    return reader_ids, facts, edges, diagnostics
# ratios: loc_comments=964:66 imports_exports=22:5 calls_definitions=300:32
