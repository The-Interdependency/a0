# a0 VM MCP control plane

The VM MCP is the model-facing control plane for the a0 production VM. It runs **on the VM** and performs local work as a dedicated, non-root `a0mcp` Unix account. Google OS Login + IAP remain the human/admin SSH path. No SSH private key, OS Login credential, or Google service-account key belongs in the MCP server or ChatGPT.

```text
ChatGPT / OpenAI MCP client
        |
        | MCP
        v
Secure MCP Tunnel
        |
        | private transport
        v
127.0.0.1:8765/mcp
        |
        v
a0-vm-mcp.service  (User=a0mcp)
        |
        +-- vm_info        read-only
        +-- list_directory read-only, A0_MCP_ROOT confined
        +-- read_text      read-only, A0_MCP_ROOT confined
        +-- shell_exec     write-capable, disabled by default
        |
        v
/srv/a0/workspaces
```

## Boundaries

- The HTTP listener binds to `127.0.0.1`; do not open port `8765` to the public internet.
- File tools resolve paths and symlinks before access and refuse anything outside `A0_MCP_ROOT`.
- `shell_exec` is intentionally powerful. Its initial working directory is confined to `A0_MCP_ROOT`, but commands can act on whatever the `a0mcp` Unix user and systemd sandbox can reach. The systemd unit therefore supplies the real host boundary.
- The service has no sudo capability and no Linux capabilities. `ProtectSystem=strict` makes the host filesystem read-only except `/srv/a0/workspaces`.
- Access to the Google Compute Engine metadata address `169.254.169.254` is denied by systemd.
- Shell subprocesses receive a small sanitized environment rather than inheriting arbitrary MCP service environment variables.
- Output and runtime are bounded. Defaults are 256 KiB per output stream and 120 seconds.

## VM installation

Run from a checkout of `The-Interdependency/a0` at `/srv/a0`:

```bash
sudo useradd --system --home /var/lib/a0mcp --create-home --shell /usr/sbin/nologin a0mcp 2>/dev/null || true
sudo install -d -o a0mcp -g a0mcp -m 0750 /srv/a0/workspaces

cd /srv/a0
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e .

sudo install -m 0644 deploy/systemd/a0-vm-mcp.service /etc/systemd/system/a0-vm-mcp.service
sudo systemctl daemon-reload
sudo systemctl enable --now a0-vm-mcp.service
sudo systemctl --no-pager --full status a0-vm-mcp.service
```

The service starts read-only from the model's perspective because `A0_MCP_SHELL_ENABLED=0`.

## Enable the write surface

Only after `vm_info`, `list_directory`, and `read_text` work through the MCP client:

```bash
sudo mkdir -p /etc/systemd/system/a0-vm-mcp.service.d
printf '[Service]\nEnvironment=A0_MCP_SHELL_ENABLED=1\n' | sudo tee /etc/systemd/system/a0-vm-mcp.service.d/shell.conf
sudo systemctl daemon-reload
sudo systemctl restart a0-vm-mcp.service
sudo systemctl --no-pager --full status a0-vm-mcp.service
```

Disable the write surface again with:

```bash
sudo rm -f /etc/systemd/system/a0-vm-mcp.service.d/shell.conf
sudo systemctl daemon-reload
sudo systemctl restart a0-vm-mcp.service
```

## Client/tunnel boundary

The server uses MCP Streamable HTTP at `http://127.0.0.1:8765/mcp`. OpenAI's published ChatGPT MCP guidance says private-network MCP servers should be connected through Secure MCP Tunnel rather than made public.

As of 2026-08-07, OpenAI's public ChatGPT documentation describes full write/modify custom MCP support for Business, Enterprise, and Edu, while the published Pro surface is read/fetch only. The server keeps `shell_exec` available for write-capable OpenAI MCP clients/workspaces and future-compatible surfaces, but the server does not bypass client-side product permissions.

`hmmm`: OpenAI's public documentation names Secure MCP Tunnel but the exact public provisioning/CLI sequence was not located while this module was built. Do not substitute a public firewall rule for the missing tunnel step. The unresolved work is to bind the tunnel to `127.0.0.1:8765/mcp`, register that remote endpoint in the eligible MCP client/workspace, and require approval for `shell_exec`.

## Rollback

```bash
sudo systemctl disable --now a0-vm-mcp.service
sudo rm -f /etc/systemd/system/a0-vm-mcp.service
sudo rm -rf /etc/systemd/system/a0-vm-mcp.service.d
sudo systemctl daemon-reload
```

This removes the MCP service without changing OS Login, IAP, the VM SSH configuration, or the a0 application itself.
