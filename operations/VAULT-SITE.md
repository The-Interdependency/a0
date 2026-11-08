# Activate the A0 vault and private Site connection

GPT generated; context, prompt Erin Spencer.

The code supplies vault-backed coding CLI launch, authenticated VM observations,
and an inert handoff inbox. Source, deployed VM, provider calls, and physical
phone acceptance remain separate evidence scopes.

## Existing VM update

Use the existing authenticated VM shell and a reviewed A0 release containing
`operations/configure-vault.py`. Preserve local changes, `/etc/a0`, `/etc/openbao`,
PostgreSQL and `/srv/a0`. Do not run fresh-store initialization on this VM.

From the deployed A0 checkout, install the root-owned administrative files:

```bash
sudo bash operations/install-vault-tools.sh
sudo python3 /usr/local/lib/a0/configure-vault.py --cli-user "$(id -un)"
```

The coding account must be non-root. Setup verifies the existing store, pins
its cluster identity, corrects KV v2 policies, installs separate application
and read-only CLI tokens, and enables hourly renewal. It restarts only A0 and
requires local HTTP readiness. The root token/recovery material is read privately
from `/etc/openbao/init.json`; it is never placed in command arguments or logs.
Expired scoped tokens require this explicit provisioning command. The timer
never acquires a root token or silently initializes a store.

Use the normal reviewed source deployment path to put the release in `/opt/a0`
before provisioning. The Site reports the build recorded by A0; an absent build
record displays `unrecorded`, never an invented commit. Retain the previous
release and backup before service changes. This guide does not claim deployment
has occurred.

## Phone launcher and pairing

Update the existing canonical skill-lib checkout and its symlinks in Termux:

```bash
git -C "$HOME/skill-lib" pull --ff-only &&
bash "$HOME/skill-lib/tools/install_ai.sh"
ai.sh vault install
ai.sh vault setup
ai.sh keys
```

Setup uses existing noninteractive authorized sudo. If that is unavailable,
run the VM provisioning command in the already authenticated interactive shell;
never paste an administrator password into chat. Existing SSH host trust is
required and is never bypassed. Existing agent panes retain old environment
values until you explicitly restart each chosen agent.

In the private reliability Site, open **Live VM → Download pairing file**.
In Termux, after allowing its normal Downloads access:

```bash
ai.sh site pair /sdcard/Download/a0-site-connection.json
ai.sh site status
```

Delete the downloaded pairing file after successful pairing. It contains a
bridge credential, not provider API keys. Site runtime settings hold the same
credential server-side. Keep this Site owner-private: authorized Site viewers
can use the bridge and its owner pairing download. The pairing command validates
the VM origin, writes protected credential files, and checks A0 readiness.

Open **Live VM → Refresh**. A fresh authenticated response shows the deployed
commit, database/vault readiness and provider credential presence. Presence is
not a successful provider request. An observation can be attached to an existing
check without changing its assessment automatically.

## Handoffs and proof

Generate a Codex or DeepSeek handoff and choose **Send to VM**. Identical target
and text produce the same receipt, including concurrent retries. `received`
means stored, not executed. On the VM, `~/.local/bin/a0-vault site handoffs` lists
receipts; `~/.local/bin/a0-vault site handoff ID` reads one. From Termux the
corresponding commands are `ai.sh site handoffs` and `ai.sh site handoff ID`.

The bridge cannot run a shell or access ordinary A0 chat/key routes. A builder
must deliberately take up the handoff. VM test receipts may be written by that
builder to `/srv/a0/media/reliability/evidence.json` as an array of
`{id, commit, observedAt, scope, status, summary}`. Scope is `vm`, `browser`, or
`provider`; status is `passed`, `failed`, or `blocked`. Reports are displayed as
VM-reported evidence, not independent verification or phone acceptance.

## Recovery and rollback

- Sealed, unavailable, redirected, mismatched or unauthorized vault: agents fail
  closed; use the recovery shell. Never reinitialize or regenerate seal keys.
- Renewal failure: inspect `systemctl status a0-vault-renew.timer` and
  `journalctl -u a0-vault-renew.service`; reprovision explicitly after recovery.
- Revoke pairing by removing `A0_BRIDGE_TOKEN_FILE` from protected A0 config and
  restarting A0. Remove/replace the Sites runtime token for a full disconnect.
- Preserve inbox/evidence and vault data through rollback. The previous app
  expects `BAO_TOKEN`, so reverting app code also requires a reviewed private
  configuration migration; do not simply revert source and assume readiness.
- Restore launcher behavior by a reviewed Git revert. Never restore stale
  provider environment variables as a fallback to a failed vault.

hmmm: live VM deployment, actual renewal across time, provider calls and physical
Android acceptance need their own receipts. Local fixture passes do not close them.
