"""First-use context regressions; run PYTHONPATH=vm-mcp python -m unittest discover -s vm-mcp/tests."""
from __future__ import annotations

import asyncio
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import first_use
from first_use import (
    CLIENT_KEY, INSTALL_FLAG, NOTICE_KEY, SCOPE_NOTICE,
    ClientKeyMiddleware, FirstUseContext, claim_install_marker, with_notice,
)

ROOT = Path(__file__).resolve().parents[1]


class MarkerTests(unittest.TestCase):
    def test_marker_claimed_once_and_private(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "state", "first-use")
            self.assertTrue(claim_install_marker(path))
            self.assertFalse(claim_install_marker(path))
            self.assertEqual(0o600, stat.S_IMODE(os.stat(path).st_mode))
            self.assertEqual(0o700, stat.S_IMODE(os.stat(os.path.dirname(path)).st_mode))

    def test_marker_write_failure_is_non_blocking(self):
        with tempfile.TemporaryDirectory() as d, patch("first_use.os.write", side_effect=OSError("full")):
            self.assertFalse(claim_install_marker(os.path.join(d, "m")))

    def test_marker_short_write_is_non_blocking(self):
        with tempfile.TemporaryDirectory() as d, patch("first_use.os.write", return_value=0):
            self.assertFalse(claim_install_marker(os.path.join(d, "m")))

    def test_marker_close_failure_is_non_blocking(self):
        close = os.close
        def close_then_fail(fd):
            close(fd)
            raise OSError("close failed")
        with tempfile.TemporaryDirectory() as d, patch("first_use.os.close", side_effect=close_then_fail):
            self.assertFalse(claim_install_marker(os.path.join(d, "m")))

    def test_marker_env_override(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "m")
            os.environ[first_use.MARKER_ENV] = path
            try:
                self.assertTrue(claim_install_marker())
                self.assertTrue(os.path.exists(path))
            finally:
                del os.environ[first_use.MARKER_ENV]

    def test_marker_symlink_not_followed(self):
        with tempfile.TemporaryDirectory() as d:
            target = os.path.join(d, "elsewhere")
            link = os.path.join(d, "m")
            os.symlink(target, link)
            self.assertFalse(claim_install_marker(link))
            self.assertFalse(os.path.exists(target))

    def test_marker_failure_is_non_blocking(self):
        with tempfile.TemporaryDirectory() as d:
            blocker = os.path.join(d, "file")
            Path(blocker).write_text("x")
            self.assertFalse(claim_install_marker(os.path.join(blocker, "m")))


class NoticeTests(unittest.TestCase):
    def test_first_success_per_client_only(self):
        t = FirstUseContext()
        r1 = with_notice({"ok": True, "stdout": "x"}, t, "a")
        self.assertEqual(NOTICE_KEY, next(iter(r1)))
        self.assertEqual(SCOPE_NOTICE, r1[NOTICE_KEY])
        self.assertEqual("x", r1["stdout"])
        self.assertNotIn(NOTICE_KEY, with_notice({"ok": True}, t, "a"))
        self.assertIn(NOTICE_KEY, with_notice({"ok": True}, t, "b"))

    def test_failure_does_not_consume(self):
        t = FirstUseContext()
        r = with_notice({"ok": False, "error": "e", INSTALL_FLAG: True}, t, "a")
        self.assertNotIn(NOTICE_KEY, r)
        self.assertNotIn(INSTALL_FLAG, r)
        self.assertIn(NOTICE_KEY, with_notice({"ok": True}, t, "a"))

    def test_install_flag_forces_notice_and_is_stripped(self):
        t = FirstUseContext()
        with_notice({"ok": True}, t, "a")
        r = with_notice({"ok": True, INSTALL_FLAG: True}, t, "a")
        self.assertIn(NOTICE_KEY, r)
        self.assertNotIn(INSTALL_FLAG, r)
        self.assertNotIn(INSTALL_FLAG, with_notice({"ok": True, INSTALL_FLAG: False}, t, "a"))

    def test_non_blocking_on_odd_input(self):
        class Broken(FirstUseContext):
            def should_notify(self, key):
                raise RuntimeError("boom")
        r = with_notice({"ok": True, "stdout": "1"}, Broken(), "a")
        self.assertEqual({"ok": True, "stdout": "1"}, r)

    def test_notice_text_is_a_complete_sentence(self):
        self.assertIsInstance(SCOPE_NOTICE, str)
        self.assertGreater(len(SCOPE_NOTICE), 200)
        self.assertTrue(SCOPE_NOTICE.endswith("."))


class ClientKeyTests(unittest.TestCase):
    def _run(self, headers):
        seen = []
        async def app(scope, receive, send):
            seen.append(CLIENT_KEY.get())
        asyncio.run(ClientKeyMiddleware(app)({"type": "http", "headers": headers}, None, None))
        return seen[0]

    def test_key_sources(self):
        self.assertEqual("s1", self._run([(b"Mcp-Session-Id", b"s1"), (b"user-agent", b"ua")]))
        self.assertIsNone(self._run([(b"User-Agent", b"ua")]))
        self.assertIsNone(self._run([]))
        self.assertIsNone(CLIENT_KEY.get())

    def test_stateless_clients_with_same_sdk_each_receive_notice(self):
        tracker = FirstUseContext()
        seen = []
        async def app(scope, receive, send):
            seen.append(with_notice({"ok": True}, tracker))
        middleware = ClientKeyMiddleware(app)
        for _ in range(2):
            asyncio.run(middleware({"type": "http", "headers": [(b"user-agent", b"same-sdk")]}, None, None))
        self.assertTrue(all(NOTICE_KEY in result for result in seen))
        self.assertEqual(set(), tracker._seen)

    def test_long_session_ids_do_not_share_a_truncated_identity(self):
        self.assertIsNone(self._run([(b"mcp-session-id", b"x" * 257)]))

    def test_context_resets_after_app_failure(self):
        async def app(scope, receive, send):
            raise RuntimeError("failed request")
        with self.assertRaises(RuntimeError):
            asyncio.run(ClientKeyMiddleware(app)({"type": "http", "headers": [(b"mcp-session-id", b"s1")]}, None, None))
        self.assertIsNone(CLIENT_KEY.get())


class WiringTests(unittest.TestCase):
    def test_install_unit_and_server_wiring(self):
        self.assertIn("first_use.py", (ROOT / "install.sh").read_text())
        unit = (ROOT / "systemd" / "vm-mcp-admin.service").read_text()
        self.assertIn("StateDirectory=vm-mcp-admin\n", unit)
        self.assertIn("StateDirectoryMode=0700\n", unit)
        server = (ROOT / "server.py").read_text()
        self.assertIn("BearerAuth(ClientKeyMiddleware(app), token)", server)
        self.assertIn("_FIRST_USE,", server)
        self.assertIn("claim_install_marker()", (ROOT / "admin_broker.py").read_text())


if __name__ == "__main__":
    unittest.main()
