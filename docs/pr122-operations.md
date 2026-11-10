# PR #122 — proposed merge, activation and rollback

GPT generated; context, prompt Erin Spencer. Prepared 2026-11-10.

**A0 merge authorized on 2026-11-10; deployment and companion merge remain held.**
The authorized A0 merge must pass current-head/base admission after reconciling
main's documentation-only GUI audit and G15 inspector contract. The provider receipt records execution.
These are proposals for the existing authenticated VM shell and phone terminal.
They do not establish host access, current runtime versions, available sudo,
off-VM recovery or a successful deployment. Do not run the fresh installer.

## Frozen inputs and merge operations

A0 repair input: `6bbcf0f06713319f4f6bbfeaed735197033c4465`.
Erin approved A0 #122 at `c9775eba868fd70854b105be4ec0bf823cee9b54`.
Main then advanced through the documentation-only GUI audit (#124) and G15
MSDMD inspector contract (#125), requiring
a canonical-record conflict resolution. `A0_RELEASE` is the resulting exact PR
head after renewed CI/review admission; executable code remains byte-identical
to the approved head. This reconciliation introduces no deployment authority.
The commit containing this document is its published output identity; inspect
`git rev-parse HEAD`, never infer it from a moving branch name.

Companion release: `46ba3e680c21434dd03e79c0cbf900881829701e`.
Inspected current main bases: A0 `d4f43edfdee0f8ce41f8bfdbe4d7d5a56ef38f4e`,
skill-lib `8ee77a6630379e48844350d8666515389b94f4c8`.

**Current admission:** A0's repaired branch incorporates current main. Companion
#137 conflicts only in generated `skill-lib_msdmd.ts` after main's #138 addition.
The second merge command below is a proposed operation, **blocked** until that
collection is regenerated and the new head/base passes CI/review. Its head will
then change: replace the old expected SHA only in a new explicit approval.
Do not apply the current two-repository deployment sequence while it is blocked.

Immediately before merging, re-read both head/base pairs, checks, effective
reviews, unresolved threads, mergeability and branch protections. Any movement
invalidates this admission; recheck the changed source before proceeding.
Completed bot review is distinct from an APPROVED review required by policy.
Use provider enforcement; no administrator bypass, force push, auto-merge or
branch deletion. Merge producer A0 first, then the companion:

```bash
# A0 authorization granted; bind A0_RELEASE to the newly admitted exact head.
gh pr merge 122 --repo The-Interdependency/a0 --merge --match-head-commit "$A0_RELEASE"
# BLOCKED: separate companion repair, review and explicit approval still required.
gh pr merge 137 --repo The-Interdependency/skill-lib --merge --match-head-commit 46ba3e680c21434dd03e79c0cbf900881829701e
```

If the first succeeds and the second fails, stop; record the partial merge and
do not activate the launcher. A merge has no VM side effect. Record merge SHAs
and resulting main CI separately. Deploy only the approved source identity,
which must be an ancestor of the merged main; do not substitute later main.

## Required private preflight

Before activation, verify the actual VM identity against the owner's existing
trusted connection. `docs/release.md` records historical host `a0-prod-1`;
that record is not a current authentication receipt. Keep SSH host verification
and recovery shell access. No secret values may appear in a public receipt.

Check the following and stop on any mismatch:

- `/opt/a0` is the expected clean successor checkout with no local work to lose;
  service working directory is `/opt/a0`, and its Node executable is version 22
  or later. The historical release record reports Node 18; runtime upgrade is
  a separate required decision if that remains true. Do not assume a login
  shell's Node is the systemd Node.
- Inventory app/schema, OpenBao binary/config/store/cluster pin, service units,
  timer state, listeners, free space and existing CLI processes. Confirm the
  unprivileged coding account, authorized sudo and HTTPS origin privately.
- Preserve root-owned copies of `/etc/a0`, `/etc/openbao`, installed
  `/usr/local/lib/a0` tools and the renewal units. Record their existence and
  prior timer state, not credential contents. Retain the old source and locked
  dependencies. Retain the original build-info file independently.
- Have the owner-controlled off-VM backup destination and applicable backup
  passphrase, current/historical seal keys, recovery authorization and role
  passwords. Recovery keys do not replace a lost static seal key. Existing root
  token validity must be checked; do not generate a replacement vault.
- A backup is consistent only with all app/media/vault credential writers
  quiesced. Stop A0 for the snapshot; pause any other authorized vault writer.
  Vault and PostgreSQL stay running. Do not stop unrelated workloads.
- Choose unused isolated databases/media suffix and loopback ports 8203/8204.
  `restore.sh` replaces its named isolated targets; they must contain no work.
  Rehearsal must finish with `CANARY_OK` before provisioning.

Read-only inventory commands in the authenticated VM shell:

```bash
hostname
id
/usr/bin/node --version
python3 --version
df -h /opt/a0 /srv/a0
sudo git -C /opt/a0 status --short
sudo git -C /opt/a0 rev-parse HEAD
sudo systemctl show a0 -p User -p WorkingDirectory -p ExecStart
sudo systemctl is-active a0 openbao a0-caddy
sudo systemctl is-enabled a0-vault-renew.timer
sudo ss -ltn
```

An absent timer is a recorded pre-rollout state, not evidence of renewal failure.
Inspect protected files in a privileged process that emits only nonsecret
shape/permission/identity checks. Never print an environment dump, `init.json`,
a token, the pairing file or raw provider responses.

## Staging and pre-change recovery

The following variables name a specific approved release and private checkpoint.
Open a child shell with `bash` in the verified VM session, then keep all VM
blocks in that same child shell so their checkpoint variables persist. Use the
actual non-root coding account. No commands below paste credentials.

```bash
# After approval and preflight; preserve this variable set in the private receipt.
# Set A0_RELEASE to the exact approved PR head before starting this block.
set -euo pipefail
umask 077
[[ "$A0_RELEASE" =~ ^[0-9a-f]{40}$ ]]
CLI_USER=$(id -un)
[[ $(id -u) != 0 ]]
PREVIOUS=$(sudo git -C /opt/a0 rev-parse HEAD)
STAGE="/opt/a0-release-$A0_RELEASE"
CHECKPOINT="/root/a0-before-$A0_RELEASE"
[[ -z $(sudo git -C /opt/a0 status --porcelain) ]]
sudo git -C /opt/a0 fetch origin main
sudo git -C /opt/a0 merge-base --is-ancestor "$A0_RELEASE" origin/main
sudo git -C /opt/a0 worktree add --detach "$STAGE" "$A0_RELEASE"
sudo npm ci --ignore-scripts --omit=dev --prefix "$STAGE"
sudo install -d -m 0700 "$CHECKPOINT"
sudo cp -a /etc/a0 /etc/openbao "$CHECKPOINT/"
# Preserve code, dependencies and the build record, without copying .git worktree metadata.
sudo rsync -a --exclude .git /opt/a0/ "$CHECKPOINT/release/"
sudo bash -s -- "$CHECKPOINT" <<'SAVE'
set -euo pipefail
umask 077
checkpoint=$1
mkdir -p "$checkpoint/admin"
for path in /usr/local/lib/a0/configure-vault.py /usr/local/lib/a0/a0-vault-renew.service /usr/local/lib/a0/a0-vault-renew.timer /etc/systemd/system/a0-vault-renew.service /etc/systemd/system/a0-vault-renew.timer; do
  if [[ -e "$path" ]]; then
    cp -a --parents "$path" "$checkpoint/admin/"
  else
    printf '%s\n' "$path" >> "$checkpoint/absent-admin-files"
  fi
done
systemctl is-enabled a0-vault-renew.timer > "$checkpoint/timer-enabled" 2>/dev/null || :
systemctl is-active a0-vault-renew.timer > "$checkpoint/timer-active" 2>/dev/null || :
SAVE
sudo python3 "$STAGE/operations/configure-vault.py" --check-recovery
sudo systemctl stop a0.service
sudo bash "$STAGE/operations/backup.sh" "$CHECKPOINT/backups"
# Select the single newly created archive from this dedicated checkpoint.
BACKUP=$(sudo find "$CHECKPOINT/backups" -maxdepth 1 -name '*.tar.gz.gpg' -type f)
[[ -n "$BACKUP" && "$BACKUP" != *$'\n'* ]]
sudo bash "$STAGE/operations/restore.sh" "$BACKUP" pr122preflight
```

Copy the encrypted archive and separately protected recovery material to the
verified off-VM destination before activation. Verify the transferred artifact
digest and owner access without publishing private paths or keys. The exact
transfer command depends on that observed destination and remains **hmmm**;
no destination or authentication is invented here. If it is unavailable, stop
before provisioning. If preparation fails, restore service availability using
the unchanged original release/config after its health check; if readiness
fails, keep A0 stopped and use the recovery shell.

## App activation and provisioning

Continue only after the snapshot and isolated restore pass. Keep database,
OpenBao, seal key, Caddy, provider values and unrelated workloads intact.
The `/opt/a0` checkout must remain at `PREVIOUS` until the guarded source switch.

```bash
[[ $(sudo git -C /opt/a0 rev-parse HEAD) == "$PREVIOUS" ]]
sudo git -C /opt/a0 checkout --detach "$A0_RELEASE"
# Use exactly the staged lockfile dependencies; do not update the lockfile.
sudo rsync -a --delete "$STAGE/node_modules/" /opt/a0/node_modules/
sudo bash /opt/a0/operations/install-vault-tools.sh
# Refresh the source identity read by /api/health, without secret configuration.
sudo python3 - "$A0_RELEASE" <<'PY'
import datetime, json, pathlib, sys
p = pathlib.Path('/opt/a0/build-info.json')
p.write_text(json.dumps({'commit': sys.argv[1], 'dirty': False,
    'builtAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}) + '\n')
p.chmod(0o644)
PY
sudo python3 /usr/local/lib/a0/configure-vault.py --cli-user "$CLI_USER"
sudo systemctl is-active --quiet a0.service
sudo systemctl is-active --quiet a0-vault-renew.timer
sudo systemctl start a0-vault-renew.service
sudo systemctl show a0-vault-renew.service -p Result -p ExecMainStatus
```

Provisioning modifies KV policies and protected credential/config files, enables
hourly renewal, restarts only A0 and checks local readiness. It replaces inline
`BAO_TOKEN` with `BAO_TOKEN_FILE` and pins `BAO_CLUSTER_ID`. It never receives
`--initialize` here. Token creation can leave valid scoped tokens even if a later
readiness check fails; record and reconcile that state without automatic retry.

Check authenticated external HTTPS status, exact build identity and served
`app.js` digest against this source. `/api/health` metadata alone is insufficient.
Test owner sign-in, saved data and bridge denial without credentials. Do not run
the production-directed broad acceptance harness as an installation smoke test.

## Launcher and private Site pairing

In Termux, retain the previous launcher revision and symlink targets, then:

```bash
git -C "$HOME/skill-lib" status --short
git -C "$HOME/skill-lib" fetch origin main
git -C "$HOME/skill-lib" merge-base --is-ancestor 46ba3e680c21434dd03e79c0cbf900881829701e origin/main
# Stop if local changes exist; preserve them before this explicit source switch.
git -C "$HOME/skill-lib" checkout --detach 46ba3e680c21434dd03e79c0cbf900881829701e
bash "$HOME/skill-lib/tools/install_ai.sh"
ai.sh vault install
ai.sh keys
# Owner downloads the pairing file from the private Site's Live VM panel.
ai.sh site pair /sdcard/Download/a0-site-connection.json
ai.sh site status
rm -- /sdcard/Download/a0-site-connection.json
```

Do not repeat `vault setup` after successful VM provisioning. Pairing restarts
A0 and checks readiness. The Site stays owner-private; its runtime bearer must
match the file delivered over SSH stdin. No provider values enter the Site.
Restart only an explicitly selected coding pane after preserving its work:
`ai.sh restart codex`, `ai.sh restart grok`, or `ai.sh restart deepcode`.
Existing panes retain their old environment until restarted. Agent startup
must use only the selected provider credential; test actual provider success
separately. A handoff's `received` receipt proves storage, not execution.

## Rollback requirements and concrete safe fallback

Stop on failed readiness, identity mismatch, pairing leakage, unexpected schema
change or failed isolation. The immediately available rollback is maintenance:

```bash
sudo systemctl stop a0.service
sudo systemctl disable --now a0-vault-renew.timer
```

This leaves Bao, PostgreSQL, the recovery shell and persistent data intact.
Disable access through the private Site while investigating. Do not delete the
vault, regenerate seal keys, initialize, restore stale provider environment
values or boot archived A0.

Returning to the prior successor requires the retained source/dependencies,
original private `a0.env`, original build-info and a still-valid original scoped
app credential. Verify that credential and policy privately against the pinned
cluster before restarting; if it has expired, remain in maintenance until a
reviewed scoped replacement/configuration migration is approved. No root token
may become the runtime credential. The old app expects inline `BAO_TOKEN`; a
source-only revert with the new configuration cannot satisfy its startup.

A private rollback credential check, before restoring configuration:

```bash
sudo python3 - "$CHECKPOINT/a0/a0.env" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location('admin', '/usr/local/lib/a0/configure-vault.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
try:
    prior = m.env_values(m.read_private(sys.argv[1]))
    current = m.env_values(m.read_private('/etc/a0/a0.env'))
    pin = current.get('BAO_CLUSTER_ID')
    token = prior.get('BAO_TOKEN')
    if not pin or not token:
        raise m.SetupError('Prior credential/config requires a separate migration.')
    addr = current.get('BAO_ADDR', 'http://127.0.0.1:8200')
    seal = m.inspect_store(addr, pin)
    if not seal['initialized'] or seal['sealed']: raise m.SetupError('Vault unavailable.')
    data = m.api(addr, 'GET', '/auth/token/lookup-self', token).get('data', {})
    policies = set(data.get('policies', []))
    if 'a0-app' not in policies or policies - {'a0-app', 'default'}:
        raise m.SetupError('Prior credential is not a scoped application identity.')
    ttl = data.get('ttl')
    if not isinstance(ttl, (int, float)) or (ttl != 0 and ttl < 3600):
        raise m.SetupError('Prior credential lacks a one-hour rollback window.')
except Exception:
    print('Rollback credential check failed; keep maintenance state.', file=sys.stderr)
    raise SystemExit(1)
print('Prior scoped credential verified; no values printed.')
PY
```

After that compatibility check, the proposed code/config rollback is:

```bash
sudo git -C /opt/a0 checkout --detach "$PREVIOUS"
sudo rsync -a --delete "$CHECKPOINT/release/node_modules/" /opt/a0/node_modules/
sudo cp -a "$CHECKPOINT/a0/a0.env" /etc/a0/a0.env
if sudo test -f "$CHECKPOINT/release/build-info.json"; then
  sudo cp -a "$CHECKPOINT/release/build-info.json" /opt/a0/build-info.json
else
  sudo rm -f /opt/a0/build-info.json
fi
sudo bash -s -- "$CHECKPOINT" <<'RESTORE_ADMIN'
set -euo pipefail
checkpoint=$1
for path in /usr/local/lib/a0/configure-vault.py /usr/local/lib/a0/a0-vault-renew.service /usr/local/lib/a0/a0-vault-renew.timer /etc/systemd/system/a0-vault-renew.service /etc/systemd/system/a0-vault-renew.timer; do
  if [[ -f "$checkpoint/admin$path" ]]; then
    cp -a "$checkpoint/admin$path" "$path"
  elif [[ -f "$checkpoint/absent-admin-files" ]] && grep -Fxq "$path" "$checkpoint/absent-admin-files"; then
    rm -f -- "$path"
  else
    echo 'Incomplete admin checkpoint; remain in maintenance.' >&2
    exit 1
  fi
done
RESTORE_ADMIN
sudo systemctl daemon-reload
sudo systemctl start a0.service
# Verify prior build, HTTPS readiness and saved data; stop A0 again on failure.
```

Do not restore the entire `/etc/openbao` tree during an app rollback. Preserve
new pairing/config files privately for diagnosis; revoke or replace an exposed
bridge token through the owner-controlled Site and VM settings. Resume a prior
renewal timer only when its original recorded configuration is compatible.
Review any unused scoped tokens for explicit revocation; do not revoke a token
still used by the app or another coding account.

`rollback.sh --check BACKUP` invokes the corrected isolated restore. It requires
active services and uses the fixed `rollbackcheck` isolated suffix, which must
be disposable. **Do not use `rollback.sh --apply` for this rollout:** that older
procedure restores app DB/media/source but does not reverse vault policies,
token-file configuration, renewal units or launcher state. Database rollback
would discard post-snapshot changes and needs a separate explicit operation.
Keep the checkpoint and independent recovery material until the live gates pass.

## Acceptance still owed

Record exact deployed A0/launcher/Site identities, configuration fingerprints
without secrets, and source-vs-runtime scopes. Required live observations:

1. Successful isolated restore with real PostgreSQL, GPG, Bao, permissions,
   cluster identity, canary, records and attachment retrieval; off-VM retrieval.
2. App startup, authenticated HTTPS and Site pairing; unauthorized and
   wrong-cluster paths fail closed; duplicate handoffs retain one receipt.
3. Manual renewal plus at least two scheduled timer executions and a token
   lookup after the original 24-hour expiry boundary; no root fallback.
4. Selected-provider isolation and real configured-provider requests. Stored
   credential presence alone does not close this gate.
5. Physical Android history/recovery, model/comparison, attachment and audio
   flows. Existing browser fixtures cannot close A17/A18.
6. Compatible rollback rehearsal and service recovery. A shared-host reboot
   remains separately authorized; do not restart unrelated services to claim it.

hmmm: actual VM inventory/access, off-VM destination, current credential validity,
exact rollback checkpoint, sustained renewal, provider success and physical-phone
acceptance remain unobserved. Deployment approval cannot manufacture these facts.
