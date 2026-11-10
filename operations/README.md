# A0 operations guide (VM deployment)

A0 runs natively on the VM under systemd: `a0.service` (Node app), `openbao.service` (pinned OpenBao fork), `a0-caddy.service` (HTTPS ingress).

## First setup (already performed on this VM)

1. Existing store: `sudo operations/install.sh /path/to/a0-checkout`. A confirmed new store additionally requires `--initialize-vault`; transport failure never triggers initialization.
2. OpenBao bootstrap happens once; new root/recovery material is root-only in `/etc/openbao/init.json` (legacy root:openbao 0640 is accepted). KV v2 mount `a0`; separate periodic `a0-app` and read-only `a0-cli` policies. App credentials use `/etc/a0/vault-app.token`; the config pins the cluster identity. The hourly renewal timer uses scoped credentials only. See [vault and Site activation](VAULT-SITE.md).
3. Owner sign-in: open https://35.212.252.101.nip.io, choose username `erin`, use the one-time setup code from `/etc/a0/setup-code.txt` (root only), set a password. Change it later in About.

## Daily operations

```sh
sudo systemctl status a0 openbao a0-caddy
sudo journalctl -u a0 -n 100            # app logs
sudo journalctl -u openbao -n 50        # vault logs
sudo journalctl -u a0-caddy -n 50       # ingress logs
curl -s https://35.212.252.101.nip.io/api/health
```

## Start / stop / restart

```sh
sudo systemctl stop a0-caddy a0 openbao      # stop
sudo systemctl start openbao a0 a0-caddy     # start (vault first, then app)
sudo systemctl restart a0                    # app-only update
```

## Update

For PR #122, follow the [approval-gated release operations](../docs/pr122-operations.md).
They stage the exact approved source, preserve prior source/configuration,
verify recovery, then provision and pair. Do not run the broad installer for an
app-only update or initialize an existing vault. The prior inline token and new
token-file configuration require compatible rollback, not a source-only revert.

## Key/provider setup

- Sign in → Settings → Providers: paste each provider key. Keys are stored in OpenBao KV v2 (`a0/data/provider/<provider>`) and never returned by the API.
- Participants → "Create defaults for all four providers" seeds the four BYOK participants; DeepSeek starts selected.

## Backup

```sh
sudo operations/backup.sh
# Output: /srv/a0/backups/a0-backup-<stamp>.tar.gz.gpg (GnuPG AES256, integrity-protected; key /etc/a0/backup.key)
# Copy BOTH the encrypted file and /etc/a0/backup.key off-VM to an authorized destination.
```

Both scripts accept JSON and historical `root_token=...` recovery files without
sourcing or printing their contents. Root credentials remain in Python memory
and authenticated vault transport, never command arguments. New backups include
cluster/mount identity and a nonsecret canary. Quiesce app/media/vault writers
for a consistent snapshot; copy the encrypted archive and separately protected
recovery material off-VM before calling recovery available.

## Restore (isolated verification)

```sh
sudo operations/restore.sh /srv/a0/backups/a0-backup-<stamp>.tar.gz.gpg verify1
# Creates a0app_verify1 + openbao_verify1 + /srv/a0/restore-media-verify1 and verifies counts.
# The suffix must be unused/disposable; these isolated targets are replaced.
# Completion requires CANARY_OK for the restored cluster and original canary.
```

## Rollback

`sudo operations/rollback.sh --check BACKUP.tar.gz.gpg` runs an isolated
restore using the corrected reader. Its fixed `rollbackcheck` targets must be
disposable. The [PR #122 rollback requirements](../docs/pr122-operations.md)
own the configuration transition: preserve the prior release, dependencies,
private config, original scoped credential and renewal state. Stop A0 if any
compatibility gate fails; keep vault/data and the recovery shell available.
Do not use `rollback.sh --apply` for this rollout. It restores app DB/media/source
without reversing vault policies, token-file configuration or launcher state.

Old archives without `vault-identity.json` require the independently configured
`BAO_CLUSTER_ID`; missing or conflicting identity fails closed. The actual
restore needs the applicable backup key, seal key, root/recovery authorization,
DB role passwords, and available loopback ports 8203/8204. An isolated fixture
pass does not establish real GPG, PostgreSQL, Bao or off-VM recovery.

## Recovery material (do not commit)

| Path | Purpose |
| --- | --- |
| `/etc/openbao/init.json` | root token + recovery key (new: root 0600; legacy root:openbao 0640) |
| `/etc/openbao/seal.key` | static auto-unseal key (root:openbao 0640) |
| `/etc/a0/backup.key` | backup encryption key (root 0600) |
| `/etc/a0/a0.env` | app DB URL, vault token-file path and cluster pin, session secret, setup code (root:a0app 0640) |
| `/etc/a0/db-passwords.env` | PostgreSQL role passwords (root 0600) |
| `/etc/a0/setup-code.txt` | one-time owner setup code copy (root 0600) |

## Security notes

- The app runs as `a0app` with no capabilities, no Docker access, no shell execution; MCP servers are remote-only with loopback/private-network blocking unless explicitly enabled per connection.
- OpenBao listens on 127.0.0.1:8200 only; PostgreSQL remains on 127.0.0.1:5432. Only Caddy publishes ports 80/443.

## Private reliability Site

[Activation and rollback](VAULT-SITE.md) cover VM provisioning, canonical `ai.sh`,
owner pairing, status evidence and inert handoff delivery. This source update
does not itself establish deployment or phone acceptance.
