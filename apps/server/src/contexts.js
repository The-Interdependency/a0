// FR1: structured, source-attributed context blocks and immutable revisions.
// The preview endpoint and the run assembler share buildBlocks/assembleBlocks,
// so preview and dispatch cannot diverge (RC01).
import { query } from './db.js';
import { config } from './config.js';
import { readUploadBase64 } from './media.js';

const HARNESS_VERSION = config.harness.version;

const BLOCK_TYPES = {
  harness: { label: 'Harness', editable: false, readonlyReason: 'Fixed A0 system prompt (versioned harness).' },
  project: { label: 'Project instructions', editable: true, readonlyReason: null },
  agent: { label: 'Agent instructions', editable: true, readonlyReason: null },
  history: { label: 'Conversation history', editable: true, readonlyReason: null },
  tool: { label: 'Tool definitions/results', editable: false, readonlyReason: 'Tool definitions come from enabled MCP connections.' },
  memory: { label: 'Memory additions', editable: true, readonlyReason: null },
};

export function describeBlockType(type) {
  return BLOCK_TYPES[type] || { label: type, editable: false, readonlyReason: 'Unknown block type.' };
}

// Build the ordered, attributed blocks for a conversation. Blocks are the
// canonical representation for BOTH the Context editor preview and dispatch.
export async function buildBlocks(conversationId, userId) {
  const conv = await query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, userId]);
  if (!conv.rows.length) {
    const err = new Error('Conversation not found.');
    err.status = 404;
    throw err;
  }
  const c = conv.rows[0];
  const policy = c.context_policy || { mode: 'all', selectedMessageIds: [] };
  const selected = policy.mode === 'selected' ? new Set(policy.selectedMessageIds || []) : null;
  const blocks = [];

  blocks.push({
    id: 'harness',
    type: 'harness',
    source: 'a0-harness',
    label: describeBlockType('harness').label,
    content: config.harness.systemPrompt,
    editable: false,
    included: true,
    readonlyReason: describeBlockType('harness').readonlyReason,
  });

  if (c.project_id) {
    const proj = await query('SELECT name, instructions FROM projects WHERE id = $1 AND user_id = $2', [c.project_id, userId]);
    if (proj.rows.length) {
      blocks.push({
        id: 'project',
        type: 'project',
        source: `project:${c.project_id}`,
        label: `Project instructions (${proj.rows[0].name})`,
        content: proj.rows[0].instructions || '',
        editable: true,
        included: true,
        readonlyReason: null,
      });
    }
  }

  const msgs = await query(
    `SELECT m.id, m.role, m.content, m.content_type, m.status, m.provider, m.model,
            m.participant_id, m.round, m.included_in_context, m.meta, m.created_at
       FROM messages m
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC, m.round ASC`,
    [conversationId],
  );
  for (const m of msgs.rows) {
    const atts = await query(
      `SELECT a.id, a.kind, a.mime, a.filename, a.size_bytes, a.status, a.storage_key
         FROM attachments a WHERE a.message_id = $1 AND a.status = 'ready'`,
      [m.id],
    );
    const source = `${m.role}${m.provider ? `:${m.provider}` : ''}${m.model ? `/${m.model}` : ''}`;
    blocks.push({
      id: `msg:${m.id}`,
      type: 'history',
      source,
      label: `${m.role === 'assistant' ? 'Assistant' : m.role === 'tool' ? 'Tool result' : 'User'} · ${m.provider || 'user'}${m.model ? ' · ' + m.model : ''} · ${new Date(m.created_at).toISOString()}`,
      content: m.content || '',
      editable: false,
      included: m.included_in_context !== false && (selected === null || selected.has(m.id)),
      readonlyReason: m.role === 'tool' ? 'Tool results are part of shared history.' : null,
      meta: {
        messageId: m.id,
        role: m.role,
        status: m.status,
        attachments: atts.rows.map((a) => ({ id: a.id, kind: a.kind, mime: a.mime, filename: a.filename, storageKey: a.storage_key })),
      },
    });
  }

  // Tool definitions are fixed at dispatch time; the editor shows their scope.
  blocks.push({
    id: 'tools',
    type: 'tool',
    source: 'mcp:enabled',
    label: 'Tool definitions (enabled MCP connections)',
    content: 'Tool definitions are assembled from enabled MCP connections at dispatch time.',
    editable: false,
    included: true,
    readonlyReason: describeBlockType('tool').readonlyReason,
  });

  return { conversationId, blocks };
}

// Assemble {system, messages} from blocks. This is the single assembler used
// by preview and dispatch (RC01). History blocks map 1:1 to messages.
export async function assembleBlocks(blocks, { forProvider = null } = {}) {
  const systemParts = [];
  const messages = [];
  for (const block of blocks) {
    if (!block.included) continue;
    if (block.type === 'harness') {
      systemParts.push(block.content);
    } else if (block.type === 'project' || block.type === 'agent' || block.type === 'memory') {
      systemParts.push(`${block.label}:\n${block.content}`);
    } else if (block.type === 'history') {
      const meta = block.meta || {};
      const msg = {
        id: meta.messageId,
        role: meta.role || 'user',
        content: block.content,
        contentType: 'text',
        status: meta.status || 'complete',
        provider: block.source?.split(':')[1]?.split('/')[0] || null,
        model: block.source?.includes('/') ? block.source.split('/')[1] : null,
        participantId: meta.participantId || null,
        round: meta.round ?? 0,
        meta: { messageId: meta.messageId },
        attachments: [],
      };
      for (const a of meta.attachments || []) {
        msg.attachments.push({ id: a.id, kind: a.kind, mime: a.mime, filename: a.filename, storageKey: a.storage_key || a.storageKey });
      }
      messages.push(msg);
    }
  }
  const system = systemParts.join('\n\n');
  // Hydrate attachment bytes for dispatch-capable consumers.
  for (const m of messages) {
    for (const att of m.attachments || []) {
      if (att.storageKey) {
        try { att.data = await readUploadBase64(att.storageKey); } catch { att.data = null; att.hydrationError = 'attachment_missing'; }
      }
    }
  }
  return { system, messages, harnessVersion: HARNESS_VERSION, blocks };
}

export async function latestRevision(conversationId, userId) {
  const { rows } = await query(
    `SELECT * FROM context_revisions WHERE conversation_id = $1 AND user_id = $2 ORDER BY revision DESC LIMIT 1`,
    [conversationId, userId],
  );
  return rows[0] || null;
}

// C04: carry the latest saved revision forward while appending new history
// blocks. Owner edits/exclusions stay effective; new messages join the tail.
export function mergeRevisionWithFresh(latestBlocks, freshBlocks) {
  const blocks = Array.isArray(latestBlocks) && latestBlocks.length ? latestBlocks.map((b) => ({ ...b })) : [];
  const existing = new Set(blocks.map((b) => b.id));
  const freshHistory = freshBlocks.filter((b) => b.type === 'history' && !existing.has(b.id));
  if (!freshHistory.length) return blocks;
  const toolsIdx = blocks.findIndex((b) => b.type === 'tool');
  const insertAt = toolsIdx >= 0 ? toolsIdx : blocks.length;
  blocks.splice(insertAt, 0, ...freshHistory);
  return blocks;
}

export async function getOrCreateRevision(conversationId, userId) {
  const latest = await latestRevision(conversationId, userId);
  if (latest) return latest;
  const { blocks } = await buildBlocks(conversationId, userId);
  const { rows } = await query(
    `INSERT INTO context_revisions (conversation_id, user_id, revision, blocks, note)
     VALUES ($1,$2,1,$3::jsonb,'initial') RETURNING *`,
    [conversationId, userId, JSON.stringify(blocks)],
  );
  return rows[0];
}

export async function createRevision(conversationId, userId, { blocks, note = '', expectedRevision = null }) {
  const latest = await latestRevision(conversationId, userId);
  const nextRevision = (latest?.revision || 0) + 1;
  if (expectedRevision !== null && latest && latest.revision !== expectedRevision) {
    const err = new Error(`Context changed in another tab (current revision ${latest.revision}). Reload and reapply your edits.`);
    err.status = 409;
    err.code = 'revision_conflict';
    throw err;
  }
  const { rows } = await query(
    `INSERT INTO context_revisions (conversation_id, user_id, revision, blocks, note, parent_revision_id)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6) RETURNING *`,
    [conversationId, userId, nextRevision, JSON.stringify(blocks), note, latest?.id || null],
  );
  return rows[0];
}

// Conservative cache-prefix estimate. This is a forecast, not an observation.
export function estimateCachePrefix(blocks, changedBlockIndex) {
  let prefixChars = 0;
  for (let i = 0; i < blocks.length; i += 1) {
    if (!blocks[i].included) break;
    if (i >= changedBlockIndex) break;
    prefixChars += String(blocks[i].content || '').length;
  }
  return {
    earliestChangedBlock: changedBlockIndex,
    estimatedReusablePrefixChars: prefixChars,
    estimate: true,
    note: 'Estimated from the earliest changed block; a shared prefix alone does not prove a provider cache hit.',
  };
}
