# ratios: loc_comments=151:14 imports_exports=9:5 calls_definitions=78:11
"""Bounded, non-executing parsers shared by the native metadata adapters.

Usage: parse_json(bytes), parse_yaml(bytes), parse_xml(bytes). No includes,
constructors, network references or target code are executed. YAML uses PyYAML's
syntax parser with explicit YAML 1.2 core scalar resolution and typed scalar keys.
Repeated keys, cyclic aliases, custom tags, merge keys and excessive expansion
are errors, never silently flattened. XML supports UTF-8, without DTD/entities.
"""
from __future__ import annotations

import json
from decimal import Decimal
import math
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlsplit

def is_json_schema_uri(value: Any) -> bool:
    """Recognize the exact JSON Schema URI authority without fetching it.

    Usage: pass a native $schema value, without coercing its type. This
    recognizes the owning namespace, not a supported draft or trusted URL.
    Userinfo, explicit ports, lookalike hosts and control characters are
    outside this recognition subset and remain unclassified source data.
    """
    if not isinstance(value, str) or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        return False
    try:
        uri = urlsplit(value)
    except ValueError:
        return False
    return uri.scheme in {'http', 'https'} and uri.netloc.lower() == 'json-schema.org'


MAX_NODES = 100_000
MAX_DEPTH = 128


def check_tree(value: Any, depth: int = 0, budget: list[int] | None = None) -> Any:
    budget = [MAX_NODES] if budget is None else budget
    budget[0] -= 1
    if depth > MAX_DEPTH or budget[0] < 0:
        raise ValueError('structured input exceeds node/depth limit')
    if isinstance(value, dict):
        for item in value.values():
            check_tree(item, depth + 1, budget)
    elif isinstance(value, list):
        for item in value:
            check_tree(item, depth + 1, budget)
    return value


def parse_json(data: bytes) -> Any:
    def pairs(items: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in items:
            if key in result:
                raise ValueError('duplicate JSON object key')
            result[key] = value
        return result

    def constant(value: str) -> Any:
        raise ValueError('non-finite JSON number')

    def integer(value: str) -> Any:
        result = int(value)
        if abs(result) > 2 ** 53 - 1 or value == '-0':
            return {'$type': 'json-number', 'lexeme': value}
        return result

    def number(value: str) -> Any:
        result = float(value)
        if not math.isfinite(result):
            raise ValueError('JSON number exceeds finite numeric representation')
        original = Decimal(value)
        if original != Decimal.from_float(result) or (result == 0 and original.is_signed()):
            return {'$type': 'json-number', 'lexeme': value}
        return result

    return check_tree(json.loads(data, object_pairs_hook=pairs, parse_constant=constant, parse_int=integer, parse_float=number))


def parse_yaml(data: bytes) -> Any:
    import yaml  # Optional reader dependency; missing installation is diagnostic.

    class CoreLoader(yaml.BaseLoader):
        yaml_implicit_resolvers: dict = {}
    CoreLoader.add_implicit_resolver('tag:yaml.org,2002:null', re.compile(r'^(?:~|null|Null|NULL|)$'), ['~', 'n', 'N', ''])
    CoreLoader.add_implicit_resolver('tag:yaml.org,2002:bool', re.compile(r'^(?:true|True|TRUE|false|False|FALSE)$'), list('tTfF'))
    CoreLoader.add_implicit_resolver('tag:yaml.org,2002:int', re.compile(r'^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$'), list('-+0123456789'))
    CoreLoader.add_implicit_resolver('tag:yaml.org,2002:float', re.compile(r'^[-+]?(?:(?:[0-9]+\.[0-9]*|\.[0-9]+|[0-9]+[eE][-+]?[0-9]+)(?:[eE][-+]?[0-9]+)?|\.(?:inf|Inf|INF|nan|NaN|NAN))$'), list('-+.0123456789'))
    node = yaml.compose(data.decode('utf-8-sig'), Loader=CoreLoader)
    active: set[int] = set()
    budget = [MAX_NODES]

    def scalar(text: str, tag: str) -> Any:
        if tag not in {'tag:yaml.org,2002:str', 'tag:yaml.org,2002:bool',
                       'tag:yaml.org,2002:null', 'tag:yaml.org,2002:int',
                       'tag:yaml.org,2002:float'}:
            raise ValueError('unsupported YAML tag')
        if tag == 'tag:yaml.org,2002:str':
            return text
        if tag.endswith(':null') and text in {'', '~', 'null', 'Null', 'NULL'}:
            return None
        if tag.endswith(':bool') and text in {'true', 'True', 'TRUE', 'false', 'False', 'FALSE'}:
            return text.lower() == 'true'
        if tag.endswith(':int'):
            if re.fullmatch(r'[-+]?[0-9]+', text):
                return int(text, 10)
            if re.fullmatch(r'0o[0-7]+', text):
                return int(text[2:], 8)
            if re.fullmatch(r'0x[0-9a-fA-F]+', text):
                return int(text[2:], 16)
        if tag.endswith(':float'):
            if text.lower().lstrip('+-') in {'.inf', '.nan'}:
                return {'$type': 'yaml-nonfinite', 'value': text}
            if re.fullmatch(r'[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?', text):
                value = float(text)
                if not math.isfinite(value):
                    raise ValueError('YAML number exceeds finite numeric representation')
                return value
        raise ValueError('invalid explicitly tagged YAML scalar')

    def visit(item: Any, depth: int = 0) -> Any:
        if item is None:
            return None
        budget[0] -= 1
        if depth > MAX_DEPTH or budget[0] < 0:
            raise ValueError('YAML alias expansion exceeds node/depth limit')
        if id(item) in active:
            raise ValueError('cyclic YAML alias')
        active.add(id(item))
        try:
            if isinstance(item, yaml.ScalarNode):
                if item.tag == 'tag:yaml.org,2002:str' and item.style is not None:
                    return item.value
                return scalar(item.value, item.tag)
            if isinstance(item, yaml.SequenceNode):
                if item.tag != 'tag:yaml.org,2002:seq':
                    raise ValueError('unsupported YAML sequence tag')
                return [visit(child, depth + 1) for child in item.value]
            if isinstance(item, yaml.MappingNode):
                if item.tag != 'tag:yaml.org,2002:map':
                    raise ValueError('unsupported YAML mapping tag')
                entries: list[dict] = []
                seen: set[str] = set()
                string_keys = True
                for key, value in item.value:
                    if not isinstance(key, yaml.ScalarNode):
                        raise ValueError('non-scalar YAML key is outside metadata mapping subset')
                    name = visit(key, depth + 1)
                    if name == '<<':
                        raise ValueError('YAML merge keys require a declared merge dialect')
                    signature = key.tag + ':' + json.dumps(name, sort_keys=True)
                    if signature in seen:
                        raise ValueError('duplicate YAML mapping key')
                    seen.add(signature)
                    string_keys = string_keys and isinstance(name, str)
                    entries.append({'key': name, 'tag': key.tag, 'value': visit(value, depth + 1)})
                if string_keys:
                    return {entry['key']: entry['value'] for entry in entries}
                # JSON object keys cannot encode typed YAML keys without loss.
                return {'$type': 'yaml-mapping', 'entries': entries}
            raise ValueError('unknown YAML node')
        finally:
            active.remove(id(item))

    return visit(node)


def parse_xml(data: bytes) -> ET.Element:
    text = data.decode('utf-8-sig')
    if '\x00' in text or re.search(r'<!\s*(?:DOCTYPE|ENTITY)', text, re.I):
        raise ValueError('DTD, entity declarations and non-UTF-8 XML are unsupported')
    if re.search(r'encoding\s*=\s*[\'"](?!utf-8[\'"])[^\'"]+', text[:200], re.I):
        raise ValueError('XML metadata reader requires UTF-8')
    root = ET.fromstring(text)
    stack = [(root, 0)]
    count = 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if depth > MAX_DEPTH or count > MAX_NODES:
            raise ValueError('XML exceeds node/depth limit')
        stack.extend((child, depth + 1) for child in node)
    return root
# ratios: loc_comments=151:14 imports_exports=9:5 calls_definitions=78:11
