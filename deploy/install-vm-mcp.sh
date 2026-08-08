#!/usr/bin/env bash
set -euo pipefail

# Usage guidance:
#   sudo bash deploy/install-vm-mcp.sh
#
# Run this from a trusted checkout of The-Interdependency/a0. The installer
# copies only the VM MCP runtime into /opt, keeps durable writable state under
# /srv/a0/workspaces, installs the isolated MCP SDK requirement, and starts the
# service with shell execution disabled.

if [[ ${EUID} -ne 0 ]]; then
  echo "ERROR: run as root (sudo bash deploy/install-vm-mcp.sh)" >&2
  exit 2
fi

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_ROOT="${A0_MCP_INSTALL_ROOT:-/opt/a0-vm-mcp}"
WORK_ROOT="${A0_MCP_ROOT:-/srv/a0/workspaces}"
SERVICE_USER="${A0_MCP_SERVICE_USER:-a0mcp}"
SERVICE_GROUP="$SERVICE_USER"

if [[ ! -f "$SOURCE_ROOT/python/vm_mcp.py" || ! -f "$SOURCE_ROOT/python/vm_mcp_policy.py" ]]; then
  echo "ERROR: source checkout does not contain the VM MCP module" >&2
  exit 3
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv ca-certificates >/dev/null

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd \
    --system \
    --home "$WORK_ROOT/.home" \
    --shell /usr/sbin/nologin \
    "$SERVICE_USER"
else
  usermod --home "$WORK_ROOT/.home" "$SERVICE_USER"
fi

install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$WORK_ROOT"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 "$WORK_ROOT/.home"
install -d -o root -g root -m 0755 "$INSTALL_ROOT/python" "$INSTALL_ROOT/deploy"

install -m 0644 "$SOURCE_ROOT/python/__init__.py" "$INSTALL_ROOT/python/__init__.py"
install -m 0644 "$SOURCE_ROOT/python/vm_mcp.py" "$INSTALL_ROOT/python/vm_mcp.py"
install -m 0644 "$SOURCE_ROOT/python/vm_mcp_policy.py" "$INSTALL_ROOT/python/vm_mcp_policy.py"
install -m 0644 "$SOURCE_ROOT/deploy/vm-mcp-requirements.txt" "$INSTALL_ROOT/deploy/vm-mcp-requirements.txt"

if command -v git >/dev/null 2>&1 && git -C "$SOURCE_ROOT" rev-parse HEAD >/dev/null 2>&1; then
  git -C "$SOURCE_ROOT" rev-parse HEAD > "$INSTALL_ROOT/SOURCE_COMMIT"
else
  printf 'hmmm\n' > "$INSTALL_ROOT/SOURCE_COMMIT"
fi
chmod 0644 "$INSTALL_ROOT/SOURCE_COMMIT"

if [[ ! -x "$INSTALL_ROOT/.venv/bin/python" ]]; then
  python3 -m venv "$INSTALL_ROOT/.venv"
fi
"$INSTALL_ROOT/.venv/bin/pip" install --upgrade pip >/dev/null
"$INSTALL_ROOT/.venv/bin/pip" install -r "$INSTALL_ROOT/deploy/vm-mcp-requirements.txt"

install -m 0644 \
  "$SOURCE_ROOT/deploy/systemd/a0-vm-mcp.service" \
  /etc/systemd/system/a0-vm-mcp.service

systemctl daemon-reload
systemctl enable --now a0-vm-mcp.service
systemctl restart a0-vm-mcp.service

printf '\nVM MCP installed\n'
printf '  source:    %s\n' "$(cat "$INSTALL_ROOT/SOURCE_COMMIT")"
printf '  endpoint:  http://127.0.0.1:8765/mcp\n'
printf '  workspace: %s\n' "$WORK_ROOT"
printf '  shell:     disabled (A0_MCP_SHELL_ENABLED=0)\n'
systemctl --no-pager --full status a0-vm-mcp.service | sed -n '1,14p'
