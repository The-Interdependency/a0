# Source retrieval

Original: a0-interface-build-brief-2026-10-27.md, Library ID libfile_2d06c161c954819192cad698bdc9432c. Retrieved text lines 1-125 of 125; complete returned text. Its Replit/native-Android delivery choices are superseded by the October 29 VM/browser instruction.

---

# A0 interface iteration — build brief

Date: 2026-10-27 (America/Los_Angeles)  
Attribution: GPT generated; context, prompt Erin Spencer.  
Status: Requirements captured from this conversation. No application implementation, deployment, or live acceptance checks have been completed in this work.

## Usage

Use this brief to design and implement the fresh A0 interface. User-set requirements below govern the build. Proposed implementation details remain revisable; unresolved matters stay visible under hmmm. The latest instruction in the conversation supersedes an earlier conflicting preference.

The previous A0 implementation was found under `archive/` at repository commit [1ff51f3161b04dc7f9cf9921e7ed1a07d6747e47](https://github.com/The-Interdependency/a0/tree/1ff51f3161b04dc7f9cf9921e7ed1a07d6747e47). That inspection establishes the source state observed during this discussion, not the health of a deployment. Archived architecture and services do not automatically become requirements of this iteration.

## Settled product scope

| Area | Requirement |
| --- | --- |
| Hosted interface | Replit-hosted website, with ChatGPT's mobile website as the interaction reference. |
| Phone interface | Android app, with ChatGPT's Android app as the interaction reference. |
| Design priority | Phone first on both surfaces. Developer Playground is not the reference. |
| Initial ownership | Erin's account only. Keep the architecture modular enough to add users later. |
| Providers | OpenAI, Anthropic, xAI, and DeepSeek through BYOK. |
| Initial provider | DeepSeek. The exact model remains configurable and has not been selected here. |
| Initial capabilities | Chat, file/image attachments, voice, projects, and tool execution. All four additions are in scope. |
| Comparison scale | Usually two models at a time; preserve the option to add C, D, and further participants. Two is a normal use case, not a structural maximum. |
| Credential storage | An open-source secrets vault sourced from GitHub, accessed through a replaceable integration. Phone hosting was subsequently ruled out by the user for this iteration. |
| Tools | General MCP support: discover and invoke capabilities exposed by configured servers. A fixed catalog of services is not a prerequisite for the interface. |

## Provider switching

Present these choices at the time of switching:

| Choice | Context behavior |
| --- | --- |
| New conversation | Start with standard harness context. Do not carry over the previous conversation's history. |
| One answer | Continue the conversation with the selected provider/model receiving the full conversation context. |
| Compare models | Send the same prompt and context snapshot to the selected participants and present their answers for comparison. |

Entering comparison from a single-model conversation must give the joining participant the entire existing prompt/response history. Apply any deliberately selected history policy consistently to all participants in later comparison rounds.

Keep provider/model attribution on each answer. Retain the saved conversation independently of provider caches. A cache miss must not discard history; a full-context request must not silently become a summary or truncated request.

The UI must make unavailable credentials, unsupported content, and insufficient context capacity visible. Exact model capabilities and cache behavior require checks against the selected providers at implementation time.

## Comparison history

Default: every participant receives all participants' responses on subsequent turns.

Preserve an alternative to select which responses enter subsequent model context. With additional participants, the selector generalizes to a chosen subset. All participants receive the same resulting history; saved alternate responses remain available even when excluded from future prompts.

Participant count, conversation-history selection, and tool-execution selection are separate controls. Selecting an answer for future context does not itself authorize its proposed tool actions.

A proposed participant record contains provider, model, settings, and a credential reference. Multiple participants may use the same provider. These are implementation consequences of the expandable design, not a claim that any particular model combination has been tested.

## Chat-to-tool transition

Ordinary comparison chat does not require an executor selection.

When tool use is proposed, present the proposed actions and let Erin choose which participant or participants execute: one, a subset, all, or cancel and remain in chat. The choice applies to the displayed tool run. Do not force an execution-owner decision when merely selecting comparison models.

Return execution results to the shared conversation history. Preserve which participant requested an action, which action actually ran, and its result.

The implementation must explicitly coordinate duplicate or conflicting actions when multiple participants are selected. A cancel request must report its actual outcome; it does not imply that an external effect has been undone.

## MCP boundary

A0 is the host for configurable MCP connections. The interface needs connection setup, authentication, capability discovery, enable/disable controls, visible call status/results, and cancellation feedback.

Model switching retains configured connections. Provider adapters translate model-facing tool requests into the shared execution route. The available capabilities come from configured servers and their granted permissions.

Server discovery and protocol support are not proof that a particular service is connected or authorized. Connection and authorization checks belong to setup and verification, not to a user-maintained hard-coded tool list.

## Modularity and current proposals

Keep identity, conversation state, provider adapters, comparison coordination, vault access, attachments, voice, projects, MCP connections, and presentation independently replaceable where their responsibilities differ. This is a proposed decomposition of the user's modularity requirement.

- OpenBao is the current server-vault recommendation, not a user-ratified deployment or an installed service.
- A persistent external host is the current vault-hosting direction. Erin's existing VM is a candidate whose current access and suitability have not been verified.
- Keep credential values out of prompts, ordinary logs, tool traces, and checked-in code. Let provider configurations refer to secrets by identity.
- Include a documented encrypted backup, recovery, and migration path; replacing a vault must preserve credential references or migrate them explicitly.
- Proposed mobile comparison layout: readable horizontally scrollable answer panes, with expansion for reading. Side-by-side comparison remains available.
- Proposed request boundary: apply provider/model changes to a subsequent request. The behavior of switching during an active stream remains to be specified.
- Display usage, estimated costs when available, and actual quota/context constraints. Preserve incomplete or failed participant results visibly.

These proposals require implementation evidence; their presence in this brief does not establish security, compatibility, or runtime availability.

## Acceptance evidence to produce

The completed application should demonstrate the following. None is claimed as passed.

1. Both interfaces work on Erin's phone, including composer behavior with the keyboard open, attachments, voice, projects, and MCP execution.
2. All four provider adapters can make real authorized calls when configured. DeepSeek is initially selected. Missing or invalid credentials produce a useful error without silently selecting another provider.
3. New conversation, one answer, and compare modes preserve their distinct context rules.
4. A conversation can move from one to two to three participants and back without losing stored answers. Every comparison round uses the same intended context for all selected participants.
5. Both the default all-responses history and deliberate subset selection produce the expected next-turn context.
6. Tool selection appears when proposed actions become actionable. Only the selected execution scope runs; cancel produces no newly authorized effects.
7. Multiple-executor tests expose and coordinate duplicate/conflicting actions, including retry and disconnect scenarios.
8. Conversation/file persistence and vault backup/restore survive the relevant process restart or migration. Credentials do not appear in prompts or logs.
9. Provider context limits, rate limits, participant failures, and network interruption remain visible. No failed model or missing history is silently represented as successful completion.

## hmmm — remaining implementation decisions

- Exact default models, supported file/image types, context capacities, and provider feature differences.
- Standard harness context: its authoritative instructions, memory inputs, and version boundary.
- Voice modes: dictation/read-aloud versus continuous interruptible conversation, and the audio services to use.
- Web/Android synchronization, storage placement, retention, and offline/resume behavior.
- Sign-in, session handling, and account recovery for the initial single user.
- Actual vault host, software/deployment choice, bootstrap credentials, backup, recovery, and migration verification.
- Initial MCP endpoint availability and authentication, plus the execution coordinator's handling of conflicting effects.
- Switching during a live response and cancellation/partial-response behavior.
- Concrete concurrency and spending controls, based on actual provider quotas and operator preferences.

These are visible gaps, not a batch questionnaire. Recover external facts from current sources and environments; ask Erin only for a consequential preference that cannot be reasonably resolved otherwise.

## Sources and standing

The requirements above derive from this conversation. Technical sources consulted during it include:

- [skill-lib](https://github.com/The-Interdependency/skill-lib): organization workflow and preservation guidance.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) and [tools](https://modelcontextprotocol.io/specification/latest/server/tools): discovery and invocation boundaries.
- [OpenBao](https://github.com/openbao/openbao): proposed vault implementation.
- [Replit deployment guidance](https://docs.replit.com/cloud-services/deployments/about-deployments): persistence considerations.
- Provider documentation for [OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching), [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [xAI](https://docs.x.ai/developers/advanced-api-usage/prompt-caching), and [DeepSeek](https://api-docs.deepseek.com/guides/kv_cache): caching boundaries, to be rechecked for the selected models.

This brief preserves user decisions, proposed implementation choices, and unverified conditions as distinct states.


