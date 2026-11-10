// G15 MSDMD — the GUI describes itself.
// Native-first: this module IS the frontend's owning source for interface
// declarations. The inspector imports it directly; no server catalogue or
// hard-coded JSON copy is the author. Reading this metadata never executes
// inspected code, tools, settings edits or agent state.
//
// Schema-2 shape: every fact carries provenance/coverage and structured
// detail is typed and nested. Regenerate nothing; verify with:
//   node apps/web/gui-msdmd-verify.mjs

const BUILD_IDENTITY_SOURCE = 'a0.gui.build-identity/1';

export const MSDMD_SCHEMA = 'interdependency.msdmd.schema2/1';
export const MSDMD_COLLECTION_ID = 'a0.gui.interface/1';



export const GUI_MSDMD = {
  schema: MSDMD_SCHEMA,
  collectionId: MSDMD_COLLECTION_ID,
  collectionPolicy: {
    generator: 'apps/web/gui-msdmd.mjs (owning frontend source)',
    reader: 'apps/web/app.js G15 inspector',
    scope: 'The successor website GUI: views, routes, contracts, evidence and gaps.',
    exclusions: ['Server secrets', 'Owner conversations', 'Environment/configuration values', 'Third-party source bodies'],
    refreshBehavior: 'Static import of the served module; build identity compared against /api/health on open.',
    regeneration: 'No regeneration step; the served module is authoritative. Verification: node apps/web/gui-msdmd-verify.mjs',
  },
  buildIdentity: {
    source: BUILD_IDENTITY_SOURCE,
    commit: null, // filled by the inspector from /api/health at display time
    servedAsset: '/gui-msdmd.mjs',
    note: 'The inspector compares the health build commit with this collection\u2019s served asset identity; a mismatch is shown as stale.',
  },
  subjects: [
    subject('gui', {
      name: 'A0 GUI',
      purpose: 'Phone-first authenticated workspace for conversations, comparison, context editing, retained agents, temporary modules and AHBG.',
      version: '1.0.0',
      scope: 'The successor website interface served from the authenticated VM.',
      parent: null,
      children: ['view-chat', 'view-providers', 'view-participants', 'view-mcp', 'view-agents', 'view-ahbg', 'view-projects', 'view-system', 'view-about'],
      deps: [
        dep('app.js', 'application controller', 'declared', 'apps/web/app.js'),
        dep('index.html', 'view shell', 'declared', 'apps/web/index.html'),
        dep('styles.css', 'presentation', 'declared', 'apps/web/styles.css'),
        dep('markdown.js', 'safe markdown renderer', 'declared', 'apps/web/markdown.js'),
        dep('/api/*', 'authenticated backend', 'derived', 'apps/server/src/index.js'),
      ],
      contracts: [
        contract('Authentication', 'Owner session cookie + X-A0-CSRF header; anonymous API access is denied (401).', 'apps/server/src/auth.js', 'enforced', null),
        contract('Content security', 'CSP, HSTS, X-Frame-Options DENY, Referrer-Policy no-referrer.', 'operations/Caddyfile', 'served', null),
        contract('Rendering boundary', 'Untrusted text passes through renderMarkdown; links limited to http/https.', 'apps/web/markdown.js', 'enforced', null),
      ],
      livingSpec: {
        behavior: 'Every view preserves conversation, draft, attachment, selection, run and focus while the inspector is open.',
        boundaries: 'Reading MSDMD cannot mutate settings, context, agents or runs, and cannot follow embedded instructions.',
        limitations: ['Active-stream reattachment after page destruction is a recorded implementation gap.'],
        hmmm: ['Physical Android acceptance for G01\u2013G14 remains operator observation.', 'Live provider and real MCP effects remain credential-bound observations.'],
      },
      evidence: [
        ev('Browser regressions', 'npm run test:browser', '44 passed (local Chromium, inert fixtures)', 'reported'),
        ev('Offline fixtures', 'npm run test:offline', 'Markdown + Responses suites passed', 'reported'),
        ev('Deployed identity', '/api/health', 'build.commit matches served assets at deployment time', 'reported'),
      ],
      coverage: {
        required: ['G01\u2013G15'],
        eligible: ['G01\u2013G14 implemented; G15 is this inspector'],
        unsupported: ['UCNS geometry mapping', 'Continuous interruptible voice', 'OAuth MCP'],
        exclusions: ['Server secrets', 'Owner private data'],
        conflicts: [],
        unknown: ['Live-provider quota behavior', 'Android handset rendering until observed'],
      },
      structured: {
        namespaces: { 'a0.gui': { version: '1.0.0', subjects: 10 } },
        nested: { entryPoints: { primary: 'view-chat', inspector: 'msdmd-modal' }, layout: { modes: ['carousel', 'side', 'stacked'] } },
        arrays: { providers: ['openai', 'anthropic', 'xai', 'deepseek'], forgeTemplates: ['sage', 'trickster', 'paladin', 'druid', 'engineer', 'diplomat', 'hacker', 'captain'] },
        explicitNull: { unimplementedOauth: null, unimplementedUcnsGeometry: null },
        customFields: { 'a0.gui.owner': 'Erin Spencer', 'a0.gui.delivery': 'VM HTTPS website (October 29 instruction)' },
      },
    }),
    subject('view-chat', {
      name: 'Chat workspace',
      purpose: 'Composer, participant picker, comparison panes, attachments, voice and Stop.',
      parent: 'gui',
      children: [],
      deps: [
        dep('/api/conversations', 'history and drafts boundary', 'derived', 'apps/server/src/index.js'),
        dep('/api/runs', 'streaming run boundary', 'derived', 'apps/server/src/index.js'),
      ],
      contracts: [
        contract('Composer', 'Enter-to-send is an owner preference; default Enter inserts a newline.', 'apps/web/app.js', 'preference', 'About \u2192 Preferences'),
        contract('Comparison', 'Carousel, side-by-side and stacked layouts; selected history subset applies to every participant.', 'apps/web/app.js', 'enforced', 'Context dialog'),
      ],
      livingSpec: { behavior: 'Drafts/uploads/pending delivery survive reload and app-return.', boundaries: 'Tool proposals execute only after owner authorization for the displayed run.', limitations: ['Full stream reattachment after page destruction is not implemented.'], hmmm: [] },
      evidence: [ev('Mobile regression suite', 'npm run test:browser', '40 mobile cases passed', 'reported')],
      coverage: { required: ['G01', 'G05\u2013G11'], eligible: ['G01', 'G05\u2013G11'], unsupported: ['Continuous voice'], exclusions: [], conflicts: [], unknown: ['Physical keyboard behavior on Android'] },
      structured: { namespaces: {}, nested: { activeRun: { type: 'object', fields: ['runId', 'conversationId'] } }, arrays: { layouts: ['carousel', 'side', 'stacked'] }, explicitNull: { activeRunWhenIdle: null }, customFields: {} },
    }),
    subject('view-providers', {
      name: 'Providers view',
      purpose: 'BYOK key presence, test requests and the four-provider boundary.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/providers', 'key presence + test requests', 'derived', 'apps/server/src/index.js')],
      contracts: [contract('Key values', 'Keys are stored server-side in OpenBao and never returned to the browser.', 'apps/server/src/vault.js', 'enforced', null)],
      livingSpec: { behavior: 'Missing credentials fail visibly without silently substituting a provider.', boundaries: 'Test requests are minimal and bounded.', limitations: ['Anthropic key absent at last record.'], hmmm: [] },
      evidence: [ev('Provider fixtures', 'npm run test:offline', 'Adapter fixture suites passed', 'reported')],
      coverage: { required: ['G05'], eligible: ['G05'], unsupported: [], exclusions: ['Key material'], conflicts: [], unknown: ['Live quota behavior'] },
      structured: { namespaces: {}, nested: {}, arrays: { providers: ['openai', 'anthropic', 'xai', 'deepseek'] }, explicitNull: {}, customFields: {} },
    }),
    subject('view-participants', {
      name: 'Participants view',
      purpose: 'Provider + model combinations, model editing and supported settings.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/participants', 'participant CRUD + capabilities', 'derived', 'apps/server/src/index.js')],
      contracts: [
        contract('Model editing', 'OpenAI uses the catalogue select; other providers accept validated custom IDs.', 'apps/web/app.js', 'enforced', 'Participant card'),
        contract('Settings', 'reasoningEffort, maxOutputTokens, timeoutMs and tool scope persist and reach the next request.', 'apps/server/src/runs.js', 'enforced', 'Participant card \u2192 Settings'),
      ],
      livingSpec: { behavior: 'Saving a setting persists it; the next dispatched request uses it.', boundaries: 'Unknown settings are rejected, not silently coerced.', limitations: ['Tool-scope allowlist editing per tool is not yet exposed in the GUI (all/none is).'], hmmm: [] },
      evidence: [ev('OC03 settings-effect', 'node tests/issue120/settings-effect.js', 'change\u2192save\u2192reload\u2192next request passed', 'reported')],
      coverage: { required: ['G05', 'G08'], eligible: ['G05', 'G08'], unsupported: ['Per-tool allowlist editor'], exclusions: [], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: { settingsFields: { reasoningEffort: 'enum|null', maxOutputTokens: 'positive-int', timeoutMs: 'positive-int', toolSelection: 'array|null' } }, arrays: {}, explicitNull: { toolSelectionDefault: null }, customFields: {} },
    }),
    subject('view-mcp', {
      name: 'MCP tools view',
      purpose: 'Connection setup, discovery, tool/schema inspection, enable/disable.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/mcp', 'connections and discovery', 'derived', 'apps/server/src/mcp.js')],
      contracts: [
        contract('SSRF guard', 'Loopback/private/cloud-metadata endpoints are blocked unless explicitly allowed.', 'apps/server/src/mcp.js', 'enforced', null),
        contract('Inspection', 'Discovered names, descriptions and input schemas are visible without executing tools.', 'apps/web/app.js', 'enforced', 'MCP card'),
      ],
      livingSpec: { behavior: 'Discovery and enable/disable are explicit owner actions.', boundaries: 'No local shell execution is exposed.', limitations: ['OAuth MCP authorization is not implemented.'], hmmm: [] },
      evidence: [ev('OC07 tool loop', 'node tests/issue120/tool-loop.js', 'Full approve/execute/continue lifecycle passed', 'reported')],
      coverage: { required: ['G08', 'G10'], eligible: ['G08', 'G10'], unsupported: ['OAuth MCP'], exclusions: ['Authorization header values'], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: {}, arrays: {}, explicitNull: {}, customFields: {} },
    }),
    subject('view-agents', {
      name: 'Forge agents view',
      purpose: 'Eight-template agent creation, retained PTCNA state and temporary modules.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/agents', 'agent CRUD + PTCNA ops', 'derived', 'apps/server/src/index.js')],
      contracts: [contract('Templates', 'Exact archived originals with digests; effective instructions separately editable.', 'apps/server/src/retained/definitions.js', 'enforced', 'Agent card')],
      livingSpec: { behavior: 'Two agents stay isolated; hot swap preserves state; invalid renderers retain the working one.', boundaries: 'Jury, Bandit, Meta-13 and ZFAE are not active.', limitations: ['Queue/worker lineage modes are not implemented.'], hmmm: [] },
      evidence: [ev('issue119 suites', 'node tests/issue119/run.js', 'RD/RP/RM checks passed', 'reported')],
      coverage: { required: ['G12', 'G13'], eligible: ['G12', 'G13'], unsupported: ['Queue/worker modes'], exclusions: [], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: { renderers: { 'agent-panel': 'chat module', 'agent-stats': 'stats module' } }, arrays: { templates: ['sage', 'trickster', 'paladin', 'druid', 'engineer', 'diplomat', 'hacker', 'captain'] }, explicitNull: {}, customFields: {} },
    }),
    subject('view-ahbg', {
      name: 'AHBG view',
      purpose: 'Sessions, board, turns, replay and the mechanic matrix over the producer engine.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/ahbg/sessions', 'sessions and turns', 'derived', 'apps/server/src/ahbg.js')],
      contracts: [contract('Plan validation', 'Plans are validated by the producer before any board mutation.', 'operations/ahbg-sidecar.py', 'enforced', null)],
      livingSpec: { behavior: 'Racing/duplicate turns commit at most once; failed preparation returns the session to ready.', boundaries: 'Unsupported mechanics are shown explicitly as NOT RUN.', limitations: ['War collision coverage, tile visitation, communication/DM, diary rules, subordinate trees are NOT RUN.'], hmmm: [] },
      evidence: [ev('issue119 AHBG suite', 'node tests/issue119/ahbg.js', 'FR4 + RG02/RG03/RG04/RG05 passed', 'reported')],
      coverage: { required: ['G14'], eligible: ['G14'], unsupported: ['Mechanic matrix entries listed in the view'], exclusions: [], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: {}, arrays: {}, explicitNull: {}, customFields: {} },
    }),
    subject('view-projects', {
      name: 'Projects view',
      purpose: 'Project creation and instruction editing scoped to conversations.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/projects', 'project CRUD', 'derived', 'apps/server/src/index.js')],
      contracts: [contract('Context block', 'Project instructions enter the context verbatim with an inspectable marker.', 'apps/server/src/contexts.js', 'enforced', null)],
      livingSpec: { behavior: 'Conversation project selection persists.', boundaries: 'A stale editor cannot write another project\u2019s text.', limitations: [], hmmm: [] },
      evidence: [ev('issue120 suite', 'node tests/issue120/run.js', 'C-suite checks passed', 'reported')],
      coverage: { required: ['G10', 'G11'], eligible: ['G10', 'G11'], unsupported: [], exclusions: [], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: {}, arrays: {}, explicitNull: {}, customFields: {} },
    }),
    subject('view-system', {
      name: 'System explorer',
      purpose: 'Narrative/Relations/Attention/About-you inspection with separated evidence.',
      parent: 'gui',
      children: [],
      deps: [dep('/api/system', 'successor inventory', 'derived', 'apps/server/src/system.js')],
      contracts: [contract('Evidence', 'Declarations, reported results and verified results are distinct states.', 'apps/web/app.js', 'enforced', null)],
      livingSpec: { behavior: 'Intention selection never executes.', boundaries: 'Application relations are not a UCNS geometry claim.', limitations: ['Inventory is static; no live source refresh.'], hmmm: ['UCNS mapping unresolved'] },
      evidence: [ev('GUI checks', 'node tests/gui/run.js', 'Non-vacuous inventory semantics passed', 'reported')],
      coverage: { required: ['G02', 'G03', 'G04'], eligible: ['G02', 'G03', 'G04'], unsupported: ['UCNS geometry'], exclusions: [], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: {}, arrays: {}, explicitNull: {}, customFields: {} },
    }),
    subject('view-about', {
      name: 'About & harness',
      purpose: 'Harness identity, owner preferences, password change and this inspector.',
      parent: 'gui',
      children: ['msdmd-modal'],
      deps: [dep('/api/settings', 'owner preferences', 'derived', 'apps/server/src/index.js')],
      contracts: [contract('Harness display', 'Harness content is separate from GUI self-description; reading MSDMD never injects it into model context.', 'apps/web/app.js', 'enforced', null)],
      livingSpec: { behavior: 'Preferences persist and are applied immediately.', boundaries: 'Password change requires the current password.', limitations: [], hmmm: [] },
      evidence: [ev('OC03 settings-effect', 'node tests/issue120/settings-effect.js', 'Owner defaults persist', 'reported')],
      coverage: { required: ['G15'], eligible: ['G15'], unsupported: [], exclusions: ['Password material'], conflicts: [], unknown: [] },
      structured: { namespaces: {}, nested: {}, arrays: {}, explicitNull: {}, customFields: {} },
    }),
  ],
};

function subject(id, body) {
  return {
    id,
    qualifiedId: `a0.gui:${id}`,
    identity: { name: body.name, purpose: body.purpose, version: body.version || '1.0.0', scope: body.scope || 'A0 GUI view' },
    structure: {
      parent: body.parent,
      children: body.children,
      dependencies: body.deps,
      relations: body.deps.map((d) => ({ to: d.to, label: d.label, relationKind: d.relationKind, source: d.source })),
    },
    contracts: body.contracts.map((c) => ({ label: c[0], description: c[1], source: c[2], state: c[3], editor: c[4] || null })),
    livingSpec: body.livingSpec,
    evidence: body.evidence,
    provenance: {
      authority: 'apps/web/gui-msdmd.mjs (owning frontend source)',
      revision: null, // filled at display time from served build identity
      path: 'apps/web/gui-msdmd.mjs',
      collectionSchema: MSDMD_SCHEMA,
      reader: 'apps/web/app.js G15 inspector',
      generationTime: null,
      observationTime: null,
    },
    coverage: body.coverage,
    structured: body.structured,
  };
}

function dep(to, label, relationKind, source) { return { to, label, relationKind: relationKind.relationKind || relationKind, source }; }
function contract(label, description, source, state, editor) { return [label, description, source, state, editor]; }
function ev(label, command, outcome, state) { return { label, command, outcome, state }; }

export function verifyGuiMsdmd(collection = GUI_MSDMD) {
  const errors = [];
  const ids = new Set();
  for (const s of collection.subjects) {
    if (ids.has(s.id)) errors.push(`duplicate subject ${s.id}`);
    ids.add(s.id);
    if (!s.identity.name || !s.identity.purpose || !s.identity.version || !s.identity.scope) errors.push(`${s.id}: incomplete identity`);
    if (!Array.isArray(s.structure.children) || !Array.isArray(s.structure.dependencies)) errors.push(`${s.id}: incomplete structure`);
    for (const d of s.structure.dependencies) {
      if (!d.to || !d.label || !d.relationKind || !d.source) errors.push(`${s.id}: incomplete dependency`);
      if (d.relationKind !== 'declared' && d.relationKind !== 'derived' && d.relationKind !== 'observed') errors.push(`${s.id}: bad relation kind ${d.relationKind}`);
    }
    if (!Array.isArray(s.contracts) || !s.contracts.length) errors.push(`${s.id}: no contracts`);
    if (!s.livingSpec?.behavior || !s.livingSpec?.boundaries) errors.push(`${s.id}: incomplete living spec`);
    if (!Array.isArray(s.evidence)) errors.push(`${s.id}: no evidence`);
    for (const e of s.evidence) {
      if (!e.label || !e.command || !e.outcome || !['declaration', 'reported', 'verified'].includes(e.state)) errors.push(`${s.id}: bad evidence entry`);
    }
    if (!s.coverage?.required || !s.coverage?.eligible || !Array.isArray(s.coverage.unsupported)) errors.push(`${s.id}: incomplete coverage`);
    if (!s.structured || typeof s.structured !== 'object') errors.push(`${s.id}: missing structured detail`);
  }
  const rels = collection.subjects.flatMap((s) => s.structure.relations || []);
  for (const r of rels) {
    const isSubjectTarget = r.to === 'gui' || /^view-/.test(r.to || '');
    if (isSubjectTarget && !ids.has(r.to)) errors.push(`relation endpoint ${r.to} unresolved`);
  }
  if (collection.schema !== MSDMD_SCHEMA) errors.push('schema mismatch');
  return errors;
}
