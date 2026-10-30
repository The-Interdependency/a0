---
title: Deep Code handoff — build and release A0 on the VM
version: 1.0.0
status: ready_for_builder
implementation_status: not_implemented_at_handoff
deployment_status: not_verified_at_handoff
owner: Erin Spencer
date: "2026-10-29"
timezone: America/Los_Angeles
repository: The-Interdependency/a0
input_commit: d1b3169bd55ac67342505c940b9f548d56060d25
target: existing_VM
access: authenticated_responsive_HTTPS_website
---

# Deep Code — build A0 to completion on the VM

GPT generated; context, prompt Erin Spencer.

## 1. Assignment and finish line

Build, verify, and deploy the complete A0 replacement on the existing VM. Erin must be able to open its HTTPS website on the phone, sign in, configure keys/connections, and use the application. Ordinary use requires no terminal, APK, Replit workspace, or developer console.

The latest owner instruction is: **"handoff for deep code to build a0 to completion on the vm. access should be a website thing."** It supersedes the earlier Replit host and required native Android package. A responsive website is the required client; optional PWA installation must not become an access prerequisite.

**Finish means a working deployed product with evidence for the complete scope.** A plan, scaffold, mockup, first-provider demo, green build, or PR alone does not satisfy this assignment. Continue through implementation, integration, deployment, and acceptance. Where an external prerequisite is genuinely unavailable, complete every unblocked part and state the exact remaining gate; do not label the whole product complete.

This handoff is documentation. No application or deployment was created by its publication.

## 2. Read and resolve before editing

1. Read root [AGENTS.md](../AGENTS.md), the complete [replacement specification](a0-replacement-spec.md), and its [source work graph](work-graphs/a0-replacement-spec.json). The specification owns R01–R14, A01–A24, and product contracts; this document owns the builder's execution sequence.
2. Resolve current [skill-lib instructions](https://github.com/The-Interdependency/skill-lib/blob/main/AGENTS.md) and relevant skills, recording the exact commit used. This handoff inspected d71a3a938cb6d646ffc0b59186452117e4a37d13. Preserve source-owned native metadata and supplement only missing facts. Read the [resource-run invariant](https://github.com/The-Interdependency/skill-lib/blob/d71a3a938cb6d646ffc0b59186452117e4a37d13/RESOURCE_RUN_INVARIANT.md) before expensive work.
3. Inspect the actual VM, authorized account, repository remote/branch/head, and uncommitted work. Record OS/architecture, CPU/RAM/free disk, existing workloads, service manager, available container runtime, listeners, reverse proxy, firewall/cloud ingress, and existing hostname/TLS configuration. Do not print environment dumps or secret files.
4. Use the existing checkout when suitable; isolate unrelated local work rather than resetting it. If no checkout exists, clone the repository. Check for newer successor implementation before building anew. This input baseline is d1b3169bd55ac67342505c940b9f548d56060d25; the commit containing this handoff is the revised source, not an instruction to reset to the old baseline.
5. Resolve available owner authentication, provider-key entry, authorized MCP endpoints, durable storage, and backup destination from legitimate existing configuration. Never invent a VM address, account, domain, provider key, or permission. Do not recover active credentials by copying archived A0 configuration.
6. Record selected architecture, concrete file plan, required verification, rollout, and rollback before implementation. Choose routine engineering details autonomously from current primary documentation; keep consequential unavailable inputs explicit.

Use the granted VM and repository authority to build and deploy the successor. Preserve unrelated services and user changes. New paid infrastructure, destructive data changes, or authority you do not possess are separate boundaries; isolate the blocked step and finish unaffected work. Do not turn normal reversible implementation choices into repeated approval requests.

The archive is historical material, not a bootable starter kit. Preserve its tree identity 573843696f7090e5164488f782e38eaccc5b64bd. Historical ZFAE/PCNA/UCNS, pricing, bridges, old agents, and old test suites are not replacement requirements.

## 3. Product that must be usable

Implement the complete canonical specification. The following is the execution checklist, not a substitute for its detailed contracts:

| Website flow | Required usable result |
| --- | --- |
| Entry and ownership | Phone-friendly sign-in to Erin's preconfigured account; no public registration or first-visitor ownership claim. Every API, file, project, key, and MCP operation enforces ownership server-side. |
| Chat and history | Streaming answers, stop/cancel feedback, saved conversations, reopen/continue, and visible failures. Store history independently of provider caches. |
| Provider settings | Secure BYOK setup for OpenAI, Anthropic, xAI, and DeepSeek. DeepSeek starts selected; resolve real model IDs/capabilities at build time. Keys are write-only/masked in normal settings and resolved server-side through OpenBao. |
| Switching | Offer New conversation, One answer / continue, and Compare models at switching time. Preserve full intended context and the versioned harness; never silently summarize, truncate, or substitute providers. |
| Comparison | Two participants work comfortably on a phone; the model and coordinator also handle C, D, and later participants. Preserve attributed answers, one shared semantic snapshot, default inclusion of all responses, and an explicit selected-response alternative. |
| Files, voice, projects | Real authorized uploads and model delivery; microphone capture/transcription and spoken answers for the selected voice mode; persistent projects and inspectable context rules. No decorative controls standing in for missing backend work. |
| Tools | Configurable MCP authentication, discovery, connection status, enable/disable, and actual invocation. At actionable proposals offer one participant, a subset, all, or cancel; coordinate duplicate/conflicting effects and preserve actual outcomes. |
| Recovery and use | Sessions, reconnect, errors, keys/connections setup, and stored history work through the website. An Android browser is the target phone client; the desktop website remains usable. |

Build one coherent mobile interface: project/history navigation, a readable conversation, a keyboard-safe composer with attachment/voice actions, provider/model switching, comparison views, tool-action selection, and settings. Make error, loading, empty, disabled, and partial-result states honest. Use the ChatGPT mobile interaction reference without adding a developer playground or unrelated agent dashboards.

**Initial voice implementation choice:** implement dictation plus spoken responses unless available evidence supports a better compatible choice. Record the choice and test it on the target browser; continuous full-duplex conversation is not an assumed requirement. Select working browser capabilities or supported speech services and disclose any service/credential dependency. A microphone icon, a mock transcript, or a desktop-only pass cannot close A18.

Keep chat participation, future-context inclusion, and tool-execution authorization as separate state. Model output, tool descriptions/results, and attachments cannot grant permissions. Local arbitrary tool code must not inherit host administration, Docker control, vault secrets, or unrestricted files/network; implement and test an actual execution boundary before enabling it. Remote MCP support must remain general rather than a fixed service catalog.

## 4. Deployment starting design

Use specification section 7 as the operational contract. The default proposal is a dedicated single-host Compose deployment with HTTPS ingress, A0, PostgreSQL, and the selected OpenBao fork. Reuse suitable existing VM infrastructure when inspection supports it; record a justified change instead of creating competing supervisors or replacing shared services.

- Provide a stable, browser-reachable HTTPS URL with owner authentication. Reuse an authorized hostname and proxy if present. If DNS/TLS authority is absent, prepare and verify the rest, then name the exact routing action needed. An SSH tunnel, localhost address, insecure preview, or certificate-warning workaround is not the delivered access path.
- Publish only website ingress. Database/vault services stay private. Separate containers use scoped service networks and service names, not each other's loopback. Preserve persistent database, media, and certificate storage across replacement.
- Build the selected OpenBao fork at 4a8f475e88e4fa0c76ae1645a22faffe5596d361, identify the resulting binary/image, and reuse it. An explicitly reviewed pin update is permitted with updated provenance and relevant checks; do not silently replace the selected fork.
- Supply the static seal key through a protected host file mounted read-only only into Bao, using its supported file seal. Keep a separate scoped application credential, validate vault identity, and fail closed on missing/wrong key or unavailable store. Do not auto-initialize a fresh vault during ordinary startup.
- Use separate application/vault database roles and migration ownership. Keep uploads authorized and persistent. Preserve encrypted backups outside the running VM and independently recoverable current/historical wrapping keys plus required recovery material.
- Verify readiness, restart/boot configuration, real HTTPS streaming/cancellation, backup restoration into an isolated target, and compatible rollback. Do not disrupt shared workloads to force a reboot test; record that specific blocked observation.

The host remains a trust boundary. Compose secret mounts, container networking, hashes, and a source-supported feature are not independent security certification or runtime proof. Source references and vault recovery details live in the specification.

## 5. Execute in dependency order

| Stage | Build and verify | Checkpoint |
| --- | --- | --- |
| B0 | Inventory; choose supported stack and locked dependencies; owner bootstrap; schemas/API and permissions; harness version; UI/file plan; acceptance witnesses | Real build/test commands, recorded decisions, no archive revival |
| B1 | VM services, scoped vault adapter, database/media persistence, secret handling, restart/restore mechanisms | Canary survives replacement; wrong/missing key and wrong store fail closed; relevant A02/A12/A13 evidence |
| B2 | First complete authenticated DeepSeek website flow with durable history and streaming | Real phone-browser request when access is available; save/reopen/continue; A03–A05/A14 |
| B3 | Other providers, model/capability handling, switching, comparison and selected history | Real configured-provider calls plus deterministic snapshot tests; A04/A06–A11/A16 |
| B4 | Full file/image, documented voice, project, and MCP lifecycle/execution flows | A15/A18/A20–A23, including negative and partial-failure cases |
| B5 | Integrated production release on the VM; public HTTPS, sessions, recovery, operator guide, device acceptance | A01/A17/A19/A24 and every other required case accounted for; exact deployed identity |

Independent UI/contract work may proceed while infrastructure is being resolved. Test doubles must be explicitly identified and cannot pass live-provider or production-vault gates. Missing keys do not justify missing adapters, configuration flows, comparison, or persistence. Keep the application ready for secure credential entry and continue all unblocked implementation.

Before a costly build/test run, inspect resource fit, workload, quotas, and the available session. Avoid broad repeated builds, unnecessary model calls, or exhaustive archived metadata scans. Cache the pinned Bao artifact and reuse decisive evidence until its owning inputs change. Once a healthy compute run starts, let it finish; do not invent an arbitrary timeout to call it bounded.

Commit coherent verified stages and push through the repository's actual permitted workflow. Do not force-push or bypass protections. Use a durable terminal/session manager already supported on the VM for long tasks, with logs and exit results that survive a client disconnect.

## 6. Verification and durable evidence

Implement meaningful checks against the actual failure boundaries; do not mirror implementation or use placeholders to make the suite green. At minimum, cover unauthorized access, credential redaction, context fidelity and provider capability mismatch, three-or-more participants, persistence/restart, attachment ownership, interrupted streams, quota failures, tool authorization/duplicates/unknown effects, and vault restoration.

Run revised A01–A24. Record each as PASS, FAIL, BLOCKED, or NOT RUN with exact source/build identity, environment, actual command/manual procedure, outcome, and redacted evidence. A failed prerequisite must not be hidden by omitting its case. Fix failing code and rerun affected checks; retain honest history.

Create these source-owned deliverables during the build; these paths are planned outputs, not claims that files or commands already exist:

| Output | Required content |
| --- | --- |
| Runtime manifests and lockfiles | Reproducible chosen toolchain/dependencies; real build, test, and run commands |
| operations deployment configuration | Actual service/proxy, private networking, volumes, readiness, nonsecret variable examples, boot/restart behavior, and reversible release procedure |
| operations/README.md | First setup, owner/key setup, start/status/logs/update, backup/restore/rotation, rollback, and recovery instructions verified against the implementation |
| docs/build-status.md | Resumption record described below; one canonical current next action |
| docs/acceptance.md | R01–R14 mapping to implementation and A01–A24; receipts and exact unrun/blocked gates |
| docs/release.md | Deployed source/image/schema/configuration identities, actual website URL, verification results and operator handover; no secret configuration values |

After every coherent stage and before a session/context limit, update docs/build-status.md with: current commit/branch and uncommitted work; implemented requirements; passing/failing/blocked gates; selected decisions; durable data paths by nonsecret reference; running jobs and how to observe them; next command/action; and outstanding hmmm. Resume from that record and repository state instead of rebuilding completed stages.

Public evidence must contain no credentials, recovery material, private operational secrets, or private conversation/file content. Use inert fixtures and redacted receipts. Keep needed sensitive operational detail in authorized private configuration, referenced by purpose.

## 7. Final response and completion test

Return to Erin with:

1. The working HTTPS website URL and how to complete secure owner sign-in/key setup.
2. Exact deployed source commit, release artifact identities, and service readiness/restart status.
3. A concise feature and A01–A24 result summary, with the evidence record link.
4. Verified update, backup/restore, and rollback instructions.
5. A precise hmmm section naming any remaining external action and what it blocks.

Report implementation, deployment, and acceptance separately. Full completion requires the complete product and its required acceptance evidence. Automated mobile emulation does not establish Erin's actual-phone result. If that observation or a live credential is unavailable, leave the affected gate BLOCKED, make the build/deployment otherwise ready, and request only the missing operator action.

## hmmm at handoff

The actual VM inventory, available hostname/DNS/TLS authority, stable owner bootstrap, provider and MCP access, off-VM backup destination, and real-phone observations have not been inspected by this documentation task. Deep Code must discover what is already available, resolve routine engineering choices, and preserve any irreducible access boundary honestly. Those unknowns do not reopen the agreed VM, website, four-provider, file/voice/project, comparison, or MCP scope.
