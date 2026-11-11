#!/usr/bin/env python3
"""Execute A0 provisioning/rotation and the supplied skill-lib consumer together.

Usage: python3 tests/reliability/check_launcher_compat.py ../skill-lib
Vault transport uses an inert loopback HTTP fixture that enforces recorded policy
and compare-and-set versions. Account identity, private-file root ownership,
hidden token input, and GitHub authentication are controlled fixtures. The real
helper launches real children; no live GitHub, OpenBao, VM, or key is involved.
"""
import contextlib
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
from unittest.mock import patch


def parse_policy(value):
    """Parse complete producer declarations without discarding malformed lines."""
    if not isinstance(value, str) or not value:
        raise ValueError('Policy must be a nonempty string')
    prefix, separator, suffix = 'path "', '" { capabilities = ', ' }'
    rules = {}
    for line in value.splitlines():
        if not line.startswith(prefix) or not line.endswith(suffix):
            raise ValueError('Malformed policy declaration')
        path, found, encoded = line[len(prefix):-len(suffix)].partition(separator)
        if not found or not path or '"' in path or path in rules:
            raise ValueError('Malformed or duplicate policy path')
        caps = json.loads(encoded)
        if (not isinstance(caps, list) or not caps
                or any(not isinstance(cap, str) or not cap for cap in caps)):
            raise ValueError('Policy capabilities must be nonempty strings')
        if len(set(caps)) != len(caps):
            raise ValueError('Duplicate policy capability')
        rules[path] = set(caps)
    return rules


def main():
    root = Path(sys.argv[1]).resolve()
    helper = root / 'tools/a0_vault.py'
    assert helper.is_file(), 'Supply the inspected skill-lib checkout'
    spec = importlib.util.spec_from_file_location('producer', Path(__file__).parents[2] / 'operations/configure-vault.py')
    producer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(producer)
    seen = []
    policies = {}
    tokens = {'inert-admin': 'root'}
    github = {'version': 0, 'value': None}
    writes = []
    fixture_errors = []
    github_values = ('inert-github-first-credential', 'inert-github-second-credential')
    expected_cli_policy = {
        **{f'a0/data/provider/{name}': {'read'} for name in ('openai', 'xai', 'deepseek', 'anthropic')},
        'a0/data/integration/github': {'read'},
        'auth/token/lookup-self': {'read'},
        'auth/token/renew-self': {'update'},
    }

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def role(self):
            return tokens.get(self.headers.get('X-Vault-Token'), 'unknown')

        def allowed(self, capability):
            role = self.role()
            if role == 'root':
                return True
            path = self.path.removeprefix('/v1/')
            return any(capability in caps and (pattern == path or
                pattern.endswith('*') and path.startswith(pattern[:-1]))
                for pattern, caps in policies.get(role, {}).items())

        def record(self):
            seen.append((self.command, self.path, self.role()))

        def reject(self, message, status=403):
            fixture_errors.append(message)
            self.respond({'errors': ['inert fixture rejected request']}, status)

        def do_GET(self):
            self.record()
            if self.path == '/v1/sys/seal-status':
                data = {'initialized': True, 'sealed': False, 'cluster_id': 'cross-repo-fixture'}
            elif self.path == '/v1/auth/token/lookup-self':
                if not self.allowed('read'):
                    return self.reject('Token self-lookup without the required policy')
                data = {'data': {'policies': [self.role()], 'period': 86400}}
            elif self.path == '/v1/sys/mounts' and self.role() == 'root':
                data = {'data': {'a0/': {'type': 'kv', 'options': {'version': '2'}}}}
            elif self.path == '/v1/a0/data/provider/deepseek':
                if not self.allowed('read'):
                    return self.reject('Provider read outside provisioned policy')
                data = {'data': {'data': {'api_key': 'inert-provider'}}}
            elif self.path == '/v1/a0/data/integration/github':
                if not self.allowed('read'):
                    return self.reject('GitHub read outside provisioned policy')
                if github['value'] is None:
                    return self.respond({}, 404)
                data = {'data': {'data': {'token': github['value']}, 'metadata': {'version': github['version']}}}
            elif self.path == '/v1/a0/metadata/integration/github':
                if not self.allowed('read'):
                    return self.reject('GitHub metadata read outside provisioned policy')
                if not github['version']:
                    return self.respond({}, 404)
                data = {'data': {'current_version': github['version']}}
            else:
                return self.reject('Unexpected fixture GET endpoint', 404)
            return self.respond(data)

        def do_POST(self):
            self.record()
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if self.path == '/v1/auth/token/create' and self.role() == 'root':
                roles = data.get('policies')
                if roles not in (['a0-app'], ['a0-cli']) or roles[0] not in policies:
                    return self.reject('Token creation requires one provisioned policy', 400)
                token = 'inert-' + roles[0]
                tokens[token] = roles[0]
                return self.respond({'auth': {'client_token': token}})
            if self.path != '/v1/a0/data/integration/github' or not self.allowed('update'):
                return self.reject('Unexpected or unauthorized fixture POST endpoint')
            if (set(data) != {'options', 'data'} or data.get('options') != {'cas': github['version']}
                    or set(data.get('data', {})) != {'token'}):
                return self.reject('GitHub write did not preserve the CAS/data contract', 400)
            writes.append((self.role(), data['options']['cas']))
            github['value'] = data['data']['token']
            github['version'] += 1
            return self.respond({'data': {'version': github['version']}})

        def do_PUT(self):
            self.record()
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            if not self.path.startswith('/v1/sys/policies/acl/') or self.role() != 'root':
                return self.reject('Policy writes require provisioning authority')
            role = self.path.rsplit('/', 1)[-1]
            try:
                rules = parse_policy(data['policy'])
            except (KeyError, TypeError, ValueError):
                return self.reject('Malformed or duplicate policy declaration', 400)
            if role == 'a0-cli' and rules != expected_cli_policy:
                return self.reject('CLI policy must contain only enumerated read paths and self operations', 400)
            if role not in ('a0-app', 'a0-cli'):
                return self.reject('Unexpected policy role', 400)
            policies[role] = rules
            return self.respond({})

        def do_DELETE(self):
            self.record()
            if self.path != '/v1/a0/data/integration/github' or not self.allowed('delete'):
                return self.reject('Secret deletion requires scoped application authority')
            github['value'] = None
            return self.respond({})

        def respond(self, data, status=200):
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode())

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            temporary = Path(tmp)
            config = {'BAO_ADDR': f'http://127.0.0.1:{server.server_port}', 'BAO_CLUSTER_ID': 'cross-repo-fixture'}
            def atomic(path, value, *_args):
                path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value); path.chmod(0o600)
            uid = os.getuid() or 1000
            account = SimpleNamespace(pw_uid=uid, pw_gid=os.getgid())
            real_fstat = os.fstat

            def fixture_root_owner(fd):
                """Stand in for root ownership only on files inside this fixture."""
                info = real_fstat(fd)
                target = Path(os.readlink(f'/proc/self/fd/{fd}'))
                if target.is_relative_to(temporary):
                    values = list(info)
                    values[4] = 0
                    return os.stat_result(values)
                return info

            receipt = io.StringIO()
            with contextlib.ExitStack() as boundary:
                boundary.enter_context(patch.object(producer, 'ETC', temporary))
                boundary.enter_context(patch.object(producer, 'atomic', side_effect=atomic))
                boundary.enter_context(patch.object(producer.pwd, 'getpwnam', return_value=account))
                boundary.enter_context(patch.object(producer.os, 'fstat', side_effect=fixture_root_owner))
                boundary.enter_context(contextlib.redirect_stdout(receipt))
                with patch.object(producer, 'root_material', return_value={'root_token': 'inert-admin'}):
                    producer.provision(config, 'fixture-operator')
                cli_config = temporary / 'cli' / f'{uid}.json'
                assert policies['a0-cli'] == expected_cli_policy
                assert 'github' not in json.loads(cli_config.read_text())
                provision_boundary = len(seen)
                assert Path(config['BAO_TOKEN_FILE']).read_text().strip() == 'inert-a0-app'

                # Consumers run under this process's real UID and real file checks.
                # Their independently executed interpreter is not affected by fstat's fixture.
                binary_dir = temporary / 'bin'
                binary_dir.mkdir()
                marker = temporary / 'gh-called'
                gh = binary_dir / 'gh'
                gh.write_text(f'''#!{sys.executable}
import os, sys
from pathlib import Path
if sys.argv[1:] != ['auth', 'git-credential', 'get']:
    raise SystemExit(98)
sys.stdin.read()
Path({str(marker)!r}).write_text('credential helper called')
print('username=fixture-owner')
print('password=' + os.environ.get('GH_TOKEN', 'inert-stale-disk-login'))
''')
                gh.chmod(0o700)
                child_env = {**os.environ, 'PATH': str(binary_dir) + os.pathsep + os.environ['PATH'],
                    'OPENAI_API_KEY': 'stale', 'XAI_API_KEY': 'stale', 'ANTHROPIC_API_KEY': 'stale',
                    'BAO_TOKEN': 'stale', 'VAULT_TOKEN': 'stale', 'A0_DATABASE_URL': 'stale',
                    'GH_TOKEN': 'inert-stale-gh-token', 'GITHUB_TOKEN': 'inert-stale-github-token'}

                def launch(code, *args):
                    return subprocess.run([sys.executable, str(helper), '--config', str(cli_config),
                        'exec', 'deepcode', '--', sys.executable, '-c', code, *args],
                        capture_output=True, text=True, env=child_env)

                provider_code = "import os; assert os.environ['DEEPSEEK_API_KEY']=='inert-provider'; assert not any(k in os.environ for k in ['OPENAI_API_KEY','XAI_API_KEY','ANTHROPIC_API_KEY','BAO_TOKEN','VAULT_TOKEN','A0_DATABASE_URL','GH_TOKEN','GITHUB_TOKEN']); print('selected provider only')"
                result = launch(provider_code)
                assert result.returncode == 0, result.stderr
                assert result.stdout.strip() == 'selected provider only'
                assert [path for _, path, _ in seen if '/provider/' in path] == ['/v1/a0/data/provider/deepseek']

                rotation_code = '''import hashlib, os, subprocess, sys
assert os.environ['DEEPSEEK_API_KEY'] == 'inert-provider'
assert hashlib.sha256(os.environ.get('GH_TOKEN', '').encode()).hexdigest() == sys.argv[1]
assert not any(k in os.environ for k in ['GITHUB_TOKEN','OPENAI_API_KEY','XAI_API_KEY','ANTHROPIC_API_KEY','BAO_TOKEN','VAULT_TOKEN','A0_DATABASE_URL'])
assert os.environ['GH_TOKEN'] not in '\\0'.join(sys.argv)
result = subprocess.run(['gh','auth','git-credential','get'], input='protocol=https\\nhost=github.com\\n\\n', capture_output=True, text=True, check=True)
credential = dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)
assert credential['password'] == os.environ['GH_TOKEN']
print('fresh github and selected provider only')
'''
                with patch.object(producer, 'root_material', side_effect=AssertionError('Routine rotation accessed root material')) as root_access:
                    for candidate in github_values:
                        with patch.object(producer, 'github_input', return_value=candidate) as hidden_input, patch.object(producer, 'github_identity') as identity:
                            producer.set_github_token(config, 'fixture-operator')
                            hidden_input.assert_called_once_with(False)
                            identity.assert_called_once_with(candidate)
                        active = json.loads(cli_config.read_text())
                        assert active['github'] == {'path': 'integration/github', 'agents': ['deepcode']}
                        assert github['value'] == candidate
                        result = launch(rotation_code, hashlib.sha256(candidate.encode()).hexdigest())
                        assert result.returncode == 0, result.stderr
                        assert result.stdout.strip() == 'fresh github and selected provider only'
                        assert marker.exists(), 'The actual child must reach its credential helper'
                        marker.unlink()
                        assert candidate not in result.stdout + result.stderr + receipt.getvalue()
                    root_access.assert_not_called()
                assert writes == [('a0-app', 0), ('a0-app', 1)], 'Rotations must use scoped CAS writes'
                assert github['version'] == 2

                producer.api(config['BAO_ADDR'], 'DELETE', '/a0/data/integration/github',
                    token=Path(config['BAO_TOKEN_FILE']).read_text().strip())
                result = launch(rotation_code, hashlib.sha256(github_values[-1].encode()).hexdigest())
                assert result.returncode != 0, 'Deleted token unexpectedly dispatched a child'
                assert 'fresh github and selected provider only' not in result.stdout
                assert not marker.exists(), 'Deleted token reached a stale gh disk-login fallback'
                assert all(role != 'root' for _, _, role in seen[provision_boundary:])
                assert not fixture_errors, fixture_errors
                assert not any(value in result.stdout + result.stderr + receipt.getvalue() for value in github_values)
            print('PASS: A0 producer → skill-lib child; provider isolation, scoped GitHub CAS rotation twice, and deletion refusal verified with inert fixtures.')
    finally:
        server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': main()
