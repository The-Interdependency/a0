# A0 vault and Site connection

GPT generated; context, prompt Erin Spencer.

FROM: environment-propagating launcher and source-only console.
TO: VM-local vault-backed CLI launches, authenticated status/evidence and durable handoff inbox consumed by the private Site.

Done when: initialized/unsealed/pinned vault supplies only selected provider keys to a child process, stale keys are removed, the Site reads authenticated VM state, and repeated handoff submissions have one durable identity. Phone acceptance remains a separate claim.
Fails if: a token enters arguments/logs/browser bundles, failed vault contact triggers initialization, Site credentials authorize ordinary chat/key routes, stale evidence is called live, or receipt is called execution.

Ownership: skill-lib tools/ai.sh and tools/a0_vault.py own terminal launching. A0 operations/configure-vault.py owns bootstrap/policies/renewal; apps/server/src/reliability.js owns the bridge schema. Site lib/vm.ts and app/api/vm own consumption; app/vm-panel.tsx owns presentation.

Permissions: read-only provider CLI token separate from application/root credentials; bridge bearer authorizes status and a handoff inbox only. Secrets stay in protected VM files or Sites runtime secrets. Pairing file is an explicit owner-only secret download passed to VM over SSH stdin.

Validation: fake Bao HTTP server + subprocess credential canaries, authentication/identity/expiry failures; real Express bridge auth and duplicate inbox tests; Site adapter fixture compatibility and owner isolation. Live VM and phone results require separate receipts.

Rollout: publish producer commits, deploy A0 source and provision CLI, then pair the Site. Restart only A0 after validation; keep Bao/store/seal unchanged. Rollback: disable bridge token config, restore prior A0 release, preserve inbox/evidence; remove launcher symlink or select prior source. Never fall back to stale keys on vault failure.

hmmm: no VM shell/login is available here; prepare every unblocked implementation and deployment command, and keep the live gate explicit.
