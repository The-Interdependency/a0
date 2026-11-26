---
name: ssh-automation
description: Fail-closed SSH automation and shell-script delivery for OpenSSH and Google Cloud. Load this when writing, reviewing, or troubleshooting non-interactive SSH scripts, CI/CD remote commands, scp/sftp/rsync-over-SSH workflows, Google Cloud IAP or OS Login automation, remote heredocs, host-key bootstrap, retries and timeouts, or one-box Cloud Shell commands that must not terminate the user's interactive shell. Do not load for one-off interactive login, server-side sshd hardening alone, or MCP-based VM control planes.
---

# ssh-automation — prove the endpoint before crossing it

The central boundary is:

```text
local shell != SSH option parser != remote shell != privileged operation
```

Every boundary must receive either fixed syntax or explicitly validated data.
Encryption does not make an unverified endpoint trustworthy, and correct local
quoting does not preserve remote argument boundaries automatically.

## Trigger / non-trigger

Load this skill for:

- Bash or shell scripts that invoke `ssh`, `scp`, `sftp`, or `rsync -e ssh`;
- CI/CD, deployment, backup, maintenance, or diagnostic commands over SSH;
- host-key provisioning, `known_hosts`, SSH certificates, jump hosts, or IAP;
- remote commands, quoted heredocs, stdin forwarding, PTY selection, or sudo;
- bounded retry, timeout, idempotency, locking, rollback, or SSH exit handling;
- a large Cloud Shell or terminal paste that contains SSH or remote setup work;
- review of a script that uses `ssh-keyscan`, `sshpass`, agent forwarding, or
  relaxed host-key checking.

Do not load it for:

- one ordinary interactive login with no generated or repeatable automation;
- server-side `sshd_config` hardening when no client automation is involved;
- a generic deployment design that uses no SSH transport;
- an MCP-based VM control plane; use `vm-mcp` when that skill exists and is the
  actual requested boundary.

## Kind and source of truth

This is a **procedural skill**. It defines no new msdmd block and ships no SSH
wrapper whose defaults could silently become environment authority.

Source priority:

1. observed target identity, operating system, account, privilege model, and
   recovery path;
2. the exact OpenSSH client version and its current official manual pages;
3. the cloud provider's current official access, identity, tunnel, and audit
   documentation;
4. this skill's doctrine and reviewed templates;
5. `hmmm` for unresolved endpoint identity, host-key provenance, privilege, or
   rollback behavior.

Primary-source research used to establish this version is recorded in
[`references/primary-sources.md`](references/primary-sources.md).

## Required declarations before generating a script

Resolve or visibly mark all of these:

```text
execution_mode: saved-script | CI | one-box-paste | interactive-assisted
local_shell: bash version or hmmm
target: exact hostname / instance identity / account
target_selection: fixed | validated allowlist | hmmm
network_path: direct | ProxyJump | VPN | Google IAP | other
host_trust: verified known_hosts | host CA | bounded TOFU | hmmm
authentication: explicit identity | short-lived certificate | OS Login | other
remote_shell: bash | POSIX sh | fixed program | hmmm
stdin_use: none | remote script | data stream
pty: disabled | required with reason
privilege: none | sudo -n named command | other
operation_idempotent: true | false | hmmm
retry_contract: none | bounded transport retry
rollback: exact action | not applicable | hmmm
secrets: locations and redaction boundary
```

Do not silently choose a username, project, zone, host, key, `known_hosts`
source, remote shell, or privileged command.

## Canonical client posture

Start from an option array so each local argument remains one argument:

```bash
SSH_OPTS=(
  -T
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=${KNOWN_HOSTS}"
  -o ConnectTimeout=10
  -o ConnectionAttempts=1
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
  -o ForwardAgent=no
  -o ClearAllForwardings=yes
)
```

Adjust values to the observed environment. Preserve these rules:

- `BatchMode=yes` makes missing credentials or host confirmation fail instead of
  prompting inside automation.
- `IdentitiesOnly=yes` limits authentication to configured identity and
  certificate files instead of offering every identity in an agent.
- `StrictHostKeyChecking=yes` is the production default. Supply a dedicated,
  verified `known_hosts` file or host-certificate authority.
- `ForwardAgent=no` is the default. Prefer `ProxyJump`, a VPN, or a provider
  tunnel to exposing the local authentication agent to another host.
- `-T` / `RequestTTY=no` is the automation default. Do not allocate a PTY merely
  to make an interactive sudo policy appear to work.
- `ConnectionAttempts=1` leaves retry policy to one visible outer loop rather
  than multiplying nested retries.
- encrypted server-alive probes bound dead sessions; they are not an
  application-level health check.
- `ClearAllForwardings=yes` prevents inherited client configuration from opening
  tunnels the script did not declare. When forwarding is intentionally used,
  declare it explicitly and add `ExitOnForwardFailure=yes`.

Inspect the effective configuration before relying on it:

```bash
ssh -G "${SSH_OPTS[@]}" "${TARGET}" >ssh-effective-config.txt
```

Review at least `hostname`, `user`, `port`, identity files, proxy/jump settings,
host-key files, strict-host-key policy, forwarding, PTY, and agent forwarding.

## Host identity and trust

|∆|Host-key verification is endpoint authentication, not optional noise.|∆|

Use one of these, strongest first:

1. a trusted SSH host certificate authority;
2. exact host keys provisioned through an authenticated, independent channel;
3. provider-managed identity and access flow whose trust boundary has been
   explicitly inspected;
4. `StrictHostKeyChecking=accept-new` only as a declared, bounded trust-on-first-
   use bootstrap where substitution risk is accepted. It must still reject a
   changed host key.

`ssh-keyscan` retrieves what the network presents. It does **not** authenticate
that result. Compare its fingerprints through an independent trusted channel
before installing them. Do not create `known_hosts` with an unverified
`ssh-keyscan` pipeline and then describe the connection as verified.

Reject these defaults:

```text
StrictHostKeyChecking=no
StrictHostKeyChecking=off
UserKnownHostsFile=/dev/null
an unverified ssh-keyscan result
```

A changed host key is a stop condition. Investigate and rotate trust through a
separate authenticated path; do not delete the old entry simply to make the
script continue.

## Authentication and privilege

- Use a dedicated least-privileged automation principal.
- Prefer short-lived certificates, hardware-backed identities, or managed
  identity such as Google OS Login over long-lived copied private keys.
- Never place a password, private key, service-account JSON key, OAuth refresh
  token, or passphrase in source, arguments, logs, or prompt text.
- Do not use `sshpass` as an automation foundation.
- Set `umask 077`; create temporary credential/config directories with
  `mktemp -d`; remove them in a trap; disable tracing around secrets.
- Use `sudo -n` so privilege failure is immediate and non-interactive. Grant the
  narrow named operation, not `sudo bash -c <model-or-user-text>`.
- Never solve sudo prompting by forcing a PTY and piping a password.

## Remote command and data boundary

OpenSSH remote command arguments are joined with spaces before sending one command
string to the server. A local array therefore does **not** become a remote argv
array. Treat the remote side as a second shell parse.

Preferred shape: fixed remote interpreter plus a locally literal script.

```bash
ssh "${SSH_OPTS[@]}" "${TARGET}" 'bash -se' <<'REMOTE'
set -Eeuo pipefail

printf 'remote host: %s\n' "$(hostname)"
# Fixed reviewed operations only.
REMOTE
```

The quoted `REMOTE` delimiter prevents the local shell from expanding remote
variables, substitutions, or backslashes. Use `sh -se` only when the script is
actually POSIX shell. Name the interpreter explicitly; do not depend on an
unknown login shell or profile.

For dynamic data:

- validate identifiers against a closed allowlist whenever possible;
- transfer structured data as a separate file with `sftp`, `scp`, `rsync`, or a
  checked stream, then invoke a fixed remote command that consumes it;
- verify a digest before activation when the file controls deployment;
- never append untrusted text to a remote command string;
- do not use `eval` on either side;
- treat `printf %q` as Bash-specific encoding that still requires the remote
  Bash version and tests; it is not the default cross-shell protocol.

## stdin and PTY rules

- Use `-T` for scripts unless a reviewed command genuinely requires a terminal.
- Use `-n` / `StdinNull=yes` only when SSH must not consume stdin.
- Do **not** use `-n` when stdin carries a remote heredoc, archive, or data
  stream.
- Do not combine a remote script and unrelated data on the same stdin without a
  defined framing protocol.
- A transparent no-PTY session is preferred for machine-readable and binary
  streams.

## Retry, timeout, and exit semantics

OpenSSH returns the remote command's status, or `255` when SSH itself reports an
error. A remote program can also return `255`; that value alone cannot always
prove a transport failure.

Retry only when all are true:

```text
operation is idempotent or protected by a durable operation identifier
the failure is classified as retryable by an explicit contract
attempt count is bounded
backoff is bounded
the final failure is returned unchanged
```

Use one retry layer. Do not combine OpenSSH connection retries, shell loops,
workflow-engine retries, and supervisor retries without calculating their
product. When a remote operation may legitimately return `255`, use a structured
receipt or a wrapper with reserved application statuses before treating `255`
as transport-only.

## Idempotency, locking, activation, and rollback

For mutations, separate the operation into:

```text
inspect -> acquire lock -> stage -> verify -> atomically activate -> health check
        -> record receipt -> release lock
                              \-> rollback on failed verification/health
```

Recommended practices:

- use `flock` or an application-native lock to prevent concurrent deployment;
- upload to a temporary path on the destination filesystem;
- verify digest, ownership, mode, and expected identity;
- use an atomic rename for activation when the filesystem permits it;
- restart only the named service through `sudo -n`;
- run a real readiness/health check after activation;
- preserve the previous known-good release until the new release passes;
- run the script twice in testing and prove the second execution is safe;
- emit an operation receipt with target identity, source identity, action,
  status, timestamps, and rollback result—never secrets.

## Safe one-box terminal delivery

A large paste must not install shell options, traps, `exit`, or `exec` into the
user's current interactive shell. Run the paste inside a child shell:

```bash
bash <<'LOCAL'
set -Eeuo pipefail
trap 'rc=$?; printf "failed: %s (status %s)\n" "$BASH_COMMAND" "$rc" >&2' ERR

# Commands, including SSH, run in this child shell.

LOCAL
```

Rules for copy-paste boxes:

- quote the `LOCAL` delimiter so the current shell does not pre-expand content;
- do not place `set -e`, `exit`, `exec`, option-changing `shopt`, or broad traps
  directly in the user's interactive shell;
- do not put `read`, `select`, or another stdin prompt inside a multi-line paste:
  following pasted lines may be consumed as the answer;
- perform any necessary confirmation as a separate command before the large
  paste, or derive confirmation from an already selected, visibly printed
  project/target;
- keep the child shell open only for the operation; returning or exiting from it
  must leave the parent Cloud Shell alive;
- print the exact failing command and preserve its status without printing
  secrets.

## Google Cloud profile

For Google Compute Engine:

- prefer OS Login for account lifecycle and Identity and Access Management
  authorization;
- require multi-factor authentication where applicable;
- prefer Identity-Aware Proxy TCP forwarding and VMs without public SSH ingress;
- force the path with `gcloud compute ssh ... --tunnel-through-iap` when IAP is
  the declared network route;
- scope the firewall to IAP's documented TCP-forwarding source range and port
  `22`; remove broad default SSH ingress when not required;
- enable IAP Data Access logs and monitor successful and failed IAP/OS Login
  attempts;
- do not put service-account keys on a phone, in Cloud Shell history, or in the
  script;
- preflight the active project, account, instance, zone, and access route before
  mutation;
- do not add `--quiet` merely to suppress an unresolved authentication or host-
  trust prompt. Make the prerequisite non-interactive first.

IAP is an access transport, not a bulk-transfer service. Use an artifact store
or another designed transfer path for large images and datasets.

## When shell is no longer the right implementation

Use shell for small wrappers around established commands. Move to Python, Go,
Ansible, Terraform, cloud-init, or another structured system when:

- the script exceeds roughly 100 lines;
- control flow, state reconciliation, parsing, or rollback becomes complex;
- multiple operating systems or shells must be supported;
- durable transactions, rich receipts, or concurrent orchestration are needed;
- correctness depends on safely transporting arbitrary structured input.

SSH may remain the transport while a structured remote program owns semantics.
Persistent machine state should normally move into reviewed infrastructure or
configuration management rather than an ever-growing SSH paste.

## Workflow

1. **Classify the execution mode.** Saved script, CI job, assisted interactive
   command, and one-box paste have different stdin and parent-shell boundaries.
2. **Resolve the endpoint.** Pin target, account, port, network path, host-key
   provenance, and authentication identity.
3. **Resolve the remote contract.** Name interpreter/program, stdin use, PTY,
   privilege, expected statuses, and application receipt.
4. **Choose the mutation contract.** Establish idempotency, lock, staged
   activation, health verification, rollback, and retry eligibility.
5. **Generate the smallest command.** Use arrays locally, a fixed remote entry
   point, quoted heredocs, and separately transferred dynamic data.
6. **Contain paste effects.** For a multi-line copy-paste, wrap the complete
   operation in a quoted child-shell heredoc and include no embedded prompt.
7. **Validate statically.** Run syntax checks, ShellCheck, and inspect `ssh -G`.
8. **Attack the failure paths.** Exercise unknown/changed host keys, wrong
   identity, unavailable network, timeout, remote nonzero, interruption,
   concurrency, and rollback.
9. **Run against a disposable target.** Prove first run, second run, and failure
   recovery before production.
10. **Report observed evidence.** Distinguish commands actually executed from
    commands derived for another environment; carry all remaining unknowns as
    `hmmm`.

## Output shape

When this skill is active, return or maintain:

```text
mode:
target identity:
network path:
host trust and provenance:
authentication identity:
effective SSH options:
stdin / PTY contract:
remote command and data protocol:
privilege boundary:
idempotency / lock / retry:
verification / rollback:
copy-paste or script:
validation actually executed:
commands not yet executed:
hmmm:
```

Usage guidance must accompany every generated script: prerequisites, exact
invocation, expected output, failure interpretation, retry boundary, rollback,
and how to remove temporary material.

## Validation

Run the applicable gates:

```bash
bash -n path/to/script.sh
shellcheck path/to/script.sh
ssh -G -F path/to/ssh_config target > /tmp/ssh-effective.txt
```

Then test against a disposable target:

- verified new host, unknown host, and deliberately changed host key;
- correct identity, wrong identity, and no available identity;
- unavailable address, handshake timeout, dead session, and interrupted client;
- remote success, ordinary nonzero, and remote `255`;
- no-PTY output, required stdin, and intentionally null stdin;
- concurrent execution and lock refusal;
- first run, second run, failed health check, and successful rollback;
- logs and receipts for secret leakage;
- one-box paste failure proving the parent interactive shell remains alive.

Static checks do not prove endpoint identity, provider authorization, remote
sudo policy, idempotency, health semantics, or rollback. Those require the
actual target or an honest `hmmm`.

## Anti-patterns

- `StrictHostKeyChecking=no`, `off`, or `UserKnownHostsFile=/dev/null` as a
  convenience default;
- trusting `ssh-keyscan` without independent fingerprint verification;
- `sshpass`, passwords in arguments, or private keys in repositories/prompts;
- agent forwarding to avoid installing proper jump/tunnel access;
- forcing a PTY for every command;
- building a remote command string from untrusted input;
- assuming local arrays preserve remote argv;
- combining `-n` with a heredoc that must reach the remote process;
- unlimited retries, retrying non-idempotent mutation, or stacking retry layers;
- `curl ... | ssh host bash`, mutable-branch execution, or activation without a
  content identity;
- passwordless generic root shells or Docker-socket access;
- placing `set -e`, `exit`, `exec`, or a `read` prompt directly in a large paste
  intended for an existing interactive terminal;
- claiming success, host verification, backup, health, or rollback when the
  command was only written and not executed.

## hmmm

- Host-key bootstrap is necessarily environment-specific; this skill refuses to
  invent an authenticated channel where none has been identified.
- OpenSSH behavior is the primary client contract. PuTTY, Dropbear, platform
  wrappers, and vendor-specific SSH clients need their own observed mapping.
- Exit `255` remains ambiguous when the remote application itself may emit it;
  reserve application statuses or add a structured receipt where the distinction
  is load-bearing.
- Exact OS Login, IAP, SSH-certificate, and audit configuration remains owned by
  the current provider/project policy and must be rechecked before deployment.
- A tunnel can be secure while the command crossing it is nonsense; encryption
  has never been a substitute for knowing which shell is speaking.
