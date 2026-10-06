# ratios: loc_comments=254:13 imports_exports=8:2 calls_definitions=146:5
"""Semantic projections for native metadata documents, preserving owning trees.

Usage: registry invokes read_standards(path, bytes, context). The JSON/YAML/TOML
syntax readers retain unknown fields; this adapter adds source-linked operations,
schemas, dependency classes, ownership, reported tests and supply-chain subjects.
These are extraction subsets, not complete schema validators or attestation
verifiers. References are retained and diagnosed; no network fetch is performed.
"""
from __future__ import annotations

import base64
import re
import tomllib
from pathlib import Path
from typing import Any

from msdmd.formats import is_json_schema_uri, parse_json, parse_yaml, parse_xml


def pointer(*parts: Any) -> str:
    return ''.join('/' + str(p).replace('~', '~0').replace('/', '~1') for p in parts)


def read_standards(path: Path, data: bytes, context: dict[str, Any]) -> tuple[list, list, list]:
    from msdmd.readers import _fact, _diagnostic, _edge, _redact_sensitive
    rid = 'metadata-standards'
    facts: list = []
    edges: list = []
    diagnostics: list = []

    def emit(convention: str, version: str, kind: str, loc: str, value: Any,
             *, scope: str = 'document', identity: str | None = None,
             native_id: str | None = None, standing: str = 'declared') -> dict:
        value, redactions = _redact_sensitive(value)
        if redactions:
            diagnostics.append(_diagnostic(context, reader_id=rid, code='sensitive_fields_redacted',
                message='sensitive values withheld from metadata projection', status='redacted'))
        fact = _fact(dict(context, convention_version=version, dialect=convention), reader_id=rid,
            convention=convention, kind=kind, scope=scope, identity=identity or context['file'],
            location={'pointer': loc}, value=value, native_id=native_id, standing=standing)
        facts.append(fact)
        return fact

    def unsupported(code: str, message: str, *, status: str = 'unsupported') -> None:
        diagnostics.append(_diagnostic(context, reader_id=rid, code=code, message=message, status=status))

    suffix = path.suffix.lower()
    if suffix == '.xml':
        root = parse_xml(data)
        local = lambda node: node.tag.rsplit('}', 1)[-1]
        xml_redacted = False

        def scrub_xml(node: Any) -> None:
            # Redact in the XML name domain, before names become generic tag/text keys.
            # Scrub the parsed tree once so every later semantic projection is safe too.
            nonlocal xml_redacted
            if _redact_sensitive({local(node): ''})[1]:
                node.text = '[redacted]'
                node.attrib.clear()
                node[:] = []
                xml_redacted = True
                return
            for name in list(node.attrib):
                if _redact_sensitive({name.rsplit('}', 1)[-1]: ''})[1]:
                    node.set(name, '[redacted]')
                    xml_redacted = True
            for child in node:
                scrub_xml(child)

        scrub_xml(root)
        if xml_redacted:
            diagnostics.append(_diagnostic(context, reader_id=rid, code='sensitive_fields_redacted',
                message='sensitive XML element or attribute content withheld before projection', status='redacted'))
        def element_value(node: Any) -> dict:
            return {'tag': node.tag, 'attributes': dict(node.attrib), 'text': node.text,
                    'tail': node.tail, 'children': [element_value(child) for child in node]}
        root_name = local(root)
        conventions = {'testsuites': 'junit.xml', 'testsuite': 'junit.xml',
            'doxygen': 'doxygen.xml', 'doxygenindex': 'doxygen.xml', 'doc': 'dotnet.xml-doc',
            'project': 'maven.pom'}
        convention = conventions.get(root_name, 'xml.document')
        maven_namespace = 'http://maven.apache.org/POM/4.0.0'
        maven_identity = root.tag == '{' + maven_namespace + '}project' or (root.tag == 'project' and
            any(child.tag == 'modelVersion' and (child.text or '').strip() == '4.0.0' for child in root))
        if convention == 'maven.pom' and not maven_identity:
            convention = 'xml.document'
        emit(convention, root.get('version', 'unspecified-producer-dialect'), 'structured-document', '', element_value(root),
            standing='reported-evidence' if convention == 'junit.xml' else 'declared')
        def walk(node: Any, loc: str) -> None:
            name = local(node)
            if name == 'testcase' and convention == 'junit.xml':
                children = [local(c) for c in node]
                result = 'error' if 'error' in children else 'failure' if 'failure' in children else 'skipped' if 'skipped' in children else 'reported-pass'
                emit(convention, 'unspecified-producer-dialect', 'test-result', loc,
                    {'attributes': dict(node.attrib), 'result': result, 'children': [element_value(c) for c in node]},
                    scope='testcase', identity=loc, native_id=node.get('name'), standing='reported-evidence')
            elif convention == 'doxygen.xml' and name in {'compounddef', 'memberdef'}:
                emit(convention, root.get('version', 'hmmm'), 'documented-symbol', loc, element_value(node),
                    scope='symbol', identity=node.get('id', loc), native_id=node.get('id'))
            elif convention == 'dotnet.xml-doc' and name == 'member':
                emit(convention, 'xml-doc-member-v1', 'documented-symbol', loc, element_value(node),
                    scope='symbol', identity=node.get('name', loc), native_id=node.get('name'))
            elif convention == 'maven.pom' and name == 'dependency':
                fields = {local(c): c.text for c in node}
                emit(convention, 'POM 4.0.0', 'dependency', loc, fields, scope='package', identity=fields.get('artifactId') or loc)
            for index, child in enumerate(node):
                walk(child, loc + pointer('children', index))
        walk(root, '')
        return facts, edges, diagnostics

    if suffix in {'.spdx', '.license'}:
        for index, line in enumerate(data.decode('utf-8-sig').splitlines()):
            match = re.match(r'\s*(SPDX-[A-Za-z]+|SPDXVersion|PackageName|PackageVersion|Relationship|LicenseID|LicenseConcluded|LicenseDeclared):\s*(.*)', line)
            if match:
                fact = emit('spdx.tag-value', 'tag-value extraction', 'license-declaration', pointer('lines', index),
                    {'tag': match[1], 'value': match[2]}, native_id=match[1])
                fact['source']['location'] = {'start_line': index + 1, 'end_line': index + 1}
        return facts, edges, diagnostics

    if suffix in {'.yaml', '.yml', '.cff'}:
        value = parse_yaml(data)
    elif suffix == '.toml' or path.name in {'Cargo.lock', 'poetry.lock', 'uv.lock'}:
        value = tomllib.loads(data.decode('utf-8'))
    else:
        value = parse_json(data)
    if not isinstance(value, dict):
        return facts, edges, diagnostics

    # A structured-document fact is a lossless data view, not standard validation.
    if 'openapi' in value or 'swagger' in value:
        version = str(value.get('openapi', value.get('swagger')))
        emit('openapi.document', version, 'api-description', '', value)
        if not (version == '2.0' or re.fullmatch(r'3\.[01]\.\d+', version)):
            unsupported('unsupported_openapi_version', 'preserved document; operations require Swagger 2 or OpenAPI 3.0/3.1')
        else:
            for section in ('paths', 'webhooks'):
                paths = value.get(section, {})
                if not isinstance(paths, dict):
                    raise ValueError('OpenAPI paths/webhooks must be a mapping')
                for route, item in paths.items():
                    if not isinstance(item, dict):
                        raise ValueError('OpenAPI path item must be a mapping')
                    for method, operation in item.items():
                        if method not in {'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'}:
                            continue
                        if not isinstance(operation, dict):
                            raise ValueError('OpenAPI operation must be a mapping')
                        emit('openapi.document', version, 'api-operation', pointer(section, route, method), operation,
                            scope='operation', identity=f'{section}:{method.upper()} {route}', native_id=operation.get('operationId'))
    elif is_json_schema_uri(value.get('$schema')):
        version = str(value['$schema'])
        emit('json.schema', version, 'schema-description', '', value, scope='schema', native_id=value.get('$id', value.get('id')))
        if not re.fullmatch(r'https?://json-schema\.org/(?:draft/(?:2020-12|2019-09)|draft-0[467])/schema#?', version):
            unsupported('unsupported_json_schema_draft', 'preserved schema; semantic extraction tested for drafts 4/6/7/2019-09/2020-12')
    if 'cff-version' in value:
        version = str(value['cff-version'])
        emit('citation.cff', version, 'citation', '', value, scope='work', native_id=value.get('doi'))
        if version != '1.2.0':
            unsupported('unsupported_cff_version', 'citation fields preserved; tested CFF version is 1.2.0')
    if 'runs' in value and ('sarif' in str(value.get('$schema', '')).lower() or value.get('version') == '2.1.0'):
        version = str(value.get('version', 'hmmm'))
        emit('sarif', version, 'analysis-report', '', value, scope='report', standing='reported-evidence')
        if version != '2.1.0':
            unsupported('unsupported_sarif_version', 'result mapping requires SARIF 2.1.0')
        else:
            for i, run in enumerate(value['runs']):
                if not isinstance(run, dict):
                    raise ValueError('SARIF run must be a mapping')
                for j, result in enumerate(run.get('results', [])):
                    emit('sarif', version, 'analysis-result', pointer('runs', i, 'results', j),
                        {'result': result, 'producer': run.get('tool'), 'invocations': run.get('invocations')},
                        scope='analysis-result', identity=f'run:{i}/result:{j}', standing='reported-evidence')
    if 'spdxVersion' in value:
        version = str(value['spdxVersion'])
        emit('spdx.json', version, 'sbom', '', value, scope='artifact', native_id=value.get('SPDXID'), standing='reported-evidence')
        if version not in {'SPDX-2.2', 'SPDX-2.3'}:
            unsupported('unsupported_spdx_version', 'package mapping tested for SPDX 2.2/2.3 JSON')
        else:
            for section in ('packages', 'files', 'relationships'):
                for i, item in enumerate(value.get(section, [])):
                    emit('spdx.json', version, 'artifact-' + section.rstrip('s'), pointer(section, i), item,
                        scope='artifact', identity=item.get('SPDXID', f'{section}:{i}'), native_id=item.get('SPDXID'), standing='reported-evidence')
    if value.get('bomFormat') == 'CycloneDX':
        version = str(value.get('specVersion', 'hmmm'))
        emit('cyclonedx.json', version, 'sbom', '', value, scope='artifact', native_id=value.get('serialNumber'), standing='reported-evidence')
        if version not in {'1.4', '1.5', '1.6'}:
            unsupported('unsupported_cyclonedx_version', 'component mapping tested for CycloneDX 1.4/1.5/1.6')
        else:
            def components(items: list, loc: str) -> None:
                for index, item in enumerate(items):
                    where = loc + pointer(index)
                    emit('cyclonedx.json', version, 'artifact-component', where, item, scope='artifact',
                        identity=item.get('bom-ref', where), native_id=item.get('bom-ref'), standing='reported-evidence')
                    components(item.get('components', []), where + '/components')
            components(value.get('components', []), '/components')
    statement = value
    statement_pointer = ''
    if value.get('payloadType') == 'application/vnd.in-toto+json' and isinstance(value.get('payload'), str):
        statement = parse_json(base64.b64decode(value['payload'], validate=True))
        statement_pointer = '/payload'
        emit('dsse.envelope', 'v1', 'signed-envelope', '', value, scope='attestation', standing='reported-evidence')
        unsupported('unverified_signature', 'envelope parsed; signature verification was not requested or performed', status='unverified')
    if isinstance(statement, dict) and str(statement.get('_type', '')).startswith('https://in-toto.io/Statement/'):
        version = str(statement['_type'])
        fact = emit('in-toto.statement', version, 'attestation', statement_pointer, statement, scope='attestation', standing='reported-evidence')
        if statement_pointer:
            fact['projection'] = {'mapping_version': 'dsse-base64-json@1', 'loss': 'none; signature not verified'}
        if version not in {'https://in-toto.io/Statement/v1', 'https://in-toto.io/Statement/v0.1'}:
            unsupported('unsupported_statement_version', 'subject mapping requires in-toto Statement v1 or v0.1')
        else:
            for i, subject in enumerate(statement.get('subject', [])):
                emit('in-toto.statement', version, 'attested-subject', statement_pointer + pointer('subject', i), subject,
                    scope='artifact', identity=subject.get('name', str(i)), native_id=subject.get('name'), standing='reported-evidence')
    if path.name in {'package-lock.json', 'npm-shrinkwrap.json'}:
        version = str(value.get('lockfileVersion', 'hmmm'))
        emit('npm.lockfile', version, 'lockfile', '', value, scope='package')
        if version not in {'2', '3'}:
            unsupported('unsupported_npm_lock_version', 'resolved-package mapping requires npm lockfileVersion 2 or 3')
        else:
            for name, item in value.get('packages', {}).items():
                emit('npm.lockfile', version, 'locked-package', pointer('packages', name), item,
                    scope='package', identity=name or '.', native_id=name)
    if path.name in {'Cargo.toml', 'Cargo.lock', 'poetry.lock', 'uv.lock', 'pnpm-lock.yaml'}:
        convention = {'Cargo.toml': 'cargo.manifest', 'Cargo.lock': 'cargo.lockfile',
            'poetry.lock': 'poetry.lockfile', 'uv.lock': 'uv.lockfile', 'pnpm-lock.yaml': 'pnpm.lockfile'}[path.name]
        version = str(value.get('version', value.get('lockfileVersion', 'source-owned-manifest')))
        emit(convention, version, 'package-metadata', '', value, scope='package')
        if path.name == 'Cargo.toml':
            for group in ('dependencies', 'dev-dependencies', 'build-dependencies'):
                for name, requirement in value.get(group, {}).items():
                    emit(convention, version, 'dependency', pointer(group, name), {'name': name, 'requirement': requirement, 'class': group},
                        scope='package', identity=name, native_id=name)
            for target, config in value.get('target', {}).items():
                for group in ('dependencies', 'dev-dependencies', 'build-dependencies'):
                    for name, requirement in config.get(group, {}).items():
                        emit(convention, version, 'dependency', pointer('target', target, group, name),
                            {'name': name, 'requirement': requirement, 'class': group, 'condition': target},
                            scope='package', identity=name, native_id=name)
        elif isinstance(value.get('package'), list):
            for i, package in enumerate(value['package']):
                emit(convention, version, 'locked-package', pointer('package', i), package,
                    scope='package', identity=f"{package.get('name', '?')}@{package.get('version', '?')}", native_id=package.get('name'))
    if path.name == 'REUSE.toml':
        emit('reuse.toml', str(value.get('version', 'hmmm')), 'license-metadata', '', value)
        for i, annotation in enumerate(value.get('annotations', [])):
            emit('reuse.toml', str(value.get('version', 'hmmm')), 'license-rule', pointer('annotations', i), annotation, scope='path-rule', identity=str(i))
    if path.suffix == '.ipynb':
        version = str(value.get('nbformat', 'hmmm'))
        emit('jupyter.notebook', version, 'notebook-metadata', '/metadata', value.get('metadata', {}))
        for i, cell in enumerate(value.get('cells', [])):
            emit('jupyter.notebook', version, 'cell-metadata', pointer('cells', i, 'metadata'), cell.get('metadata', {}), scope='cell', identity=cell.get('id', str(i)), native_id=cell.get('id'))
    # Reference objects are retained, never downloaded or treated as resolved.
    def refs(item: Any, loc: str) -> None:
        if isinstance(item, dict):
            for key, child in item.items():
                child_loc = loc + pointer(key)
                if key in {'$ref', '$dynamicRef'} and isinstance(child, str):
                    emit('metadata.reference', 'URI-reference', 'reference', child_loc,
                        {'uri': child, 'resolution': 'not-resolved', 'network_access': False}, standing='declared')
                else:
                    refs(child, child_loc)
        elif isinstance(item, list):
            for index, child in enumerate(item):
                refs(child, loc + pointer(index))
    refs(value, '')
    # Native IDs have convention-owned uniqueness rules; collector pointers do
    # not excuse duplicate IDs. Retain all witnesses while rejecting validity.
    unique_kinds = {'openapi.document': {'api-operation'},
                    'spdx.json': {'sbom', 'artifact-package', 'artifact-file'},
                    'cyclonedx.json': {'artifact-component'}}
    identities: dict[tuple[str, str], list[dict]] = {}
    for fact in facts:
        namespace = fact['convention']['namespace']
        native_id = fact['native']['id']
        if native_id is not None and fact['kind'] in unique_kinds.get(namespace, set()):
            identities.setdefault((namespace, str(native_id)), []).append(fact)
    for (namespace, _), witnesses in identities.items():
        if len(witnesses) > 1:
            diagnostics.append(_diagnostic(context, reader_id=rid,
                code='duplicate_native_identifier', message='duplicate native ID in ' + namespace,
                status='invalid', severity='error'))
    return facts, edges, diagnostics
# ratios: loc_comments=254:13 imports_exports=8:2 calls_definitions=146:5
