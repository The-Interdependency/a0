#!/usr/bin/env bash
# A0 encrypted backup: application DB + OpenBao DB + media, consistent as a set.
# Usage: sudo operations/backup.sh [backup_dir]
# Output: encrypted tarball in /srv/a0/backups; a separate backup key lives at
# /etc/a0/backup.key (root-only). Copy BOTH off-VM to an authorized location.
set -euo pipefail

BACKUP_ROOT="${1:-/srv/a0/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d /tmp/a0-backup.XXXXXX)"
OUT="${BACKUP_ROOT}/a0-backup-${STAMP}.tar.gz.enc"
KEY_FILE="/etc/a0/backup.key"

if [[ ! -f "${KEY_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 > "${KEY_FILE}"
  chown root:root "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  echo "Created backup key at ${KEY_FILE} (root-only). Store a copy off-VM."
fi

echo "[backup] dumping application database…"
sudo -u postgres pg_dump --clean --if-exists --no-owner a0app > "${WORK}/a0app.sql"
echo "[backup] dumping OpenBao database…"
sudo -u postgres pg_dump --clean --if-exists --no-owner openbao > "${WORK}/openbao.sql"
echo "[backup] copying media…"
mkdir -p "${WORK}/media"
cp -a /srv/a0/media/. "${WORK}/media/"
echo "[backup] recording identities…"
{
  echo "stamp=${STAMP}"
  echo "host=$(hostname)"
  echo "a0_commit=$(cd /opt/a0 && git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "openbao_binary=$(/opt/openbao/openbao version 2>/dev/null | head -1 || echo unknown)"
} > "${WORK}/identities.txt"

echo "[backup] packaging and encrypting…"
mkdir -p "${BACKUP_ROOT}"
tar -C "${WORK}" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -salt -pass file:"${KEY_FILE}" -out "${OUT}"
rm -rf "${WORK}"
echo "[backup] wrote ${OUT}"
ls -la "${OUT}"
echo "[backup] REMEMBER: copy this file AND ${KEY_FILE} off the VM to an authorized destination."
