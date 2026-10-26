# ratios: loc_comments=116:9 imports_exports=8:1 calls_definitions=41:4
"""Source metadata from pinned Rust, Java, C and C++ grammars.

Usage: read_grammar(path, supplied_bytes, context) through msdmd.collect.
No build, macro expansion, annotation processing or target import occurs. .h
requires explicit language selection and is reported ambiguous. Documentation
retains raw comments and repeated tags; it does not run rustdoc or Doxygen.
"""
from __future__ import annotations

import hashlib
import importlib
import re
from pathlib import Path
from typing import Any

GRAMMARS = {'.rs': ('rust', '0.24.2'), '.java': ('java', '0.23.5'),
            '.c': ('c', '0.24.2'), '.cpp': ('cpp', '0.23.4'),
            '.cc': ('cpp', '0.23.4'), '.cxx': ('cpp', '0.23.4'),
            '.hpp': ('cpp', '0.23.4'), '.hxx': ('cpp', '0.23.4')}
DECLARATIONS = {'function_item', 'function_signature_item', 'struct_item',
    'enum_item', 'trait_item', 'type_item', 'mod_item', 'const_item', 'static_item',
    'class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration',
    'method_declaration', 'constructor_declaration', 'annotation_type_declaration',
    'function_definition', 'class_specifier', 'struct_specifier', 'enum_specifier',
    'namespace_definition', 'declaration'}


def read_grammar(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    from tree_sitter import Language, Parser
    from msdmd.readers import _fact, _diagnostic
    rid = 'native-grammars'
    if path.suffix == '.h':
        return [], [], [_diagnostic(context, reader_id=rid, code='ambiguous_header_language',
            message='.h can be C or C++; supply an unambiguous .c/.hpp source representation', status='ambiguous')]
    language, version = GRAMMARS[path.suffix.lower()]
    # Only hard-coded installed grammar modules are loaded, never target modules.
    grammar = importlib.import_module('tree_sitter_' + language)
    tree = Parser(Language(grammar.language())).parse(data)
    namespace = {'rust': 'rustdoc', 'java': 'javadoc', 'c': 'doxygen', 'cpp': 'doxygen'}[language]
    context = dict(context, convention_version=f'{language}-grammar@{version}', dialect=language)
    facts: list = []
    diagnostics: list = []
    nodes: list = []
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        nodes.append(node)
        stack.extend(reversed(node.named_children))
    if tree.root_node.has_error:
        diagnostics.append(_diagnostic(context, reader_id=rid, code='source_grammar_error',
            message='source contains grammar errors; recovered facts are partial', status='invalid', severity='error'))
    declarations: list[tuple[Any, str]] = []
    counts: dict[str, int] = {}

    def text(node: Any) -> str:
        return data[node.start_byte:node.end_byte].decode('utf-8')

    def name_of(node: Any) -> str | None:
        name = node.child_by_field_name('name')
        declarator = node.child_by_field_name('declarator')
        while name is None and declarator is not None:
            if declarator.type in {'identifier', 'field_identifier', 'qualified_identifier'}:
                name = declarator
                break
            declarator = declarator.child_by_field_name('declarator')
        return text(name) if name is not None else None

    def emit(node: Any, kind: str, identity: str, value: Any, *, scope: str = 'symbol', convention: str | None = None) -> dict:
        key = kind + ':' + identity
        ordinal = counts.get(key, 0)
        counts[key] = ordinal + 1
        fact = _fact(context, reader_id=rid, kind=kind, scope=scope, identity=identity,
            convention=convention or language + '.source-metadata',
            location={'start_line': node.start_point.row + 1, 'end_line': node.end_point.row + 1,
                      'start_byte': node.start_byte, 'end_byte': node.end_byte}, value=value)
        fact['address'] = fact['subject']['address'] + '/fact/' + kind + '/' + str(ordinal)
        facts.append(fact)
        return fact

    for node in nodes:
        if node.type in DECLARATIONS and (name := name_of(node)):
            parents = [(parent, identity) for parent, identity in declarations
                       if parent.start_byte <= node.start_byte and parent.end_byte >= node.end_byte]
            parent = parents[-1][1] if parents else ''
            # Rust impl blocks have no named declaration; retain their type context.
            ancestor = node.parent
            impl = None
            while ancestor is not None and ancestor.type not in DECLARATIONS:
                if ancestor.type == 'impl_item':
                    impl = ancestor.child_by_field_name('type')
                    break
                ancestor = ancestor.parent
            if impl is not None:
                parent = '.'.join(filter(None, (parent, text(impl))))
            identity = '.'.join(filter(None, (parent, name)))
            body = node.child_by_field_name('body')
            signature = data[node.start_byte:body.start_byte if body else node.end_byte].decode('utf-8').strip()
            declarations.append((node, identity))
            emit(node, 'symbol-declaration', identity, {'name': name, 'qualified_name': identity,
                'syntax_kind': node.type, 'signature': signature, 'condition_resolution': 'not-evaluated'})
        if node.type in {'use_declaration', 'import_declaration', 'package_declaration', 'preproc_include', 'attribute_item', 'inner_attribute_item'}:
            emit(node, 'source-declaration', context['file'], {'syntax_kind': node.type, 'text': text(node)}, scope='module')
        if node.type in {'macro_invocation', 'preproc_if', 'preproc_ifdef'}:
            diagnostics.append(_diagnostic(context, reader_id=rid, code='unresolved_compile_context',
                message='macro/preprocessor context is preserved but not evaluated', status='dynamic-unresolved'))
    for node in nodes:
        if node.type not in {'line_comment', 'block_comment', 'comment'}:
            continue
        raw = text(node)
        enclosing = [(owner, ident) for owner, ident in declarations
                     if owner.start_byte <= node.start_byte and owner.end_byte >= node.end_byte]
        identity = enclosing[-1][1] if enclosing else context['file']
        scope = 'symbol' if enclosing else 'module'
        doc = raw.startswith(('/**', '/*!', '///', '//!'))
        attachment = 'enclosing' if enclosing else 'module'
        if doc and not raw.startswith(('//!', '/*!')):
            following = [(owner, ident) for owner, ident in declarations if owner.start_byte >= node.end_byte]
            if following:
                owner, candidate = following[0]
                between = data[node.end_byte:owner.start_byte].decode('utf-8')
                # Only comments/attributes can bridge leading documentation.
                scrubbed = re.sub(r'/\*.*?\*/|//[^\n]*|#\[[^\]]*\]', '', between, flags=re.S)
                if not scrubbed.strip():
                    identity, scope, attachment = candidate, 'symbol', 'leading-documentation'
        emit(node, 'comment', identity, {'text': raw, 'attachment': attachment}, scope=scope)
        if doc:
            tags = [{'name': match[1], 'text': match[2].strip()}
                    for match in re.finditer(r'(?:^|\n)\s*(?:\*|///|//!)?\s*[@\\]([A-Za-z]+)\s*([^\n]*)', raw.removeprefix('/**').removesuffix('*/'))]
            emit(node, 'documentation-comment', identity, {'text': raw, 'tags': tags,
                'attachment': attachment, 'expansion': 'not-performed'}, scope=scope, convention=namespace)
        for match in re.finditer(r'SPDX-(License-Identifier|FileCopyrightText):\s*([^\n*]+)', raw):
            emit(node, 'license-declaration', context['file'], {'tag': 'SPDX-' + match[1], 'value': match[2].strip()},
                 scope='module', convention='spdx.source-header')
    return facts, [], diagnostics
# ratios: loc_comments=116:9 imports_exports=8:1 calls_definitions=41:4
