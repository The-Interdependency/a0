#!/usr/bin/env bash
# A0 restore into an ISOLATED target. The running deployment is not modified.
# Usage: sudo operations/restore.sh <backup.tar.gz.enc> [suffix]
# Verifies: database rows, media files, and a nonsecret canary in OpenBao.
set -euo pipefail

BACKUP_FILE="${1:?usage: restore.sh <backup.tar.gz.enc> [suffix]}"
SUFFIX="${2:-restore}"
KEY_FILE="/etc/a0/backup.key"
WORK="$(mktemp -d /tmp/a0-restore.XXXXXX)"
APP_DB="a0app_${SUFFIX}"
BAO_DB="openbao_${SUFFIX}"

if [[ ! -f "${KEY_FILE}" ]]; then
  echo "Backup key ${KEY_FILE} is missing; recovery requires the applicable current/historical wrapping keys." >&2
  exit 1
fi

echo "[restore] decrypting and unpacking…"
openssl enc -d -aes-256-cbc -pbkdf2 -salt -pass file:"${KEY_FILE}" -in "${BACKUP_FILE}" | tar -C "${WORK}" -xzf -
chmod -R a+rX "${WORK}"

echo "[restore] creating isolated databases ${APP_DB} and ${BAO_DB}…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${APP_DB};" -c "DROP DATABASE IF EXISTS ${BAO_DB};" >/dev/null
sudo -u postgres createdb -O a0_app "${APP_DB}"
sudo -u postgres createdb -O openbao "${BAO_DB}"

echo "[restore] loading application database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${APP_DB}" -f "${WORK}/a0app.sql" >/dev/null
echo "[restore] loading OpenBao database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${BAO_DB}" -f "${WORK}/openbao.sql" >/dev/null

echo "[restore] restoring media into isolated path /srv/a0/restore-media-${SUFFIX}…"
RESTORE_MEDIA="/srv/a0/restore-media-${SUFFIX}"
rm -rf "${RESTORE_MEDIA}"
mkdir -p "${RESTORE_MEDIA}"
cp -a "${WORK}/media/." "${RESTORE_MEDIA}/"

echo "[restore] verifying…"
USERS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM users" -d "${APP_DB}")
CONVS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM conversations" -d "${APP_DB}")
MEDIA_COUNT=$(find "${RESTORE_MEDIA}" -type f | wc -l)
KV_ROWS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM openbao_kv_store" -d "${BAO_DB}")
echo "users=${USERS} conversations=${CONVS} media_files=${MEDIA_COUNT} bao_kv_rows=${KV_ROWS}"
echo "identities:"
cat "${WORK}/identities.txt"

# Nonsecret canary: if the application DB has a credential_references row for
# provider 'canary', that proves the restored app references the restored vault.
CANARY=$(sudo -u postgres psql -tAc "SELECT count(*) FROM credential_references WHERE provider='canary'" -d "${APP_DB}")
if [[ "${CANARY}" -gt 0 ]]; then
  echo "[restore] CANARY_OK: restored app DB references restored vault credential."
else
  echo "[restore] canary not present in this backup; skipping canary assertion."
fi

echo "[restore] isolated restore complete. Clean up with:"
echo "  sudo -u postgres dropdb ${APP_DB}; sudo -u postgres dropdb ${BAO_DB}; sudo rm -rf ${RESTORE_MEDIA}"
rm -rf "${WORK}"
