#!/usr/bin/env bash
# A0 restore into an ISOLATED target. The running deployment is not modified.
# GnuPG verifies integrity during decryption; the embedded SHA-256 manifest is
# then checked before any SQL executes. Finally a second OpenBao instance is
# started against the restored store to prove the original canary is readable.
# Usage: sudo operations/restore.sh <backup.tar.gz.gpg> [suffix]
set -euo pipefail

BACKUP_FILE="${1:?usage: restore.sh <backup.tar.gz.gpg> [suffix]}"
SUFFIX="${2:-restore}"
KEY_FILE="/etc/a0/backup.key"
SEAL_KEY="/etc/openbao/seal.key"
WORK="$(mktemp -d /tmp/a0-restore.XXXXXX)"
APP_DB="a0app_${SUFFIX}"
BAO_DB="openbao_${SUFFIX}"
RESTORE_BAO_PORT="${RESTORE_BAO_PORT:-8203}"

if [[ ! -f "${KEY_FILE}" ]]; then
  echo "Backup passphrase ${KEY_FILE} is missing; recovery requires the applicable current/historical keys." >&2
  exit 1
fi
if [[ ! -f "${SEAL_KEY}" ]]; then
  echo "OpenBao seal key ${SEAL_KEY} is missing; a restored vault cannot be unsealed without it." >&2
  exit 1
fi

echo "[restore] decrypting and unpacking (GnuPG integrity check)…"
gpg --batch --yes --pinentry-mode loopback --passphrase-file "${KEY_FILE}" \
  -o "${WORK}/backup.tar.gz" -d "${BACKUP_FILE}"
tar -C "${WORK}" -xzf "${WORK}/backup.tar.gz"
chmod -R a+rX "${WORK}"

echo "[restore] verifying embedded integrity manifest…"
(cd "${WORK}" && sha256sum -c manifest.sha256)

echo "[restore] creating isolated databases ${APP_DB} and ${BAO_DB}…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${APP_DB};" -c "DROP DATABASE IF EXISTS ${BAO_DB};" >/dev/null
sudo -u postgres createdb -O a0_app "${APP_DB}"
sudo -u postgres createdb -O openbao "${BAO_DB}"

echo "[restore] loading application database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${APP_DB}" -f "${WORK}/a0app.sql" >/dev/null
echo "[restore] loading OpenBao database…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${BAO_DB}" -f "${WORK}/openbao.sql" >/dev/null
echo "[restore] reassigning restored object ownership to application/vault roles…"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${APP_DB}" <<'SQL' >/dev/null
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO a0_app', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO a0_app', r.sequence_name);
  END LOOP;
END $$;
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${BAO_DB}" <<'SQL' >/dev/null
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO openbao', r.tablename);
  END LOOP;
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO openbao', r.sequence_name);
  END LOOP;
END $$;
SQL
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${APP_DB}" -c "ALTER DATABASE ${APP_DB} OWNER TO a0_app" >/dev/null
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "${BAO_DB}" -c "ALTER DATABASE ${BAO_DB} OWNER TO openbao" >/dev/null

echo "[restore] restoring media into isolated path /srv/a0/restore-media-${SUFFIX}…"
RESTORE_MEDIA="/srv/a0/restore-media-${SUFFIX}"
rm -rf "${RESTORE_MEDIA}"
mkdir -p "${RESTORE_MEDIA}"
cp -a "${WORK}/media/." "${RESTORE_MEDIA}/"

echo "[restore] verifying database/media counts…"
USERS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM users" -d "${APP_DB}")
CONVS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM conversations" -d "${APP_DB}")
MEDIA_COUNT=$(find "${RESTORE_MEDIA}" -type f | wc -l)
KV_ROWS=$(sudo -u postgres psql -tAc "SELECT count(*) FROM openbao_kv_store" -d "${BAO_DB}")
echo "users=${USERS} conversations=${CONVS} media_files=${MEDIA_COUNT} bao_kv_rows=${KV_ROWS}"
echo "identities:"
cat "${WORK}/identities.txt"

echo "[restore] proving restored OpenBao usability…"
BAO_DB_PW=$(grep '^BAO_DB_PW=' /etc/a0/db-passwords.env | cut -d= -f2)
RESTORE_BAO_CFG="${WORK}/restored-bao.hcl"
cat > "${RESTORE_BAO_CFG}" <<EOF
storage "postgresql" {
  connection_url = "postgres://openbao:${BAO_DB_PW}@127.0.0.1:5432/${BAO_DB}?sslmode=disable"
  table          = "openbao_kv_store"
  ha_enabled     = "false"
}
listener "tcp" {
  address     = "127.0.0.1:${RESTORE_BAO_PORT}"
  tls_disable = "true"
}
seal "static" {
  current_key_id = "a0-seal-1"
  current_key    = "file://${SEAL_KEY}"
}
api_addr      = "http://127.0.0.1:${RESTORE_BAO_PORT}"
cluster_addr  = "http://127.0.0.1:8204"
disable_mlock = true
log_level     = "error"
EOF
chmod 640 "${RESTORE_BAO_CFG}"
chown root:openbao "${RESTORE_BAO_CFG}"
sudo -u openbao /opt/openbao/openbao server -config="${RESTORE_BAO_CFG}" >"${WORK}/restored-bao.log" 2>&1 &
RESTORED_BAO_PID=$!
cleanup_bao() { kill "${RESTORED_BAO_PID}" 2>/dev/null || true; wait "${RESTORED_BAO_PID}" 2>/dev/null || true; }
trap cleanup_bao EXIT
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${RESTORE_BAO_PORT}/v1/sys/seal-status" >/dev/null 2>&1; then break; fi
  sleep 1
  if [[ $i -eq 20 ]]; then
    echo "[restore] restored Bao did not become ready; log:" >&2
    tail -20 "${WORK}/restored-bao.log" >&2
    exit 1
  fi
done
SEALED=$(curl -fsS "http://127.0.0.1:${RESTORE_BAO_PORT}/v1/sys/seal-status" | python3 -c 'import sys,json; print(json.load(sys.stdin)["sealed"])')
ROOT_TOKEN="$(grep '^root_token=' /etc/openbao/init.json | cut -d= -f2)"
CANARY=$(curl -fsS -H "X-Vault-Token: ${ROOT_TOKEN}" "http://127.0.0.1:${RESTORE_BAO_PORT}/v1/a0/data/backup-canary" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["data"]["value"])' 2>/dev/null || echo MISSING)
EXPECTED_CANARY=$(grep '^canary=' "${WORK}/canary.txt" | cut -d= -f2-)
if [[ "${SEALED}" == "False" && "${CANARY}" == "${EXPECTED_CANARY}" && "${CANARY}" != "MISSING" ]]; then
  echo "[restore] CANARY_OK: restored Bao unsealed and read original canary '${CANARY}'."
else
  echo "[restore] CANARY_FAIL: sealed=${SEALED} canary=${CANARY} expected=${EXPECTED_CANARY}" >&2
  exit 1
fi

echo "[restore] isolated restore complete. Clean up with:"
echo "  sudo -u postgres dropdb ${APP_DB}; sudo -u postgres dropdb ${BAO_DB}; sudo rm -rf ${RESTORE_MEDIA}"
rm -rf "${WORK}"
