#!/usr/bin/env bash
# A0 rehearsed release/data recovery procedure (F15).
# --check : dry run against isolated databases (safe; default).
# --apply : maintenance-state production rollback:
#           1) fresh safety backup, 2) stop the app (write quiescence),
#           3) restore app DB + media from the selected backup,
#           4) redeploy the source commit recorded in that backup,
#           5) restart and verify health/data.
# Requires the backup passphrase (/etc/a0/backup.key) and OpenBao seal key.
# Usage:
#   sudo operations/rollback.sh --check <backup.tar.gz.gpg>
#   sudo operations/rollback.sh --apply <backup.tar.gz.gpg>
set -euo pipefail

MODE="${1:?usage: rollback.sh --check|--apply <backup.tar.gz.gpg>}"
BACKUP_FILE="${2:?backup file required}"
KEY_FILE="/etc/a0/backup.key"
APP_DIR="/opt/a0"

[[ "${MODE}" == "--check" || "${MODE}" == "--apply" ]] || { echo "mode must be --check or --apply" >&2; exit 1; }
[[ -f "${KEY_FILE}" ]] || { echo "missing ${KEY_FILE}" >&2; exit 1; }
[[ -f "${BACKUP_FILE}" ]] || { echo "backup not found: ${BACKUP_FILE}" >&2; exit 1; }

echo "[rollback] preflight identities…"
echo "current commit: $(cd ${APP_DIR} && git rev-parse HEAD)"
echo "current dirty: $(cd ${APP_DIR} && git status --porcelain | head -c 200 || true)"
sudo systemctl is-active a0 openbao a0-caddy

echo "[rollback] isolated compatibility check (restore.sh --check path)…"
SUFFIX="rollbackcheck"
"$(dirname "$0")/restore.sh" "${BACKUP_FILE}" "${SUFFIX}"

if [[ "${MODE}" == "--check" ]]; then
  echo "[rollback] CHECK PASSED: backup decrypts, manifest verifies, isolated restore and restored-Bao canary succeed."
  echo "[rollback] To apply: sudo operations/rollback.sh --apply ${BACKUP_FILE}"
  exit 0
fi

echo "[rollback] creating safety backup of current state…"
"$(dirname "$0")/backup.sh"

echo "[rollback] extracting target identities from backup…"
WORK="$(mktemp -d /tmp/a0-rollback.XXXXXX)"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "${KEY_FILE}" \
  -o "${WORK}/backup.tar.gz" -d "${BACKUP_FILE}"
tar -C "${WORK}" -xzf "${WORK}/backup.tar.gz"
TARGET_COMMIT="$(grep '^a0_commit=' "${WORK}/identities.txt" | cut -d= -f2-)"
echo "target commit: ${TARGET_COMMIT}"
cd "${APP_DIR}"
git cat-file -e "${TARGET_COMMIT}^{commit}" || { echo "target commit ${TARGET_COMMIT} is not available in ${APP_DIR}" >&2; exit 1; }

echo "[rollback] write quiescence: stopping a0…"
sudo systemctl stop a0

echo "[rollback] restoring production app database and media…"
APP_DB_PW=$(grep '^A0_DB_PW=' /etc/a0/db-passwords.env | cut -d= -f2)
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS a0app;" -c "CREATE DATABASE a0app OWNER a0_app;" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -d a0app -f "${WORK}/a0app.sql" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER DATABASE a0app OWNER TO a0_app;" >/dev/null
rm -rf /srv/a0/media/uploads
mkdir -p /srv/a0/media/uploads
cp -a "${WORK}/media/." /srv/a0/media/
sudo chown -R a0app:a0app /srv/a0/media

echo "[rollback] redeploying recorded source commit ${TARGET_COMMIT}…"
sudo git checkout -q "${TARGET_COMMIT}"
sudo chown -R a0app:a0app "${APP_DIR}"

echo "[rollback] restarting app and verifying…"
sudo systemctl start a0
sleep 3
HEALTH=$(curl -s "http://127.0.0.1:8787/api/health")
echo "${HEALTH}"
echo "${HEALTH}" | grep -q '"ok":true' || { echo "health check failed after rollback" >&2; exit 1; }
USERS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM users" -d a0app)
echo "post-rollback users=${USERS}"

echo "[rollback] APPLY COMPLETE. Verify the website: https://35.212.252.101.nip.io"
rm -rf "${WORK}"
