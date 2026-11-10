# Reactivate A0: cache-aware context editing, agents/tools, temporary modules and AHBG

Source: https://github.com/The-Interdependency/a0/issues/119
Retrieved 2026-11-04, America/Los_Angeles. Issue state: open. Updated: 2026-11-04T02:59:19Z.

This is a dated source snapshot. Requirement text and current implementation status must be evaluated separately; historical status paragraphs may be stale.

---

## Priority and requested outcome

Erin's next priority, ahead of phone-file access, is feature reactivation:

1. Cache-aware context editing.
2. Agent instantiation and tool use.
3. Temporary module creation, display, and hot swapping on agent spawn, with statistics and chat.
4. AHBG.

**Additional owner request, 2026-10-30:** update the OpenAI model calls. FR0 below covers the current model catalogue, Responses transport and the existing saved participant; complete it with the reactivation work.

**Additional owner requirement:** a place to change models and an option for every supported user choice. Expose provider/model selection in chat and capability-aware settings throughout the scoped product; show the effective value and scope, persist it, and verify its execution effect. Implement [the current audit and options contract](https://github.com/The-Interdependency/a0/issues/120), including OC01–OC10.

**Current status, 2026-10-30:** GitHub main and public health report `700a817be2dc768a78ad198dc5e87ac2294722f3`. OpenAI Responses/model editing and context revisions now exist, but FR0/FR1 remain partial: the linked audit records 16 findings and eight isolated defect reproductions. FR2–FR4 remain pending. The historical source observations below are baselines, not claims that the new code is absent.

**FROM:** the deployed successor chat website plus archived feature mechanisms and a separately owned AHBG runtime.

**TO:** a usable agent workspace in the existing authenticated VM website: edit context with cache consequences visible, instantiate an agent, authorize actual tool work, automatically display its temporary stats/chat module, replace that module without losing state, and run that same deployed agent through AHBG with inspectable, replayable results.

This is the explicit reactivation contract requested after [the deployment audit, #118](https://github.com/The-Interdependency/a0/issues/118). It adds these four capabilities and the OpenAI call update below to the successor scope. It does not revive the retired application wholesale. Preserve `archive/`, unrelated VM services/data, and the existing R01–R14 contracts. The prior exclusion of automatic legacy feature commitments is superseded **for these requested capabilities, their exact archived agent descriptions, and reuse of their owning code**. Keep the archived definitions and code as source material. Agent responsibilities, delegation and communication behavior may be changed at Erin's direction; record the active configuration separately from the archived original. Unrelated pricing, subscription and Android packaging are outside this amendment.

The exact-description and code-reuse requirement below is an explicit owner clarification. Other detailed behavior is a derived implementation contract and proposed decomposition, grounded in inspected source. Source presence is not a runtime pass. Exact new file paths, API names, framework choices and release identities belong to the published successor implementation.

GPT generated; context, prompt Erin Spencer.

## Current build scope — owner instruction

**2026-10-30:** Erin has specified the retained components and exclusions for this build. This selection supersedes the earlier broad kernel/agent inventory and any conflicting completion requirement below or in prior comments.

| Keep in this build | Exclude from this build |
| --- | --- |
| PTCNA memory cores, including the retained long- and short-term numerical memory state | Jury |
| Phi, Psi and Omega cores | Bandit |
| Forge and its complete eight-template set | Meta-13 |
| Existing requested context editing, agent/tool execution, temporary stats/chat modules and AHBG integration | ZFAE |

Reuse the actual retained implementations. The four exclusions must not be registered as active components, booted, spawned, used as a parent/orchestrator, selected as inference routes, or required by an active feature in this build. Preserve their files as historical archive material. Retaining PTCNA does not reactivate the historical ZFAE identity or wrapper.

Exact archived descriptions remain preserved for the retained agents/templates. Where retained text refers to an excluded component, keep the original as source and explicitly configure the effective behavior without that dependency. Historical text is not an activation instruction. This selection does not require a broader A0OS kernel rebuild or decide additional kernel work.

## Start here

- Read the current [A0 repository instructions][A1], [replacement specification][A2], and [VM build handoff][A12]. Update the specification, source work graph, build-status record and acceptance ledger as this explicit scope is implemented.
- Reconcile the VM checkout, dirty state and artifact before changes. Current main is `700a817be2dc768a78ad198dc5e87ac2294722f3`; public `/api/health` reported that commit and an empty dirty state on 2026-10-30. This is self-reported identity, not independent VM artifact attestation. The archive tree remains `573843696f7090e5164488f782e38eaccc5b64bd`; preserve newer unpublished work.
- Start from that published successor and preserve any newer unpublished VM work. Publish/reconcile additional changes through the authorized Git workflow after secret inspection. Extend the existing harness, runs, provider, MCP and website owners.
- Apply #118's rendering, run-control, ownership and state-isolation fixes where these features depend on them. In particular F01, F02 and F06 must be verified before exposing generated module content and expanded agent/tool workflows. Feature implementation can proceed alongside the remaining audit work; phone-file integration is lower priority.
- [Issue #113][A13] is a related authenticated skill-execution contract. Reconcile its historical paths against the successor and share execution/lifecycle infrastructure; do not create competing executors.

## What the source actually establishes

| Feature | Existing mechanism | Reactivation gap |
| --- | --- | --- |
| Context editing/caching | Archived named-context editor, per-conversation boost, prompt assembly/splitter, provider cache controls and usage accounting. | No complete cache-impact editor established by the inspected paths; preview/send divergence and text-marker splitting must be repaired. |
| Agents/tools | Archived spawn queue/worker, instance abstraction, lineage, logs, cap checks and tool dispatch. | Successor integration remains to be verified. The old worker supports only `single`; accepting other labels does not implement those modes. |
| Temporary modules | Archived metadata-renderer pattern and a new-module form. | The form calls an unregistered `ws/modules` route; `agent-modules.json` is empty. No connected spawn-to-module/hot-swap lifecycle was established. |
| AHBG | Actual runtime, presentation, protocol, persistence/replay and benchmark source in Stack. | Its local `--agent a0` path uses a frozen reference policy. The real-service adapter targets an older A0 API and must be adapted to the successor. |

Inspected A0 source: [context assembly][A3], [context controls][A4], [cache controls][A14], [usage accounting][A15], [context editor and preview][A16], [spawn tool][A5], [spawn executor][A6], [agent instance][A7], [tool executor][A8], [module form][A9], [UI metadata registry][A10], [empty agent-module manifest][A11].

AHBG source authority: [AHBG target and rules ownership][G1], [production runtime guide][G2], [harness implementations][G3], [A0 HTTP adapter][G4], [HTTP bridge][G5], and [existing integration graph][G6].

## Retained definitions and code reuse

Erin requires the exact archived agent descriptions and reuse of the existing code. Apply that requirement to the retained scope above. Update the successor's root instructions and product specification accordingly; their earlier blanket exclusion of archive reuse must not discard these selected components.

### Retained source owners

| Component | Owning source and implementation to reuse |
| --- | --- |
| PTCNA state and Phi/Psi/Omega numerical cores | [PTCNAState][T1] wraps the producer-owned `PTCNARuntime`/neural engine, exposes `phi`, `psi`, `omega`, `memory_l` and `memory_s`, and implements checkpoint save/load. Reuse the retained numerical state and `PTCNAStateMerge.fork/absorb/converge` through the successor lifecycle. Model delegates with similar names do not implement these numerical cores. |
| Numerical memory | The active rings come from the pinned PTCNA producer. [Archived MemoryCore][T2] separately records concrete `write`, `query`, `absorb`, `flush_to` and `state` behavior. Preserve the producer's actual memory implementation and state contracts; do not silently replace it with a conversation transcript or a second local algebra. |
| Phi/Psi/Omega descriptions | [SDK definitions][D1] contain separate `description` and `prompt` values for the retained three roles. Preserve these original values where those definitions are used. Extract the retained definitions without importing the whole active registry or requiring its excluded Jury/Bandit delegates and Meta-13 parent. Keep numerical-core and model-delegate identities distinct. |
| Forge and all templates | [ARCHETYPES][D3]: `sage`, `trickster`, `paladin`, `druid`, `engineer`, `diplomat`, `hacker`, `captain`. Preserve exact IDs, names, blurbs, system prompts and personality data, with original tool suggestions and starting statistics as catalogue data. Reuse [Forge routes][D7], [creation UI][D8] and [agent chat][D12] for template selection, instance creation, edits and conversation binding. |
| Shared context and private overrides | [Context defaults][D14] provide archived A0 identity/base/grounding text. Preserve applicable originals and authorized owner overrides with provenance; source defaults do not reconstruct missing private database values. The active configuration must reflect this build's included/excluded components. |

The [archived compatible producer-pair record][T3] and lockfile pin PTCNA `c5fa9a599498f19c8345f2790a0636542dfbc6a1`, UCNS `b7b6f35cce69c273860923489a1c8b5372d14eb0` and the pair publisher interdependent-lib `918025e525910eaa3f20141aeb3956f137b248bf`. These are retained source identities, not a claim that they are current upstream main. Reuse that exact compatible pair or publish a reviewed compatible update with the corresponding verification. PTCNA owns its algebra; A0 owns the integration and persistence.

The producer adapter also uses numerical Theta for state/identity/merge contracts. Resolve that technical dependency from the producer; it is distinct from the Guardian OS shell. Do not erase required numerical state or introduce an additional excluded component by inference from a similar name.

### Exact originals and selected active behavior

- Retain each original description/prompt as an immutable source record with repository, commit, path, symbol/field and value digest. Preserve case, punctuation, whitespace, newlines and Unicode. Extract the source-defined string values without starting the archived application.
- Bind each instance/run/context snapshot to its selected effective definition. Keep original text separately inspectable; owner edits or adaptations create explicit revisions. Retained prompts containing historical references to Meta-13 or another excluded component must not silently restore that component or its routing.
- Preserve field roles: a Forge blurb is display text, an SDK description supports delegation discovery, and the selected operative prompt reaches the appropriate invocation. Database/module labels alone do not prove operative prompt use.
- Forge must expose the complete eight-template catalogue, create independently addressable instances, bind the selected provider/tools/context and attach the temporary stats/chat module. Original RPG statistics remain separate from measured execution usage.
- Preserve the bound definition and actual retained PTCNA state through persistence, fork/isolation, reconnect and hot swapping. A module swap changes presentation; it must not reset memory, create another engine instance or replay effects.

### Adaptation boundaries

Reuse existing functions and data where compatible. Record source path/symbol, successor destination and the reason for each adaptation or replacement. Preserve relevant notices and distinguish deliberate behavior changes from fixes.

| Source | Required adaptation |
| --- | --- |
| [PTCNAState][T1], [state/ring/memory routes][T4], [agent lifecycle][D9], [spawn tool][A5], [worker][A6], [queue helpers][D10] | Extract state lifecycle and queue/lineage behavior into the successor. Inject the retained state service instead of importing archived `main.py`; separate its ZFAE boot/primary-agent wiring and naming dependency. Preserve durable owner/grant binding, checkpoint recovery, cancellation and actual state isolation. |
| [SDK definitions][D1] | Select Phi/Psi/Omega explicitly. Do not activate `ALL_SUBAGENTS`, full mode registries or the old Meta-13 parent adapter in this build; they include excluded components. |
| [Forge catalogue/routes][D3] [D7], [AgentInstance][A7] | Retain template copying, ownership and prompt-to-inference binding; repair the missing `await` in the model resolver if reused. Enforce actual per-agent tool names at dispatch instead of reducing them to a Boolean `use_tools`. |
| [Prompt assembly][A3], [cache controls][A14], [usage mapping][A15], successor [harness][N1] | Reuse the existing mechanisms while repairing preview/split/accounting defects and preserving complete context. Do not copy the old SDK adapter's role-dropping history flattening. |
| [Metadata renderer][D11], [Forge chat][D12], [module form][A9], successor [website][N4] | Reuse the rendering and chat bindings; implement the missing registry/create/mount/swap/retire connections. |
| [AHBG runtime][G2], [harness][G3], [presentation][D13], [A0 adapter][G4] | Reuse these implementations with the successor adapter. AHBG integration must use the included agent/runtime path and must not reintroduce an excluded component. |
| Successor [runs][N2] and [MCP coordinator][N3] | Extend the existing authenticated execution owners and preserve current repairs. |

The separate archived `a0/memory.py` continuity store requires Jury tokens. Keeping PTCNA numerical memory does not select that store. Preserve it in the archive; use the retained numerical memory implementation for this build.

The required evidence is the actual retained cores/memory plus Forge → instance → model/tool work → stats/chat module, with exact source definitions, selected active instructions, persisted state and no activation of the four excluded components.

## FR0 — Update OpenAI model calls

**Original gap baseline:** A0 `843efaf61a17d255dd98276d21fa9f719c44b507`. The linked current audit supersedes these status observations at `700a817`; the implementation requirements and official-documentation basis remain. No paid inference/account test was performed by this audit.

### Original gaps and reuse

- [`providers.js`][O1] defaults OpenAI to `gpt-4o-mini`, labels it `openai-compatible`, and routes it through `streamOpenAICompatible` at `/chat/completions`. Capabilities are provider-wide; usage normalization keeps only Chat Completions token fields.
- [`index.js`][O2] skips already-seeded providers, so a changed default does not update the saved OpenAI participant. Its Settings test separately calls `/chat/completions` with `max_tokens: 1`. Its tool phase executes MCP actions and finishes without returning results to the model. [The website cards][O5] currently provide Delete but no model edit control.
- Reuse the [archived Responses adapter][O4] mechanisms in `_format_responses_messages`, `_responses_kwargs`, `_call_responses` and `_accumulate_usage`, particularly complete output-item replay and call-ID matching. Adapt them into the successor's owner/grant/run boundaries. The archive always sends temperature, silently substitutes some efforts, discards its progress callback and returns only the first text segment; those behaviors are not the current contract.

### Current models and configuration

Offer the exact current API IDs from [the official catalogue][OA1]: `gpt-6-luna`, `gpt-6.1-sol`, `gpt-6.1-terra`, and `gpt-6-astra`. The proposed inexpensive seed is **`gpt-6-luna`**, preserving the existing low-cost default's role. Sol, Terra and Astra remain explicit owner choices for their respective workloads. Actual access must be checked with the configured account; a catalogue entry does not establish account access.

Provide an in-place website edit/upgrade for the persisted participant, preserving its identity/history and deliberate custom selections. Freeze the chosen model and call settings per run; do not rewrite historical attribution or silently substitute another provider/model. Validate model-specific context/output limits, modalities and controls rather than retaining the provider-wide 128k assumption. Record requested and returned model identities.

[Current GPT-6 guidance][OA2] requires Responses for Astra/Sol/Terra tool calling and for Luna reasoning with tools. Use `reasoning.effort` with the selected model's allowed values; Astra/Sol reject `none`, while Terra/Luna support it. Remove unsupported sampling/logprob parameters when reasoning is enabled. Reject incompatible choices visibly instead of silently changing them. Keep effort, verbosity and output budget explicit/configurable; enable additional processing modes only when deliberately selected and supported.

### Adapter and lifecycle contract

1. **OpenAI transport:** introduce a distinct Responses path using `POST /v1/responses`, `input`, `max_output_tokens`, typed text/image content and flat function definitions. Preserve image-only inputs and all intended context. Use an explicit schema strictness policy with local argument validation. Preserve other providers' independently selected transports. [Migration][OA3]
2. **Streaming and Stop:** consume typed text/function events, accumulate every relevant output item and text part, and distinguish successful, failed, incomplete and stopped outcomes. Do not treat EOF or HTTP 200 alone as success. Keep abort/deadline propagation active through the entire body stream and subsequent tool rounds; the current `fetchWithTimeout` removes its abort listener/timer after headers. [Streaming][OA4]
3. **Actual tool loop:** persist complete function calls and correlate results by `call_id`; run authorized tools through A0's current coordinator and return `function_call_output` to the requesting participant until an answer or explicit budget/stop/failure. Preserve pending state, grants, per-instance isolation and uncertain-effect recovery. A provider response containing tool calls does not mean the A0 run is complete. [Function calling][OA5]
4. **Context ownership:** use `store: false` with A0-managed canonical history and complete required output-item replay, including opaque encrypted reasoning items. Current documentation says these items are returned by default; request `reasoning.encrypted_content` explicitly where the selected API/model requires and supports it. Keep provider continuation state scoped to its originating participant/model/configuration; do not send it to other providers or carry stale state across an edited/forked revision. Rebuild from the intended history when continuation becomes incompatible, and report an unsupported continuation instead of dropping content. Provider-managed history must not bypass FR1's editable, inspectable snapshot. [Migration][OA3]
5. **Cache and usage:** implement the selected model's current `prompt_cache_options`/breakpoint controls; do not copy older `prompt_cache_retention` settings blindly. Feed FR1 and modules actual `input_tokens`, `output_tokens`, `total_tokens`, cache reads/writes (including reported lifetime details) and reasoning usage. Preserve raw usage and aggregate tool rounds without double counting; absent counters remain unknown. [Prompt caching][P1]
6. **Settings Test and errors:** use the same adapter/request builder and selected model/configuration for diagnostics and inference, with a bounded but valid output budget. Keep credential, model/access, invalid-parameter, rate-limit and transport failures distinguishable and redact credentials. After updating a model, the website test must exercise that exact selection.

Ordinary chat/comparison, retained agent/Forge work and AHBG calls must use this same updated OpenAI boundary. Existing PTCNA/Phi/Psi/Omega/Forge retention and the four named exclusions continue to govern this build.

## FR1 — Cache-aware context editing

### User-visible result

Provide a phone-usable Context editor showing the ordered context the application intends to send, where each part comes from, what is editable, and how an edit is expected to affect reusable provider context. Preserve the original conversation and prior request evidence.

### Required behavior

- Represent context as structured, source-attributed blocks: harness, project instructions, agent instructions/persona, selected history, attachments, tool definitions/results, and applicable memory/additions. Do not infer structure by splitting on a Markdown heading inside arbitrary text.
- Distinguish reusable template edits from project, conversation and agent-instance overrides. Show readonly reasons for fixed sections; do not silently change global instructions from a local editor.
- Support explicit edits and inclusion/exclusion at the declared scope. Preserve original messages, excluded answers and revisions; future-context changes must not overwrite historical evidence.
- Preview additions/removals/reordering and save a new immutable context revision. Each run records the exact context, harness, tool-schema and configuration revisions it used.
- Generate preview and dispatch from the same canonical assembly. The preview covers application-owned content and attachment/tool representation, without claiming access to provider-hidden instructions or internal model state.
- Keep deterministic tool ordering and serialization. A comparison uses one semantic revision for every participant while allowing provider-specific wire formats.
- Show the earliest changed portion and a conservative estimate of potentially reusable context per provider/model/API configuration. A shared prefix alone does not prove a provider cache hit.
- Keep observed cache reads, cache writes, fresh input and output usage separate from forecasts. Missing counters, unsupported modes and unknown prices remain unknown. Do not infer cache hits from latency or use a universal character-to-token heuristic as an observation.
- Preserve full intended context after a cache miss or expiry. Never omit history, files or instructions merely to improve cache statistics.
- Freeze in-flight runs. Edits affect the next request or an explicit replacement run; they cannot silently alter an active run or already-authorized tool action.
- A spawned child inherits a deliberately selected revision; later parent/child edits do not mutate each other's snapshots.
- Handle save failures and competing-tab revision conflicts without losing the editable draft.

### Provider capability mapping

Implement and test against the actual configured model/API, rather than copying historical adapter assumptions:

| Provider | Owning current documentation | Required mapping |
| --- | --- | --- |
| OpenAI | [Prompt caching][P1] | Model-specific cache behavior, supported prefix/routing/retention controls and actual response usage. Do not assume every model supports the same controls. |
| Anthropic | [Prompt caching][P2] | Supported cache controls and separate cache-read/cache-creation/fresh-input accounting; tool/system/message changes affect the prefix. |
| DeepSeek | [Context caching][P3] | Best-effort matching of persisted prefix units; normalize `prompt_cache_hit_tokens` and `prompt_cache_miss_tokens` from actual usage. |
| xAI | [Caching][P4] and [usage fields][P5] | Compatible conversation/cache routing and the actual Chat Completions/Responses usage shape; a routing key is not a guarantee of reuse. |

Record model, API/adapter version and documentation check date with capability declarations. Do not copy pricing constants or minimum token thresholds into a universal policy.

### Historical defects to avoid carrying forward

`build_prompt_sections()` does not call `_prepend_doctrine()`, so its preview lacks parts the send path may add. It also classifies an appended context boost as stable if the literal Memory marker is absent. The comment that a prefix must remain unchanged is not an enforced revision boundary. See [the actual implementation][A3]. Use current semantic snapshots to repair these problems, rather than restoring the old text splitter unchanged.

## FR2 — Agent instantiation and actual tool use

### User-visible result

Create an agent from the website with a task, explicit provider/model, context revision and available tools. Show its live status; interact with the specific instance through the configured chat interface, inspect its work, stop it, and retain its result and history. Multiple instances must remain independently addressable.

### Required behavior

- Keep agent definition/configuration, live instance, run, parent/root lineage, conversation, participant and module identities distinct. A second chat pane or provider record alone is not a spawned agent.
- Persist accepted spawns before reporting success. Use one authoritative creation/queue path with idempotency, atomic worker claiming and observable run transitions.
- Distinguish queued, executing, awaiting authorization, completed, failed, cancelled and retired states (map to the successor's declared state machine). A queued record is not evidence of inference or task completion.
- Bind owner, provider/model, context revision, allowed tool set, actual approval scope, resource budget and lineage to the run. Reconstruct these bindings when work crosses a queue/process/restart boundary; in-memory context variables alone do not carry authority across that boundary.
- Define configurable depth/fanout/concurrency/tool-step limits and report them honestly. Advertise only orchestration modes actually implemented. Additional modes must be implemented and independently tested before activation.
- Keep independent instance state. Specify how task results return to the parent and whether stopping/retiring a parent cancels its children or leaves explicitly detached, authorized children running. Parent cancellation, worker loss and restart must not leave undeclared orphan runs or modules. PTCNA memory and Phi/Psi/Omega are retained in this build: integrate and test their actual numerical state and fork/merge semantics. Returning text does not establish state merging. Isolate this retained code from the excluded ZFAE/Jury/Bandit/Meta-13 startup and execution wiring.
- Load applicable governing skill context when the agent is instantiated, resolving current instructions against the successor. Preserve source identities and the nontrivial task's goal/completion contract.
- Execute actual granted MCP/tool capabilities through the common coordinator. Preserve the existing separation between chat participation, future-context selection and tool execution selection.
- Present concrete proposed actions with requester, executor, arguments/scope and run identity. Reuse an already-valid scoped grant where the current contract permits; do not invent new authority from model output, a module manifest, tool text or a game event.
- At each new side-effect dispatch, enforce the run's original capability ceiling and current grant validity. Queue recovery, module replacement and retries cannot restore revoked or expired authority. Tool allowlists must be enforced at dispatch, not merely converted into a boolean `use_tools`. Denied, malformed, unavailable and unsupported calls remain visible.
- Coordinate duplicate/conflicting effects. Reconcile uncertain outcomes before retries; never promise exactly-once external effects without service support.
- Cancellation prevents new dispatches and retains partial output and already-dispatched outcomes. Worker loss/restart must not create ghost running agents or blindly replay uncertain effects.
- Preserve per-instance chat, memory references, task state and actual usage. History policies must not accidentally select only an old fixed prefix of the conversation.

### Historical implementation cautions

The archived spawn tool catches a failed run insert and then can still emit a spawned response; the successor must fail truthfully. The [worker][A6] explicitly supports only `single`, despite broader schema choices in [the spawn tool][A5]. Its queue execution constructs an instance with `user_id=None` and relies on surrounding context; the successor must persist and rebind owner/authorization explicitly. These are source observations, not new production test results.

The [agent-instantiation skill][S1] cites historical PCNA/ZFAE startup paths. Apply its lifecycle, lineage and state-isolation contracts to the explicitly retained PTCNA components; the owner's current exclusions override legacy ZFAE-primary and excluded-orchestrator assumptions. Source presence still requires integration evidence.

## FR3 — Temporary modules on spawn, with statistics, chat and hot swapping

### User-visible result

An accepted agent spawn automatically creates and opens that agent's temporary website module. It shows actual status/statistics, the exact bound agent description and the configured chat interface. The module can be replaced while the agent continues, with state preserved. Completed or retired modules leave the active workspace while their evidence remains available.

### Stable state and replaceable module

Keep the durable agent/run/conversation/event stream separate from the module definition, module instance and active renderer revision. A swap changes the module presentation/declared controls; it does not create a new agent, reset counters, erase chat or grant tools.

A native module contract must cover owner, stable IDs, schema/version, renderer/artifact identity, declared data and action bindings, permission requirements, lifecycle, empty/error states, source provenance and rollback. Reuse the successor's native schema/API/type owners; supplement missing planning information only. The exact schema and names remain implementation choices.

### Lifecycle

1. **Create:** accepting a spawn also creates a durable module-instance descriptor or an observable recoverable creation failure. Duplicate spawn requests/events produce one logical run and module.
2. **Display:** validate the descriptor and mount one renderer, keyed to the correct instance/run/conversation. Reconnect rehydrates it from authoritative state. Unknown schemas, missing renderers and inaccessible data remain visible rather than disappearing.
3. **Interact:** provide per-agent chat and controls with clear run binding and the selected interaction configuration. Statistics include status, provider/model, elapsed time, tokens/cache usage when reported, tool activity/pending actions and applicable task progress. Label unavailable measurements; historical RPG/coherence values are not substitutes for measured usage.
4. **Hot swap:** stage and validate a candidate revision, activate with an expected-current-revision check, and retain the prior known-good revision. Preserve chat, draft, context revision, event cursor, metrics history, active run, pending action scopes and relevant reading/focus state. Clean up old subscriptions exactly once.
5. **Recover:** failed validation, loading or migration leaves the previous working module active. Concurrent stale swaps fail visibly. Rollback restores a compatible module revision without replaying inference or tool effects.
6. **Retire:** final status and receipts remain inspectable after the temporary view closes. Closing a view, stopping a run, retiring an instance and deleting user data are separate operations. Late events cannot revive a retired panel or appear under another agent.

### Generation and execution boundary

The first implementation may generate validated module descriptors and dynamically instantiate trusted, schema-driven renderers. This must be a real runtime create/mount/swap/retire path, not a new hardcoded tab per agent.

If an agent generates new executable UI/backend module code, it needs a separately identified artifact, validation/build results, scoped activation and a proven execution boundary. Do not run arbitrary handler text inside the production web process or render untrusted markup as trusted code. Do not let a generated endpoint string become an unrestricted authenticated fetch or allow module metadata to expand permissions. This follows the existing specification's execution boundary.

### Source reuse limit

The [archived new-module form][A9] submits handler text/metadata to `/api/v1/ws/modules`; the [registered router/metadata collector][A10] has no corresponding route. The [generated agent-module list][A11] is empty. These are reference pieces, not a working hot-swap loader. A metadata coverage scanner or passing static-tab check does not prove runtime lifecycle completion.

## FR4 — AHBG in the authenticated website, driven by the actual A0 agent

### User-visible result

Open AHBG inside A0, choose an actual agent instance, and see its board, legal observations/actions, turn progression, chat and execution statistics. The game persists, resumes and replays with source/rule/harness identities attached.

### Authority and current scope

- Stack's [AHBG README][G1] owns the current immediate target: a persistent plane with repeated agent observation/planning, communication, movement, construction, tile effects, adversarial context, collision resolution and diary/event persistence.
- The inspected [runtime guide][G2] advertises `observe`, `plan`, `relocate`, `construct`. This executable slice alone must not be presented as fulfillment of every broader immediate-target mechanic. Create a mechanic-to-rule/source/test matrix and finish the required missing behavior or leave the feature visibly incomplete. Include the source-owned requirements for subordinate-agent decision trees; spawning, absence, control and loyalty transitions; War collisions; tile visitation and local seven-tile modification; communication and DM effects; and diary/event persistence.
- UCNS owns the consumed geometry and construction relations. The board must render the same geometric state used by the engine; do not draw an unrelated approximation or duplicate UCNS mathematics in A0.
- Current AHBG authority explicitly defers multiplayer/federation/ascension and other broader architecture. Preserve those later intents and their status; this reactivation does not erase them or silently claim they already work.
- A0 owns its website, owner access, agent/context/provider execution and real-world tool authority. AHBG owns gameplay, legal action validation and benchmark meaning. Game actions do not grant external MCP/filesystem/shell authority.

### Integration requirements

- Adapt [A0HTTPHarness][G4] or an equivalent declared adapter to the exact published successor API and authenticated run interface. The current adapter cites `ad958a4e5f4cdb17ba815539d2e6a545034db161`, uses historical `/api/v1/...` routes and `x-user-id`, and expects an old JSON response shape. Do not revive that API or trust a caller-supplied user ID just to make the adapter pass.
- Bind game session to owner, unique session identity, agent instance/run, context revision, provider/model, rules/config/seed and exact source artifacts. A UI label named A0 is insufficient provenance.
- Use the actual configured provider through A0 for repeated observe → plan → validate → resolve → persist → next-turn cycles. [The local `--agent a0` path][G3] loads a frozen reference `Vessel`/policy; that run cannot be reported as the deployed A0 integration.
- Mount the board/feed/turn controls and agent stats/chat through the module lifecycle above. Swapping that module must preserve the plane, agent binding and next uncommitted turn.
- Keep submitted plans separate from executed effects. Validate session/turn, advertised capabilities, legal actions, unique per-unit intents and plan schema before applying a turn. Reconcile duplicates and races without committing a turn twice.
- Persist and reconstruct session lookup, board, construction state, event log, turn history and agent association after app/game-service and browser restart. Saved field files alone do not establish website session recovery.
- Expose the existing [HTTP bridge][G5] only behind a properly designed private integration boundary. Its inspected handlers lack owner authorization; sessions are in-memory, IDs derive only from seed/turn count, and a request can choose `out_dir`. Production integration needs owner-scoped durable identities and server-chosen storage. Keep optional native artifact/path selection out of public requests.
- Inspect and repair [the integration runner's][G7] result-field mismatch (`final_digest` versus [the result type's][G8] `state_digest`) before using it as evidence of a completed run.
- Preserve benchmark modes and measurement meaning. An enforcement layer replacing a submitted action and an observation-only test measure different systems. Store both actions and the selected mode; a game score does not certify general intelligence, consciousness or unexamined safety.
- Preserve optional UCHC/EDCM/TIWCG boundaries in the [existing graph][G6]. Activate an optional integration only with its own exact artifacts, mapping and evidence. No new common game kernel, monetization requirement or native APK is implied by this website task.

## Implementation ownership and proposed file plan

The current successor paths are linked in the reuse table above. Resolve their latest state before editing; additional agent/module paths below describe responsibilities to implement.

| Owner | Change | Required evidence | Rollback |
| --- | --- | --- | --- |
| A0 OpenAI adapter, participant settings, diagnostics and usage persistence | FR0 model catalogue/selection, Responses streaming, tool continuation and normalized observations | RO01–RO04 + RC03/RA03–RA04 | Preserve old participant revisions and compatible history; roll back transport/configuration together without replaying tool effects. |
| A0 context/contracts + provider adapters | Structured context revisions, exact agent bindings, one preview/dispatch assembler, provider cache capability/usage mapping | RC01–RC05 + RD02 | Revert active revision/adapter through a compatible schema path; preserve history. |
| A0 agent/run service + worker + tool coordinator | Retained PTCNA cores/memory, Forge and exact template assets; durable creation, lineage, owner/grant rebinding, real execution/cancel/recovery; four explicit exclusions | RA01–RA05 + RD01–RD03/RP01/RU01 | Stop new claims; preserve and reconcile active work before switching compatible worker versions. |
| A0 module registry + web renderer | Runtime descriptors, exact description inspection, spawn-driven mount, stats/chat, versioned activation/rollback/retirement | RM01–RM05 + RD02–RD03 | Return to known-good renderer/descriptor revision without replaying effects. |
| Stack `ahbg/integration/` and owning runtime modules | Successor adapter and producer-owned session/protocol/persistence fixes | RG01–RG05 | Pin compatible AHBG artifact and session schema; preserve saved planes and receipts. |
| A0 AHBG API/module | Owner-scoped access and durable agent-to-game binding; phone board/control integration | RG01–RG05 + RX01 | Disable new sessions while keeping existing saved state/readback available. |
| A0 docs/operations and shared graph | Scope amendment, exact pins, usage, real acceptance and recovery instructions | RX01 + graph integrity | Preserve previous versioned documentation and release identities. |

For every owning change, publish the concrete created/modified paths, purpose, boundary, required tests, rollout and rollback. Honor repository protections. Source publication, merge, deployment and actual-phone acceptance remain separate states.

## Acceptance gates

All gates below are **NOT RUN by this review**. Use PASS, FAIL, BLOCKED or NOT RUN with exact revision and evidence; manual/operator execution is a method, not an outcome. Keep #118/A01–A24 traceable alongside these added gates.

| Gate | Required observation |
| --- | --- |
| RO01 | Create a new OpenAI participant and update an existing one through the website without losing identity/history. Assert exact model/settings in real inference and Settings Test, model-specific capability checks, no silent substitution, and unchanged historical attribution. |
| RO02 | A Responses-specific fixture verifies text and image-only input, fragmented text/tool events, all output parts, complete tool-call/result continuation, argument rejection, failed/incomplete responses, interrupted EOF, and Stop after headers/during tool rounds. Preserve other providers' transport behavior. |
| RO03 | Replay the correct opaque continuation items for the originating instance; edits/forks/model switches cannot leak or retain incompatible state. Verify input/output/cache-write/cache-read/reasoning usage across rounds, unknown counters, and truthful module/context displays. |
| RO04 | With valid OpenBao-held credentials, record live text, image and authorized tool-to-answer smoke checks for the selected current model, including the website diagnostic and Stop. Report model/account failures accurately; offline fixtures do not satisfy this gate. |
| RD01 | Verify exact archived originals for retained Phi/Psi/Omega definitions, applicable context and all eight Forge templates. Confirm the full Forge catalogue and separately identified effective revisions. Excluded-component assets remain historical source, not required active definitions. |
| RD02 | Verify the original definition remains exact and the explicitly selected effective instructions reach persistence, instantiation, frozen context and the actual delegation/model-adapter payload. Do not require rejected archived role restrictions in the active payload. Metadata-only storage of active instructions fails. Original/effective revisions stay distinct; restart, model change, context edit and hot swap preserve the bound text and exact-text inspector unless a new revision is explicitly selected. |
| RD03 | Across startup, creation, default delegation, provider/tool work, AHBG, restart and hot swap, prove Jury, Bandit, Meta-13 and ZFAE are not active registrations, parent/default routes, background jobs or execution prerequisites. Historical references retained in exact source text do not count as activation. |
| RP01 | Exercise the retained PTCNA Phi/Psi/Omega and numerical memory, inspect actual attributed state, verify memory operations and checkpoint/restart restoration, and prove forked instances do not share mutable state. Stats/chat must reflect that running instance; generic model labels, transcript storage and copied source do not pass. |
| RU01 | Publish a source-path/function-to-successor reuse ledger and demonstrate the actual reused catalogue, lifecycle, context and UI/AHBG integration paths. Run focused behavior and defect-regression checks against the active contract, with intentional differences from the archive recorded; a copied filename, rewritten summary or static source hash cannot establish runtime reuse or behavior. |
| RC01 | Context editor preview and actual provider-adapter input share the same revision and intended content, including project/agent context, files and tools. |
| RC02 | Edits with no memory block and text containing `## Memory` cannot corrupt segmentation; early/late edits produce honest cache-impact estimates. |
| RC03 | Identical inputs serialize deterministically; cache miss/expiry still sends complete context; absent usage remains unknown. Use actual provider observations for any claimed cache hit. |
| RC04 | Editing during a stream preserves the active snapshot; next run sees the new revision; parent and child edits remain isolated; comparison participants share the intended semantic revision. |
| RC05 | Failed/concurrent saves preserve drafts and expose revision conflicts; unauthorized callers cannot inspect/change context or its history. |
| RA01 | Duplicate spawn and worker races produce one accepted run/claim; failed persistence never reports successful spawn. |
| RA02 | At least two agent instances remain separately addressable with correct owner, task, context, provider, chat and run lineage; restart reconstructs required state. |
| RA03 | A real authorized tool succeeds and a denied tool fails before dispatch; both outcomes are attached to the correct agent/run. Child and queued work cannot inherit broader authority accidentally; revoke a grant after queue acceptance and verify dispatch is denied. |
| RA04 | Stop remains visible while running, prevents new dispatches and preserves partial/uncertain outcomes; disconnect/retry/worker loss cannot silently duplicate an effect. Parent cancellation/restart follows the declared descendant policy without undeclared orphan runs/modules. |
| RA05 | Caps, unsupported modes, missing provider access and long histories fail/report truthfully; unsupported orchestration is not advertised as working. |
| RM01 | Accepted spawn creates one temporary module and one live mount/subscription. Reconnect reconstructs it without a duplicate agent or inference request. |
| RM02 | Two modules keep chat drafts, stats, controls and event cursors isolated; unknown renderer/schema/measurement states are visible. |
| RM03 | Hot-swap a live module during streaming and a pending tool authorization: same instance/run/chat/context survive, with no lost messages, replayed effects or expanded permissions. |
| RM04 | Invalid candidates, stale concurrent revisions and failed migrations retain the previous working module and its readable conversation, drafts, statistics, event cursor and pending-action bindings. Rollback restores compatible presentation without losing state or replaying effects. |
| RM05 | Retirement cleans subscriptions and preserves durable conversation/stats/outcomes; late events cannot revive the panel or update another agent. Metadata round-trip preserves or explicitly rejects unknown properties. |
| RG01 | The real deployed A0 agent, with exact provider/context/source identity, drives repeated AHBG turns; a frozen local reference agent is identified separately. |
| RG02 | Board, movement and construction consume the same pinned UCNS-derived state; every current required mechanic is mapped to its rule, implementation and test or remains explicitly incomplete. |
| RG03 | Foreign/stale sessions, duplicate/racing turns, unadvertised actions, malformed plans and game-text permission injection cannot commit unauthorized or duplicate effects. |
| RG04 | Game-service/app/browser restart restores the same owner/session/agent/plane; deterministic replay checks the expected field and construction state. |
| RG05 | Hot-swap the AHBG module without resetting the game; preserve submitted versus executed actions, benchmark mode and truthful usage/failure records. |
| RX01 | Complete the integrated website witness below on the actual deployed build, with phone observation and a second evidence readback. |

### RX01 — combined website witness

1. In the authenticated website, edit context and inspect the changed revision and estimated cache consequences.
2. Create two distinguishable Forge agents from explicitly chosen templates/effective configurations and context revisions; inspect their exact archived descriptions, active prompts and independent retained PTCNA state, then edit one without silently changing the other.
3. Observe each temporary stats/chat module appear. Use each instance's configured chat interface and inspect its actual definition/context/provider binding.
4. Approve a bounded, test-safe tool action for one agent, decline another, and inspect actual dispatch/outcome receipts.
5. Hot-swap one active module; retain chat/draft/history/stats and pending action scope, with no duplicate request or tool effect.
6. Bind that same agent to AHBG. Run repeated legal turns, including movement/construction and the broader required mechanics supported by their source-owned rules.
7. Reconnect/restart through the declared recovery process; restore the retained PTCNA memory/core state and agent/module/game associations, verify replay, and confirm the four excluded components remain inactive.
8. Cancel/retire the run and close its temporary module; retrieve its final status, chat, actions, metrics and game receipts from durable history.

This is an integration witness, not a substitute for the negative gates or the rest of the declared AHBG mechanic inventory.

## Execution order and completion checklist

- [ ] Reconcile published successor source with the VM and current acceptance evidence; preserve newer local/unrelated work.
- [ ] Resolve the shared identity record and source ownership below; map stale lifecycle-skill references explicitly.
- [ ] Integrate PTCNA memory cores and Phi/Psi/Omega; restore Forge and all eight templates with exact archived originals; exclude Jury/Bandit/Meta-13/ZFAE. Publish the reuse ledger and pass RD01–RD03/RP01/RU01.
- [ ] Repair the relevant #118 rendering, run-control and isolation foundations before activating expanded workflows.
- [ ] Complete OC01–OC10 from the current options/regression audit and correct affected acceptance claims.
- [ ] Complete FR0 current OpenAI model calls, existing-participant editing and RO01–RO04; reuse the owning archived Responses mechanisms with the documented repairs.
- [ ] Complete FR1 context revision/editor/cache mapping and RC01–RC05.
- [ ] Complete FR2 durable instantiation/scoped execution and RA01–RA05.
- [ ] Complete FR3 temporary modules, stats/chat and real hot swapping; pass RM01–RM05.
- [ ] Complete FR4 successor AHBG integration and required mechanic coverage; pass RG01–RG05.
- [ ] Perform RX01 with actual website/phone evidence, and rerun affected original A01–A24 gates.
- [ ] Update source-owned specification, work graph, build-status, acceptance, operations/rollback and ordinary website usage guidance.
- [ ] Return published and deployed source/artifact identities, resulting feature access, redacted receipts and remaining hmmm. Keep this issue open while any required capability or gate remains incomplete.

Use separate implementation and checking passes, focused on these contracts. Continue independent work when an operator credential or phone observation is blocked. Never promote a scaffold, queued job, successful build, local reference policy or documentation review into a live feature pass.

## Shared work graph

This record supersedes `12ac679e459ee75a1f6c7db595c76b9fcf51edffd909de73eef709b102b156d3`. It preserves component scope and producer pins, updates A0 to the audited build and adds the supported-options requirement and observed regression boundaries. The two UCNS entries represent different recorded consumers, not interchangeable versions. Resolve their compatibility explicitly before a combined deployment.

The digest covers canonical JSON containing exactly `repositories` and `boundaries`, with sorted keys, compact separators and repository-array order preserved. Source identities do not establish a runtime pass.

```json
{
  "schema": "the-interdependency.stack-manifest",
  "version": "1.0.0",
  "repositories": [
    {
      "repository": "The-Interdependency/a0",
      "commit": "700a817be2dc768a78ad198dc5e87ac2294722f3",
      "authority": "Successor website, identity, context, supported user options, OpenAI integration, retained PTCNA integration, Forge agents, tools and modules; exact selected archived definitions/code are reactivation inputs.",
      "relation": "Published implementation owner; public health reports this build. Archive tree 573843696f7090e5164488f782e38eaccc5b64bd remains preserved; private artifact/state verification is separate."
    },
    {
      "repository": "The-Interdependency/skill-lib",
      "commit": "d71a3a938cb6d646ffc0b59186452117e4a37d13",
      "authority": "Current build, metadata, lifecycle and evidence discipline, reconciled against successor repository instructions.",
      "relation": "Governing contract source; historical runtime-specific references are not automatic revival instructions."
    },
    {
      "repository": "The-Interdependency/stack",
      "commit": "9de81c67b271df09c1d9ba5422660c96fe8af7ac",
      "authority": "AHBG gameplay, runtime, harness protocol, presentation and benchmark evidence.",
      "relation": "Producer and compatibility peer, specifically ahbg/; consumes the pinned UCNS source."
    },
    {
      "repository": "The-Interdependency/ucns",
      "commit": "828c0b8bbcfc267efb5701da714191c1f73a81ff",
      "authority": "Consumed geometry and construction relations.",
      "relation": "Existing AHBG geometric producer pin, not a claim that this is UCNS current main."
    },
    {
      "repository": "The-Interdependency/ptcna",
      "commit": "c5fa9a599498f19c8345f2790a0636542dfbc6a1",
      "authority": "Retained producer-owned numerical cores, memory state and merge algebra.",
      "relation": "Exact archived PTCNA producer pin consumed through the A0 state adapter; not a claim of current main."
    },
    {
      "repository": "The-Interdependency/interdependent-lib",
      "commit": "918025e525910eaa3f20141aeb3956f137b248bf",
      "authority": "Publication and validation of the archived compatible PTCNA/UCNS pair.",
      "relation": "Pair publisher for retained PTCNA state; exact archived pin."
    },
    {
      "repository": "The-Interdependency/ucns",
      "commit": "b7b6f35cce69c273860923489a1c8b5372d14eb0",
      "authority": "UCNS source consumed by the retained archived PTCNA pair.",
      "relation": "PTCNA pair producer pin, distinct from the UCNS revision consumed by AHBG; do not conflate the two compatibility contexts."
    }
  ],
  "boundaries": {
    "authority_transfer": false,
    "proof_status_transfer": false,
    "measurement_status_transfer": false,
    "semantic_mapping": "Explicit adapter mapping only; A0 owns identity/tool authority and retained-state integration, PTCNA owns numerical cores/memory/merge algebra, interdependent-lib owns pair validation, AHBG owns game semantics, UCNS owns geometry at each recorded consumption pin.",
    "agent_scope": "cross-repository-work-graph",
    "hmmm": [
      "Main and live public health report the recorded A0 commit. This is not independent artifact attestation; private state and authenticated acceptance remain unverified by this audit.",
      "Retain PTCNA memory cores, Phi/Psi/Omega and complete Forge templates. Separate shared lifecycle/state code from excluded Jury/Bandit/Meta-13/ZFAE registrations, defaults and runtime dependencies.",
      "AHBG current-service adapter targets an older A0 API and lacks verified successor integration.",
      "The AHBG integration record carries additional optional or deferred peers; preserve their source-owned boundaries and pins if activated.",
      "The archived PTCNA pair consumes UCNS b7b6f35cce69c273860923489a1c8b5372d14eb0 while the AHBG record consumes 828c0b8bbcfc267efb5701da714191c1f73a81ff. Preserve compatible environments or verify an explicit pin reconciliation before combining them; no compatibility pass is claimed here.",
      "Current audit finds FR0/FR1 partial despite new code. Complete the supported-options contract and repair reproduced context, file, UI, tool and cancellation defects; selected-account behavior remains to verify."
    ]
  },
  "work_graph_sha256": "03181665648747d9c756783d8c9108bee009287fa3ee20b42a33ec5c8fd24dff"
}
```

No mathematical, semantic, certification, measurement or empirical validity transfers merely because A0 consumes AHBG/UCNS or because a benchmark runs. The record is an identity digest, not producer authentication. Preserve Stack's additional source-owned graph and optional/deferred integrations.

## hmmm

- Main and public health report the audited build. Private artifact/state verification, newer VM work and fresh signed-in acceptance remain separate.
- Cache control, retention and accounting depend on actual provider/model/API capabilities and runtime observations; no guaranteed hit rate or savings is asserted.
- The builder reports the old OpenAI key issue repaired. The screenshot’s later failure has no preserved diagnostic; establish its cause from actual error evidence. This audit did not rotate keys or call paid inference.
- The current included/excluded component selection is explicit. Resolve retained PTCNA technical dependencies and producer-pair compatibility without reactivating Jury, Bandit, Meta-13 or ZFAE. Broader A0OS kernel placement is not a prerequisite for this build.
- Runtime temporary-module creation/hot swapping is not established by the archived form/schema.
- AHBG's broader immediate-target rules exceed the currently advertised four-capability slice; preserve the full mechanic inventory and unresolved rules.
- No feature repair, provider inference, VM deployment, AHBG run or phone acceptance was performed by this source review. This issue records the requested implementation work and its proof obligations.

## Sources

[A1]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/AGENTS.md
[A2]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/docs/a0-replacement-spec.md
[A3]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/prompt_assembly.py
[A4]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/focus.py
[A5]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/tools/sub_agent_spawn.py
[A6]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/spawn_executor.py
[A7]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/agent_instance.py
[A8]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/tool_executor.py
[A9]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/components/NewModulePanel.tsx
[A10]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/__init__.py
[A11]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/lib/agent-modules.json
[A12]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/docs/deep-code-vm-handoff.md
[A13]: https://github.com/The-Interdependency/a0/issues/113
[A14]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/providers/claude_provider.py
[A15]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/energy_registry.py
[A16]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/components/chat-widgets.tsx
[G1]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/README.md
[G2]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/runtime/README.md
[G3]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/runtime/harness.py
[G4]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/integration/a0_http.py
[G5]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/runtime/server.py
[G6]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/integration/work-graph.json
[G7]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/integration/run_current_a0.py
[G8]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/runtime/runtime.py
[S1]: https://github.com/The-Interdependency/skill-lib/blob/d71a3a938cb6d646ffc0b59186452117e4a37d13/agent-instantiation/SKILL.md
[P1]: https://developers.openai.com/api/docs/guides/prompt-caching
[P2]: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
[P3]: https://api-docs.deepseek.com/guides/kv_cache/
[P4]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching
[P5]: https://docs.x.ai/developers/advanced-api-usage/prompt-caching/usage-and-pricing
[D1]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/a0/adapters/subagents.py
[D3]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/forge_archetypes.py
[D7]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/forge.py
[D8]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/components/ForgeTab.tsx
[D9]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/agent_lifecycle.py
[D10]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/services/spawn_db.py
[D11]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/components/TabRenderer.tsx
[D12]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/client/src/components/ForgeAgentChat.tsx
[D13]: https://github.com/The-Interdependency/stack/blob/9de81c67b271df09c1d9ba5422660c96fe8af7ac/ahbg/presentation/README.md
[N1]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/server/src/harness.js
[N2]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/server/src/runs.js
[N3]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/server/src/mcp.js
[N4]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/web/app.js
[D14]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/contexts.py
[T1]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/engine/ptcna_state.py
[T2]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/engine/memory_core.py
[T3]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/docs/work-graphs/ptcna-state-integration.json
[T4]: https://github.com/The-Interdependency/a0/blob/57b11a7ddb1e93febcc2b6c593c3a8f436e5c16a/archive/python/routes/pcna_api.py

[O1]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/server/src/providers.js
[O2]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/server/src/index.js
[O4]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/archive/python/services/providers/open_comp_prov_v0.0.0alpha.py
[O5]: https://github.com/The-Interdependency/a0/blob/843efaf61a17d255dd98276d21fa9f719c44b507/apps/web/app.js
[OA1]: https://developers.openai.com/api/docs/models
[OA2]: https://developers.openai.com/api/docs/guides/latest-model
[OA3]: https://developers.openai.com/api/docs/guides/migrate-to-responses
[OA4]: https://developers.openai.com/api/docs/guides/streaming-responses
[OA5]: https://developers.openai.com/api/docs/guides/function-calling



