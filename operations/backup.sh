#!/usr/bin/env bash
# A0 encrypted backup: application DB + OpenBao DB + media, consistent as a set.
# Encryption is GnuPG symmetric (AES256 with integrity protection). A SHA-256
# manifest inside the archive is verified by restore.sh before any SQL runs.
# A nonsecret canary is written into OpenBao and referenced from the app DB so
# restore.sh can prove the restored vault opens the correct store and reads it.
# Usage: sudo operations/backup.sh [backup_dir]
set -euo pipefail

BACKUP_ROOT="${1:-/srv/a0/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d /tmp/a0-backup.XXXXXX)"
OUT="${BACKUP_ROOT}/a0-backup-${STAMP}.tar.gz.gpg"
KEY_FILE="/etc/a0/backup.key"
BAO_ADDR="http://127.0.0.1:8200"

if [[ ! -f "${KEY_FILE}" ]]; then
  umask 077
  openssl rand -hex 32 > "${KEY_FILE}"
  chown root:root "${KEY_FILE}"
  chmod 600 "${KEY_FILE}"
  echo "Created backup passphrase file at ${KEY_FILE} (root-only). Store a copy off-VM."
fi

echo "[backup] writing nonsecret canary into OpenBao and app DB…"
ROOT_TOKEN="$(grep '^root_token=' /etc/openbao/init.json | cut -d= -f2)"
CANARY_VALUE="a0-backup-canary-${STAMP}"
curl -fsS -X POST -H "X-Vault-Token: ${ROOT_TOKEN}" "${BAO_ADDR}/v1/a0/data/backup-canary" \
  -d "{\"data\":{\"value\":\"${CANARY_VALUE}\"}}" >/dev/null
sudo -u postgres psql -d a0app -v ON_ERROR_STOP=1 -c \
  "INSERT INTO credential_references (user_id, provider, vault_path) SELECT id, 'canary', 'backup-canary' FROM users ORDER BY created_at LIMIT 1 ON CONFLICT (provider) DO UPDATE SET vault_path='backup-canary', updated_at=now();" >/dev/null
echo "canary=${CANARY_VALUE}" > "${WORK}/canary.txt"

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
  echo "a0_dirty=$(cd /opt/a0 && git status --porcelain 2>/dev/null | head -c 200 || true)"
  echo "openbao_binary=$(/opt/openbao/openbao version 2>/dev/null | head -1 || echo unknown)"
  echo "openbao_fork_commit=4a8f475e88e4fa0c76ae1645a22faffe5596d361"
} > "${WORK}/identities.txt"

echo "[backup] writing integrity manifest…"
(cd "${WORK}" && find . -type f ! -name manifest.sha256 | sort | xargs sha256sum > manifest.sha256)

echo "[backup] packaging and encrypting (GnuPG AES256, integrity-protected)…"
mkdir -p "${BACKUP_ROOT}"
tar -C "${WORK}" -czf - . | gpg --batch --yes --symmetric --cipher-algo AES256 \
  --pinentry-mode loopback --passphrase-file "${KEY_FILE}" -o "${OUT}"
rm -rf "${WORK}"
echo "[backup] wrote ${OUT}"
ls -la "${OUT}"
echo "[backup] REMEMBER: copy this file AND ${KEY_FILE} off the VM to an authorized destination."
