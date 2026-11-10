"""Inert recovery tests: python3 -m unittest discover -s tests/reliability.

Real reader/HTTP/shell execution; no production vault, services, DB or GPG.
Fixture bootstrap replaces paths/root UID only, preserving mode/no-follow checks.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

OPS = Path(__file__).resolve().parents[2] / 'operations'
spec = importlib.util.spec_from_file_location('admin', OPS / 'configure-vault.py')
admin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(admin)
TOKEN = 'inert-root-credential=padding=='
CANARY = 'a0-backup-canary-20261110-120000'


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.material = self.root / 'init.json'
        self.material.write_text(json.dumps({'root_token': TOKEN, 'recovery_keys_b64': ['inert']}))
        self.material.chmod(0o600)
        self.requests = []
        self.failure = None
        self.value = CANARY
        test = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_): pass

            def do_GET(self):
                test.requests.append((self.path, self.headers.get('X-Vault-Token')))
                if test.failure == 'redirect':
                    self.send_response(302)
                    self.send_header('Location', '/must-not-follow')
                    self.end_headers()
                    return
                status = 403 if test.failure == 'auth' and self.path != '/v1/sys/seal-status' else 200
                if self.path == '/v1/sys/seal-status':
                    data = {'initialized': test.failure != 'uninitialized', 'sealed': test.failure == 'sealed',
                            'cluster_id': 'wrong' if test.failure == 'cluster' else 'inert-cluster'}
                elif self.path == '/v1/auth/token/lookup-self': data = {'data': {'policies': ['root']}}
                else: data = {'data': {'data': {'value': test.value}}}
                if status == 403: data = {'errors': [TOKEN]}
                self.send_response(status)
                self.end_headers()
                self.wfile.write((TOKEN if test.failure == 'json' else json.dumps(data)).encode())

            def do_POST(self):
                test.requests.append((self.path, self.headers.get('X-Vault-Token')))
                payload = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                test.value = payload['data']['value']
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{}')

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        self.config = self.root / 'a0.env'
        self.config.write_text(f'BAO_ADDR=http://127.0.0.1:{self.server.server_port}\nBAO_CLUSTER_ID=inert-cluster\nBAO_KV_MOUNT=custom\n')
        self.config.chmod(0o600)
        self.receipt = self.root / 'receipt'
        self.receipt.mkdir()
        (self.receipt / 'canary.txt').write_text('canary=' + CANARY + '\n')
        (self.receipt / 'vault-identity.json').write_text('{"cluster_id":"inert-cluster","mount":"custom"}')
        self.bootstrap = self.root / 'python3'
        self.bootstrap.write_text(f'''#!{sys.executable}
import importlib.util, os, sys
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('fixture_admin', sys.argv[1])
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
sys.argv=sys.argv[1:]; m.ETC=Path({str(self.root)!r})
original=m.read_private; real_fstat=os.fstat
def owned(fd):
    fields=list(real_fstat(fd)); fields[4]=0
    return os.stat_result(fields)
def read(path):
    return original(Path({str(self.material)!r}) if str(path)=='/etc/openbao/init.json' else path)
with patch.object(m.os, 'geteuid', return_value=0), patch.object(m.os, 'fstat', side_effect=owned), patch.object(m, 'read_private', side_effect=read):
    raise SystemExit(m.main())
''')
        self.bootstrap.chmod(0o700)

    def stop_server(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()

    def invoke(self, *args):
        result = subprocess.run([str(self.bootstrap), str(OPS / 'configure-vault.py'), *args], capture_output=True, text=True)
        self.assertNotIn(TOKEN, result.stdout + result.stderr)
        self.assertNotIn('Traceback', result.stderr)
        return result

    def restore(self):
        return self.invoke('--restore-canary', str(self.receipt), '--restore-port', str(self.server.server_port))

    def test_json_and_legacy_round_trip_http_with_padding_and_custom_mount(self):
        for raw in (json.dumps({'root_token': TOKEN}), '# historical\nroot_token=' + TOKEN + '\nrecovery_key=inert\n'):
            self.material.write_text(raw)
            result = self.invoke('--backup-canary', CANARY)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout), {'cluster_id': 'inert-cluster', 'mount': 'custom'})
            result = self.restore()
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('CANARY_OK', result.stdout)
        auth = [(p, t) for p, t in self.requests if p != '/v1/sys/seal-status']
        self.assertTrue(auth)
        self.assertTrue(all(t == TOKEN for _, t in auth))
        self.assertTrue(all(p in ('/v1/auth/token/lookup-self', '/v1/custom/data/backup-canary') for p, _ in auth))

    def test_invalid_material_refuses_http_without_output(self):
        cases = ['', '{}', '[]', '{"root_token":', '{bad\nroot_token=' + TOKEN,
                 json.dumps({'root_token': None}), json.dumps({'root_token': 7}),
                 json.dumps({'root_token': ''}), json.dumps({'root_token': TOKEN + '\nInjected: yes'}),
                 '{"root_token":"first","root_token":"second"}',
                 'root_token=first\nroot_token=second\n', 'root_token=\n',
                 'root_token=$(touch /tmp/never-execute)\n', 'export root_token=secret\n',
                 'root_token=' + ('x' * 65537)]
        for i, raw in enumerate(cases):
            with self.subTest(case=i):
                self.material.write_text(raw)
                self.assertNotEqual(self.invoke('--backup-canary', CANARY).returncode, 0)
        self.assertEqual(self.requests, [])

    def test_missing_unsafe_symlink_directory_and_fifo_fail_closed(self):
        for kind in ('missing', 'world-readable', 'group-writable', 'symlink', 'directory', 'fifo'):
            with self.subTest(kind=kind):
                if self.material.exists() or self.material.is_symlink(): self.material.unlink()
                if kind == 'symlink': self.material.symlink_to(self.config)
                elif kind == 'directory': self.material.mkdir()
                elif kind == 'fifo': os.mkfifo(self.material)
                elif kind != 'missing':
                    self.material.write_text('root_token=' + TOKEN)
                    self.material.chmod(0o644 if kind == 'world-readable' else 0o620)
                self.assertNotEqual(self.invoke('--check-recovery').returncode, 0)
                if self.material.is_dir(): self.material.rmdir()

    def test_owner_and_unreadable_checks(self):
        fields = list(self.material.stat()); fields[4] = 12345
        with patch.object(admin.os, 'fstat', return_value=os.stat_result(fields)):
            with self.assertRaises(admin.SetupError): admin.read_private(self.material)
        with patch.object(admin.os, 'open', side_effect=PermissionError):
            with self.assertRaises(PermissionError): admin.root_material(self.material)

    def test_legacy_root_group_readable_mode_is_accepted(self):
        self.material.write_text('root_token=' + TOKEN + '\n'); self.material.chmod(0o640)
        self.assertEqual(self.invoke('--check-recovery').returncode, 0)

    def test_auth_redirect_json_seal_and_cluster_failures(self):
        for failure in ('auth', 'redirect', 'json', 'sealed', 'uninitialized', 'cluster'):
            with self.subTest(failure=failure):
                self.failure = failure
                for result in (self.invoke('--backup-canary', CANARY), self.restore()):
                    self.assertNotEqual(result.returncode, 0)
                    self.assertNotIn('CANARY_OK', result.stdout)
        self.assertFalse(any(p in ('/must-not-follow', '/v1/sys/init', '/v1/sys/unseal') for p, _ in self.requests))
        self.requests.clear()
        self.assertNotEqual(self.invoke('--backup-canary', CANARY).returncode, 0)
        self.assertEqual(self.requests, [('/v1/sys/seal-status', None)])

    def test_network_failure_is_redacted(self):
        with patch.object(admin, 'read_private', return_value=self.material.read_text()), patch.object(admin.urllib.request.OpenerDirector, 'open', side_effect=admin.urllib.error.URLError(TOKEN)):
            with self.assertRaises(admin.SetupError) as failure:
                admin.recovery_canary({'BAO_ADDR': 'http://127.0.0.1:8200'}, write=CANARY)
            self.assertNotIn(TOKEN, str(failure.exception))

    def test_wrong_canary_and_archive_identity_refuse_restore(self):
        self.value = TOKEN
        self.assertNotEqual(self.restore().returncode, 0)
        (self.receipt / 'vault-identity.json').write_text('{"cluster_id":"wrong","mount":"custom"}')
        self.requests.clear()
        self.assertNotEqual(self.restore().returncode, 0)
        self.assertEqual(self.requests, [])

    def test_historical_archive_requires_independent_cluster_pin(self):
        (self.receipt / 'vault-identity.json').unlink()
        self.assertEqual(self.restore().returncode, 0)
        self.config.write_text('BAO_KV_MOUNT=custom\n')
        self.requests.clear()
        self.assertNotEqual(self.restore().returncode, 0)
        self.assertEqual(self.requests, [])

    def test_shells_reject_bad_material_before_side_effects(self):
        self.material.write_text('{}')
        for name in ('backup.sh', 'restore.sh'):
            result = subprocess.run(['bash', '-x', str(OPS / name), 'unused.gpg', 'fixture'],
                env={**os.environ, 'PATH': str(self.root) + ':' + os.environ['PATH']}, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Recovery root token is missing or invalid', result.stderr)
            self.assertNotIn(TOKEN, result.stdout + result.stderr)
            self.assertNotIn('[backup]', result.stdout); self.assertNotIn('[restore]', result.stdout)

    def test_real_shells_route_both_formats_without_credential_arguments(self):
        """Fixed-path sandbox; inert OS/crypto commands; real Python HTTP path."""
        sandbox_ops = self.root / 'operations'; sandbox_ops.mkdir()
        shutil.copy2(OPS / 'configure-vault.py', sandbox_ops)
        for name in ('backup.sh', 'restore.sh'):
            source = (OPS / name).read_text()
            for fixed in ('/etc/a0', '/etc/openbao', '/srv/a0', '/tmp/a0-', '/opt/a0'):
                source = source.replace(fixed, str(self.root) + fixed)
            (sandbox_ops / name).write_text(source)
        for path in ('etc/a0', 'etc/openbao', 'srv/a0/media', 'opt/a0', 'tmp', 'bin'):
            (self.root / path).mkdir(parents=True, exist_ok=True)
        (self.root / 'etc/a0/backup.key').write_text('inert-encryption-key')
        (self.root / 'etc/openbao/seal.key').write_text('inert-seal-key')
        (self.root / 'etc/a0/db-passwords.env').write_text('BAO_DB_PW=inert-db-password')
        (self.root / 'srv/a0/media/file').write_text('inert media')
        stub = self.root / 'bin/stub'
        stub.write_text(f'''#!{sys.executable}
import json, pathlib, shutil, sys, time
name=pathlib.Path(sys.argv[0]).name; args=sys.argv[1:]
with open({str(self.root / 'commands.jsonl')!r}, 'a') as log: log.write(json.dumps([name, *args])+'\\n')
if name=='sudo':
    if 'server' in args: time.sleep(0.2)
    elif 'pg_dump' in args: print('-- inert SQL')
    elif 'psql' in args:
        if '-tAc' in args: print('1')
        elif '-c' not in args: sys.stdin.read()
elif name=='gpg':
    out=args[args.index('-o')+1]
    if '-d' in args: shutil.copyfile(args[args.index('-d')+1], out)
    else: pathlib.Path(out).write_bytes(sys.stdin.buffer.read())
elif name=='curl': print('{{"initialized":true,"sealed":false}}')
''')
        stub.chmod(0o700)
        for name in ('sudo', 'gpg', 'chown', 'curl'): (self.root / 'bin' / name).symlink_to(stub)
        env = {**os.environ, 'PATH': f'{self.root}:{self.root}/bin:' + os.environ['PATH'], 'RESTORE_BAO_PORT': str(self.server.server_port)}
        for i, raw in enumerate((json.dumps({'root_token': TOKEN}), 'root_token=' + TOKEN + '\n')):
            self.material.write_text(raw)
            (self.root / 'etc/openbao/init.json').write_text(raw)
            backup_dir = self.root / f'backups{i}'
            result = subprocess.run(['bash', '-x', str(sandbox_ops / 'backup.sh'), str(backup_dir)], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            archive = next(backup_dir.glob('*.gpg'))
            restored = subprocess.run(['bash', '-x', str(sandbox_ops / 'restore.sh'), str(archive), f'fixture{i}'], env=env, capture_output=True, text=True)
            self.assertEqual(restored.returncode, 0, restored.stderr)
            self.assertIn('CANARY_OK', restored.stdout)
            self.assertNotIn(TOKEN, result.stdout + result.stderr + restored.stdout + restored.stderr)
        self.assertNotIn(TOKEN, (self.root / 'commands.jsonl').read_text())
        self.assertEqual(list((self.root / 'tmp').iterdir()), [])
        self.failure = 'auth'
        rejected = subprocess.run(['bash', str(sandbox_ops / 'backup.sh'), str(self.root / 'rejected')], env=env, capture_output=True, text=True)
        self.assertNotEqual(rejected.returncode, 0)
        self.assertNotIn(TOKEN, rejected.stdout + rejected.stderr)
        self.assertFalse((self.root / 'rejected').exists())
        self.assertEqual(list((self.root / 'tmp').iterdir()), [])


if __name__ == '__main__': unittest.main()
