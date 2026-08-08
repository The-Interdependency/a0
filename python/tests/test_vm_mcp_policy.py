from __future__ import annotations

from pathlib import Path

import pytest

from python.vm_mcp_policy import (
    VmMcpConfig,
    list_directory,
    read_text,
    resolve_under_root,
    run_shell,
)

# === CHECKS ===
# id: check_vm_mcp_parent_escape_rejected
#   proves: vm_mcp_read_paths_confined
#   call: self::test_parent_escape_rejected
#   mutates: filesystem
#   cleanup: tmp_path_teardown
#
# id: check_vm_mcp_symlink_escape_rejected
#   proves: vm_mcp_read_paths_confined
#   call: self::test_symlink_escape_rejected
#   mutates: filesystem
#   cleanup: tmp_path_teardown
#
# id: check_vm_mcp_read_bounded
#   proves: vm_mcp_read_output_bounded
#   call: self::test_read_text_is_bounded
#   mutates: filesystem
#   cleanup: tmp_path_teardown
#
# id: check_vm_mcp_directory_bounded
#   proves: vm_mcp_read_output_bounded
#   call: self::test_directory_listing_is_bounded
#   mutates: filesystem
#   cleanup: tmp_path_teardown
#
# id: check_vm_mcp_shell_default_disabled
#   proves: vm_mcp_shell_default_disabled
#   call: self::test_shell_disabled
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_shell_cwd_escape_rejected
#   proves: vm_mcp_shell_cwd_confined
#   call: self::test_shell_cwd_escape_rejected
#   mutates: filesystem
#   cleanup: tmp_path_teardown
#
# id: check_vm_mcp_shell_output_bounded
#   proves: vm_mcp_shell_execution_bounded
#   call: self::test_shell_output_is_bounded
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_shell_timeout_bounded
#   proves: vm_mcp_shell_execution_bounded
#   call: self::test_shell_timeout_is_enforced
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_shell_environment_sanitized
#   proves: vm_mcp_credentials_not_inherited
#   call: self::test_shell_does_not_inherit_unrelated_environment
#   mutates: process_environment
#   cleanup: monkeypatch_rollback
# === END CHECKS ===


def config(
    root: Path, *, shell_enabled: bool = False, output_limit: int = 64
) -> VmMcpConfig:
    return VmMcpConfig(
        root=root,
        shell_enabled=shell_enabled,
        max_read_bytes=64,
        max_output_bytes=output_limit,
        max_timeout_seconds=1.0,
        max_directory_entries=10,
    )


def test_parent_escape_rejected(tmp_path: Path) -> None:
    with pytest.raises(PermissionError):
        resolve_under_root(tmp_path, "../outside", must_exist=False)


def test_symlink_escape_rejected(tmp_path: Path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret", encoding="utf-8")
    (tmp_path / "escape").symlink_to(outside, target_is_directory=True)
    with pytest.raises(PermissionError):
        read_text(config(tmp_path), "escape/secret.txt")


def test_read_text_is_bounded(tmp_path: Path) -> None:
    (tmp_path / "large.txt").write_text("abcdefghij", encoding="utf-8")
    result = read_text(config(tmp_path), "large.txt", max_bytes=5)
    assert result["text"] == "abcde"
    assert result["bytes_read"] == 5
    assert result["truncated"] is True


def test_directory_listing_is_bounded(tmp_path: Path) -> None:
    for index in range(4):
        (tmp_path / f"{index}.txt").write_text("x", encoding="utf-8")
    result = list_directory(config(tmp_path), ".", max_entries=2)
    assert len(result["entries"]) == 2
    assert result["truncated"] is True


def test_shell_disabled(tmp_path: Path) -> None:
    with pytest.raises(PermissionError):
        run_shell(config(tmp_path), "true")


def test_shell_cwd_escape_rejected(tmp_path: Path) -> None:
    with pytest.raises(PermissionError):
        run_shell(config(tmp_path, shell_enabled=True), "true", cwd="..")


def test_shell_output_is_bounded(tmp_path: Path) -> None:
    result = run_shell(
        config(tmp_path, shell_enabled=True, output_limit=5),
        "printf 1234567890",
    )
    assert result["exit_code"] == 0
    assert result["stdout"] == "12345"
    assert result["stdout_truncated"] is True


def test_shell_timeout_is_enforced(tmp_path: Path) -> None:
    result = run_shell(
        config(tmp_path, shell_enabled=True),
        "sleep 2",
        timeout_seconds=0.1,
    )
    assert result["timed_out"] is True
    assert result["exit_code"] is None


def test_shell_does_not_inherit_unrelated_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("A0_MCP_TEST_SECRET_SENTINEL", "must-not-leak")
    result = run_shell(
        config(tmp_path, shell_enabled=True),
        "printf '%s' \"${A0_MCP_TEST_SECRET_SENTINEL-unset}\"",
    )
    assert result["stdout"] == "unset"
