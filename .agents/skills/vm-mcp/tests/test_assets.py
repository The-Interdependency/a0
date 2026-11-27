"""Static contract checks for vm-mcp deployment assets."""
from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# === CHECKS ===
# id: check_vm_mcp_loopback_config
#   proves: vm_mcp_loopback_only
#   call: self::test_server_binds_loopback_only
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_systemd_write_boundary
#   proves: vm_mcp_host_write_confined
#   call: self::test_non_root_service_keeps_hardening
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_metadata_denial
#   proves: vm_mcp_metadata_credentials_blocked
#   call: self::test_systemd_blocks_cloud_metadata_address
#   mutates: none
#   cleanup: none
#
# id: check_vm_mcp_personal_console_root_separate
#   proves: vm_mcp_personal_console_root_separate
#   call: self::test_personal_console_uses_separate_root_broker
#   mutates: none
#   cleanup: none
# === END CHECKS ===


class VmMcpAssetTests(unittest.TestCase):
    def test_server_binds_loopback_only(self) -> None:
        text = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn('host="127.0.0.1"', text)
        self.assertIn('streamable_http_path="/mcp"', text)
        self.assertNotIn('host="0.0.0.0"', text)

    def test_non_root_service_keeps_hardening(self) -> None:
        text = (ROOT / "systemd" / "vm-mcp.service").read_text(encoding="utf-8")
        for expected in (
            "User=vmmcp",
            "NoNewPrivileges=true",
            "ProtectSystem=strict",
            "CapabilityBoundingSet=\n",
            "AmbientCapabilities=\n",
            "ReadWritePaths=/srv/vm-mcp/workspace",
            "InaccessiblePaths=-/run/docker.sock -/var/run/docker.sock",
        ):
            self.assertIn(expected, text)

    def test_systemd_blocks_cloud_metadata_address(self) -> None:
        text = (ROOT / "systemd" / "vm-mcp.service").read_text(encoding="utf-8")
        self.assertIn("IPAddressDeny=169.254.169.254", text)

    def test_personal_console_uses_separate_root_broker(self) -> None:
        service = (ROOT / "systemd" / "vm-mcp-admin.service").read_text(encoding="utf-8")
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        installer = (ROOT / "install.sh").read_text(encoding="utf-8")
        self.assertIn("User=root", service)
        self.assertIn("RestrictAddressFamilies=AF_UNIX", service)
        broker = (ROOT / "admin_broker.py").read_text(encoding="utf-8")
        self.assertIn("os.chown(socket_path.parent, 0, caller_group.gr_gid)", broker)
        self.assertIn("os.chmod(socket_path, 0o660)", broker)
        self.assertIn("def admin_exec", server)
        self.assertIn("def user_exec", server)
        self.assertIn("VM_MCP_PROFILE=personal-console", installer)
        self.assertNotIn("User=root\nGroup=root\nWorkingDirectory=/opt/vm-mcp\nEnvironmentFile", (ROOT / "systemd" / "vm-mcp.service").read_text(encoding="utf-8"))

    def test_installer_preserves_existing_workspace_ownership(self) -> None:
        text = (ROOT / "install.sh").read_text(encoding="utf-8")
        self.assertIn('if [[ ! -e "$WORK_ROOT" ]]', text)
        self.assertNotIn('install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$WORK_ROOT"\ninstall -d', text)

    def test_runtime_uses_current_v2_sdk(self) -> None:
        requirements = (ROOT / "requirements.txt").read_text(encoding="utf-8")
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn("mcp>=2,<3", requirements)
        self.assertIn("from mcp.server import MCPServer", server)
        self.assertNotIn("from mcp.server.fastmcp", server)


if __name__ == "__main__":
    unittest.main()
