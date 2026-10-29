# A0 — replacement specification and preserved history

**Start with the [replacement implementation specification](docs/a0-replacement-spec.md).** It records the complete known phone-first web/Android, four-provider BYOK, comparison, OpenBao, and MCP scope, its proposed Replit deployment, and acceptance gates.

Status: specification published; replacement application and deployment remain unimplemented/unverified. Replit is the selected application/backend host. The VM is a checkout/work destination for this handoff.

The old A0 implementation is deprecated at the owner's request and retained under archive/ for historical inspection and reproducibility. Its retirement does not prohibit building the fresh successor defined by the new specification. This repository remains active.

## Builder and VM handoff

Read [AGENTS.md](AGENTS.md) and [the spec](docs/a0-replacement-spec.md); the [source work graph](docs/work-graphs/a0-replacement-spec.json) records the inspected inputs.

For a new checkout on the VM:

~~~sh
git clone https://github.com/The-Interdependency/a0.git a0
cd a0
git rev-parse HEAD
less docs/a0-replacement-spec.md
~~~

Use an existing clean checkout's normal fetch/fast-forward workflow if already cloned; preserve unrelated work. Record the checked-out commit before building. These commands retrieve documentation and do not start an application.

GPT generated; context, prompt Erin Spencer.

## Preserved source

The existing archival change moved the complete previous source tree under [archive/](archive/) without changing its contents. This notice leaves that tree intact.

| Evidence | Exact identity |
| --- | --- |
| Source commit before relocation | `f68304130f66b5afb73dde3352f24d8096bf21b9` |
| Preserved source / archive tree | `573843696f7090e5164488f782e38eaccc5b64bd` |
| Archival relocation commit | `1ff51f3161b04dc7f9cf9921e7ed1a07d6747e47` |
| Preserved tracked files | 909 |

The canonical deterministic export contains 909 tracked files. Its SHA-256 is `8a38e4f147da4ed89f8490b02ef635a9447d70d5b5574fec78f09663203c1706`.

Replit is a separate source/runtime boundary. Its source must be retained and reconciled independently; this notice does not establish Replit parity or hosted shutdown.

## Historical usage

Read [the historical README](archive/README.md) as historical documentation. Preserve the licenses and notices within each source tree. For exact historical analysis, check out the source commit above into an isolated worktree; do not use the old deployment or startup instructions against a live environment.

Verify preservation from a fetched clone:

```sh
git rev-parse f68304130f66b5afb73dde3352f24d8096bf21b9^{tree}
git rev-parse HEAD:archive
```

Both results must equal the preserved tree identity above. Existing commit-pinned references remain historical source references; current-branch consumers must use the preserved path or an explicitly chosen historical commit.

## Retirement boundary

A source archive, GitHub's read-only repository archive flag, and hosted runtime shutdown are separate states. This documentation records source preservation and deprecation only. Database contents, runtime uploads, private checkpoints, credentials, and hosted configuration are outside the tracked-source preservation claim. Keep independent research repositories, shared hosts, and their dependencies intact.

**hmmm:** Replacement implementation and deployment acceptance remain unfinished. Provider-level legacy runtime/data-retention receipts remain separate from this source handoff; repository read-only archival is not a requirement for the active successor workspace.

