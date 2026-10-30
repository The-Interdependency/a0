# A0 release record

Released: 2026-10-30 on VM `a0-prod-1.us-west1-a.c.cs-poc-ab8uzg6ej7vv4vwtyywhbwn.internal` (GCP project `cs-poc-ab8uzg6ej7vv4vwtyywhbwn`, external IP 35.212.252.101).

## Public surface

- **HTTPS URL: https://35.212.252.101.nip.io** (primary) and https://35.212.252.101.sslip.io (fallback). Real Let's Encrypt certificates obtained automatically by Caddy; HTTP redirects to HTTPS.
- Only ingress ports 80/443 are published by Caddy. PostgreSQL (127.0.0.1:5432), OpenBao (127.0.0.1:8200), and the A0 app (127.0.0.1:8787) stay private to the host.

## Deployed identities

| Component | Identity |
| --- | --- |
| A0 source commit | `3eef4b088aa0c4e826f657f74cc6cfe0738062f3` (`build: implement A0 VM website…`) — deployed at `/opt/a0` |
| Docs/acceptance commit | this commit (see `git rev-parse HEAD`) |
| Harness | `a0-harness/1.0.0` |
| Node runtime | v18.19.1 (`/usr/bin/node`) with npm lockfile committed |
| OpenBao fork | The-Interdependency/openbao @ `4a8f475e88e4fa0c76ae1645a22faffe5596d361`; built binary reports `OpenBao v2.0.0-HEAD` at `/opt/openbao/openbao` |
| Caddy | v2.11.7 at `/opt/caddy/caddy` |
| PostgreSQL | existing cluster 16 (`postgresql@16-main`); app DB `a0app` (role `a0_app`), vault DB `openbao` (role `openbao`) |
| App schema | migration `0001_initial` applied |
| Services | `a0.service`, `openbao.service`, `a0-caddy.service` — enabled, active, restart on-failure |

## Readiness / restart evidence

- `curl -s https://35.212.252.101.nip.io/api/health` → `{"ok":true,"name":"a0","harness":"a0-harness/1.0.0",...}` over public HTTPS.
- A14 PASS: conversation persisted across `systemctl restart a0`.
- A12 PASS: vault canary persisted across `systemctl restart openbao`.
- Streaming/cancellation exercised through the public HTTPS URL by the acceptance runner (SSE over fetch).

## Backup / restore / rollback

- Backup: `sudo operations/backup.sh` → `/srv/a0/backups/a0-backup-<stamp>.tar.gz.enc` (AES-256-CBC, key `/etc/a0/backup.key`).
- Restore verified: `sudo operations/restore.sh … verify1` restored both databases and media into isolated targets (users=1, conversations=0, media_files=22, bao_kv_rows=53).
- Rollback: `cd /opt/a0 && sudo git checkout <previous-good-commit> && sudo systemctl restart a0`. Source rollback does not undo database migrations or external tool effects; restore the pre-update backup for data-affecting migrations. Full instructions in operations/README.md.

## Operator handover

- Owner sign-in: username `erin`; the one-time setup code was consumed during acceptance; the current owner password is delivered separately. Change it in About after first sign-in.
- Provider keys: DeepSeek, xAI, OpenAI keys imported from the VM's existing environment into OpenBao. Anthropic needs a key. OpenAI's existing key returns 401 and must be rotated in Settings → Providers.
- Recovery material lives only on the VM (and in off-VM copies the operator makes): `/etc/openbao/init.json`, `/etc/openbao/seal.key`, `/etc/a0/backup.key`, `/etc/a0/a0.env`, `/etc/a0/db-passwords.env`. None are committed to the repository.
