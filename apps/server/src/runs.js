// Run orchestration: dispatch, streaming, cancellation, tool authorization.
// The SSE route in index.js uses these helpers; this module keeps no HTTP.
import { query } from './db.js';
import { freezeSnapshot } from './harness.js';
import { makeVault } from './vault.js';
import {
  resolveApiKey,
  streamProvider,
  assertCapability,
  usageFromProvider,
  defaultCapabilitiesFor,
} from './providers.js';
import { coordinateToolSelections, invokeMcpTool } from './mcp.js';

const activeRuns = new Map(); // runId -> { abort, resolver }

export function getActiveRun(runId) {
  return activeRuns.get(runId);
}

export function registerRun(runId, controller) {
  const entry = { abort: () => controller.abort(), resolver: null };
  activeRuns.set(runId, entry);
  return entry;
}

export function unregisterRun(runId) {
  activeRuns.delete(runId);
}

export function stopRun(runId) {
  const entry = activeRuns.get(runId);
  if (!entry) return false;
  entry.abort();
  if (entry.resolver) entry.resolver({ actionIds: [], cancel: true });
  return true;
}

export async function authorizeTools(runId, selection) {
  const entry = activeRuns.get(runId);
  if (!entry) {
    const err = new Error('Run is not active or already finished.');
    err.status = 409;
    throw err;
  }
  if (!entry.resolver) {
    const err = new Error('This run has no pending tool proposal.');
    err.status = 409;
    throw err;
  }
  entry.resolver(selection);
}

export function buildToolsForConnections(connections) {
  const tools = [];
  for (const conn of connections) {
    if (!conn.enabled) continue;
    for (const tool of conn.tools || []) {
      tools.push({
        type: 'function',
        function: {
          name: `${conn.name.replace(/[^a-zA-Z0-9_-]/g, '_')}__${tool.name}`,
          description: `${tool.description || tool.name} (via MCP server "${conn.name}")`,
          parameters: tool.inputSchema || { type: 'object', properties: {} },
        },
      });
    }
  }
  return tools;
}

export function mapToolNameToConnection(toolName, connections) {
  for (const conn of connections) {
    if (!conn.enabled) continue;
    const prefix = `${conn.name.replace(/[^a-zA-Z0-9_-]/g, '_')}__`;
    if (toolName.startsWith(prefix)) {
      const inner = toolName.slice(prefix.length);
      if ((conn.tools || []).some((t) => t.name === inner)) return { conn, toolName: inner };
    }
  }
  return null;
}

export async function insertRun({ conversationId, userId, mode, participantIds }) {
  const roundRes = await query(
    `SELECT COALESCE(MAX(round),0)+1 AS next FROM runs WHERE conversation_id = $1`,
    [conversationId],
  );
  const round = roundRes.rows[0].next;
  const { id: snapshotId, snapshot } = await freezeSnapshot(conversationId, round);
  const run = await query(
    `INSERT INTO runs (conversation_id, user_id, round, harness_version, snapshot_id, mode)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [conversationId, userId, round, snapshot.harnessVersion, snapshotId, mode],
  );
  for (const pid of participantIds) {
    await query(
      `INSERT INTO run_participants (run_id, participant_id) VALUES ($1,$2)`,
      [run.rows[0].id, pid],
    );
  }
  return { run: run.rows[0], snapshot, round };
}

export async function dispatchParticipant({
  run,
  participant,
  snapshot,
  connections,
  vault,
  signal,
  onChunk,
}) {
  const provider = participant.provider;
  const model = participant.model;
  const capabilities = participant.capabilities || defaultCapabilitiesFor(provider);
  const apiKey = await resolveApiKey(vault, provider);

  // Content capability check before any dispatch (A10): report the mismatch
  // for this participant rather than silently dropping unsupported content.
  const hasImages = snapshot.messages.some((m) => (m.attachments || []).some((a) => a.mime?.startsWith('image/')));
  const mismatch = hasImages ? assertCapability(provider, capabilities, 'images') : null;
  if (mismatch) {
    const err = new Error(mismatch);
    err.code = 'context_incompatible';
    throw err;
  }

  const tools = buildToolsForConnections(connections);
  const result = await streamProvider({
    provider,
    model,
    apiKey,
    snapshot,
    tools,
    signal,
    onChunk: (chunk) => onChunk({ participantId: participant.id, ...chunk }),
    timeoutMs: 120000,
    baseUrl: participant.settings?.baseUrl || undefined,
  });
  return { text: result.text, toolCalls: result.toolCalls || [], usage: usageFromProvider(result.usage), finishReason: result.finishReason };
}

export async function executeCoordinatedTool({ connection, authHeader, toolName, args, signal }) {
  const url = new URL(connection.url);
  return invokeMcpTool({ url: url.toString(), authHeader, toolName, args, signal });
}

export async function createAssistantMessage({ conversationId, participant, round, runId, status, content }) {
  const { rows } = await query(
    `INSERT INTO messages (conversation_id, role, content, content_type, status, provider, model, participant_id, round, meta)
     VALUES ($1,'assistant',$2,'text',$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [conversationId, content, status, participant.provider, participant.model, participant.id, round, JSON.stringify({ runId })],
  );
  return rows[0];
}

export async function updateMessageContent(messageId, content, status) {
  await query(`UPDATE messages SET content = $2, status = $3, updated_at = now() WHERE id = $1`, [messageId, content, status]);
}

export async function recordUsage({ runId, participantId, provider, model, usage }) {
  if (!usage) return;
  await query(
    `INSERT INTO usage_observations (run_id, participant_id, provider, model, prompt_tokens, completion_tokens, total_tokens)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [runId, participantId, provider, model, usage.prompt_tokens, usage.completion_tokens, usage.total_tokens],
  );
}

export function makeVaultForRun() {
  return makeVault();
}

export { coordinateToolSelections };
