# A0 vault and Site connection

GPT generated; context, prompt Erin Spencer.

FROM: environment-propagating launcher and source-only console.
TO: VM-local vault-backed CLI launches, authenticated status/evidence and durable handoff inbox consumed by the private Site.

Done when: initialized/unsealed/pinned vault supplies only selected provider keys to a child process, stale keys are removed, the Site reads authenticated VM state, and repeated handoff submissions have one durable identity. Phone acceptance remains a separate claim.
Fails if: a token enters arguments/logs/browser bundles, failed vault contact triggers initialization, Site credentials authorize ordinary chat/key routes, stale evidence is called live, or receipt is called execution.

Ownership: skill-lib tools/ai.sh and tools/a0_vault.py own terminal launching. A0 operations/configure-vault.py owns bootstrap/policies/renewal; apps/server/src/reliability.js owns the bridge schema. Site lib/vm.ts and app/api/vm own consumption; app/vm-panel.tsx owns presentation.

Permissions: read-only provider CLI token separate from application/root credentials; bridge bearer authorizes status and a handoff inbox only. Secrets stay in protected VM files or Sites runtime secrets. Pairing file is an explicit owner-only secret download passed to VM over SSH stdin.

Validation: fake Bao HTTP server + subprocess credential canaries, authentication/identity/expiry failures; real Express bridge auth and duplicate inbox tests; Site adapter fixture compatibility and owner isolation. Live VM and phone results require separate receipts.

Rollout: publish producer commits, deploy A0 source and provision CLI, then pair the Site. Restart only A0 after validation; keep Bao/store/seal unchanged. Rollback: follow docs/pr122-operations.md to restore compatible prior source/configuration or stop A0 in maintenance; preserve inbox/evidence and the recovery shell. Keep vault-backed launch or disable agent dispatch; never fall back to stale provider environment keys.

hmmm: no VM shell/login is available here; prepare every unblocked implementation and deployment command, and keep the live gate explicit.

## PR #122 recovery correction — 2026-11-10

Repair scope: `operations/configure-vault.py` owns the shared JSON/legacy recovery
reader and credential-bearing HTTP; `backup.sh` and `restore.sh` call its recovery
modes without placing tokens in shell variables or process arguments. Validate
recovery material before backup/restore side effects. Preserve private temporary
files, use the configured KV mount, and verify the restored cluster and canary.
`tests/reliability/test_recovery.py` exercises formats, rejected material, HTTP
failures, shell routing and redaction. Existing provisioning/bridge tests plus
skill-lib #137's launcher tests guard unchanged isolation and renewal contracts.

Update `docs/build-status.md`, the source work graph, and operator guidance with
exact identities, results and approval-gated operations. No VM mutation, merge,
provider request or physical-phone claim belongs to this source correction.
