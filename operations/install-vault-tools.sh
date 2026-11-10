#!/usr/bin/env bash
# Usage: sudo bash operations/install-vault-tools.sh from the reviewed release.
# Installs root-owned administrative code outside the app-writable checkout.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run through authorized sudo.' >&2; exit 1; }
SOURCE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
install -d -o root -g root -m 0755 /usr/local/lib/a0
install -o root -g root -m 0755 "$SOURCE/configure-vault.py" /usr/local/lib/a0/configure-vault.py
for unit in a0-vault-renew.service a0-vault-renew.timer; do
  install -o root -g root -m 0644 "$SOURCE/$unit" "/usr/local/lib/a0/$unit"
done
echo 'Root-owned A0 vault administration tools installed.'
