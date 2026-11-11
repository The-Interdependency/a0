"""GitHub rotation contracts, with inert local vault data and a mocked GitHub origin.

Usage: python3 -m unittest discover -s tests/reliability -p 'test_github_vault.py'.
No real token, production service, or external network is used. The PTY case
checks that the actual terminal input path suppresses echo and restores it.
"""
import contextlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import pty
import select
import signal
import sys
import tempfile
import termios
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import urllib.error


SOURCE = Path(__file__).resolve().parents[2] / "operations/configure-vault.py"
spec = importlib.util.spec_from_file_location("github_provision", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CANDIDATE = "inert-github-candidate-not-for-output"
OLD = "inert-github-old-not-for-output"
APP = "inert-scoped-app"
CLI = "inert-scoped-cli"


class GitHubRotationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "cli").mkdir()
        self.version, self.value = 3, OLD
        self.deleted, self.denied, self.bad_readback = False, False, False
        self.sealed, self.initialized, self.cluster = False, True, "fixture-cluster"
        self.app_policies, self.cli_policies = ["a0-app"], ["a0-cli"]
        self.events = []
        test = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_GET(self):
                token = self.headers.get("X-Vault-Token")
                test.events.append(("GET", self.path, token))
                if self.path == "/v1/sys/seal-status":
                    return self.reply(200, {"initialized": test.initialized, "sealed": test.sealed, "cluster_id": test.cluster})
                if self.path == "/v1/auth/token/lookup-self":
                    policies = test.app_policies if token == APP else test.cli_policies
                    return self.reply(200, {"data": {"policies": policies}})
                if self.path == "/v1/custom/metadata/integration/github" and token == APP:
                    return self.reply(200 if test.version else 404, {"data": {"current_version": test.version}})
                if self.path == "/v1/custom/data/integration/github" and token == CLI:
                    if test.denied:
                        return self.reply(403, {"errors": [CANDIDATE]})
                    if not test.version or test.deleted:
                        return self.reply(404, {})
                    value = "wrong-readback" if test.bad_readback and test.value == CANDIDATE else test.value
                    return self.reply(200, {"data": {"data": {"token": value}, "metadata": {"version": test.version}}})
                return self.reply(403, {"errors": [CANDIDATE]})

            def do_POST(self):
                payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                test.events.append(("POST", self.path, self.headers.get("X-Vault-Token")))
                if self.path != "/v1/custom/data/integration/github" or self.headers.get("X-Vault-Token") != APP:
                    return self.reply(403, {"errors": [CANDIDATE]})
                if payload.get("options", {}).get("cas") != test.version:
                    return self.reply(400, {"errors": [CANDIDATE]})
                test.value = payload["data"]["token"]
                test.version += 1
                test.deleted = False
                return self.reply(200, {"data": {"version": test.version}})

            def reply(self, status, data):
                self.send_response(status)
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.stop_server)
        for name, value in (("vault-app.token", APP), ("cli/1000.token", CLI)):
            (self.root / name).write_text(value)
        self.config = {"BAO_ADDR": f"http://127.0.0.1:{self.server.server_port}",
                       "BAO_CLUSTER_ID": self.cluster, "BAO_KV_MOUNT": "custom",
                       "BAO_TOKEN_FILE": str(self.root / "vault-app.token")}
        self.cli_file = self.root / "cli/1000.json"
        self.cli_file.write_text(json.dumps({"schema": "a0.cli-vault/1", "addr": self.config["BAO_ADDR"],
            "cluster_id": self.cluster, "mount": "custom", "token_file": str(self.root / "cli/1000.token"),
            "bridge": {"fixture": "preserve"}}))
        self.original = self.cli_file.read_text()
        (self.root / "a0.env").write_text("".join(f"{k}={v}\n" for k, v in self.config.items()))

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    @contextlib.contextmanager
    def fixture(self, candidate=None, validator=None):
        def write(path, value, *_):
            Path(path).write_text(value)
        def read(path):
            self.assertFalse(str(path).endswith("/openbao/init.json"))
            return Path(path).read_text()
        with contextlib.ExitStack() as stack:
            stack.enter_context(patch.object(module, "ETC", self.root))
            stack.enter_context(patch.object(module, "read_private", side_effect=read))
            stack.enter_context(patch.object(module, "atomic", side_effect=write))
            stack.enter_context(patch.object(module.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1000, pw_gid=os.getgid())))
            root = stack.enter_context(patch.object(module, "root_material", side_effect=AssertionError("Routine rotation must not use root")))
            input_mock = stack.enter_context(patch.object(module, "github_input", side_effect=candidate, return_value=CANDIDATE))
            validator_mock = stack.enter_context(patch.object(module, "github_identity", side_effect=validator))
            output = io.StringIO()
            stack.enter_context(contextlib.redirect_stdout(output))
            stack.enter_context(contextlib.redirect_stderr(output))
            yield input_mock, validator_mock, output
            root.assert_not_called()
            self.assertNotIn(CANDIDATE, output.getvalue())
            self.assertNotIn(OLD, output.getvalue())

    def test_success_rotates_exact_path_then_enables_config_and_preserves_bridge(self):
        def candidate(_stdin):
            self.assertTrue(any(e[1].endswith("/metadata/integration/github") for e in self.events))
            return CANDIDATE
        with self.fixture(candidate=candidate) as (read, verify, output):
            module.set_github_token(self.config, "operator")
            verify.assert_called_once_with(CANDIDATE)
            read.assert_called_once_with(False)
            self.assertIn("stored in OpenBao", output.getvalue())
        self.assertEqual((self.value, self.version), (CANDIDATE, 4))
        cli = json.loads(self.cli_file.read_text())
        self.assertEqual(cli["github"], {"path": "integration/github", "agents": ["deepcode"]})
        self.assertEqual(cli["bridge"], {"fixture": "preserve"})
        self.assertEqual([e[1] for e in self.events if e[0] == "POST"], ["/v1/custom/data/integration/github"])

    def test_first_write_and_soft_deleted_latest_version_use_metadata_cas(self):
        for version, deleted in ((0, False), (9, True)):
            with self.subTest(version=version):
                self.version, self.deleted = version, deleted
                with self.fixture():
                    module.set_github_token(self.config, "operator")
                self.assertEqual(self.version, version + 1)
                self.assertEqual(self.value, CANDIDATE)

    def test_failed_github_authentication_preserves_old_value_and_cli_config(self):
        with self.fixture(validator=module.SetupError("GitHub rejected fixture")):
            with self.assertRaises(module.SetupError):
                module.set_github_token(self.config, "operator")
        self.assertEqual((self.value, self.version), (OLD, 3))
        self.assertEqual(self.cli_file.read_text(), self.original)
        self.assertFalse(any(e[0] == "POST" for e in self.events))

    def test_concurrent_version_change_refuses_to_overwrite_the_other_writer(self):
        def candidate(_stdin):
            self.version += 1
            self.value = "other-writer"
            return CANDIDATE
        with self.fixture(candidate=candidate):
            with self.assertRaises(module.SetupError):
                module.set_github_token(self.config, "operator")
        self.assertEqual((self.value, self.version), ("other-writer", 4))
        self.assertEqual(self.cli_file.read_text(), self.original)

    def test_bad_readback_does_not_activate_cli_or_claim_unchanged_vault(self):
        self.bad_readback = True
        with self.fixture():
            with self.assertRaisesRegex(module.SetupError, "inspect vault state"):
                module.set_github_token(self.config, "operator")
        self.assertEqual(self.value, CANDIDATE)  # Write happened; don't claim rollback.
        self.assertEqual(self.cli_file.read_text(), self.original)

    def test_store_and_scope_failures_precede_candidate_input(self):
        failures = [("sealed", True), ("initialized", False), ("cluster", "wrong"),
                    ("app_policies", ["root"]), ("app_policies", ["a0-app", "root"]),
                    ("cli_policies", ["root"]), ("denied", True)]
        for attr, bad in failures:
            with self.subTest(attr=attr, bad=bad):
                original = getattr(self, attr)
                setattr(self, attr, bad)
                with self.fixture() as (read, verify, _):
                    with self.assertRaises(module.SetupError):
                        module.set_github_token(self.config, "operator")
                    read.assert_not_called()
                    verify.assert_not_called()
                setattr(self, attr, original)
        self.assertEqual((self.value, self.version), (OLD, 3))
        self.assertEqual(self.cli_file.read_text(), self.original)

    def test_main_rotation_never_initializes_renews_or_restarts_services(self):
        with self.fixture(), patch.object(module.os, "geteuid", return_value=0), patch.object(module.subprocess, "run") as process, patch.object(sys, "argv", [str(SOURCE), "--set-github-token", "--cli-user", "operator"]):
            self.assertEqual(module.main(), 0)
            process.assert_not_called()
        self.assertFalse(any("/sys/init" in e[1] or "/renew" in e[1] for e in self.events))

    def test_cli_policy_grants_read_only_exact_github_secret(self):
        policy = module.policy("custom", cli=True)
        self.assertIn('path "custom/data/integration/github" { capabilities = ["read"] }', policy)
        self.assertNotIn('custom/data/*', policy)
        self.assertNotIn('custom/data/integration/*', policy)
        self.assertNotIn('"create"', policy)

    def test_later_provision_preserves_optional_github_configuration(self):
        cli = json.loads(self.original)
        cli["github"] = {"path": "integration/github", "agents": ["deepcode"]}
        self.cli_file.write_text(json.dumps(cli))
        def api(_addr, method, path, *_args, **_kwargs):
            if path == "/sys/seal-status":
                return {"initialized": True, "sealed": False, "cluster_id": self.cluster}
            if path == "/sys/mounts":
                return {"data": {"custom/": {"type": "kv", "options": {"version": "2"}}}}
            return {}
        def atomic(path, value, *_args, **_kwargs):
            Path(path).write_text(value)
        with patch.object(module, "ETC", self.root), patch.object(module, "api", side_effect=api), patch.object(module, "atomic", side_effect=atomic), patch.object(module, "read_private", side_effect=lambda p: Path(p).read_text()), patch.object(module, "scoped_token"), patch.object(module, "root_material", return_value={"root_token": "inert-admin"}), patch.object(module.pwd, "getpwnam", return_value=SimpleNamespace(pw_uid=1000, pw_gid=os.getgid())), contextlib.redirect_stdout(io.StringIO()):
            module.provision(self.config, "operator")
        self.assertEqual(json.loads(self.cli_file.read_text())["github"], cli["github"])


class GitHubInputTests(unittest.TestCase):
    def test_missing_private_terminal_never_falls_back_to_stdin(self):
        with patch.object(module.os, "open", side_effect=OSError("no tty")), patch.object(module.sys, "stdin") as stdin:
            with self.assertRaisesRegex(module.SetupError, "no token was read from stdin"):
                module.github_input()
            stdin.buffer.read.assert_not_called()

    def test_explicit_pipe_mode_is_bounded_and_rejects_whitespace_or_nonascii(self):
        cases = [b"", b"bad token", b"a\nb", b"a\x00b", b"\xff", b"x" * 4097]
        for value in cases:
            with self.subTest(value_length=len(value)), patch.object(module.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(value))):
                with self.assertRaises(module.SetupError):
                    module.github_input(True)
        for value in (b"safe-token", b"safe-token\n", b"safe-token\r\n", b"x" * 4096):
            with patch.object(module.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(value))):
                self.assertEqual(module.github_input(True), value.rstrip(b"\r\n").decode())

    def test_actual_terminal_hides_input_and_restores_echo(self):
        pid, fd = pty.fork()
        if pid == 0:
            try:
                answer = module.github_input()
                os.write(1, b"VALUE_OK\n" if answer == CANDIDATE else b"WRONG_VALUE\n")
                os._exit(0)
            except BaseException:
                os._exit(1)
        output = b""
        status = None
        try:
            deadline = time.monotonic() + 5
            while b"(hidden): " not in output and time.monotonic() < deadline:
                if select.select([fd], [], [], 0.1)[0]:
                    output += os.read(fd, 8192)
            self.assertIn(b"(hidden): ", output)
            self.assertFalse(termios.tcgetattr(fd)[3] & termios.ECHO)
            os.write(fd, CANDIDATE.encode() + b"\n")
            while time.monotonic() < deadline:
                if select.select([fd], [], [], 0.1)[0]:
                    try:
                        output += os.read(fd, 8192)
                    except OSError:
                        break
                ended, status = os.waitpid(pid, os.WNOHANG)
                if ended:
                    pid = None
                    break
            self.assertIn(b"VALUE_OK", output)
            self.assertNotIn(CANDIDATE.encode(), output)
            self.assertTrue(termios.tcgetattr(fd)[3] & termios.ECHO)
        finally:
            if pid is not None:
                ended, _status = os.waitpid(pid, os.WNOHANG)
                if not ended:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
            os.close(fd)

    def test_github_request_uses_fixed_https_origin_and_redacts_errors(self):
        class Opener:
            def open(self, request, timeout):
                self.request = request
                raise urllib.error.HTTPError(request.full_url, 401, CANDIDATE, {}, io.BytesIO(CANDIDATE.encode()))
        opener = Opener()
        with patch.object(module.urllib.request, "build_opener", return_value=opener) as build:
            with self.assertRaises(module.SetupError) as error:
                module.github_identity(CANDIDATE)
        self.assertNotIn(CANDIDATE, str(error.exception))
        self.assertEqual(opener.request.full_url, "https://api.github.com/user")
        self.assertEqual(opener.request.get_header("Authorization"), "Bearer " + CANDIDATE)
        self.assertIs(build.call_args.args[0], module.NoRedirect)
        self.assertEqual(build.call_args.args[1].proxies, {})
        with self.assertRaises(module.SetupError):
            module.NoRedirect().redirect_request(opener.request, None, 302, "", {}, "https://other.invalid/")


if __name__ == "__main__":
    unittest.main()
