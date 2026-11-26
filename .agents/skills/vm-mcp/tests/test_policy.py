"""Contract tests for vm-mcp profiles, workspace policy, and confined shell.

Run:
    PYTHONPATH=vm-mcp python -m unittest discover -s vm-mcp/tests -p 'test_*.py'
"""
from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

# === CHECKS ===
# id: check_vm_mcp_parent_escape_rejected
#   proves: vm_mcp_read_paths_confined
#   call: self::test_parent_escape_rejected
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_symlink_escape_rejected
#   proves: vm_mcp_read_paths_confined
#   call: self::test_symlink_escape_rejected
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_listing_symlink_not_followed
#   proves: vm_mcp_listing_symlinks_not_followed
#   call: self::test_listing_does_not_follow_symlink_metadata
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_output_bounded
#   proves: vm_mcp_output_bounded
#   call: self::test_read_text_is_bounded
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_profile_default_read_only
#   proves: vm_mcp_profile_default_read_only
#   call: self::test_default_profile_is_read_only
#   mutates: process_environment
#   cleanup: patch_dict_rollback
#
# id: check_vm_mcp_workspace_write_gate
#   proves: vm_mcp_workspace_writes_confined
#   call: self::test_write_requires_mutating_profile
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_workspace_write_confined
#   proves: vm_mcp_workspace_writes_confined
#   call: self::test_write_and_move_remain_under_root
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_personal_console_gate
#   proves: vm_mcp_personal_console_explicit
#   call: self::test_broker_exec_requires_personal_console
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_shell_cwd_escape_rejected
#   proves: vm_mcp_shell_cwd_confined
#   call: self::test_shell_cwd_escape_rejected
#   mutates: filesystem
#   cleanup: tempdir_teardown
#
# id: check_vm_mcp_shell_output_bounded
#   proves: vm_mcp_shell_execution_bounded
#   call: self::test_shell_output_is_bounded_while_draining
#   mutates: process
#   cleanup: process_group_killed
#
# id: check_vm_mcp_shell_timeout
#   proves: vm_mcp_shell_execution_bounded
#   call: self::test_shell_timeout_is_enforced
#   mutates: process
#   cleanup: process_group_killed
#
# id: check_vm_mcp_environment_sanitized
#   proves: vm_mcp_credentials_not_inherited
#   call: self::test_shell_does_not_inherit_unrelated_environment
#   mutates: process_environment
#   cleanup: patch_dict_rollback
# === END CHECKS ===

from policy import (
    VmMcpConfig,
    broker_exec,
    list_directory,
    move_path,
    read_text,
    resolve_under_root,
    run_shell,
    write_text,
)


class VmMcpPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def config(self, *, profile: str = "read-only", output: int = 64) -> VmMcpConfig:
        return VmMcpConfig(
            root=self.root,
            profile=profile,
            max_read_bytes=64,
            max_output_bytes=output,
            max_timeout_seconds=3.0,
            max_directory_entries=10,
            admin_socket=self.root / "admin.sock",
        )

    def test_default_profile_is_read_only(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            config = VmMcpConfig.from_env()
        self.assertEqual(config.profile, "read-only")
        self.assertFalse(config.shell_enabled)
        self.assertFalse(config.workspace_write_enabled)
        self.assertFalse(config.personal_console_enabled)

    def test_legacy_shell_flag_maps_to_workspace(self) -> None:
        with patch.dict(os.environ, {"VM_MCP_SHELL_ENABLED": "1"}, clear=True):
            config = VmMcpConfig.from_env()
        self.assertEqual(config.profile, "workspace")

    def test_parent_escape_rejected(self) -> None:
        with self.assertRaises(PermissionError):
            resolve_under_root(self.root, "../outside", must_exist=False)

    def test_symlink_escape_rejected(self) -> None:
        outside = self.root.parent / f"{self.root.name}-outside"
        outside.mkdir()
        try:
            (outside / "secret.txt").write_text("secret", encoding="utf-8")
            (self.root / "escape").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(PermissionError):
                read_text(self.config(), "escape/secret.txt")
        finally:
            (outside / "secret.txt").unlink(missing_ok=True)
            outside.rmdir()

    def test_listing_does_not_follow_symlink_metadata(self) -> None:
        outside = self.root.parent / f"{self.root.name}-outside"
        outside.mkdir()
        try:
            target = outside / "huge.txt"
            target.write_text("x" * 1000, encoding="utf-8")
            link = self.root / "link"
            link.symlink_to(target)
            result = list_directory(self.config(), ".")
            entry = result["entries"][0]
            self.assertEqual(entry["kind"], "symlink")
            self.assertEqual(entry["size"], link.lstat().st_size)
            self.assertNotEqual(entry["size"], target.stat().st_size)
        finally:
            target.unlink(missing_ok=True)
            outside.rmdir()

    def test_read_text_is_bounded(self) -> None:
        (self.root / "large.txt").write_text("abcdefghij", encoding="utf-8")
        result = read_text(self.config(), "large.txt", max_bytes=5)
        self.assertEqual(result["text"], "abcde")
        self.assertTrue(result["truncated"])

    def test_directory_listing_is_bounded(self) -> None:
        for index in range(4):
            (self.root / f"{index}.txt").write_text("x", encoding="utf-8")
        result = list_directory(self.config(), ".", max_entries=2)
        self.assertEqual(len(result["entries"]), 2)
        self.assertTrue(result["truncated"])

    def test_write_requires_mutating_profile(self) -> None:
        with self.assertRaises(PermissionError):
            write_text(self.config(), "x.txt", "x")

    def test_write_and_move_remain_under_root(self) -> None:
        config = self.config(profile="workspace")
        write_text(config, "a/x.txt", "hello", create_parents=True)
        result = move_path(config, "a/x.txt", "moved.txt")
        self.assertEqual(Path(result["destination"]).read_text(encoding="utf-8"), "hello")
        with self.assertRaises(PermissionError):
            write_text(config, "../outside.txt", "no")

    def test_shell_is_disabled_in_read_only(self) -> None:
        with self.assertRaises(PermissionError):
            run_shell(self.config(), "true")

    def test_shell_cwd_escape_rejected(self) -> None:
        with self.assertRaises(PermissionError):
            run_shell(self.config(profile="workspace"), "true", cwd="..")

    def test_shell_output_is_bounded_while_draining(self) -> None:
        result = run_shell(
            self.config(profile="workspace", output=5),
            "python3 -c 'print(\"x\" * 1000000, end=\"\")'",
        )
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["stdout"], "xxxxx")
        self.assertTrue(result["stdout_truncated"])

    def test_shell_timeout_is_enforced(self) -> None:
        started = time.monotonic()
        result = run_shell(
            self.config(profile="workspace"), "sleep 2", timeout_seconds=0.1
        )
        self.assertTrue(result["timed_out"])
        self.assertIsNone(result["exit_code"])
        self.assertLess(time.monotonic() - started, 1.0)

    def test_shell_does_not_inherit_unrelated_environment(self) -> None:
        with patch.dict(os.environ, {"VM_MCP_TEST_SECRET_SENTINEL": "must-not-leak"}):
            result = run_shell(
                self.config(profile="workspace"),
                "printf '%s' \"${VM_MCP_TEST_SECRET_SENTINEL-unset}\"",
            )
        self.assertEqual(result["stdout"], "unset")

    def test_broker_exec_requires_personal_console(self) -> None:
        with self.assertRaises(PermissionError):
            broker_exec(
                self.config(profile="workspace"), mode="admin", user=None,
                command="true", cwd="/", timeout_seconds=1,
            )


if __name__ == "__main__":
    unittest.main()
