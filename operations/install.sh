#!/usr/bin/env bash
# A0 native VM installation (no Docker). Idempotent; preserves unrelated services.
# Usage: sudo operations/install.sh /path/to/a0-checkout
# Does: install binaries, system users, DB roles/databases, env files, systemd
# units, and OpenBao bootstrap (initialize once, scoped app token, KV mount).
set -euo pipefail

REPO="${1:?usage: install.sh /path/to/a0-checkout}"
APP_DIR="/opt/a0"
OPENBAO_DIR="/opt/openbao"

if [[ -z "${OPENBAO_BINARY:-}" ]]; then
  OPENBAO_BINARY="${REPO}/../openbao-src/bin/openbao"
  [[ -f "${OPENBAO_BINARY}" ]] || OPENBAO_BINARY="/opt/openbao/openbao"
fi
[[ -f "${OPENBAO_BINARY}" ]] || { echo "OpenBao binary not found at ${OPENBAO_BINARY}" >&2; exit 1; }

echo "[install] system users and directories…"
useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin a0app 2>/dev/null || true
useradd --system --home-dir "${OPENBAO_DIR}" --shell /usr/sbin/nologin openbao 2>/dev/null || true
mkdir -p /etc/a0 /etc/openbao /etc/caddy /srv/a0/media/uploads /srv/a0/media/tmp /srv/a0/backups /var/lib/caddy /var/log/caddy
chown -R a0app:a0app /srv/a0/media /srv/a0/backups
chown -R www-data:www-data /var/lib/caddy /var/log/caddy

echo "[install] application checkout…"
mkdir -p "${APP_DIR}"
rsync -a --delete --exclude node_modules --exclude .git "${REPO}/" "${APP_DIR}/"
cp -a "${REPO}/.git" "${APP_DIR}/.git" 2>/dev/null || true
cd "${APP_DIR}"
if [[ ! -d node_modules ]]; then
  npm install --omit=dev
fi
chown -R a0app:a0app "${APP_DIR}"

echo "[install] OpenBao binary…"
install -o openbao -g openbao -m 0755 "${OPENBAO_BINARY}" "${OPENBAO_DIR}/openbao"

echo "[install] PostgreSQL roles/databases…"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='a0_app'" | grep -q 1; then
  A0_DB_PW="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "CREATE ROLE a0_app LOGIN PASSWORD '${A0_DB_PW}'" >/dev/null
  sudo -u postgres createdb -O a0_app a0app
  echo "A0_DB_PW=${A0_DB_PW}" > /etc/a0/db-passwords.env
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='openbao'" | grep -q 1; then
  BAO_DB_PW="$(openssl rand -hex 24)"
  sudo -u postgres psql -c "CREATE ROLE openbao LOGIN PASSWORD '${BAO_DB_PW}'" >/dev/null
  sudo -u postgres createdb -O openbao openbao
  echo "BAO_DB_PW=${BAO_DB_PW}" >> /etc/a0/db-passwords.env
fi
chmod 600 /etc/a0/db-passwords.env
# shellcheck disable=SC1091
source /etc/a0/db-passwords.env

echo "[install] OpenBao config…"
sed -e "s|REPLACE_WITH_BAO_DB_PASSWORD|${BAO_DB_PW}|" "${REPO}/operations/openbao.hcl" > /etc/openbao/config.hcl
chown root:openbao /etc/openbao/config.hcl
chmod 640 /etc/openbao/config.hcl
[[ -f /etc/openbao/seal.key ]] || { openssl rand -out /etc/openbao/seal.key 32; chown root:openbao /etc/openbao/seal.key; chmod 640 /etc/openbao/seal.key; }

echo "[install] systemd units and Caddy…"
install -m 0644 "${REPO}/operations/a0.service" /etc/systemd/system/a0.service
install -m 0644 "${REPO}/operations/openbao.service" /etc/systemd/system/openbao.service
install -m 0644 "${REPO}/operations/a0-caddy.service" /etc/systemd/system/a0-caddy.service
install -m 0755 /opt/caddy/caddy /usr/local/bin/caddy 2>/dev/null || true
install -m 0644 "${REPO}/operations/Caddyfile" /etc/caddy/Caddyfile
mkdir -p /etc/systemd/system/a0-caddy.service.d
systemctl daemon-reload

echo "[install] application env…"
if [[ ! -f /etc/a0/a0.env ]]; then
  {
    echo "NODE_ENV=production"
    echo "A0_HOST=127.0.0.1"
    echo "A0_PORT=8787"
    echo "A0_PUBLIC_ORIGIN=https://35.212.252.101.nip.io"
    echo "A0_DATABASE_URL=postgres://a0_app:${A0_DB_PW}@127.0.0.1:5432/a0app"
    echo "BAO_ADDR=http://127.0.0.1:8200"
    echo "BAO_KV_MOUNT=a0"
    echo "A0_MEDIA_ROOT=/srv/a0/media"
    echo "A0_SESSION_SECRET=$(openssl rand -hex 32)"
    echo "A0_BOOTSTRAP_CODE=$(openssl rand -hex 16)"
    echo "BAO_TOKEN=REPLACE_AFTER_VAULT_BOOTSTRAP"
  } > /etc/a0/a0.env
  chown root:a0app /etc/a0/a0.env
  chmod 640 /etc/a0/a0.env
fi
# Preserve existing values; ensure the setup code is readable by the operator.
grep -q '^A0_BOOTSTRAP_CODE=' /etc/a0/a0.env || echo "A0_BOOTSTRAP_CODE=$(openssl rand -hex 16)" >> /etc/a0/a0.env
chown root:a0app /etc/a0/a0.env; chmod 640 /etc/a0/a0.env

echo "[install] starting OpenBao…"
systemctl enable --now openbao.service
sleep 2
systemctl is-active openbao.service

echo "[install] OpenBao bootstrap (initialize once, scoped token, KV mount)…"
export BAO_ADDR=http://127.0.0.1:8200
if ! curl -fsS "${BAO_ADDR}/v1/sys/seal-status" | grep -q '"initialized":true'; then
  INIT_OUT="$(curl -fsS -X POST "${BAO_ADDR}/v1/sys/init" -d '{"secret_shares":1,"secret_threshold":1}')"
  ROOT_TOKEN="$(echo "${INIT_OUT}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["root_token"])')"
  RECOVERY_KEY="$(echo "${INIT_OUT}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["recovery_keys_b64"][0])')"
  umask 077
  {
    echo "initialized_at=$(date -Is)"
    echo "root_token=${ROOT_TOKEN}"
    echo "recovery_key_b64=${RECOVERY_KEY}"
  } > /etc/openbao/init.json
  chown root:openbao /etc/openbao/init.json
  chmod 640 /etc/openbao/init.json
  echo "OpenBao initialized; root token + recovery key stored in /etc/openbao/init.json (root:openbao 0640)."
else
  echo "OpenBao already initialized; keeping existing store."
fi
source <(sed -e 's/^/export /' /etc/openbao/init.json)
export BAO_TOKEN="${root_token}"

echo "[install] enabling KV v2 mount 'a0' and scoped app policy/token…"
curl -fsS -X POST -H "X-Vault-Token: ${root_token}" "${BAO_ADDR}/v1/sys/mounts/a0" \
  -d '{"type":"kv","options":{"version":"2"}}' >/dev/null || true
curl -fsS -X POST -H "X-Vault-Token: ${root_token}" "${BAO_ADDR}/v1/sys/policies/acl/a0-app" \
  -d '{"policy":"path \"secret/data/a0/*\" { capabilities = [\"create\",\"read\",\"update\",\"delete\",\"list\"] }"}' >/dev/null
APP_TOKEN="$(curl -fsS -X POST -H "X-Vault-Token: ${root_token}" "${BAO_ADDR}/v1/auth/token/create" \
  -d '{"policies":["a0-app"],"ttl":"720h","renewable":true}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["auth"]["client_token"])')"
sed -i "s|^BAO_TOKEN=.*|BAO_TOKEN=${APP_TOKEN}|" /etc/a0/a0.env

echo "[install] starting A0 and Caddy…"
systemctl enable --now a0.service a0-caddy.service
sleep 2
systemctl is-active a0.service
systemctl is-active a0-caddy.service || true

echo "[install] complete."
echo "Setup code: $(grep '^A0_BOOTSTRAP_CODE=' /etc/a0/a0.env | cut -d= -f2)"
echo "Public URL: https://35.212.252.101.nip.io"
echo "Store /etc/a0/backup.key and /etc/openbao/init.json recovery material off-VM."
