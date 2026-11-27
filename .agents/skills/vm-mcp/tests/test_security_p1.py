"""Security P1 regressions; run PYTHONPATH=vm-mcp python -m unittest discover -s vm-mcp/tests."""
from __future__ import annotations

import asyncio
import json
import http.client
import importlib.util
import time
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import admin_broker
from auth import BearerAuth, configured_token
from policy import VmMcpConfig, move_path, remove_path


class HttpCallerAuthTests(unittest.TestCase):
    def test_missing_wrong_duplicate_and_valid_credentials(self):
        for headers, expected in [([], False), ([(b'authorization', b'Bearer wrong')], False),
                                  ([(b'authorization', b'Bearer fixture'), (b'authorization', b'Bearer fixture')], False),
                                  ([(b'Authorization', b'Bearer fixture')], True)]:
            with self.subTest(headers=headers):
                called = []
                sent = []
                async def app(scope, receive, send):
                    called.append(scope)
                async def receive():
                    raise AssertionError('unauthenticated request body was read')
                async def send(message):
                    sent.append(message)
                asyncio.run(BearerAuth(app, b'fixture')({'type': 'http', 'headers': headers}, receive, send))
                self.assertEqual(expected, bool(called))
                if not expected:
                    self.assertEqual(401, sent[0]['status'])
                    self.assertNotIn('fixture', json.dumps(sent, default=str))

    def test_missing_or_malformed_config_fails_closed(self):
        for token in ['', 'short', 'x' * 31, 'x' * 257, 'x' * 32 + '\n']:
            with patch.dict(os.environ, {'VM_MCP_AUTH_TOKEN': token}):
                with self.assertRaises(RuntimeError):
                    configured_token()
        with patch.dict(os.environ, {'VM_MCP_AUTH_TOKEN': 'x' * 32}):
            self.assertEqual(b'x' * 32, configured_token())
            self.assertNotIn('VM_MCP_AUTH_TOKEN', os.environ)

    def test_isolated_process_refuses_same_uid_child_memory_and_environment(self):
        # Run the hardening in a disposable process, never change test-runner state.
        code = '''
import os, subprocess, sys
from auth import protect_process
protect_process()
child = subprocess.run([sys.executable, '-c', "from pathlib import Path; Path('/proc/%s/environ').read_bytes()" % os.getpid()], capture_output=True)
assert child.returncode != 0, child.stdout
assert b'PermissionError' in child.stderr, child.stderr
'''
        result = subprocess.run([sys.executable, '-c', code], capture_output=True, text=True, cwd=Path(__file__).resolve().parents[1])
        self.assertEqual(0, result.returncode, result.stderr)


class BrokerCallerAuthTests(unittest.TestCase):
    def test_same_uid_shell_child_is_not_the_main_process(self):
        response = subprocess.CompletedProcess([], 0, stdout='101\n', stderr='')
        for peer, allowed in [((101, 123), True), ((102, 123), False), ((101, 456), False)]:
            with self.subTest(peer=peer), patch.object(admin_broker, '_peer_credentials', return_value=peer), \
                 patch.object(admin_broker.subprocess, 'run', return_value=response):
                if allowed:
                    admin_broker._authorize_peer(None, 123)
                else:
                    with self.assertRaises(PermissionError):
                        admin_broker._authorize_peer(None, 123)

    def test_stopped_or_invalid_service_identity_fails_closed(self):
        for identity in ['0', '', 'unknown', '101\n102']:
            with self.subTest(identity=identity), patch.object(admin_broker, '_peer_credentials', return_value=(101, 123)), \
                 patch.object(admin_broker.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=identity)):
                with self.assertRaises(PermissionError):
                    admin_broker._authorize_peer(None, 123)

    def test_kernel_socket_peer_has_current_pid_and_uid(self):
        first, second = socket.socketpair()
        with first, second:
            self.assertEqual((os.getpid(), os.getuid()), admin_broker._peer_credentials(first))

    def test_real_same_uid_child_cannot_impersonate_service(self):
        try:
            listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        except PermissionError:
            self.skipTest('runner sandbox disallows Unix listener creation; exercised in hosted CI')
        with tempfile.TemporaryDirectory() as temporary, listener:
            endpoint = str(Path(temporary) / 'broker.sock')
            listener.bind(endpoint)
            listener.listen()
            child = subprocess.Popen([sys.executable, '-c',
                'import socket,sys; s=socket.socket(socket.AF_UNIX); s.connect(sys.argv[1]); s.recv(1)', endpoint])
            try:
                connection, _ = listener.accept()
                with connection, patch.object(admin_broker.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, stdout=str(os.getpid()))):
                    self.assertEqual(child.pid, admin_broker._peer_credentials(connection)[0])
                    self.assertEqual(os.getuid(), admin_broker._peer_credentials(connection)[1])
                    with self.assertRaises(PermissionError):
                        admin_broker._authorize_peer(connection, os.getuid())
            finally:
                child.wait(timeout=5)



class DestructiveEntryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.config = VmMcpConfig(self.root, 'workspace', 1024, 1024, 1, 10, self.root / 'broker.sock')

    def tearDown(self):
        self.temp.cleanup()

    def test_remove_links_preserves_file_directory_external_and_broken_referents(self):
        (self.root / 'file').write_text('retained')
        (self.root / 'directory').mkdir()
        for name, target in [('file-link', self.root / 'file'), ('dir-link', self.root / 'directory'),
                             ('outside-link', self.root.parent), ('broken-link', self.root / 'missing')]:
            with self.subTest(name=name):
                link = self.root / name
                link.symlink_to(target)
                remove_path(self.config, name, recursive=True)
                self.assertFalse(link.is_symlink())
        self.assertEqual('retained', (self.root / 'file').read_text())
        self.assertTrue((self.root / 'directory').is_dir())

    def test_move_preserves_source_link_and_replaces_destination_link_only(self):
        (self.root / 'source-target').write_text('source')
        (self.root / 'destination-target').write_text('destination')
        (self.root / 'source').symlink_to('source-target')
        (self.root / 'destination').symlink_to('destination-target')
        move_path(self.config, 'source', 'destination')
        self.assertEqual('source-target', os.readlink(self.root / 'destination'))
        self.assertEqual('source', (self.root / 'source-target').read_text())
        self.assertEqual('destination', (self.root / 'destination-target').read_text())
        self.assertFalse((self.root / 'source').is_symlink())

    def test_parent_escape_and_workspace_root_are_refused(self):
        (self.root / 'escape').symlink_to(self.root.parent, target_is_directory=True)
        for path in ['.', '..', str(self.root), 'escape/anything']:
            with self.subTest(path=path), self.assertRaises(PermissionError):
                remove_path(self.config, path)
        with self.assertRaises(PermissionError):
            move_path(self.config, '.', 'new')


@unittest.skipUnless(importlib.util.find_spec('mcp'), 'install vm-mcp/requirements.txt for HTTP integration')
class McpHttpIntegrationTests(unittest.TestCase):
    def test_real_mcp_endpoint_denies_unauthenticated_admin_call(self):
        # The installed unit hands the token over as a root-opened stdin file;
        # the environment variable is the legacy fallback.
        for source in ('stdin', 'environment'):
            with self.subTest(source=source), tempfile.TemporaryFile('w+') as token_file:
                token_file.write('f' * 32 + '\n')
                token_file.seek(0)
                extra = ({'VM_MCP_AUTH_TOKEN_SOURCE': 'stdin'} if source == 'stdin'
                         else {'VM_MCP_AUTH_TOKEN': 'f' * 32})
                self._check_endpoint(extra, token_file if source == 'stdin' else subprocess.DEVNULL)

    def _check_endpoint(self, extra, stdin):
        with socket.socket() as port_socket:
            port_socket.bind(('127.0.0.1', 0))
            port = port_socket.getsockname()[1]
        runtime = Path(__file__).resolve().parents[1]
        base = {k: v for k, v in os.environ.items() if not k.startswith('VM_MCP_AUTH_TOKEN')}
        env = dict(base, VM_MCP_PROFILE='read-only', VM_MCP_PORT=str(port), **extra)
        # The temp token file is owned by the test user, not root: rebind the
        # owner constant in-process, then run server.py unchanged as __main__.
        launcher = ('import os, runpy, sys; sys.path.insert(0, sys.argv[1]); import auth; '
                    'auth.TOKEN_FILE_OWNER_UID = os.getuid(); sys.argv = [sys.argv[2]]; '
                    'runpy.run_path(sys.argv[0], run_name="__main__")')
        process = subprocess.Popen([sys.executable, '-c', launcher, str(runtime), str(runtime / 'server.py')],
                                   env=env, stdin=stdin,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
                    connection.request('POST', '/mcp', json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                        'params': {'name': 'admin_exec', 'arguments': {'command': 'true'}}}),
                        {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
                    response = connection.getresponse()
                    self.assertEqual(401, response.status)
                    response.read()
                    connection.close()
                    break
                except ConnectionRefusedError:
                    if process.poll() is not None or time.monotonic() >= deadline:
                        self.fail('MCP endpoint did not start')
                    time.sleep(0.05)
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
            connection.request('POST', '/mcp', json.dumps({'jsonrpc': '2.0', 'id': 2, 'method': 'initialize', 'params': {
                'protocolVersion': '2025-03-26', 'capabilities': {}, 'clientInfo': {'name': 'fixture', 'version': '1'}}}),
                {'Authorization': 'Bearer ' + 'f' * 32, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
            response = connection.getresponse()
            self.assertEqual(200, response.status, response.read())
            connection.close()
        finally:
            process.terminate()
            process.communicate(timeout=5)
