#!/usr/bin/env python3
"""Check the producer/consumer contract against a supplied exact skill-lib checkout.

Usage: python3 tests/reliability/check_launcher_compat.py ../skill-launcher
Inert HTTP fixture and private temp files only; no service changes or live keys.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
from unittest.mock import patch


def main():
    root = Path(sys.argv[1]).resolve()
    helper = root / 'tools/a0_vault.py'
    assert helper.is_file(), 'Supply the inspected skill-lib checkout'
    spec = importlib.util.spec_from_file_location('producer', Path(__file__).parents[2] / 'operations/configure-vault.py')
    producer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(producer)
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def do_GET(self):
            seen.append(self.path)
            if self.path == '/v1/sys/seal-status': data = {'initialized': True, 'sealed': False, 'cluster_id': 'cross-repo-fixture'}
            elif self.path == '/v1/auth/token/lookup-self': data = {'data': {'policies': ['a0-cli']}}
            elif self.path == '/v1/sys/mounts': data = {'data': {'a0/': {'type': 'kv', 'options': {'version': '2'}}}}
            elif self.path == '/v1/a0/data/provider/deepseek': data = {'data': {'data': {'api_key': 'inert-provider'}}}
            else: raise AssertionError('Unexpected fixture endpoint')
            self.respond(data)

        def do_POST(self):
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            assert self.path == '/v1/auth/token/create'
            self.respond({'auth': {'client_token': 'inert-' + data['policies'][0]}})

        def do_PUT(self):
            self.rfile.read(int(self.headers['Content-Length']))
            assert self.path.startswith('/v1/sys/policies/acl/')
            self.respond({})

        def respond(self, data):
            self.send_response(200); self.end_headers(); self.wfile.write(json.dumps(data).encode())

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        with tempfile.TemporaryDirectory() as tmp:
            config = {'BAO_ADDR': f'http://127.0.0.1:{server.server_port}', 'BAO_CLUSTER_ID': 'cross-repo-fixture'}
            def atomic(path, value, *_args):
                path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(value); path.chmod(0o600)
            with patch.object(producer, 'ETC', Path(tmp)), patch.object(producer, 'atomic', side_effect=atomic), patch.object(producer, 'root_material', return_value={'root_token': 'inert-admin'}), patch.object(producer.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=os.getuid() or 1000, pw_gid=os.getgid())):
                producer.provision(config, 'fixture-operator')
            uid = os.getuid() or 1000
            code = "import os; assert os.environ['DEEPSEEK_API_KEY']=='inert-provider'; assert not any(k in os.environ for k in ['OPENAI_API_KEY','XAI_API_KEY','ANTHROPIC_API_KEY','BAO_TOKEN','VAULT_TOKEN','A0_DATABASE_URL']); print('selected provider only')"
            result = subprocess.run([sys.executable, str(helper), '--config', f'{tmp}/cli/{uid}.json', 'exec', 'deepcode', '--', sys.executable, '-c', code], capture_output=True, text=True,
                env={**os.environ, 'OPENAI_API_KEY': 'stale', 'XAI_API_KEY': 'stale', 'ANTHROPIC_API_KEY': 'stale', 'BAO_TOKEN': 'stale', 'VAULT_TOKEN': 'stale', 'A0_DATABASE_URL': 'stale'})
            assert result.returncode == 0, result.stderr
            assert result.stdout.strip() == 'selected provider only'
            assert [p for p in seen if '/provider/' in p] == ['/v1/a0/data/provider/deepseek']
            print('PASS: A0-produced CLI config consumed by skill-lib; selected key isolation preserved.')
    finally:
        server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__': main()
