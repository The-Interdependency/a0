# A0 release record (issue #118 corrective release)

Released: 2026-10-30 on VM `a0-prod-1.us-west1-a.c.cs-poc-ab8uzg6ej7vv4vwtyywhbwn.internal` (GCP project `cs-poc-ab8uzg6ej7vv4vwtyywhbwn`, external IP 35.212.252.101).

## Public surface

- **HTTPS URL: https://35.212.252.101.nip.io** (primary) and https://35.212.252.101.sslip.io (fallback). Real Let's Encrypt certificates; HTTP redirects to HTTPS.
- CSP header now served: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`.

## Deployed identities

| Component | Identity |
| --- | --- |
| Published HEAD (GitHub main) | `f5a50f19c0d2de80343023842ed340c6e9ce81a6` (`feat: FR0 OpenAI Responses transport + FR1 cache-aware context revisions (issue #119)`) |
| Deployed HEAD on VM | matches `/api/health` build field (runtime code of `f5a50f19c0d2de80343023842ed340c6e9ce81a6` plus this docs record) |
| Previous release commits | implementation `3eef4b088aa0c4e826f657f74cc6cfe0738062f3`, docs `1885b975c83f5a74c36afb0294121a5e26ca48ea` |
| Harness | `a0-harness/1.0.0` |
| Node runtime | v18.19.1 (`/usr/bin/node`) |
| OpenBao | The-Interdependency/openbao @ `4a8f475e88e4fa0c76ae1645a22faffe5596d361`; binary `OpenBao v2.0.0-HEAD` at `/opt/openbao/openbao` |
| Caddy | v2.11.7 at `/opt/caddy/caddy` |
| PostgreSQL | existing cluster 16; app DB `a0app` (role `a0_app`), vault DB `openbao` (role `openbao`) |
| App schema | migration `0001_initial` |
| Services | `a0.service`, `openbao.service`, `a0-caddy.service` — enabled, active, restart on-failure |

## Verification results

- Acceptance A01–A24 final ledger: **21 PASS, 1 FAIL (A04), 2 BLOCKED (A17/A18), 0 NOT RUN** — see docs/acceptance.md.
- A04: openai/xai/deepseek real test requests PASS; anthropic BLOCKED (no key). A04 stays FAIL until all four providers pass.
- F01: `tests/frontend/run.js` — all adversarial fixtures inert; safe links preserved. CSP live.
- A13: GnuPG backup + isolated restore + restored-Bao canary OK. Tampered backup fails decryption (exit 2) before extraction.
- A24: served-source issue-#118 checks all pass; rollback `--check` rehearsal passed.
- `/api/health` now reports `build.commit`, `build.dirty`, `build.builtAt` so the running build is bound to its source identity.

## Backup / restore / rollback

- Backup: `sudo operations/backup.sh` → `/srv/a0/backups/a0-backup-<stamp>.tar.gz.gpg` (GnuPG AES256, integrity-protected, with SHA-256 manifest + OpenBao canary).
- Restore: `sudo operations/restore.sh <backup> <suffix>` — decrypts, verifies manifest, restores isolated DBs/media, then starts a second OpenBao against the restored store and reads the original canary.
- Rollback: `sudo operations/rollback.sh --check <backup>` (rehearsal; passed) and `--apply <backup>` (maintenance-state restore + redeploy of the recorded commit). Full procedures in operations/README.md.

## Operator handover

- Owner account `erin` remains the only user. The owner password was changed by the operator during phone sign-in and is not recorded here; recovery via the website About → Change password, or privately documented operator recovery.
- Provider keys in OpenBao: openai, deepseek, xai configured; anthropic needs a key. OpenAI's earlier 401 was traced to a test placeholder overwriting the real key; the real key was re-imported and now passes.
- Recovery material stays only on the VM (and off-VM copies the operator makes): `/etc/openbao/init.json`, `/etc/openbao/seal.key`, `/etc/a0/backup.key`, `/etc/a0/a0.env`, `/etc/a0/db-passwords.env`. None are committed.
