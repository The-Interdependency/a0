# Primary sources for `ssh-automation`

**Research date:** 2026-08-07

**Status:** source record for the current skill version; re-check current client
and provider documentation before changing operational defaults.

## OpenSSH / OpenBSD manuals

### `ssh_config(5)`

Source: https://man.openbsd.org/ssh_config

Load-bearing observations:

- `BatchMode=yes` disables interactive password and host-key confirmation
  prompts and is intended for scripts and batch jobs.
- `StrictHostKeyChecking=yes` refuses unknown automatic additions and changed
  host keys; `accept-new` adds previously unseen keys but still rejects changed
  keys; `no`/`off` can proceed with changed keys subject to restrictions.
- `IdentitiesOnly=yes` limits authentication to configured identities and
  certificates rather than every identity offered by an agent.
- `ConnectTimeout`, `ConnectionAttempts`, `ServerAliveInterval`, and
  `ServerAliveCountMax` expose bounded connection and dead-session behavior.
- `StdinNull=yes` / `-n` prevents SSH from reading stdin.
- `ControlPath` should contain `%h/%p/%r` or `%C` and live in a directory not
  writable by other users.
- `ForwardAgent` carries explicit risk because a remote attacker able to access
  the forwarded socket can use the loaded identities.
- `ClearAllForwardings` and `ExitOnForwardFailure` make forwarding state
  explicit and fail when requested forwarding cannot be established.

### `ssh(1)`

Source: https://man.openbsd.org/ssh

Load-bearing observations:

- additional remote command arguments are joined with spaces before being sent
  to the server; this is not a preserved remote argv boundary;
- `-T` disables pseudo-terminal allocation;
- without a PTY, the session is transparent and can reliably carry binary data;
- agent forwarding should be used cautiously and a jump host may be safer;
- SSH returns the remote command's status, or `255` when SSH reports an error.

### `ssh-keyscan(1)`

Source: https://man.openbsd.org/ssh-keyscan

Load-bearing observation:

- a `known_hosts` file built from unverified `ssh-keyscan` output leaves users
  vulnerable to man-in-the-middle attacks. Scanning discovers presented keys;
  verification requires an independent trusted channel.

## Shell language and analysis

### GNU Bash manual — redirections / here documents

Source: https://www.gnu.org/software/bash/manual/html_node/Redirections.html

Load-bearing observation:

- quoting a here-document delimiter prevents expansion in the body; an unquoted
  delimiter permits parameter, command, and arithmetic expansion.

### Google Shell Style Guide

Source: https://google.github.io/styleguide/shellguide.html

Load-bearing observations:

- shell is appropriate for small utilities and wrappers, not complex systems;
- scripts over roughly 100 lines or with non-straightforward control flow should
  move to a structured language;
- arrays with quoted `"${array[@]}"` expansion preserve argument boundaries;
- ShellCheck is recommended for scripts large and small.

### ShellCheck

Source: https://github.com/koalaman/shellcheck

Load-bearing observation:

- ShellCheck is a static-analysis tool for shell scripts and belongs in the
  validation gate; it does not prove remote identity or runtime semantics.

## Google Cloud access and audit

### Securing SSH access to virtual machines

Source: https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices

Load-bearing observations:

- use zero-trust network controls;
- restrict and promptly revoke login access;
- protect credentials with multiple factors;
- maintain a reliable SSH audit trail.

### Identity-Aware Proxy TCP forwarding

Source: https://docs.cloud.google.com/iap/docs/using-tcp-forwarding

Load-bearing observations:

- IAP provides an authenticated TCP-forwarding path;
- the documented IPv4 forwarding source range is `35.235.240.0/20`;
- port `22` may be limited to that range rather than broad public ingress;
- IAP is not intended for bulk data transfer.

### Auditing SSH access

Source: https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/auditing

Load-bearing observations:

- enable IAP Data Access logs, which are disabled by default;
- monitor successful and failed IAP and OS Login access attempts;
- export operating-system SSH logs when a complete host activity picture is
  required.

## hmmm

- Exact enterprise host-certificate enrollment and automated rotation differ by
  environment and are not specified by these generic sources.
- Provider wrappers can add behavior above OpenSSH; their evaluated effective
  configuration must be observed rather than inferred.
