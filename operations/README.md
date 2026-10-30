# A0 operations guide (VM deployment)

A0 runs natively on the VM under systemd: `a0.service` (Node app), `openbao.service` (pinned OpenBao fork), `a0-caddy.service` (HTTPS ingress).

## First setup (already performed on this VM)

1. Install: `sudo operations/install.sh /path/to/a0-checkout` (idempotent).
2. OpenBao bootstrap happens once: initialized with `recovery_shares=1,recovery_threshold=1`; root token + recovery key stored at `/etc/openbao/init.json` (root:openbao 0640). KV v2 mount `a0`, policy `a0-app`, scoped app token written to `/etc/a0/a0.env`.
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

```sh
cd /opt/a0 && sudo git fetch origin && sudo git checkout <release-commit>
sudo rsync -a --delete --exclude node_modules /opt/a0/ ... # or redeploy via install.sh
sudo systemctl restart a0
```

## Key/provider setup

- Sign in → Settings → Providers: paste each provider key. Keys are stored in OpenBao KV v2 (`a0/data/provider/<provider>`) and never returned by the API.
- Participants → "Create defaults for all four providers" seeds the four BYOK participants; DeepSeek starts selected.

## Backup

```sh
sudo operations/backup.sh
# Output: /srv/a0/backups/a0-backup-<stamp>.tar.gz.enc (AES-256-CBC, key /etc/a0/backup.key)
# Copy BOTH the encrypted file and /etc/a0/backup.key off-VM to an authorized destination.
```

## Restore (isolated verification)

```sh
sudo operations/restore.sh /srv/a0/backups/a0-backup-<stamp>.tar.gz.enc verify1
# Creates a0app_verify1 + openbao_verify1 + /srv/a0/restore-media-verify1 and verifies counts.
# Full production restore = load those dumps into fresh a0app/openbao databases and
# copy media back; the vault additionally needs /etc/openbao/seal.key + recovery material.
```

## Rollback

```sh
cd /opt/a0
OLD=$(git rev-parse HEAD)
sudo git fetch origin
sudo git checkout <previous-good-commit>
sudo systemctl restart a0
# If the previous build is broken after a DB migration, restore the pre-update backup
# with operations/restore.sh before restarting. Source rollback alone does not undo
# database migrations or external tool effects.
# To return to this release: sudo git checkout $OLD && sudo systemctl restart a0
```

## Recovery material (do not commit)

| Path | Purpose |
| --- | --- |
| `/etc/openbao/init.json` | root token + recovery key (root:openbao 0640) |
| `/etc/openbao/seal.key` | static auto-unseal key (root:openbao 0640) |
| `/etc/a0/backup.key` | backup encryption key (root 0600) |
| `/etc/a0/a0.env` | app DB URL, BAO token, session secret, setup code (root:a0app 0640) |
| `/etc/a0/db-passwords.env` | PostgreSQL role passwords (root 0600) |
| `/etc/a0/setup-code.txt` | one-time owner setup code copy (root 0600) |

## Security notes

- The app runs as `a0app` with no capabilities, no Docker access, no shell execution; MCP servers are remote-only with loopback/private-network blocking unless explicitly enabled per connection.
- OpenBao listens on 127.0.0.1:8200 only; PostgreSQL remains on 127.0.0.1:5432. Only Caddy publishes ports 80/443.
