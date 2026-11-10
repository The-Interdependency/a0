# A0 build status — canonical resumption record

Updated: 2026-11-10 (America/Los_Angeles).
GPT generated; context, prompt Erin Spencer.

## Current work and source identities

**PR #122: scoped OpenBao credentials, renewal, private reliability bridge and
recovery compatibility. Source verification is complete locally; merge and VM
deployment are held for Erin's explicit approval.**

| Participant | Exact inspected input / role |
| --- | --- |
| A0 PR #122 | `6bbcf0f06713319f4f6bbfeaed735197033c4465`; branch `codex/a0-openbao-site-20261108`; corrections are the commit containing this record |
| A0 main base | `4656cd3f841b896ad3a6a104a5c9caca2031ca51` |
| skill-lib PR #137 | `46ba3e680c21434dd03e79c0cbf900881829701e`; unchanged compatibility peer; owns `tools/ai.sh` and `tools/a0_vault.py` |
| Current build doctrine / skill-lib main | `6a16302f0b7ad6e2ed5331ee1423fcc0939e1d57` |
| Private Site consumer | `7bbe73ba4e5e0ea99dd4f7e293eea309c77cfd0d`; local source identity verified; current hosted release not reverified here |
| OpenBao selected fork | `4a8f475e88e4fa0c76ae1645a22faffe5596d361`; no binary/store/seal change in this correction |

The updated [shared work graph](work-graphs/a0-site-bridge.json) pins these input
participants and preserves their separate authority/evidence boundaries. The
output commit and GitHub CI receipts bind the corrected source; obtain the full
output SHA with `git rev-parse HEAD`. Public records contain no operational keys.
No unrelated working-tree changes were included. No VM or provider job was started.

## Repairs and preserved contracts

- `configure-vault.py` now owns one recovery reader for JSON and historical
  key/value material. It retains values containing `=`, rejects duplicate,
  missing, empty, non-string, malformed and header-unsafe credentials, refuses
  unsafe/nonregular/symlink files, and never evaluates shell syntax.
- `backup.sh` and `restore.sh` validate material before side effects and call
  administrative canary modes. Tokens stay inside Python, outside shell
  arguments/environment/output. Redirects, failed authentication, bad JSON,
  unavailable/sealed/uninitialized stores and identity mismatch fail closed.
- New encrypted archives include a nonsecret cluster/mount receipt. Restoration
  checks that identity and the original canary. Historical archives without a
  receipt require the independently configured cluster pin; missing identity
  cannot be guessed. Private temporary files are cleaned on failure and success.
- Existing application/CLI token separation, root-owned renewal code,
  `a0.cli-vault/1`, `a0.site-pairing/1`, bridge scope and provider dispatch remain
  intact. The CLI reads only its selected provider; no root/app token is passed
  to coding agents. The completed launcher PATH repair is preserved.

## Executed source verification

Local environment: Node `v24.22.1`, Python `3.12.14`, Playwright `1.56.1`,
Chromium `141.0.7390.37`. These results bind the code/test files committed with
this record; documentation does not promote them to VM acceptance.

| Command / evidence | Observed result and limit |
| --- | --- |
| `python3 -m unittest discover -s tests/reliability -p 'test_*.py'` | 17 tests PASS: 6 provisioning + 11 recovery; real loopback HTTP and actual shell scripts; database/crypto/service boundaries are inert fixtures |
| `node --test tests/reliability/bridge.test.js` | 3 tests PASS: auth separation, deduplicated inbox, rate/path controls, token rotation and cluster refusal |
| `npm run test:offline` | 13 Markdown + 17 Responses assertions PASS; no live provider request |
| `npm run test:browser` | 40 tests PASS, no skips/cancellations; real app/CSS with fixture APIs/speech; first attempt lacked Chromium, then the pinned browser was installed and the full suite passed |
| `python3 tests/reliability/check_launcher_compat.py ../skill-launcher` | PASS: this A0 producer creates the CLI configuration consumed by skill-lib `46ba3e6`; real HTTP fixture plus child-process selected-key isolation |
| In that skill-lib checkout: `python3 -m unittest discover -s tests -p 'test_a0_vault.py'` and `... -p 'test_ai_launcher.py'` | 6 + 7 PASS; includes the completed login executable/runtime PATH review regression |
| Seeded historical `grep '^root_token='` reader | JSON shell regression FAILS as intended; this demonstrates regression sensitivity, not an outstanding repaired-source failure |
| Shell syntax and `git diff --check` | PASS; CI now checks each affected shell script separately |

Prior-head remote evidence: [A0 Web regressions](https://github.com/The-Interdependency/a0/actions/runs/42514050299)
at `6bbcf0f`; [skill-lib CI](https://github.com/The-Interdependency/skill-lib/actions/runs/42514504885)
and [hygiene](https://github.com/The-Interdependency/skill-lib/actions/runs/42514504884)
at `46ba3e6` all completed successfully. The
[skill-lib review receipt](https://github.com/The-Interdependency/skill-lib/pull/137#issuecomment-6725811515)
reports completed review with no findings at that exact head; its earlier PATH
thread is resolved and outdated. This is not a policy-required APPROVED review.

The corrected A0 head needs its own CI/review receipt on
[PR #122](https://github.com/The-Interdependency/a0/pull/122). Recheck head/base,
checks and unresolved threads at merge admission; old green results do not
certify a new head. GitHub's conflicting advanced CodeQL workflow was removed
in the input PR; default analysis remains active. Do not repeat the obsolete
mobile-repair instruction to resolve that old configuration conflict.

## Deployment prerequisites and configuration transition

Use the [exact proposed operations](pr122-operations.md), including its approval
holds, preflight and rollback gates. The historical application path is `/opt/a0`;
actual host, source, schema, Node executable and services must be inspected before
activation. Historical Node 18 does not meet the current Node >=22 contract.

The existing-store procedure installs root-owned administration files, then runs
`sudo python3 /usr/local/lib/a0/configure-vault.py --cli-user <verified-account>`.
It writes separate periodic `a0-app` and read-only `a0-cli` tokens, changes
`BAO_TOKEN` to `BAO_TOKEN_FILE`, pins `BAO_CLUSTER_ID`, enables hourly renewal,
restarts A0 and checks local readiness. **Do not initialize this existing vault.**
First preserve configuration/recovery material, quiesce writers, create an
encrypted backup, verify an isolated restore and verify the off-VM copy.

Pair only after VM readiness and launcher installation. The owner downloads the
pairing file from the private Site, then runs `ai.sh site pair FILE` over SSH
stdin and deletes the download after success. Pairing requires the matching
VM origin, CLI config, protected bridge-token files and private Site runtime
credential. Provider keys remain on the VM. Existing coding panes require an
explicit restart to replace their environment; preserve their work first.

Durable paths: `/srv/a0/media` (uploads, reliability inbox/evidence), PostgreSQL
`a0app` / `openbao`, `/etc/a0` (protected application/CLI/renewal configuration),
`/etc/openbao` (seal/recovery material), `/srv/a0/backups` (encrypted archives).
These are source-defined paths, not fresh observations of the VM.

## Recovery and remaining acceptance gates

Use [operations/VAULT-SITE.md](../operations/VAULT-SITE.md) for recovery semantics
and [pr122-operations.md](pr122-operations.md) for the proposed sequence.
Keep the exact prior source/dependencies, private configuration and applicable
current/historical keys independent of the app. Source rollback alone cannot
reverse the `BAO_TOKEN_FILE` transition. If the prior scoped credential/config
cannot be verified, stop A0 in maintenance while retaining vault/data and the
recovery shell. `rollback.sh --apply` is not suitable for this configuration
transition; it does not restore vault policies, tokens, timer or launcher state.

| Gate | Current evidence status |
| --- | --- |
| Corrected A0 CI and terminal review | Read the corrected-head PR receipt before merge |
| Merge A0 #122 then skill-lib #137 | NOT PERFORMED; explicit approval required |
| Current VM inventory, runtime compatibility and checkpoint | NOT OBSERVED in this task |
| Real GPG/PostgreSQL/Bao isolated restore and independent off-VM retrieval (A13) | NOT RUN for this release; local fixtures do not close it |
| VM deployment, exact served-source/build identity and authenticated HTTPS (A24) | NOT PERFORMED; separate explicit approval required |
| Site pairing / authorized evidence / denied unauthorized access | NOT RUN on the VM for this release |
| Renewal across scheduled executions and original 24-hour token lifetime | NOT OBSERVED; instantaneous fixture renewal is insufficient |
| Real provider success with isolated selected credentials (A04/A11) | NOT RUN for this release; stored-key presence is insufficient |
| Physical Android recovery/comparison/files/microphone/speaker (A17/A18) | NOT RUN; browser emulation is a separate result |
| Prior-release/config rollback and restart; shared-host reboot when authorized | NOT RUN for this release |

## Next action / running work

Finish current-head CI/review and present the frozen merge and deployment
operations for Erin's approval. No merge, deployment, token provisioning,
service restart or production recovery was performed by this source repair.
There are no local background tests remaining at handoff; remote CI/review
status belongs to the PR receipt, not an inferred running VM state.

Previous mobile/issue #118/#119/#120 receipts remain in Git history at
[the inspected input record](https://github.com/The-Interdependency/a0/blob/6bbcf0f06713319f4f6bbfeaed735197033c4465/docs/build-status.md),
[mobile-chat-repair.md](mobile-chat-repair.md), [acceptance.md](acceptance.md)
and [release.md](release.md). Their dated live claims do not establish this
release's deployment or current phone behavior.

hmmm: merge/deployment approval, VM access/current inventory, off-VM recovery,
sustained renewal, live provider and physical Android evidence remain open.
