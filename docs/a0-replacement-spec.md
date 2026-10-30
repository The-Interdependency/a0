---
title: A0 replacement implementation specification
spec_id: a0.replacement/1
version: 1.1.0
status: specification
implementation_status: not_implemented
deployment_status: not_verified
owner: Erin Spencer
date: "2026-10-29"
timezone: America/Los_Angeles
hosting_requirement: existing_VM
access_requirement: authenticated_responsive_website
---

# A0 replacement — complete build specification

GPT generated; context, prompt Erin Spencer.

## 1. Standing and usage

This is the implementation specification for the fresh A0 application. It consolidates the October 27 product brief, the OpenBao fork decision, and the latest October 29 instruction to build to completion on the VM with website access. That instruction supersedes the earlier Replit deployment requirement and separate native Android delivery gate. It records the complete known scope; unresolved choices remain explicit. A specification is not an implementation, a successful test, or a deployment receipt.

**The existing VM hosts A0; Erin accesses it through an authenticated, phone-first HTTPS website.** Android's browser is the primary phone surface. A native APK and Replit deployment are not required for completion. Browser installation as a PWA is optional and must not gate ordinary website access. Start execution with the [Deep Code VM handoff](deep-code-vm-handoff.md).

For the builder:

1. Read this document, the root [AGENTS.md](../AGENTS.md), and the pinned source identities below.
2. Implement the new application from this contract. The historical archive supplies provenance and reference material; it is not the successor foundation.
3. Preserve the distinction between user requirements, proposed implementation choices, and verified behavior. Record a changed proposal before relying on it.
4. Work through the build stages and acceptance matrix. Link each implemented requirement to its owning source, tests, and exact commit.
5. Keep hmmm visible. Resolve routine engineering choices from current documentation and recorded evidence; ask the owner only for a consequential preference that cannot otherwise be recovered.
6. No acceptance case below has been executed for the replacement. Do not turn a test plan or a successful documentation check into a runtime pass.

### Standing labels

| Label | Meaning |
| --- | --- |
| REQUIREMENT | An explicit product decision preserved from the owner's instructions. |
| DERIVED CONTRACT | Engineering behavior needed to satisfy a requirement; it remains subject to implementation review. |
| PROPOSAL | A concrete starting design, not an independently ratified user preference or demonstrated implementation. |
| VERIFIED SOURCE | A named capability or source identity inspected in existing code/documentation, not a successful A0 deployment. |
| hmmm | A missing decision, runtime observation, credential/access condition, or unfinished proof. |

The user-facing product should use ordinary language. These engineering labels belong in developer documentation and evidence records, not routine chat controls.

## 2. Requirements and scope

| ID | REQUIREMENT |
| --- | --- |
| R01 | Host the fresh A0 website and backend on the existing VM, with a reachable HTTPS website as the access surface. Verify the actual VM and deployment configuration before activating services. |
| R02 | Provide a responsive, phone-first website usable in Erin's Android browser and on desktop. Use ChatGPT's mobile interaction patterns as references; a developer playground is not the design reference. Native Android packaging is no longer a delivery gate. |
| R03 | Initial access is Erin's account only. Keep identity and ownership modular enough for later multiuser support; a public release or subscription business is not part of this iteration. |
| R04 | Support BYOK for OpenAI, Anthropic, xAI, and DeepSeek. Initially select DeepSeek. The exact provider models are configurable and are not settled here. |
| R05 | Include chat, file/image attachments, voice, projects, and tool execution in the delivered scope. Build stages do not remove any of these capabilities. |
| R06 | At provider/model switching, offer New conversation, One answer / continue, and Compare models, with the context rules in section 3. No default switching choice was specified. |
| R07 | Support comparison across an extensible participant set. Two simultaneous models is the ordinary use case, not a structural limit; adding C, D, and later participants must not require redesign. |
| R08 | Default subsequent comparison context includes every participant's responses. Preserve a control for selecting which responses enter future context; all participants receive the same selected history. Excluded responses remain saved. |
| R09 | Select tool executors when actionable tool use is proposed. Chat participation, future-context selection, and execution authorization are separate controls. |
| R10 | A0 hosts configurable MCP connections with discovery and invocation of granted capabilities. Do not require a fixed catalog of supported services. |
| R11 | Use an open-source GitHub-sourced secrets vault through a replaceable integration. The owner requested the OpenBao fork and MSDMD adoption. Integrate that fork as the selected vault component; its operational configuration is still a proposal to verify. |
| R12 | Phone hosting of the vault is ruled out for this iteration. Keep the vault integration replaceable so storage/hosting can change later. |
| R13 | Preserve the old A0 work as historical source. Do not revive its deployment, identity, inference engine, services, or tests as automatic requirements of this replacement. |
| R14 | Preserve modular replacement of the application's differing responsibilities. Provider, vault, identity, presentation, and execution choices must not become inseparable. |

The historical ZFAE, UCNS, PCNA, pricing, agent-spawn, and Android bridge designs do not become current product commitments merely because they exist in the archive. Any future reuse needs an explicit contract and current evidence. Independent projects, including Odysseus, retain their own lifecycle.

## 3. Conversation, switching, and comparison contracts

### 3.1 Switching choices

| Choice | Required behavior |
| --- | --- |
| New conversation | Create a new conversation with the standard harness context. Do not import the previous conversation's message history. |
| One answer / continue | Keep the conversation and give the selected provider/model its complete intended conversation context. |
| Compare models | Send the same user prompt and canonical context snapshot to the chosen participants and display separately attributed answers. A participant joining an existing conversation receives the complete intended prior prompt/response history. |

DERIVED CONTRACT: store the conversation independently of provider caches. A cache miss must not lose history. A full-context request must not silently turn into a summary, omitted attachments, or truncated history.

Define and version the standard harness context before claiming these modes work. Its instructions, memory inputs, assembly order, and version identity must be inspectable. Repository agent instructions and archived identities are not automatically runtime system prompts.

### 3.2 Participants and context

PROPOSAL: a participant has a stable ID, provider, model, settings, capability description, and credential reference. More than one participant may use the same provider. Provider keys are not participant data.

DERIVED CONTRACT:

- Freeze one semantic context snapshot per comparison round. Each adapter may encode it in the provider's format, but must preserve the intended content, order, attribution, attachments, and tool history.
- Default later rounds include all saved participant responses. A deliberate selection policy applies equally to every participant; selecting context never authorizes tool effects.
- Retain partial, failed, cancelled, excluded, and successful answers with their actual status. Preserve provider/model attribution and the source round.
- Record ordering deterministically. Network completion order must not silently change the history policy.
- If any selected participant cannot accept the intended context or content type, explain the mismatch before sending that participant's request. Never report incomplete transfer as full-context continuation.
- Configuration changes to participants, models, or context policies must not erase previously saved answers.

PROPOSAL: ordinary model/settings changes apply to the next request. Switching during an active stream requires an explicit stop/continue decision and preserves the partial response. The final interaction remains hmmm until documented and tested.

### 3.3 Usage and limits

DERIVED CONTRACT: show actual provider failures, rate/context limits, participant outcomes, and token usage when returned. Label estimates as estimates; unavailable prices or usage remain unknown. Do not silently substitute providers or models.

PROPOSAL: configurable limits for concurrent requests, tool steps, attachments, and spending protect completion under actual account quotas. No specific numeric cap is approved here, and a practical concurrency limit must not be confused with a hard two-participant data model.

## 4. MCP and tool execution

A0 is the MCP host. Provide connection setup, authentication, capability discovery, enable/disable controls, visible call progress/results, and cancellation feedback. Model switching preserves configured connections.

When a participant proposes tool actions:

1. Display the concrete actions and their requesting participants.
2. Let Erin choose one participant, a subset, all, or cancel and remain in chat.
3. Bind that authorization to the displayed run and action scope. Selecting chat models alone does not grant execution.
4. Execute through the shared coordinator with the configured server's actual permissions.
5. Return results to shared conversation history with requester, executor, action identity, outcome, and timestamps.

DERIVED CONTRACT:

- Compare duplicate and conflicting proposed effects before dispatch. Coordinate them explicitly; do not blindly execute every selected model's duplicate write.
- Use server-supported idempotency or reconciliation when available. Never promise exactly-once behavior for an external service that cannot support it.
- A disconnect after dispatch can leave an outcome unknown. Record that uncertainty and reconcile before retrying an irreversible effect.
- A cancelled run authorizes no new dispatches. Already dispatched effects may have completed; report that result honestly rather than claiming they were undone.
- Expose insufficient authorization, unavailable servers, expired connections, and partial failures.
- Provider adapters translate model-facing tool requests into this common execution route. A discovered tool is not proof of authorization to invoke it.
- Treat server descriptions, tool results, attachments, and model output as untrusted data. They cannot grant themselves permissions or override execution selection.

The application must not claim arbitrary shell/code execution is isolated merely because OpenBao listens on localhost. Untrusted processes sharing a deployment user can cross process/filesystem boundaries. Only explicitly trusted, scoped handlers may run until a separate execution boundary is designed and proven. This preserves general MCP connectivity without pretending co-location is a sandbox.

## 5. Identity, storage, files, voice, and clients

### 5.1 Access and data ownership

DERIVED CONTRACT: enforce the initial owner on the server using a stable verified identity. Every conversation, project, file, credential, and MCP operation must authorize its owner; hiding UI controls is insufficient. The first sign-in must not allow an arbitrary visitor to seize ownership.

Use replaceable authentication/session integration. Establish session expiry/revocation, browser request protection, browser login return handling, and recovery. Exact identity provider and recovery mechanics remain hmmm; password invention or a hard-coded development bypass is not a completion shortcut.

### 5.2 Persistent state

PROPOSAL: versioned database records for User, Project, Conversation, Participant, Message, ContextSnapshot, Run, ToolAction, MCPConnection, Attachment, CredentialReference, and UsageObservation.

Each record has stable identity, ownership where applicable, timestamps, and explicit state. Runs bind harness version, context snapshot, participants, model/settings, and tool authorization. Store references to secrets, not their values.

Use transactional updates where a partial write would change conversation or authorization meaning. Keep app migrations separate from OpenBao-owned tables. File metadata belongs in the database; media bytes belong behind a replaceable durable-storage interface. A protected persistent VM volume is the initial proposal; another object store may replace it without changing ownership contracts. Back up the media together with its database references.

Define deletion, retention, export, cross-client synchronization, and offline/resume behavior before their acceptance gates. They are not permission to migrate or delete historical private data.

### 5.3 Attachments, voice, and projects

- Attachments: authenticated upload/retrieval, ownership, supported types/size checks, durable storage, visible processing state, and provider-specific delivery. An accepted upload must not silently disappear from a model's context.
- Voice: microphone permissions, visible capture/processing state, interruption/error feedback, and persistence of the resulting conversation. Dictation/read-aloud versus continuous interruptible voice and exact audio services remain hmmm. Do not claim full voice scope by shipping an empty microphone control.
- Projects: create/select/manage projects and consistently attach conversations/files to their project. Project context loading and any project instructions must have explicit, inspectable rules.
- Website: use authoritative server state and stable identities across browser sessions/devices. Verify keyboard-open composition, comparison readability, file selection, microphone use, sign-in, reconnect, and saved-history retrieval in Erin's Android browser. Do not require a terminal, APK, or developer console for ordinary use.
- PROPOSAL: readable side-by-side comparison with horizontally scrollable panes and an expanded reading view on narrow screens. Validate usability rather than treating a layout mockup as acceptance.

## 6. Component boundaries and proposed file plan

This is a proposed decomposition, not a claim that these modules exist. The native manifests, API schemas, types, and documentation created during implementation own their metadata. MSDMD supplements only information those sources cannot already express.

| Proposed module | Responsibility and surface | Boundary / minimum evidence |
| --- | --- | --- |
| identity | Sign-in, sessions, stable owner authorization, recovery | Identity service + all protected data routes; A01/A19 |
| conversations | Projects, messages, context snapshots, versioned harness assembly | Database + user content; A03–A09/A14 |
| providers | OpenAI/Anthropic/xAI/DeepSeek adapters and capability negotiation | External provider APIs + server-side secret lookup; A04/A10/A11/A16 |
| secrets | Replaceable vault interface, key lifecycle, scoped access | OpenBao + bootstrap trust + encrypted persistence; A02/A12/A13 |
| comparison | Participant orchestration, shared history policy, visible outcomes | Concurrent requests + persisted run state; A06–A09/A16 |
| media | Uploads, attachment delivery, voice integration | User files/audio + storage/provider capabilities; A15/A18 |
| mcp | Connections, discovery, permissions, execution coordination | External tools + authorized side effects; A20–A23 |
| web | Phone-first website and settings | Authenticated API presentation; A17/A18 |
| operations | Startup, health, deployment, migration, backup/recovery, observability | Existing VM + operational privileges; A12–A14/A24 |

PROPOSED active layout, to finalize with the implementation framework:

- apps/web: website and shared UI.
- apps/server: authenticated API and streaming endpoints.
- packages/contracts: versioned data/API schemas and context contracts.
- packages/providers, packages/secrets, packages/mcp: replaceable adapters/coordinator.
- operations: VM deployment, HTTPS, supervision, migration, backup/restore, and rollback instructions and automation.
- tests: contract, integration, deployment, and client acceptance witnesses.
- docs: source-linked specifications and operator guidance.

Keep route namespace, permission tier, data schema, editable/read-only fields, empty/error states, and renderer expectations declared in owning native schemas or appropriate supplemental metadata. A rendered field or route name is not evidence that its backend exists. Exact framework, versions, registry names, endpoints, and test paths are hmmm until implemented.

## 7. VM deployment proposal and vault bootstrap

All topology choices in this section are PROPOSALS pending inspection and executable verification. VM hosting and website access are requirements.

### 7.1 Proposed topology

- Inspect the existing VM's identity, operating system, resources, service manager, listeners, reverse proxy, DNS/TLS route, and authorized deployment account. Preserve unrelated services and data. Reuse a suitable existing proxy/runtime; otherwise use one dedicated Docker Compose project.
- The proposed project contains HTTPS ingress, the A0 application, PostgreSQL, and the pinned OpenBao build. A same-origin website/API keeps ordinary use in the browser. Caddy is the default proxy proposal when no suitable proxy already exists; its normal public-hostname setup needs correct DNS, reachable HTTP/HTTPS ports, and persistent certificate state.
- Publish only the ingress needed for the website. PostgreSQL and OpenBao have no public or published host ports. Separate containers communicate over explicitly scoped private service networks: OpenBao listens on its private container interface and the application uses its service name. Container-local loopback does not connect separate containers. Native processes on one host may instead use loopback with verified process/file permissions.
- Use separate database ownership and credentials for application records and OpenBao's encrypted store. Keep migrations separate. Persist PostgreSQL, authenticated media storage, and certificate state in named volumes or deliberately managed host paths outside disposable containers.
- Use production builds, pinned artifact identities, explicit dependency health/readiness checks, and a verified startup/restart policy. Verify the container daemon or native service manager starts on boot; do not make competing supervisors own the same process. Provider outages remain visible per-provider failures, not reasons to bypass identity or vault controls.
- Mount the static vault wrapping key from an owner-protected host file read-only into the vault process/container only, using the selected fork's documented static file seal. Give the application a separate narrowly scoped vault identity. Provider keys stay in OpenBao.
- The VM host and its administrators are the bootstrap trust boundary. File-mounted Compose secrets are controlled file delivery, not an independent encrypted secret manager or protection against a compromised host. Do not expose the Docker control socket or host secrets to the application or MCP tools.

The pinned fork documents PostgreSQL storage and static automatic unsealing with a 32-byte key supplied through a file or environment variable. This establishes source support, not binary, resource-fit, permission, or VM deployment verification. See the primary references below and the execution order in the [handoff](deep-code-vm-handoff.md).

### 7.2 Startup, initialization, and permissions

- Start OpenBao against the explicitly selected store. Initialize only after positively establishing that the intended store is genuinely uninitialized; an unavailable, mistaken, or empty replacement store must not silently create a new vault.
- OpenBao cannot fetch its unlocking key from itself while sealed. Create bootstrap material once through an authorized private administrative path, preserve its identity, and never regenerate it automatically during redeploy. Protect permissions and mount scope; do not print secrets, embed them in command lines, or commit them.
- Establish recoverable owner-held material and replace the initial root token with scoped application credentials. A root token is not an ordinary application credential. Document scoped credential renewal/replacement.
- Readiness requires the expected vault identity, durable store, authorization policy, and active/unsealed state. Startup errors leave the affected service visibly unavailable; they do not enable a development bypass.
- Serialize vault replacement, or prove the selected storage locking/fencing before permitting overlapping writers. An app-only update must not recreate the vault/database unnecessarily.
- No live provider or vault secret may appear in client bundles, client-facing responses, model context, tool payloads, logs, repositories, or test fixtures. Authenticated server-side vault/provider transport and deliberately inert test credentials are permitted.
- Keep uploaded files behind authorized retrieval. Validate MCP endpoint/authorization discovery and redirects against unwanted access to cloud metadata, loopback, or private administrative services; intentionally authorized private MCP connections need explicit scoped rules. Local tool execution requires an independently tested permission boundary, not a claim that private networking alone is isolation.

### 7.3 Recovery, updates, and rollback

- Retain encrypted backups in an authorized location independent of the running VM. Include application and vault stores, media with consistent database references, and reproducible database roles/grants. Select schedule, retention, and recovery objectives explicitly. A persistent volume or an untested dump does not prove recovery.
- A database backup alone cannot recover the vault. Preserve the applicable static wrapping key and any historical wrapping keys required by that backup, together with required recovery authorization, through an owner-accessible path independent of the deployed app. Recovery shares cannot replace a lost auto-unseal wrapping key. None of this material belongs in GitHub.
- Restore into an isolated target and verify application records, attachments, vault identity, and a nonsecret canary. Test provider-key rotation/deletion, wrapping-key rotation, and replacement of the vault adapter while preserving or explicitly migrating credential references.
- Before migration/update, record source/build/configuration identities, app schema, vault version, backups, and recovery prerequisites. Test rollback compatibility: source rollback does not undo a database migration or external tool effect.
- A safe rollback uses a compatible, previously tested successor build or an unavailable maintenance state. It never reactivates archived A0. Avoid destructive volume-removal operations during ordinary updates.
- Verify service restart and release replacement. Demonstrate VM reboot recovery when the host can safely be rebooted within authority; otherwise retain that exact observation as BLOCKED and verify all nondisruptive startup evidence. Do not reboot shared workloads merely to manufacture a pass.
- Verify streaming, cancellation, owner sign-in, and data access through the actual HTTPS website from outside the VM. A healthy backend port, local preview, or successful merge is not the public-site acceptance result.

## 8. Build stages and completion

These stages organize work; all R01–R14 remain delivery obligations.

| Stage | Deliverable | Exit evidence |
| --- | --- | --- |
| B0 | Fresh implementation scaffold, owner identity, schemas, and versioned harness plan | Source/build identities recorded; archive remains isolated; A01/A03 design translated into executable checks |
| B1 | VM runtime + vault adapter + durable storage | Nonsecret canary survives service restart and release replacement; missing/wrong unlock material refuses access; A02/A12/A13 |
| B2 | One persisted DeepSeek conversation through the real adapter | Authenticated phone request, streamed response, close/reopen/continue; A03–A05/A14 |
| B3 | All four providers and extensible comparison | Real configured-provider calls and exact intended-context checks; A04/A06–A11/A16 |
| B4 | Attachments, voice, projects, and MCP coordination | A15/A18/A20–A23; no placeholder controls or unverified tool effects |
| B5 | Integrated HTTPS website release on the VM | Owner sign-in, real-phone browser evidence, restart/recovery and final acceptance; A17/A19/A24 plus all applicable earlier cases |

Frontend, adapter contract, and schema work may proceed alongside B1 using clearly identified test doubles. A fake provider/vault can prove local handling but cannot satisfy a live provider or production persistence gate.

Scope for this documentation update is the spec and Deep Code handoff. The builder is tasked with implementing and deploying the successor to completion on the existing VM within available authority. This documentation commit itself performs or certifies no application build, provider call, deployment, historical runtime restart, private-data migration, or retirement action. The handoff distinguishes ordinary build work from unavailable access, new paid resources, and destructive/shared-host changes.

## 9. Acceptance matrix

All cases below are **NOT RUN for the replacement**. These are required witnesses to implement, not existing test names or passing results.

| ID | Case and pass criterion | Fails if |
| --- | --- | --- |
| A01 | Only the configured owner can enter the application and access its records; unauthorized API/file/key/MCP access is denied | Anonymous/other-user access succeeds, or first visitor can claim ownership |
| A02 | Add/replace/delete a test credential through the adapter; retrieval occurs server-side with scoped policy | Root credentials become the ordinary app identity, or a secret is disclosed |
| A03 | New conversation has the identified standard harness and no previous conversation messages | History leaks across the boundary or harness identity is unknowable |
| A04 | Each of four configured providers performs a real authorized request; DeepSeek starts selected | A stub/fallback is reported as a real selected-provider pass |
| A05 | Continue switches provider/model with the complete intended prior context | Messages, selected attachments, or required tool history are silently lost |
| A06 | Enter comparison from single mode; all participants receive the same semantic context snapshot | The joining model loses prior history or participants receive different intended histories |
| A07 | Default next round includes every participant's responses with attribution | One answer silently replaces, excludes, or impersonates another |
| A08 | Selected-response policy affects every participant equally while keeping excluded answers saved | Selection deletes records, differs by participant, or grants tool execution |
| A09 | Move between one, two, three, and back to one participant without losing history | Schema/UI/coordinator assumes exactly two or destroys stored answers |
| A10 | Context/content incompatibility is reported before affected dispatch | Automatic truncation/summary or unsupported-content omission masquerades as full context |
| A11 | Missing/invalid/revoked credential gives a useful failure without provider substitution | A different provider is silently used or a key leaks |
| A12 | Nonsecret vault canary survives service restart and release replacement; wrong/missing wrapping key refuses access | State is lost, a new store is silently initialized, or a development bypass opens |
| A13 | Restore an encrypted backup with its applicable current/historical wrapping keys and required recovery authorization; verify identity and data, then test rotation/migration | Backup exists but cannot be restored, recovery shares are assumed to replace a lost wrapping key, or rotation loses the store |
| A14 | Saved conversation/project/file references survive app restart and redeploy; separate browser sessions/devices read consistent state | Cache/local process state is the only copy or restart silently drops data |
| A15 | Upload, authorize, retrieve, and deliver supported attachments; unsupported inputs have visible outcomes | Files cross owners, disappear, or are reported delivered when omitted |
| A16 | Rate limit, participant failure, disconnect, retry, and cancel retain honest per-participant outcomes | Partial/unknown results are labeled successful or duplicate billable requests are hidden |
| A17 | HTTPS website works in Erin's Android browser with keyboard, login, comparison, and reconnection | Desktop preview/emulation alone is claimed as real-phone acceptance, or ordinary use requires an APK/terminal |
| A18 | Projects and the explicitly documented voice mode complete their real website flows on the target phone browser | Static controls or undisclosed feature reductions count as completion |
| A19 | Session expiry/revocation, request protection, browser login return, and recovery enforce owner access | A stale/bypassed session exposes data or recovery bypasses authorization |
| A20 | Configure/authenticate/discover/enable/disable an MCP server and expose truthful capability/call status | A catalog entry is mistaken for a working authorized connection |
| A21 | Chat does not force an executor choice; actionable tools offer one/subset/all/cancel for the displayed run | Chat/context selection authorizes effects or nonselected actions are dispatched |
| A22 | Duplicate/conflicting actions, retries, and disconnects are coordinated with real receipts/idempotency limits | Duplicate irreversible effects occur silently or unknown outcomes are retried blindly |
| A23 | Cancellation stops new dispatch; actual earlier effects and untrusted-tool boundaries are reported | Cancellation is claimed to undo effects or same-user local processes are called sandboxed |
| A24 | Exact source/build/configuration identities, public surface, readiness, storage recovery, and rollback are verified on the VM's HTTPS website deployment | A merge/preview/green documentation check is presented as a healthy deployed application |

Each execution receipt should include case ID, exact source/build identity, environment, observation, test result, and redacted evidence location. Use PASS, FAIL, BLOCKED, or NOT RUN. No provider credentials, private message bodies, or recovery material belong in public receipts.

## 10. Source identities, provenance, and non-transfer

| Source | Exact identity / role |
| --- | --- |
| Prior published specification | The-Interdependency/a0 at d1b3169bd55ac67342505c940b9f548d56060d25; baseline for this VM/website revision; the original documentation baseline was 330772cc84574b031fe15238ae7556f2c7087f71 |
| Historical A0 source | f68304130f66b5afb73dde3352f24d8096bf21b9; preserved archive tree 573843696f7090e5164488f782e38eaccc5b64bd |
| Selected OpenBao fork | The-Interdependency/openbao at 4a8f475e88e4fa0c76ae1645a22faffe5596d361; candidate vault implementation and fork-specific metadata work |
| Canonical build doctrine | The-Interdependency/skill-lib at d71a3a938cb6d646ffc0b59186452117e4a37d13 |
| OpenBao's vendored reader source | skill-lib at 6bdbfe9c574e6b497f056ebd92655241fc56f681; distinct from the current doctrine pin; honor the consumer policy for metadata replay |
| Original product brief | a0-interface-build-brief-2026-10-27.md; SHA-256 dfed7c92135722269238ec4f040edb3a642adc66400cdaf6458132151f5970fb; owner decisions and proposals as captured on October 27 |
| Later owner decisions | OpenBao fork/MSDMD request; October 29 Replit hosting instruction and GitHub publication; latest superseding hosting/access instruction: "handoff for deep code to build a0 to completion on the vm. access should be a website thing." |

The [work graph](work-graphs/a0-replacement-spec.json) binds the inspected repositories and explicit non-transfer boundaries. It pins the input baseline; the commit containing this document identifies its published output. A digest detects content change and is not a signature.

This spec supersedes earlier requirements only where later owner instructions resolve them: OpenBao is the selected fork; the existing VM is now the application/backend host; website access replaces native Android packaging as the delivery requirement. All other R01–R14 scope remains. Technical deployment choices remain proposals until selected and verified by the builder. No mathematical, semantic, empirical, measurement, security certification, or runtime correctness status transfers from another project into A0.

Maintain upstream license and attribution obligations when importing component code. OpenBao retains its own MPL-2.0 obligations. This documentation change does not select a new successor-code license or alter historical licenses; resolve license/notice placement before distributing new binaries.

### Primary technical references

- [OpenBao fork MSDMD boundary](https://github.com/The-Interdependency/openbao/blob/4a8f475e88e4fa0c76ae1645a22faffe5596d361/docs/MSDMD.md)
- [Pinned PostgreSQL backend documentation](https://github.com/The-Interdependency/openbao/blob/4a8f475e88e4fa0c76ae1645a22faffe5596d361/website/content/docs/configuration/storage/postgresql.mdx)
- [Pinned static unseal documentation](https://github.com/The-Interdependency/openbao/blob/4a8f475e88e4fa0c76ae1645a22faffe5596d361/website/content/docs/configuration/seal/static.mdx)
- [Pinned seal/recovery-key distinction](https://github.com/The-Interdependency/openbao/blob/4a8f475e88e4fa0c76ae1645a22faffe5596d361/website/content/docs/concepts/seal.mdx)
- [Compose deployment on a server](https://docs.docker.com/compose/how-tos/production/), [startup/readiness](https://docs.docker.com/compose/how-tos/startup-order/), [restart policy](https://docs.docker.com/engine/containers/start-containers-automatically/), and [persistent volumes](https://docs.docker.com/engine/storage/volumes/)
- [Compose file-mounted secrets](https://docs.docker.com/compose/how-tos/use-secrets/) and [Docker daemon security](https://docs.docker.com/engine/security/)
- [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) and [reverse proxy/streaming](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [PostgreSQL backup/restore](https://www.postgresql.org/docs/current/backup.html)
- [MCP security guidance](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) and [tool contract](https://modelcontextprotocol.io/specification/latest/server/tools)
- Provider API/cache capability documentation: [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [xAI](https://docs.x.ai/developers/advanced-api-usage/prompt-caching), [DeepSeek](https://api-docs.deepseek.com/guides/kv_cache).

These live documentation links are navigation, not frozen runtime evidence. Recheck exact versions, features, quotas, costs, and deployment behavior at implementation time.

## 11. hmmm — decisions and evidence still required

| Open item | Consequence / resolution point |
| --- | --- |
| Actual VM execution and website address | Inspect the VM, existing services/proxy, resources, DNS/domain and TLS access; prove startup, private networking, storage, vault unsealing, serialized replacement, restart and restore. No address or VM identity is invented by this handoff. |
| Framework and concrete module/API contracts | Select supported versions, lock dependencies, and link source/test ownership at B0. |
| Default provider models and capabilities | Inspect current APIs, account access, file limits, context capacities, streaming/tool differences, and usage accounting before B2/B3. |
| Standard harness context | Resolve authoritative runtime instructions, memory inputs, assembly order, and version identity before context tests. |
| Identity and recovery | Select authentication integration, stable owner bootstrap, session storage and browser return flow before private release. |
| Voice definition | Set dictation/read-aloud versus continuous interruptible interaction and audio-provider behavior before voice acceptance. |
| Storage lifecycle and clients | Define retention/deletion/export, project context, synchronization, offline/resume, and active-stream switching behavior before corresponding acceptance cases. |
| MCP servers and effect coordination | Verify actual endpoints, credentials, grants, idempotency/reconciliation, cancellation, and execution isolation before tool release. |
| Limits and operating cost | Set concurrency/tool-step/spending limits from real quotas and owner constraints; do not invent a budget or conflate rate caps with participant-model limits. |
| Successor license and distribution | Resolve new-code license placement and upstream notices before distributing code/binaries. Native Android signing and store delivery are outside this website release. |
| Live acceptance | Real provider credentials and a real-phone pass remain unverified. Use secure setup surfaces; do not request secrets in a chat or commit them. |
| Legacy operations | Remaining hosted retirement/private-data receipts are separate work. They neither prove this successor exists nor authorize stopping shared hosts. |

No unresolved item above reopens VM hosting, website access, the four providers, phone-first design, general MCP, or the included attachments/voice/projects/tool scope.

