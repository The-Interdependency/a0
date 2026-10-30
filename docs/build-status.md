# A0 build status — resumption record

Last updated: 2026-10-30 (VM local time)

## Current state

- **Source**: The-Interdependency/a0 checkout at `/home/wayseer_interdependentway_org/a0` and deployed at `/opt/a0`.
- **Branch/HEAD**: see `git rev-parse HEAD` in `/opt/a0`; committed as `docs: record A0 VM deployment acceptance` (exact SHA in docs/release.md).
- **Uncommitted work**: none expected; keep `git status` clean before further changes.
- **Deployment**: production A0 running on this VM. HTTPS URL: https://35.212.252.101.nip.io (and https://35.212.252.101.sslip.io).

## Implemented requirements

- R01/R02: native systemd deployment (no Docker on VM); phone-first responsive website with Caddy HTTPS ingress.
- R03: owner-only bootstrap via one-time setup code; server-side ownership checks on every record; no public registration.
- R04: BYOK adapters for OpenAI, Anthropic, xAI, DeepSeek; DeepSeek selected by default; keys stored in OpenBao KV v2 and resolved server-side.
- R05: persisted chat with streaming, stop/cancel, saved conversations, attachments, voice (browser dictation + spoken responses), projects, MCP tool execution.
- R06/R07/R08/R09: New conversation / One answer (continue) / Compare models switching; extensible participants; shared context snapshots; default all-responses context; selected-response policy; separate tool-execution authorization.
- R10: configurable MCP connections (URL, auth header in vault, discovery, enable/disable, SSRF guard with explicit private-network opt-in).
- R11/R12: OpenBao fork pinned at 4a8f475e88e4fa0c76ae1645a22faffe5596d361, built locally (OpenBao v2.0.0-HEAD), PostgreSQL storage, static file seal; replaceable vault adapter.
- R13/R14: archive/ preserved untouched; provider/vault/identity/presentation/execution boundaries kept modular.

## Gate results

- Acceptance A01–A24: 19 PASS, 0 FAIL, 2 BLOCKED (A17/A18 real phone), 3 operator-run (A04 live partial, A13 backup/restore, A24 deploy verification) — see docs/acceptance.md for the full matrix and reruns.
- A04 live: DeepSeek PASS, xAI PASS, Anthropic BLOCKED (no key), OpenAI FAIL (legacy key 401; operator must rotate the key in Settings → Providers).

## Selected decisions

- Native Node 18 (system `/usr/bin/node`) + PostgreSQL 16 (existing cluster) + OpenBao (native binary) + Caddy (native binary). Docker was not installed; native services avoid a competing supervisor and reuse the existing PostgreSQL cluster while preserving the `a0` role and `a0p` database.
- Durable paths: app DB `a0app` (role `a0_app`), vault DB `openbao` (role `openbao`), media `/srv/a0/media`, backups `/srv/a0/backups`, app env `/etc/a0/a0.env`, vault recovery material `/etc/openbao/init.json`, seal key `/etc/openbao/seal.key`, backup key `/etc/a0/backup.key`, setup code `/etc/a0/setup-code.txt`.
- Voice: browser Web Speech API dictation + speechSynthesis spoken answers (no external audio service dependency).

## Running jobs

- `systemctl status a0 openbao a0-caddy` — all three should be active.
- Caddy certificate renewal is automatic (Let's Encrypt).

## Next action

- Operator (Erin): sign in at https://35.212.252.101.nip.io with the delivered owner password, change the password in About, rotate the OpenAI key in Settings → Providers, and open the site from the Android phone to close A17/A18.

## Outstanding hmmm

- **Git push blocked**: local commits `3eef4b0` (implementation) and `1885b97` (docs) are on `main` in `/home/wayseer_interdependentway_org/a0` and `/opt/a0`, but the GitHub tokens in the VM's `.env` are invalid and no SSH key is installed. Operator action: provide a valid `GH_TOKEN`/`GITHUB_TOKEN` or SSH deploy key, then `cd /home/wayseer_interdependentway_org/a0 && git push origin main`.
- Real-phone browser/microphone observation (A17/A18) not yet performed from a physical Android device.
- OpenAI legacy key returns 401; rotation required.
- Anthropic key not configured; A04 live for Anthropic blocked.
- Off-VM backup copy: encrypted backup files and `/etc/a0/backup.key` must be copied to an authorized off-VM destination by the operator.
- Org hostname (e.g. a0.interdependentway.org) requires DNS A record to 35.212.252.101 plus adding the name to /etc/caddy/Caddyfile; nip.io/sslip.io names are the current working public URLs.
