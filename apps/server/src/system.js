// Successor system inventory for the GUI System view (G02/G03/G04).
// Source-attributed; freshness is the deployed build commit. This is an
// application-relations inventory, not a UCNS geometry claim.
import { HARNESS_VERSION } from './harness.js';

export const SYSTEM_BUILT_FROM = 'apps/server/src/system.js';

export const SYSTEM_OBJECTS = [
  // Views and surfaces
  { id: 'view-chat', label: 'Chat workspace', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'Conversations, composer, participants, comparison, attachments and voice.', next: { minimal: 'Send one message to the selected participant(s).', maximalFeasible: 'Run a three-participant comparison with attribution and history selection.', maximalPotential: 'Continuous interruptible voice conversation (service support unresolved).' } },
  { id: 'view-system', label: 'System explorer', kind: 'view', categories: ['research', 'implementation'], state: 'working', source: 'apps/web/index.html', description: 'Narrative, Relations and Attention entry views over the successor inventory.', next: { minimal: 'Inspect one object and its evidence.', maximalFeasible: 'Traverse recorded and inferred relations with return navigation.', maximalPotential: 'Live refresh from external source adapters (unmet adapter prerequisites).' } },
  { id: 'view-providers', label: 'Providers view', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'BYOK OpenAI, Anthropic, xAI and DeepSeek key management and test requests.', next: { minimal: 'View key presence without values.', maximalFeasible: 'Test one provider request with a configured key.', maximalPotential: 'Quota/cost forecast from provider usage APIs (not integrated).' } },
  { id: 'view-participants', label: 'Participants view', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'Provider + model participant records with model-specific settings.', next: { minimal: 'Inspect one participant.', maximalFeasible: 'Edit model and supported settings; verify the next request uses them.', maximalPotential: 'Per-provider capability live refresh (not integrated).' } },
  { id: 'view-agents', label: 'Forge agents view', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'Eight-template Forge agent creation, editing, retirement and PTCNA state.', next: { minimal: 'Create one retained agent.', maximalFeasible: 'Run two isolated agents and observe independent state.', maximalPotential: 'Full queue/worker lineage modes (not implemented).' } },
  { id: 'view-ahbg', label: 'AHBG view', kind: 'view', categories: ['research', 'implementation'], state: 'working', source: 'apps/web/index.html', description: 'Sessions, board, turn controls, records, replay and the mechanic matrix.', next: { minimal: 'Create a session and inspect the board.', maximalFeasible: 'Run an agent-driven turn and verify replay.', maximalPotential: 'Full mechanic-to-rule matrix coverage (several entries NOT RUN).' } },
  { id: 'view-about', label: 'About & harness', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'Harness version, owner preferences, options inventory and password change.', next: { minimal: 'Read the harness version.', maximalFeasible: 'Change one owner preference and observe it persist.', maximalPotential: 'Signed release provenance from build metadata (partial).' } },

  // Server modules
  { id: 'mod-server', label: 'Express app server', kind: 'skill', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'apps/server/src/index.js', description: 'Authenticated API surface, routes and run orchestration.', next: { minimal: 'Serve /api/health.', maximalFeasible: 'Run all authenticated flows.', maximalPotential: 'Multi-tenant authorization (not required for owner-only).' } },
  { id: 'mod-providers', label: 'Provider adapters', kind: 'skill', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'apps/server/src/providers.js', description: 'OpenAI Responses streaming, Anthropic, xAI and DeepSeek adapters with usage normalization.', next: { minimal: 'One real request per configured provider.', maximalFeasible: 'All four providers with keys.', maximalPotential: 'Live capability/catalogue refresh (not integrated).' } },
  { id: 'mod-contexts', label: 'Context assembler', kind: 'skill', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/contexts.js', description: 'Source-attributed blocks, revisions, freeze and cache-prefix estimation.', next: { minimal: 'Inspect the current revision.', maximalFeasible: 'Edit a block and dispatch the new revision.', maximalPotential: 'Observed cache-hit verification per provider (credentials needed).' } },
  { id: 'mod-runs', label: 'Run coordinator', kind: 'skill', categories: ['operations', 'digital'], state: 'working', source: 'apps/server/src/runs.js', description: 'Run registry, dispatch, tool coordination, Stop and usage recording.', next: { minimal: 'One single-participant run.', maximalFeasible: 'Comparison run with tool authorization and Stop.', maximalPotential: 'Per-run cost ceilings (not implemented).' } },
  { id: 'mod-mcp', label: 'MCP host', kind: 'skill', categories: ['operations', 'digital'], state: 'working', source: 'apps/server/src/mcp.js', description: 'MCP connection discovery/invocation with SSRF guard; no local shell execution.', next: { minimal: 'Connect one MCP server.', maximalFeasible: 'Discover and invoke a tool with authorization.', maximalPotential: 'OAuth MCP authorization (not implemented).' } },
  { id: 'mod-vault', label: 'OpenBao adapter', kind: 'skill', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'apps/server/src/vault.js', description: 'KV v2 credential storage; keys are never returned to the browser.', next: { minimal: 'Read key presence.', maximalFeasible: 'Rotate a key via the owner.', maximalPotential: 'Per-key least-recent-use audit (not implemented).' } },
  { id: 'mod-ptcna', label: 'PTCNA producer client', kind: 'skill', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/ptcna.js', description: 'Sidecar client for retained phi/psi/omega state, infer, fork/absorb/converge.', next: { minimal: 'Inspect one agent state.', maximalFeasible: 'Fork/absorb/converge two agents.', maximalPotential: 'Producer merge module full coverage (partial).' } },
  { id: 'mod-ahbg', label: 'AHBG successor adapter', kind: 'skill', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/ahbg.js', description: 'Per-turn observe/plan/resolve over the pinned Stack runtime engine.', next: { minimal: 'Create a session.', maximalFeasible: 'Agent-driven turn with replay verification.', maximalPotential: 'Full mechanic matrix (several entries NOT RUN).' } },
  { id: 'mod-retained', label: 'Retained definitions', kind: 'skill', categories: ['research', 'theory'], state: 'working', source: 'apps/server/src/retained/definitions.js', description: 'Exact eight Forge templates and Phi/Psi/Omega cores with digests and source pins.', next: { minimal: 'List the eight templates.', maximalFeasible: 'Spawn an agent with the exact archived original.', maximalPotential: 'Provenance beyond pinned digests (upstream archive).' } },

  // Data and boundaries
  { id: 'data-conversations', label: 'Conversations and messages', kind: 'data', categories: ['operations', 'digital'], state: 'working', source: 'apps/server/src/db.js', description: 'Durable conversations, participants, messages, attachments and usage.', next: { minimal: 'List history.', maximalFeasible: 'Resume one conversation with full context.', maximalPotential: 'Cross-device sync (not required).' } },
  { id: 'data-context-revisions', label: 'Context revisions', kind: 'data', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/db.js', description: 'Immutable revision history of effective context blocks.', next: { minimal: 'Inspect the latest revision.', maximalFeasible: 'Create a revision and dispatch it.', maximalPotential: 'Revision diff UI (not implemented).' } },
  { id: 'data-agents', label: 'Retained agents', kind: 'data', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/db.js', description: 'Agent identity, bound conversation/participant, lineage and module state.', next: { minimal: 'List agents.', maximalFeasible: 'Two isolated agents with state.', maximalPotential: 'Queue/worker modes (not implemented).' } },
  { id: 'data-ahbg-sessions', label: 'AHBG sessions', kind: 'data', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/db.js', description: 'Owner-scoped sessions with board, turn records and provenance.', next: { minimal: 'List sessions.', maximalFeasible: 'Turn + replay verification.', maximalPotential: 'Full mechanic matrix coverage.' } },
  { id: 'data-usage', label: 'Usage observations', kind: 'data', categories: ['operations', 'digital'], state: 'working', source: 'apps/server/src/db.js', description: 'Recorded token/cache/reasoning usage per participant.', next: { minimal: 'Inspect one observation.', maximalFeasible: 'Cache read/write separation per turn.', maximalPotential: 'Cost aggregation (not implemented).' } },
  { id: 'boundary-auth', label: 'Owner authentication', kind: 'boundary', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'apps/server/src/auth.js', description: 'scrypt password, HMAC-signed sessions, CSRF header check.', next: { minimal: 'Sign in.', maximalFeasible: 'Password change.', maximalPotential: 'Recovery codes (not implemented).' } },
  { id: 'boundary-csp', label: 'Content-Security-Policy', kind: 'boundary', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'operations/Caddyfile', description: 'Served CSP, HSTS and frame denial headers.', next: { minimal: 'Inspect headers.', maximalFeasible: 'Verify no inline scripts in the bundle.', maximalPotential: 'Report-only CSP iteration (not configured).' } },
  { id: 'boundary-mcp-ssrf', label: 'MCP SSRF guard', kind: 'boundary', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'apps/server/src/mcp.js', description: 'Blocks loopback/private/cloud-metadata endpoints unless explicitly allowed.', next: { minimal: 'Reject one private endpoint.', maximalFeasible: 'Allow one loopback endpoint explicitly.', maximalPotential: 'Egress allowlist (not implemented).' } },
  { id: 'service-openbao', label: 'OpenBao service', kind: 'operation', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'operations/openbao.service', description: 'Static auto-unseal KV v2 store on loopback.', next: { minimal: 'Health check.', maximalFeasible: 'Backup/restore with canary.', maximalPotential: 'Off-VM recovery copy (operator action).' } },
  { id: 'service-caddy', label: 'Caddy HTTPS ingress', kind: 'operation', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'operations/a0-caddy.service', description: 'Automatic TLS for ports 80/443 only.', next: { minimal: 'Verify certificate.', maximalFeasible: 'Reload configuration.', maximalPotential: 'Custom domain (operator action).' } },
  { id: 'service-ptcna', label: 'PTCNA sidecar', kind: 'operation', categories: ['research', 'implementation'], state: 'working', source: 'operations/a0-ptcna.service', description: 'Producer PTCNA runtime on loopback with per-agent state.', next: { minimal: 'Health check.', maximalFeasible: 'Infer and fork.', maximalPotential: 'Full merge algebra coverage (partial).' } },
  { id: 'service-ahbg', label: 'AHBG sidecar', kind: 'operation', categories: ['research', 'implementation'], state: 'working', source: 'operations/a0-ahbg.service', description: 'Producer Stack runtime engine on loopback.', next: { minimal: 'Health check.', maximalFeasible: 'Observe/resolve a turn.', maximalPotential: 'Mechanic matrix coverage.' } },
  { id: 'svc-postgres', label: 'PostgreSQL 16', kind: 'operation', categories: ['infrastructure', 'maintenance'], state: 'working', source: 'operations/install.sh', description: 'Durable application state database.', next: { minimal: 'Health check.', maximalFeasible: 'Backup/restore.', maximalPotential: 'Replication (not required).' } },

  // Known gaps (honest states)
  { id: 'gap-ucns', label: 'UCNS geometry mapping', kind: 'attention', categories: ['research', 'theory'], state: 'construction', source: 'docs/handoffs/deepseek-gui/START-HERE.md', description: 'The System view shows application relations; no UCNS geometry is claimed.', next: { minimal: 'Label application relations as such.', maximalFeasible: 'None until producer geometry is resolved.', maximalPotential: 'Producer-owned UCNS mapping.' } },
  { id: 'gap-phone', label: 'Physical Android acceptance', kind: 'attention', categories: ['operations', 'physical'], state: 'construction', source: 'docs/mobile-chat-repair.md', description: 'A17/A18/OC09/RX01 remain operator observation on Erin\u2019s handset.', next: { minimal: 'Run the recorded phone runbook.', maximalFeasible: 'Record one observed flow per gate.', maximalPotential: 'Full handset acceptance of G01\u2013G14.' } },
  { id: 'gap-live-providers', label: 'Live provider grants', kind: 'attention', categories: ['operations', 'digital'], state: 'construction', source: 'docs/acceptance.md', description: 'OpenAI/xAI/DeepSeek keys imported; Anthropic key absent.', next: { minimal: 'Import the Anthropic key.', maximalFeasible: 'One real request per provider.', maximalPotential: 'Rate/context ceiling tests.' } },
  { id: 'gap-stream-recovery', label: 'Active-stream reattachment after page destruction', kind: 'attention', categories: ['operations', 'digital'], state: 'broken', source: 'docs/mobile-chat-repair.md', description: 'Recorded gap: reloading after the page is destroyed does not reattach an in-flight stream.', next: { minimal: 'Document the behavior honestly.', maximalFeasible: 'Server-side stream registry for reattachment.', maximalPotential: 'Full reattachment with resume tokens.' } },
];

export const SYSTEM_RELATIONS = [
  { id: 'rel-skills-tools', from: 'mod-providers', to: 'view-chat', kind: 'recorded', label: 'exposes model calls to', source: 'apps/web/app.js' },
  { id: 'rel-tools-ops', from: 'view-chat', to: 'mod-runs', kind: 'recorded', label: 'dispatches through', source: 'apps/web/app.js' },
  { id: 'rel-runs-mcp', from: 'mod-runs', to: 'mod-mcp', kind: 'recorded', label: 'coordinates tool execution with', source: 'apps/server/src/runs.js' },
  { id: 'rel-mcp-ssrf', from: 'mod-mcp', to: 'boundary-mcp-ssrf', kind: 'recorded', label: 'is guarded by', source: 'apps/server/src/mcp.js' },
  { id: 'rel-server-db', from: 'mod-server', to: 'svc-postgres', kind: 'recorded', label: 'persists through', source: 'apps/server/src/db.js' },
  { id: 'rel-server-vault', from: 'mod-providers', to: 'mod-vault', kind: 'recorded', label: 'reads credentials from', source: 'apps/server/src/providers.js' },
  { id: 'rel-vault-openbao', from: 'mod-vault', to: 'service-openbao', kind: 'recorded', label: 'calls', source: 'apps/server/src/vault.js' },
  { id: 'rel-agents-ptcna', from: 'view-agents', to: 'mod-ptcna', kind: 'recorded', label: 'shows retained state from', source: 'apps/server/src/ptcna.js' },
  { id: 'rel-ptcna-sidecar', from: 'mod-ptcna', to: 'service-ptcna', kind: 'recorded', label: 'calls', source: 'apps/server/src/ptcna.js' },
  { id: 'rel-ahbg-adapter', from: 'view-ahbg', to: 'mod-ahbg', kind: 'recorded', label: 'operates through', source: 'apps/server/src/ahbg.js' },
  { id: 'rel-ahbg-sidecar', from: 'mod-ahbg', to: 'service-ahbg', kind: 'recorded', label: 'calls', source: 'apps/server/src/ahbg.js' },
  { id: 'rel-caddy-site', from: 'service-caddy', to: 'mod-server', kind: 'recorded', label: 'proxies HTTPS to', source: 'operations/Caddyfile' },
  { id: 'rel-context-runs', from: 'data-context-revisions', to: 'mod-runs', kind: 'recorded', label: 'freezes snapshots for', source: 'apps/server/src/contexts.js' },
  { id: 'rel-usage-providers', from: 'data-usage', to: 'mod-providers', kind: 'recorded', label: 'records usage from', source: 'apps/server/src/runs.js' },
  { id: 'rel-retained-agents', from: 'mod-retained', to: 'data-agents', kind: 'recorded', label: 'supplies exact originals to', source: 'apps/server/src/retained/definitions.js' },
  { id: 'rel-inferred-ucns', from: 'gap-ucns', to: 'view-system', kind: 'inferred', label: 'does NOT yet establish geometry for', source: 'docs/handoffs/deepseek-gui/START-HERE.md' },
  { id: 'rel-inferred-phone', from: 'gap-phone', to: 'view-chat', kind: 'inferred', label: 'blocks final acceptance of', source: 'docs/mobile-chat-repair.md' },
];

// G04: what A0 knows about the owner, what it uses, and the authority for use.
export const SYSTEM_KNOWLEDGE = [
  { item: 'Owner username', held: true, usedIn: 'authentication', authority: 'user-provided at bootstrap', note: 'Stored as the owner account identity.' },
  { item: 'Owner password hash', held: true, usedIn: 'authentication', authority: 'user-provided; scrypt hash only', note: 'The plaintext password is never stored.' },
  { item: 'Project instructions', held: true, usedIn: 'context project block', authority: 'user-provided per project', note: 'Shown verbatim with a marker to models.' },
  { item: 'Conversation history and attachments', held: true, usedIn: 'frozen conversation context', authority: 'user-provided in conversations', note: 'Durable on the server; drafts stay browser-local.' },
  { item: 'Agent effective instructions', held: true, usedIn: 'agent context block', authority: 'user-edited from exact archived originals', note: 'Original and effective text are separately preserved.' },
  { item: 'Owner preferences', held: true, usedIn: 'presentation/voice defaults', authority: 'user-selected in About', note: 'Persisted in the owner settings record.' },
  { item: 'Model/provider selections and usage', held: true, usedIn: 'participant records and usage observations', authority: 'user-configured participants', note: 'Historical attribution is retained per message.' },
  { item: 'Tool authorizations', held: true, usedIn: 'run-scoped tool approval', authority: 'user-approved per run', note: 'Approvals never outlive their run.' },
  { item: 'Personal facts outside A0 (calendar, contacts, schedule)', held: false, usedIn: '—', authority: 'unknown / not collected', note: 'No such inventory exists; treat as not collected.' },
  { item: 'Inferred owner intent', held: false, usedIn: '—', authority: 'inferred', note: 'Intentions in the System view are local and never execute.' },
];

export const DECISION_CONDITIONS = [
  'actions that consume resources nearing depletion',
  'actions that expose infrastructure to damage or destruction',
  'actions from which no return is possible',
  'actions with significant chance of failure',
];

export function systemPayload(buildCommit) {
  return {
    provenance: {
      generatedBy: SYSTEM_BUILT_FROM,
      harness: HARNESS_VERSION,
      buildCommit,
      generatedAt: new Date().toISOString(),
      scopeNote: 'Application-relations inventory for the successor VM website. Not a UCNS geometry claim.',
    },
    objects: SYSTEM_OBJECTS,
    relations: SYSTEM_RELATIONS,
    knowledge: SYSTEM_KNOWLEDGE,
    decisionConditions: DECISION_CONDITIONS,
  };
}
