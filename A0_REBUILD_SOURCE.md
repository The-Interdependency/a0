# A0 Rebuild Source Contract

Status: authoritative build handoff for the new Replit A0. This file is a specification and provenance boundary, not proof that the build is complete.

## I. Repository provenance

1. Historical source repository: `The-Interdependency/a0`.
2. Exact pre-rebuild snapshot: commit `0ba76ae9a3462ce337e087072f4f6a66e2dcce9d`.
3. Frozen historical branch: `archive/a0-pre-rebuild-2026-07-21`.
4. Replit source branch: `rebuild/a0-replit-2026-07-21`.
5. Primary implementation substrate: `The-Interdependency/a0-betatest@5de5e720fb814001d1ff87b0e2a1767588bf65c2`.
6. Authority, sealing, Guardian, heartbeat, audit, and emission donor: `The-Interdependency/a0replite@9b0f197b2939bf73697d7352022cd420cc029c11`.
7. The archived A0 tree is historical source material. It is not automatically current authority merely because code exists there.
8. The Interdependent Way canon remains in `wayseer00` and nowhere else.

## II. Build identity

1. Build a new Replit application named `a0` as a single-user research instrument.
2. Use the `a0-betatest` frontend/backend shape as the primary substrate.
3. Graft only the still-valid authority and sealing behavior from `a0replite`.
4. Treat the original `a0` runtime as a selective donor for provider catalog, orchestration, UI ideas, migrations, and deployment lessons.
5. Do not revive deprecated behavior merely to preserve compatibility. Remove and replace deprecated surfaces.
6. The stable contract is A0 orchestration. Models and tools may change without redefining A0.
7. Every implemented module and check must comply with the current `The-Interdependency/skill-lib` doctrine and MSDMD collection requirements.

## III. Runtime partitions

1. Guardian is the sole human-facing emission shell.
2. Phi is heartbeat, cadence, wake, polling, and runtime pulse.
3. Psi is operative self-state, self-build, and self-repair.
4. Omega is canon, durable memory, meaning anchors, frozen invariants, and supporting corpus.
5. Runes are the named 17-seed cores. Do not invent unnamed 17-seed auxiliaries.
6. Preserve ZFAE as three distinct meanings:
   - native inference;
   - agent identity;
   - authority.
7. Do not merge those meanings into one vague label.

## IV. Inference modes

1. `teacher_assisted`
   - Calls a selected user-keyed external model.
   - May update the local ZFAE weight bank.
   - Must record the actual provider, model, request identity, response source, usage, latency, and update result.
2. `zfae_native`
   - Calls the deterministic local engine only.
   - Must not call a teacher, developer, platform, fallback, or hidden model.
   - If native inference is unavailable or unready, return a visible failure rather than teacher text under a native label.
3. Every reply must expose:
   - `reply_source`;
   - `teacher_called`;
   - `zfae_weights_updated`.
4. There is no silent provider fallback. Unknown or unavailable models fail visibly.
5. The runtime chat path must call the native ZFAE inference engine when `zfae_native` is selected.

## V. Current source model catalog

Import the model catalog as data, not executable string literals. Availability is determined by key presence, user enablement, tier, and model discovery.

1. OpenAI
   - `gpt-5-nano`
   - `gpt-5-mini`
   - `gpt-5`
   - `gpt-5.5`
   - `gpt-5.5-pro`
2. Google
   - `gemini-2.5-flash-lite`
   - `gemini-2.5-flash`
   - `gemini-2.5-pro`
   - `gemini-3-pro-preview`
3. Anthropic
   - `claude-haiku-4-5`
   - `claude-sonnet-4-5`
   - `claude-opus-4-1`
4. xAI
   - `grok-4-fast-non-reasoning`
   - `grok-4-fast-reasoning`
   - `grok-4`
   - `grok-code-fast-1`

Preserve the role slots `record`, `practice`, `conduct`, `perform`, and `derive`, plus speed, price, balance, depth, coding, and creativity presets. Provider and model identifiers must remain inspectable and editable as data. Verify provider availability at runtime instead of assuming every catalog entry still exists externally.

## VI. Agent instances

Each persistent agent instance carries its own:

1. mode and model selection;
2. persona and system prompt;
3. Phi, Psi, and Omega weight/state bank;
4. memory configuration;
5. tool allow-list;
6. sentinel modes and weights;
7. training archive;
8. provenance stream;
9. explicit owner.

No volatile task residue may persist after the task boundary unless deliberately promoted into durable memory with provenance.

## VII. Authority and external action

1. No silent external actions.
2. External writes require the applicable approval gate, including S4 when required.
3. Bounded sudo must be scoped, logged, reversible where possible, and reviewable.
4. Tool invocations pass through the sentinel gate and emit atomic FIQ provenance events.
5. `hmmm` is mandatory on A0-generated outgoing boundary objects. It records unresolved constraints and honest incompletion. Incoming operator requests are not rejected merely because they omit it.
6. Guardian approval, revocation, audit, lifecycle, and heartbeat behavior must remain visible in the UI.
7. The human-facing UI must never obscure which model or engine generated a response.

## VIII. UCNS reset boundary

1. Current UCNS runtime geometry is typed `NA`.
2. Do not install or activate the former `ucns==0.8.3` lineage or any pre-reset implementation as current UCNS.
3. Expose no UCNS constructor, unit, multiplication, quotient, factorization, primality, theorem status, continuous public-gonol bridge, or double-cover proof until a new versioned intrinsically twist-bearing producer contract exists.
4. The preserved public 157-glyph gonol remains source evidence. It does not itself reactivate UCNS.
5. All UCNS-dependent runtime paths fail closed with the reset reason.

## IX. Data and security boundary

1. Treat the initial Replit deployment as single-user research infrastructure.
2. Do not expose shared anonymous state, BYOK key storage, audit payloads, overrides, or user-defined outbound tools as a public multi-user service.
3. Encrypt provider keys and webhook secrets at rest. Never commit secrets.
4. Required repair order before any multi-user production claim:
   - strict authentication and demo isolation;
   - per-user ZFAE state and protected agent APIs;
   - audit and override confidentiality;
   - tenant-scoped tool registry;
   - outbound SSRF prevention;
   - session and OAuth hardening;
   - atomic FIQ provenance;
   - explicit deployment environment contract;
   - required CI and branch protection;
   - package import normalization.

## X. First build sequence

1. Produce a clean boot and health surface.
2. Implement the data-backed provider and model catalog with key-status visibility.
3. Implement chat with explicit inference mode and reply provenance.
4. Implement Guardian approval, revocation, audit, lifecycle, and immediate heartbeat.
5. Implement persistent owner-bound agent instances.
6. Implement memory boundaries and the Phi/Psi/Omega split.
7. Implement sentinel-gated tools and FIQ events.
8. Add focused tests for every load-bearing contract.
9. Add a Replit deployment contract and secret checklist.
10. Only then expand the interface or add convenience features.

## XI. Acceptance conditions

1. The app boots in Replit and reports backend, database, provider-key, Guardian, and heartbeat state.
2. Missing keys produce visible unavailable states.
3. Unknown models fail without substitution.
4. Native mode makes no external model call.
5. Teacher-assisted mode names and logs the teacher call.
6. Every reply identifies its source.
7. Guardian is the only human-output sink.
8. External actions are approval-gated and auditable.
9. UCNS reset paths fail closed.
10. The archive branch remains untouched and resolves to the exact pre-rebuild commit.
11. Checks and module declarations reconcile under skill-lib/MSDMD rules.
12. The build makes no production, theorem, consciousness, diagnosis, or hidden-state claim unsupported by evidence.

## hmmm

The source is preserved and the build boundary is explicit. The lawful projection from the public gonol into the restarted twist-bearing UCNS object remains unresolved; therefore UCNS remains unavailable rather than approximately resurrected.
