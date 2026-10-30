// Versioned standard harness context. Assembly order and identity are
// inspectable; repository agent instructions are NOT runtime system prompts.
// FR1: the frozen snapshot is assembled from immutable context revisions via
// contexts.js, so preview and dispatch share one canonical assembler.
import { config } from './config.js';
import { query } from './db.js';
import { getOrCreateRevision, assembleBlocks, buildBlocks, latestRevision, createRevision } from './contexts.js';

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
// FR1: the snapshot is assembled from the current immutable context revision.
export async function freezeSnapshot(conversationId, userId, round, extraSystem = '') {
  // A run freezes the CURRENT intended context. If messages/project changed
  // since the latest revision, create a new immutable revision; otherwise
  // reuse the latest one (edits only affect the next request).
  const fresh = await buildBlocks(conversationId, userId);
  const latest = await latestRevision(conversationId, userId);
  let revision = latest;
  if (!latest || JSON.stringify(latest.blocks) !== JSON.stringify(fresh.blocks)) {
    revision = await createRevision(conversationId, userId, { blocks: fresh.blocks, note: `run round ${round}` });
  }
  const assembled = await assembleBlocks(revision.blocks || [], {});
  const snapshot = {
    harnessVersion: HARNESS_VERSION,
    contextRevisionId: revision.id,
    contextRevision: revision.revision,
    system: assembled.system + (extraSystem ? `\n\n${extraSystem}` : ''),
    messages: assembled.messages,
    blocks: revision.blocks || [],
    frozenAt: new Date().toISOString(),
  };
  const { rows } = await query(
    `INSERT INTO context_snapshots (conversation_id, round, harness_version, snapshot)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (conversation_id, round) DO UPDATE SET snapshot = EXCLUDED.snapshot, harness_version = EXCLUDED.harness_version
     RETURNING id`,
    [conversationId, round, HARNESS_VERSION, JSON.stringify(snapshot)],
  );
  return { id: rows[0].id, snapshot, revisionId: revision.id };
}

export function nextRoundFor(conversationId) {
  return query(`SELECT COALESCE(MAX(round),0)+1 AS next FROM runs WHERE conversation_id = $1`, [conversationId])
    .then((r) => r.rows[0].next);
}
