# ratios: loc_comments=330:52 imports_exports=17:6 calls_definitions=124:11
"""Syntax-aware code readers for the unified collection.

Usage: registry calls read_python/read_typescript with bounded bytes and context.
Python delegates symbol/comment attachment to module_projection. The TypeScript
compiler is a library worker, not the inspected program. Neither reader resolves
imports, loads target configuration, or establishes runtime behavior.
Worker records and symbol references are validated before projection; malformed
results produce a reader failure without partial facts or guessed edges.
"""
from __future__ import annotations

import ast
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any

from msdmd.module_projection import project_python_bytes, _byte_line_reader
import tokenize


def read_python(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    from msdmd.readers import _fact, _diagnostic, _subject_address, _edge
    context = dict(context, convention_version=f'Python {sys.version_info.major}.{sys.version_info.minor}', dialect='python')
    rid = 'python-ast'
    records = project_python_bytes(data, source_path=context['file'], repo=context['repo'], revision=context['revision'])
    header = records[0]
    facts: list = []
    edges: list = []
    diagnostics: list = []
    symbols = {r['id']: r for r in records if r['record_type'] == 'symbol'}
    identities = {key: value['qualified_name'] for key, value in symbols.items()}
    # Only duplicate qualified names need the attachment reader's signature suffix.
    counts: dict[str, int] = {}
    for name in identities.values():
        counts[name] = counts.get(name, 0) + 1
    identities = {key: name if counts[name] == 1 else key for key, name in identities.items()}
    identities[header['module_id']] = context['file']
    metadata_counts: dict[tuple[str, str], int] = {}

    def location(record: dict) -> dict:
        span = record['source_span']
        return {'start_line': span['start']['line'], 'end_line': span['end']['line']}

    for record in records[1:]:
        if record['record_type'] == 'diagnostic':
            diagnostics.append(_diagnostic(context, reader_id=rid, code=record['code'],
                message=record['message'], status='invalid', severity='error'))
            continue
        if record['record_type'] == 'symbol':
            identity = identities[record['id']]
            kind = 'class-declaration' if record['kind'] == 'class' else 'callable-declaration'
            fact = _fact(context, reader_id=rid, kind=kind, scope='symbol', identity=identity,
                location=location(record), native_id=record['qualified_name'], value={
                    'name': record['qualified_name'].split('.')[-1], 'qualified_name': record['qualified_name'],
                    'kind': record['kind'], 'signature': record['signature'], 'decorators': record['decorators'],
                    'attachment_identity': record['id'], 'parent_identity': record['parent']},
                projection={'mapping_version': 'python-surfaces@2', 'canonical_field': 'declared_surface', 'loss': 'behavior not inferred'})
            # Stable semantic pointer; exact byte/line span is provenance, not identity.
            fact['address'] = fact['subject']['address'] + '/fact/declaration'
            fact['source']['location']['span'] = record['source_span']
            facts.append(fact)
            continue
        if record['record_type'] != 'metadata':
            continue
        identity = identities.get(record['subject'], record['subject'])
        scope = 'module' if record['subject'] == header['module_id'] else 'symbol'
        kind = 'documentation' if record['metadata_kind'] == 'documentation' else 'comment'
        value = {'text': record['text'], 'attachment': record['attachment'],
                 'attachment_identity': record['subject'], 'metadata_kind': record['metadata_kind']}
        if kind == 'documentation':
            try:
                import docstring_parser
                parsed = docstring_parser.parse(record['text'])
                value['format'] = parsed.style.name.lower()
                value['fields'] = [dict(vars(field)) for field in parsed.meta]
                value['summary'] = parsed.short_description
                value['description'] = parsed.long_description
            except ImportError:
                diagnostics.append(_diagnostic(context, reader_id=rid, code='missing_docstring_parser',
                    message='install msdmd/requirements.txt to extract structured docstring fields', status='unsupported'))
            except Exception as exc:
                # A parser rejection must not discard the source-owned docstring.
                diagnostics.append(_diagnostic(context, reader_id=rid, code='docstring_parse_error',
                    message=type(exc).__name__, status='unsupported'))
        key = (record['subject'], kind)
        ordinal = metadata_counts.get(key, 0); metadata_counts[key] = ordinal + 1
        fact = _fact(context, reader_id=rid, kind=kind, scope=scope, identity=identity,
            location=location(record), value=value,
            convention='python.pep257' if kind == 'documentation' else 'python.line-comment', standing='declared')
        fact['address'] = fact['subject']['address'] + f'/fact/{kind}/{ordinal}'
        fact['source']['location']['span'] = record['source_span']
        facts.append(fact)
        if kind == 'comment':
            for line_ordinal, line in enumerate(record['text'].splitlines()):
                for tag in ('SPDX-License-Identifier', 'SPDX-FileCopyrightText'):
                    if tag + ':' in line:
                        facts.append(_fact(context, reader_id=rid, kind='license-declaration', scope=scope,
                            identity=identity, location=location(record), value={'tag': tag, 'value': line.split(tag + ':', 1)[1].strip()},
                            native_id=f'{tag}:{ordinal}:{line_ordinal}', convention='spdx.file-header', standing='declared'))
    if header['status'] == 'invalid':
        return facts, edges, diagnostics
    encoding = tokenize.detect_encoding(_byte_line_reader(data))[0]
    tree = ast.parse(data.decode(encoding), type_comments=True)
    import_ordinals: dict[str, int] = {}
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Import, ast.ImportFrom)):
            continue
        owners = [r for r in symbols.values() if r['source_span']['start']['line'] <= node.lineno <= r['source_span']['end']['line']]
        owner = min(owners, key=lambda r: r['source_span']['end']['line'] - r['source_span']['start']['line']) if owners else None
        identity = identities[owner['id']] if owner else context['file']
        scope = 'symbol' if owner else 'module'
        for alias in node.names:
            module = alias.name if isinstance(node, ast.Import) else '.' * node.level + (node.module or '')
            item = {'kind': 'import' if isinstance(node, ast.Import) else 'from_import',
                    'module': module, 'name': alias.name, 'alias': alias.asname,
                    'level': getattr(node, 'level', 0)}
            ordinal = import_ordinals.get(identity, 0); import_ordinals[identity] = ordinal + 1
            fact = _fact(context, reader_id=rid, kind='dependency', scope=scope, identity=identity,
                location={'start_line': node.lineno, 'end_line': node.end_lineno}, value=item,
                native_id=f'{module}:{alias.name}:{ordinal}', projection={
                    'mapping_version': 'python-imports@2', 'relation': 'imports', 'loss': 'conditions retained in source; resolution not executed'})
            fact['address'] = fact['subject']['address'] + f'/fact/import/{ordinal}'
            facts.append(fact)
            edges.append(_edge(fact['subject']['address'], 'python-module:' + module, 'imports'))
    # A literal initializer is not a complete export set after another write,
    # mutation, conditional assignment, or escape through an alias/call.
    # Only one simple module-level literal assignment with no subsequent uses
    # earns static standing. Other syntax remains visible without execution.
    assignments = []
    allowed_names: set[int] = set()
    for node in tree.body:
        targets = node.targets if isinstance(node, ast.Assign) else [node.target] if isinstance(node, ast.AnnAssign) else []
        if len(targets) == 1 and isinstance(targets[0], ast.Name) and targets[0].id == '__all__':
            assignments.append(node)
            allowed_names.add(id(targets[0]))
    export_uses = [node for node in ast.walk(tree) if isinstance(node, ast.Name) and node.id == '__all__']
    unresolved = len(assignments) != 1 or any(id(node) not in allowed_names for node in export_uses)
    if assignments:
        node = assignments[-1]
        value = node.value
        literal = isinstance(value, (ast.List, ast.Tuple)) and all(
            isinstance(item, ast.Constant) and isinstance(item.value, str) for item in value.elts)
        unresolved = unresolved or not literal
        names = [item.value for item in value.elts] if literal else None
        facts.append(_fact(context, reader_id=rid, kind='exports', scope='module', identity=context['file'],
            location={'start_line': node.lineno, 'end_line': node.end_lineno}, native_id='__all__',
            value={'names': names if not unresolved else None,
                   'declared_names': names,
                   'resolution': 'dynamic-unresolved' if unresolved else 'static'}))
    if export_uses and unresolved:
        diagnostics.append(_diagnostic(context, reader_id=rid, code='dynamic_python_exports',
            message='__all__ has a nonliteral, repeated, conditional, mutated or escaped declaration; final exports not inferred',
            status='dynamic-unresolved'))
    return facts, edges, diagnostics


# V8's JIT needs pages that are writable and then executable, which systemd
# MemoryDenyWriteExecute=yes forbids: node then dies with a V8 fatal error
# (SIGTRAP) before running anything. Interpreter-only output is byte-identical,
# so the trusted worker and the identity probe always run without a JIT.
NODE_ARGV = ('node', '--jitless')


def node_signal(returncode: int) -> str | None:
    """Name the signal that ended a node process, or None for an ordinary exit.

    Python reports a signal death as ``-N``; a shell or version-manager shim in
    front of node reports it as ``128 + N``.
    """
    if returncode < 0:
        try:
            return signal.Signals(-returncode).name
        except ValueError:
            return f'signal {-returncode}'
    if returncode > 128:
        try:
            return signal.Signals(returncode - 128).name
        except ValueError:
            return None
    return None


# Seconds one trusted TypeScript worker (or the identity probe) may run. A
# worker that hangs never yields partial success: it is killed and the file is
# a reader failure. The CLI sets this from --typescript-timeout.
TYPESCRIPT_TIMEOUT_SECONDS = 120.0

_POSIX = os.name == 'posix'


def _kill_process_group(process: subprocess.Popen) -> None:
    """Kill ``process`` and, on POSIX, every process in its session's group."""
    if _POSIX:
        try:
            os.killpg(process.pid, signal.SIGKILL)  # start_new_session: pgid == pid
        except (ProcessLookupError, PermissionError):
            pass
    try:
        process.kill()
    except ProcessLookupError:
        pass


def run_node(argv: list[str], *, input: str | None = None, timeout: float, cwd: Path | str,
             env: dict[str, str], encoding: str = 'utf-8', errors: str = 'strict') -> subprocess.CompletedProcess:
    """Run a node command like ``subprocess.run(..., capture_output=True, text=True)``.

    On POSIX the command starts in its own session, and a timeout (or any
    interruption) kills the whole process group, not just the direct child: a
    version-manager shim (nvm, volta, asdf) may run the real node as a
    grandchild that would otherwise keep running and holding the pipes.
    Raises ``subprocess.TimeoutExpired`` after the group is killed.
    """
    with subprocess.Popen(argv, stdin=subprocess.PIPE if input is not None else subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd, env=env,
                          text=True, encoding=encoding, errors=errors, start_new_session=_POSIX) as process:
        try:
            stdout, stderr = process.communicate(input, timeout=timeout)
        except BaseException:
            _kill_process_group(process)
            process.wait()
            raise
    return subprocess.CompletedProcess(argv, process.returncode, stdout, stderr)


# Per-file worker diagnostic for valid input nested too deeply for the
# recursive compiler/visitor stack (smaller under --jitless). The file is not
# extracted (an error diagnostic, so --strict exits 2), but the run continues;
# it is not a missing runtime and never exits 3.
TOO_DEEP_CODE = 'typescript_input_too_deep'

# Worker output keys and their types; anything else is not a worker result.
_WORKER_LISTS = ('declarations', 'docs', 'comments', 'imports', 'exports', 'diagnostics')
_WORKER_SPAN = {'start_line': int, 'end_line': int}
_NULLABLE_TEXT = (str, type(None))
# The trusted worker owns this wire shape. Validate before projecting any facts;
# extra fields stay preserved, but known fields never acquire guessed types.
_WORKER_RECORDS = {
    'declarations': {**_WORKER_SPAN, 'name': _NULLABLE_TEXT, 'qualified_name': str,
        'identity': str, 'kind': str, 'exported': bool, 'anonymous': bool,
        'parameters': [{'name': str, 'type': _NULLABLE_TEXT, 'optional': bool,
                        'rest': bool, 'default': _NULLABLE_TEXT}],
        'returns': _NULLABLE_TEXT, 'decorators': [str]},
    'docs': {**_WORKER_SPAN, 'identity': str, 'owner': str, 'text': str,
        'description': str, 'tags': [{'tag': str, 'text': str, 'name': _NULLABLE_TEXT,
                                    'type': _NULLABLE_TEXT, 'comment': _NULLABLE_TEXT}]},
    'comments': {**_WORKER_SPAN, 'text': str, 'identity': _NULLABLE_TEXT,
        'owner': _NULLABLE_TEXT, 'attachment': str},
    'imports': {**_WORKER_SPAN, 'module': str, 'kind': str, 'declaration': str, 'owner': str},
    'exports': {**_WORKER_SPAN, 'kind': str, 'local_name': _NULLABLE_TEXT,
        'exported_name': str, 'type_only': bool, 'declaration': str, 'owner': str,
        'declaration_identities': [str]},
    'diagnostics': {**_WORKER_SPAN, 'code': str, 'status': str},
}
_WORKER_OPTIONAL_FIELDS = {
    'declarations': {'export_names': [str]},
    'exports': {'expression': str},
    'diagnostics': {'message': str},
}


def _worker_value(value: Any, schema: Any) -> bool:
    """Check required record fields, array elements and exact JSON scalar types."""
    if isinstance(schema, dict):
        return isinstance(value, dict) and all(key in value and _worker_value(value[key], child)
                                              for key, child in schema.items())
    if isinstance(schema, list):
        return isinstance(value, list) and all(_worker_value(item, schema[0]) for item in value)
    if isinstance(schema, tuple):
        return type(value) in schema
    return type(value) is schema  # bool is not a source-line integer


def node_rejected_flag(stderr: str) -> bool:
    """True when node refused a command-line option (for example an old node without --jitless)."""
    return 'bad option' in stderr


def _worker_result(stdout: str) -> dict[str, Any] | None:
    """Parse worker stdout, or None when it is not a complete worker result."""
    try:
        parsed = json.loads(stdout)
    except (ValueError, RecursionError):
        return None
    if not isinstance(parsed, dict) or not isinstance(parsed.get('version'), str) or not parsed['version']:
        return None
    if not all(isinstance(parsed.get(key), list) for key in _WORKER_LISTS):
        return None
    for section, schema in _WORKER_RECORDS.items():
        for item in parsed[section]:
            if not _worker_value(item, schema) or not 0 < item['start_line'] <= item['end_line']:
                return None
            if any(key in item and not _worker_value(item[key], child)
                   for key, child in _WORKER_OPTIONAL_FIELDS.get(section, {}).items()):
                return None
    identities = {item['identity'] for item in parsed['declarations']}
    if '' in identities or len(identities) != len(parsed['declarations']):
        return None
    for section in ('docs', 'comments'):
        if any(item['identity'] is not None and item['identity'] not in identities for item in parsed[section]):
            return None
    if any(identity not in identities for item in parsed['exports'] for identity in item['declaration_identities']):
        return None
    if any(item['status'] not in {'invalid', 'dynamic-unresolved'}
           and (item['status'], item['code']) != ('unsupported', TOO_DEEP_CODE) for item in parsed['diagnostics']):
        return None
    return parsed


def read_typescript(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    from msdmd.readers import _diagnostic
    rid = 'typescript-compiler'
    helper = Path(__file__).with_name('typescript-reader.cjs')
    env = {key: value for key, value in os.environ.items() if key not in {'NODE_OPTIONS', 'NODE_PATH'}}

    def failed(message: str) -> tuple[list, list, list]:
        # Fail closed: the CLI exits 3 and writes nothing, as for a missing
        # runtime. Worker stderr is never published because it can quote
        # inspected source text.
        return [], [], [_diagnostic(context, reader_id=rid, code='typescript_reader_failed',
            message=message + '; input not extracted', status='unsupported', severity='error')]

    # Undecodable input is an input error for read_native, not a worker failure.
    request = json.dumps({'path': str(path), 'text': data.decode('utf-8-sig')})
    # Package resolution is rooted at the trusted helper, never the inspected repo.
    try:
        result = run_node([*NODE_ARGV, str(helper)], input=request, cwd=helper.parent, env=env,
            timeout=TYPESCRIPT_TIMEOUT_SECONDS)
    except FileNotFoundError:
        raise  # node absent from PATH: reader_dependency_unavailable
    except subprocess.TimeoutExpired:
        return [], [], [_diagnostic(context, reader_id=rid, code='typescript_reader_timeout',
            message=f'trusted TypeScript worker exceeded {TYPESCRIPT_TIMEOUT_SECONDS:g}s and was killed; input not extracted',
            status='unsupported', severity='error')]
    except (OSError, UnicodeDecodeError) as exc:
        return failed(f'trusted TypeScript worker could not run ({type(exc).__name__})')
    killed = node_signal(result.returncode)
    if killed:
        # A signal death means node cannot run here (for example a sandbox that
        # V8 refuses), not that this input is malformed: a missing runtime.
        return [], [], [_diagnostic(context, reader_id=rid, code='node_runtime_unavailable',
            message=f'trusted Node worker was killed by {killed}; Node cannot run in this environment; input not extracted',
            status='unsupported')]
    if result.returncode:
        if "Cannot find module 'typescript'" in result.stderr:
            return [], [], [_diagnostic(context, reader_id=rid, code='typescript_reader_unavailable',
                message='TypeScript compiler package not installed for the trusted worker; run npm ci --prefix <msdmd skill dir>',
                status='unsupported')]
        if node_rejected_flag(result.stderr):
            return failed(f'node rejected {" ".join(NODE_ARGV[1:])} (exit status {result.returncode}); Node is too old for the trusted worker')
        return failed(f'trusted TypeScript worker exited with status {result.returncode}')
    parsed = _worker_result(result.stdout)
    if parsed is None:
        return failed('trusted TypeScript worker exited 0 without a complete JSON result')
    try:
        return _typescript_facts(parsed, context)
    except (KeyError, TypeError, AttributeError, ValueError):
        return failed('trusted TypeScript worker exited 0 with a malformed result')


def _typescript_facts(parsed: dict[str, Any], context: dict[str, Any]) -> tuple[list, list, list]:
    """Project one validated worker result onto collection facts."""
    from msdmd.readers import _fact, _diagnostic, _edge, _subject_address
    rid = 'typescript-compiler'
    context = dict(context, convention_version=parsed['version'], dialect='typescript-compiler-jsdoc')
    facts: list = []
    edges: list = []
    diagnostics = [_diagnostic(context, reader_id=rid, code=d['code'],
        message=d.get('message', 'dynamic module loading is not resolved'), status=d['status'],
        severity='error' if d['status'] == 'invalid' or d['code'] == TOO_DEEP_CODE else 'warning',
        location={'start_line': d['start_line'], 'end_line': d['end_line']}) for d in parsed['diagnostics']]
    for index, item in enumerate(parsed['declarations']):
        fact = _fact(context, reader_id=rid, kind='exported-declaration' if item['exported'] else 'symbol-declaration',
            scope='symbol', identity=item['identity'], native_id=None if item.get('anonymous') else item['qualified_name'], value=item,
            location={'start_line': item['start_line'], 'end_line': item['end_line']})
        fact['address'] = fact['subject']['address'] + '/fact/declaration'
        facts.append(fact)
        if item['exported']:
            edges.append(_edge(_subject_address(context, 'module', context['file']), fact['subject']['address'], 'exports'))
    for index, item in enumerate(parsed['docs']):
        fact = _fact(context, reader_id=rid, kind='documentation', scope='symbol', identity=item['identity'],
            value=item, location={'start_line': item['start_line'], 'end_line': item['end_line']},
            convention='typescript.documentation-comment', standing='declared')
        fact['address'] = fact['subject']['address'] + f'/fact/documentation/{index}'
        facts.append(fact)
    for index, item in enumerate(sorted(parsed['comments'], key=lambda c: c['start_line'])):
        scope = 'symbol' if item.get('identity') else 'module'
        identity = item.get('identity') or context['file']
        fact = _fact(context, reader_id=rid, kind='comment', scope=scope, identity=identity,
            value=item, location={'start_line': item['start_line'], 'end_line': item['end_line']}, native_id=str(index))
        facts.append(fact)
        for tag in ('SPDX-License-Identifier', 'SPDX-FileCopyrightText'):
            for match_ordinal, match in enumerate(re.finditer(re.escape(tag) + r':\s*([^\r\n]*?)(?:\*/|$)', item['text'], re.M)):
                facts.append(_fact(context, reader_id=rid, kind='license-declaration', scope='module', identity=context['file'],
                    value={'tag': tag, 'value': match[1].strip()}, native_id=f'{tag}:{index}:{match_ordinal}',
                    location={'start_line': item['start_line'], 'end_line': item['end_line']}, convention='spdx.file-header', standing='declared'))
    for index, item in enumerate(parsed['imports']):
        fact = _fact(context, reader_id=rid, kind='dependency', scope='module', identity=context['file'],
            value=item, native_id=str(index), location={'start_line': item['start_line'], 'end_line': item['end_line']})
        facts.append(fact)
        edges.append(_edge(fact['subject']['address'], 'ecma-module:' + item['module'], item['kind']))
    for index, item in enumerate(parsed['exports']):
        fact = _fact(context, reader_id=rid, kind='local-export', scope='module', identity=context['file'],
            value=item, native_id=item['exported_name'], location={'start_line': item['start_line'], 'end_line': item['end_line']})
        fact['address'] = fact['subject']['address'] + f'/fact/local-export/{index}'
        facts.append(fact)
        targets = [_subject_address(context, 'symbol', identity) for identity in item['declaration_identities']]
        fallback = 'ecma-local:' + item['local_name'] if item.get('local_name') else fact['address']
        for target in targets or [fallback]:
            edges.append(_edge(fact['subject']['address'], target, 'exports:' + item['exported_name']))
    return facts, edges, diagnostics
# ratios: loc_comments=330:52 imports_exports=17:6 calls_definitions=124:11
