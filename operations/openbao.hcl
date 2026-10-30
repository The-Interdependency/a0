# OpenBao configuration for A0 (pinned fork 4a8f475e88e4fa0c76ae1645a22faffe5596d361).
# Installed at /etc/openbao/config.hcl by operations/install.sh.
# The seal key file is root-owned, readable only by the openbao group, and is
# mounted read-only into the service through this file reference.

storage "postgresql" {
  connection_url = "postgres://openbao:REPLACE_WITH_BAO_DB_PASSWORD@127.0.0.1:5432/openbao?sslmode=disable"
  table          = "openbao_kv_store"
  ha_enabled     = "false"
}

listener "tcp" {
  address     = "127.0.0.1:8200"
  tls_disable = "true"
}

seal "static" {
  current_key_id = "a0-seal-1"
  current_key    = "file:///etc/openbao/seal.key"
}

api_addr      = "http://127.0.0.1:8200"
cluster_addr  = "http://127.0.0.1:8201"
disable_mlock = true
log_level     = "warn"
