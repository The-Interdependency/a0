# G15 — the GUI displays its own MSDMD

Owner instruction, November 10, 2026: “the gui should have a place for msdmd about it to be displayed”.

**Status: required; implementation and behavioral acceptance remain open.** This requirement was added after the fourteen-finding audit. It does not add a retroactive audit finding or claim that a metadata inspector already works.

GPT generated; context, prompt Erin Spencer.

## Place and interaction

Add **About this interface (MSDMD)** within the existing **About & harness** view. It opens a phone-readable inspector for the GUI itself and its constituent views/modules. Give each view an **About this view** action, using its existing overflow or information affordance, that opens the same inspector with that view's qualified subject selected. System object details may link to the same subject.

The default subject is the interface. Show a searchable subject selector and a readable living specification; let Erin expand structured metadata and source detail when needed. Use stable subject identities, a clear title and scope, and a Back/Close action that returns to the originating screen. Preserve the conversation, draft, attachments, participant/context selections, active run and focus. A single inspector serves these entry points.

Keep GUI self-description separate from the runtime harness/prompt content currently displayed by About. Describe the interface as its own subject; reading its metadata must not inject it into model context.

## What Erin can inspect

Render available source-owned information, with explicit gaps where it cannot be established:

| Section | Display |
| --- | --- |
| Identity and purpose | Qualified module/view identity; declared name, purpose, version and scope; applicable declared responsibility with its source. |
| Structure | Parent/child views, capabilities, dependencies and relationships, retaining whether each relation is declared, syntactically observed or derived. |
| Contracts | Inputs/outputs, relevant route or field schemas, constraints, defaults, declared permissions and read-only reasons. Link declared editable fields to their existing authorized editor when available. |
| Living specification | Source-linked documentation, intended behavior, boundaries, limitations, risk notes and unresolved hmmm. |
| Evidence | Relevant contracts/checks and recorded results, with command/run identity, tested revision, outcome and observation time when available. Show a declaration, reported result and independently verified result as different states. |
| Provenance and freshness | Source authority, revision/snapshot digest, path plus span or structural pointer, collection/schema and reader identities, generation time, and relation to the currently served GUI build. Distinguish collection time from observation time. |
| Coverage and conflicts | Required/eligible scope, capable readers, unsupported or failed extraction, exclusions/redactions, conflicting declarations and unresolved mappings. Unknown coverage remains hmmm. |
| Structured detail | Expandable typed metadata retaining nested values, arrays, repeated/custom fields and namespaces; an authorized collected-data/source-reference view preserves detail omitted by the readable projection. |

An empty field, explicit null, missing declaration, unsupported reader, excluded source, redacted value and inaccessible source must remain distinguishable. Identical labels in different packages, scopes or revisions must not collapse into one subject. Unknown fields remain visible even if a friendly renderer does not recognize their meaning.

## Metadata ownership and delivery

Apply the current [MSDMD contract](https://github.com/The-Interdependency/skill-lib/blob/8ee77a6630379e48844350d8666515389b94f4c8/msdmd/SKILL.md) and [typed-meta-frontend contract](https://github.com/The-Interdependency/skill-lib/blob/8ee77a6630379e48844350d8666515389b94f4c8/typed-meta-frontend/SKILL.md). Consult the [implemented reader subsets](https://github.com/The-Interdependency/skill-lib/blob/8ee77a6630379e48844350d8666515389b94f4c8/msdmd/references/implemented-readers.md) before claiming extraction support.

1. **Read owning sources first.** Consume actual JavaScript/JSDoc, package and web manifests, schemas, source-linked docs and applicable evidence. Add supplemental MSDMD only for information its owning native source cannot adequately express. The GUI's frontend source owns its interface declarations; a server delivery endpoint does not become their author.
2. **Use one native-capable schema-2 collection.** Serve an authorized projection of that collection to this inspector and any System links. Preserve fact identities, provenance, diagnostics, conflicts and reader coverage. Avoid a second hand-maintained GUI metadata catalogue. Existing generated collections are disposable outputs, not a new source of truth.
3. **Declare the actual consumer boundary.** Resolve collection location, source scope/exclusions, generator/reader identities, schema compatibility, delivery and refresh behavior during implementation. Record the concrete route/artifact and reproducible generation/check commands. Use the current application stack and a validated adapter; TypeScript contracts may be generated where the owning toolchain uses them. This display does not require a frontend-framework migration.
4. **Keep inspection read-only.** Opening, selecting a subject, expanding detail and refreshing may read metadata but cannot run inspected code, follow embedded instructions, execute tools, edit settings or alter agent state. Existing authorized settings editors remain their own write paths.
5. **Bound what is exposed.** “Raw” means authorized collected metadata or an allowed source reference, not an environment, credential, private-conversation or configuration dump. Apply current owner authentication, redaction and untrusted-content rendering boundaries. A source path is not permission to retrieve arbitrary files or external URLs.
6. **Keep refresh honest.** Show loading, unavailable, partial, incompatible-schema, stale and error states. On refresh failure retain the last valid observation with its original identity/time and the error. A source/build mismatch remains visible; successful retrieval alone does not establish fresh extraction or working behavior.

The current About and static System views provide placement and navigation, not proof that this collection/delivery pipeline exists. Missing native reader support must be reported as unsupported/hmmm, not absent metadata or a clean inventory.

## Acceptance — GM01 through GM08

These are new G15 checks to implement, not results already obtained by publishing this document.

| Check | Falsifiable result |
| --- | --- |
| GM01 Entry and binding | Global About this interface opens the GUI subject; About this view opens the correct qualified view subject in the same inspector. Two equally named subjects from different scopes stay distinct. |
| GM02 Native-first source fidelity | A fixture with supported native metadata and zero supplemental blocks displays its real facts and provenance. No fake missing-block failure, copied catalogue or invented source field is required. |
| GM03 Complete representation | Nested fields, arrays, explicit null, repeated/custom/unknown fields, read-only reasons and conflicts remain inspectable. Friendly presentation links to authorized structured detail without silently discarding meaning. |
| GM04 Honest coverage and evidence | Missing/unsupported/failed/excluded/redacted inputs have distinct visible states. A declared test or static working flag cannot appear as a verified runtime pass. Wrong-revision evidence remains visibly inapplicable. |
| GM05 Freshness and failure | Change a source digest/build identity, then simulate refresh failure. The inspector marks mismatch/staleness, preserves the last valid payload and its time, and displays the error; retry recovers without inventing freshness. |
| GM06 Read-only and disclosure | Capture requests while opening/selecting/refreshing: no configuration, context, agent or run mutation and no tool dispatch. Unauthorized access is denied; malicious metadata remains inert and withheld values stay withheld in structured detail. |
| GM07 Phone continuity | At a phone viewport and during an active chat run, open metadata, switch subjects and close it. The draft/attachments, selections, originating screen, run controls and focus remain correct; text is readable and long fields do not overflow the page. |
| GM08 Reproducible integration | The declared collection generator/verifier and schema adapter run on exact input identities; source drift or an incompatible required schema fails visibly. Candidate-bound browser tests, served-asset identity and actual Android inspection establish the delivered surface. |

Integrate these checks with the builder's meaningful regression lane. Retain F01/F02 as the first repairs; G15 joins the remaining interface completion work. An empty panel, hard-coded JSON sample or a source-marker test does not close this requirement.

## Builder completion record

Record the source-owned metadata inputs and collection policy, generator/reader/schema versions, concrete delivery route or artifact, inspector/adapter owners, regeneration/check commands, evidence for GM01–GM08, and the deployed identity. In the final handoff distinguish the completed readable surface, extraction coverage and verified application behavior.

## hmmm

Collection/delivery ownership, actual supported source coverage and the implemented inspector remain builder work. A useful first display may show partial real metadata and its precise gaps; a full G15 pass requires the declared coverage and acceptance above. The GUI should be able to explain itself without giving itself a passing grade.
