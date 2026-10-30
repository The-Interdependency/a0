// Versioned standard harness context. Assembly order and identity are
// inspectable; repository agent instructions are NOT runtime system prompts.
import { config } from './config.js';
import { query } from './db.js';

export const HARNESS_VERSION = config.harness.version;

export function systemPromptFor({ projectInstructions = '', userName = 'Erin' } = {}) {
  const parts = [config.harness.systemPrompt];
  if (projectInstructions?.trim()) {
    parts.push(`Project instructions (inspectable in Projects; the user wrote these, treat them as user context):\n${projectInstructions.trim()}`);
  }
  return parts.join('\n\n');
}

// Loads the exact messages that form the intended context for a conversation,
// honoring the conversation's selection policy. Nothing is summarized or
// silently dropped; excluded messages are retained in storage.
export async function loadIntendedContext(conversationId) {
  const { rows: convRows } = await query(
    `SELECT id, project_id, context_policy, harness_version FROM conversations WHERE id = $1`,
    [conversationId],
  );
  if (!convRows.length) {
    const err = new Error('Conversation not found.');
    err.status = 404;
    throw err;
  }
  const conv = convRows[0];
  let instructions = '';
  if (conv.project_id) {
    const { rows: projRows } = await query(`SELECT name, instructions FROM projects WHERE id = $1`, [conv.project_id]);
    if (projRows.length) {
      instructions = projRows[0].instructions || '';
    }
  }
  const policy = conv.context_policy || { mode: 'all', selectedMessageIds: [] };
  let messages;
  if (policy.mode === 'selected' && Array.isArray(policy.selectedMessageIds) && policy.selectedMessageIds.length) {
    messages = await query(
      `SELECT m.id, m.role, m.content, m.content_type, m.status, m.provider, m.model,
              m.participant_id, m.round, m.meta
         FROM messages m
        WHERE m.conversation_id = $1 AND m.id = ANY($2::uuid[])
        ORDER BY m.created_at ASC, m.round ASC`,
      [conversationId, policy.selectedMessageIds],
    );
  } else {
    messages = await query(
      `SELECT m.id, m.role, m.content, m.content_type, m.status, m.provider, m.model,
              m.participant_id, m.round, m.meta
         FROM messages m
        WHERE m.conversation_id = $1 AND m.included_in_context = true
        ORDER BY m.created_at ASC, m.round ASC`,
      [conversationId],
    );
  }
  const withAttachments = [];
  for (const m of messages.rows) {
    const atts = await query(
      `SELECT a.id, a.kind, a.mime, a.filename, a.size_bytes, a.status, a.storage_key
         FROM attachments a
        WHERE a.message_id = $1 AND a.status = 'ready'`,
      [m.id],
    );
    withAttachments.push({ ...m, attachments: atts.rows });
  }
  return {
    conversationId,
    projectInstructions: instructions,
    messages: withAttachments,
    policy,
  };
}

// Freeze one semantic context snapshot per comparison round. All participants
// in the round receive this exact snapshot; adapters may only encode it.
// Attachment bytes are referenced by storage key here; the run coordinator
// hydrates them from durable media before dispatch.
export async function freezeSnapshot(conversationId, round, extraSystem = '') {
  const ctx = await loadIntendedContext(conversationId);
  const snapshot = {
    harnessVersion: HARNESS_VERSION,
    system: systemPromptFor({ projectInstructions: ctx.projectInstructions }) + (extraSystem ? `\n\n${extraSystem}` : ''),
    messages: ctx.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      contentType: m.content_type,
      status: m.status,
      provider: m.provider,
      model: m.model,
      participantId: m.participant_id,
      round: m.round,
      meta: m.meta,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        mime: a.mime,
        filename: a.filename,
        storageKey: a.storage_key,
      })),
    })),
    frozenAt: new Date().toISOString(),
  };
  const { rows } = await query(
    `INSERT INTO context_snapshots (conversation_id, round, harness_version, snapshot)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (conversation_id, round) DO UPDATE SET snapshot = EXCLUDED.snapshot, harness_version = EXCLUDED.harness_version
     RETURNING id`,
    [conversationId, round, HARNESS_VERSION, JSON.stringify(snapshot)],
  );
  return { id: rows[0].id, snapshot };
}

export function nextRoundFor(conversationId) {
  return query(`SELECT COALESCE(MAX(round),0)+1 AS next FROM runs WHERE conversation_id = $1`, [conversationId])
    .then((r) => r.rows[0].next);
}
