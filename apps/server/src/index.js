// A0 server entry point: authenticated API, streaming chat, comparison,
// attachments, projects, voice (client-side), and configurable MCP tools.
import express from 'express';
import busboy from 'busboy';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, assertBootstrapConfig, ensureMediaDirs } from './config.js';
import { pool, query, migrate, withTransaction } from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  sessionUser,
  requireAuth,
  requireCsrf,
  csrfTokenFor,
  countOwners,
  createOwner,
  signSessionToken,
} from './auth.js';
import { makeVault, VaultError } from './vault.js';
import {
  PROVIDER_DEFS,
  defaultModelFor,
  defaultCapabilitiesFor,
  providerInfo,
  resolveApiKey,
} from './providers.js';
import { HARNESS_VERSION, systemPromptFor } from './harness.js';
import {
  insertRun,
  dispatchParticipant,
  registerRun,
  unregisterRun,
  stopRun,
  authorizeTools,
  buildToolsForConnections,
  mapToolNameToConnection,
  createAssistantMessage,
  updateMessageContent,
  recordUsage,
  executeCoordinatedTool,
  coordinateToolSelections,
} from './runs.js';
import { writeUpload, readUpload, removeUpload } from './media.js';
import { validateMcpUrl, discoverTools } from './mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '../../web');

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('[a0]', err);
  res.status(status).json({ error: err.code || 'error', message: err.message || 'Unexpected error.' });
}

export async function start() {
  assertBootstrapConfig();
  ensureMediaDirs();
  await migrate();

  const vault = makeVault();
  try {
    await vault.healthCheck();
  } catch (err) {
    throw new Error(`OpenBao health check failed; refusing to start (fail closed): ${err.message}`);
  }

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.cookies = parseCookies(req);
    next();
  });
  app.use(express.json({ limit: '2mb' }));

  // --- Public bootstrap / auth -------------------------------------------------
  app.get('/api/health', asyncRoute(async (req, res) => {
    let build = null;
    try {
      const raw = await fs.promises.readFile('/opt/a0/build-info.json', 'utf8');
      build = JSON.parse(raw);
    } catch {
      build = null;
    }
    res.json({
      ok: true,
      name: 'a0',
      harness: HARNESS_VERSION,
      time: new Date().toISOString(),
      build: build || { commit: 'unrecorded' },
      servedFrom: config.nodeEnv,
    });
  }));

  app.get('/api/bootstrap/status', asyncRoute(async (req, res) => {
    const owners = await countOwners();
    res.json({ ownerExists: owners > 0, needsSetup: owners === 0 });
  }));

  app.post('/api/bootstrap/setup', asyncRoute(async (req, res) => {
    if (await countOwners() > 0) return res.status(409).json({ error: 'conflict', message: 'Owner already exists. Sign in instead.' });
    const { username, password, setupCode } = req.body || {};
    if (!username || !password || password.length < 10) {
      return res.status(400).json({ error: 'validation', message: 'Choose a username and a password of at least 10 characters.' });
    }
    if (!setupCode || typeof setupCode !== 'string') {
      return res.status(400).json({ error: 'validation', message: 'Setup code is required.' });
    }
    const expected = config.bootstrapCode;
    const suppliedHash = crypto.createHash('sha256').update(setupCode).digest('hex');
    const expectedHash = config.bootstrapCodeHash || (expected ? crypto.createHash('sha256').update(expected).digest('hex') : '');
    const ok = expected ? crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(expectedHash)) : false;
    if (!ok) return res.status(403).json({ error: 'setup_code', message: 'Incorrect setup code.' });
    const user = await createOwner(username, password);
    const session = await createSession(user.id, req);
    res.cookie(config.cookieName, signSessionToken(session.token), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: session.expires,
    });
    res.json({ ok: true, user });
  }));

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { username, password } = req.body || {};
    const { rows } = await query('SELECT id, username, password_hash FROM users WHERE username = $1', [username || '']);
    const user = rows[0];
    const valid = user && await verifyPassword(password || '', user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'unauthorized', message: 'Incorrect username or password.' });
    }
    const session = await createSession(user.id, req);
    res.cookie(config.cookieName, signSessionToken(session.token), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: session.expires,
    });
    res.json({ ok: true, user: { id: user.id, username: user.username } });
  }));

  app.post('/api/auth/logout', requireAuth, requireCsrf, asyncRoute(async (req, res) => {
    await destroySession(req);
    res.clearCookie(config.cookieName);
    res.json({ ok: true });
  }));

  // --- Everything below requires the owner ------------------------------------
  app.use('/api', requireAuth);

  app.get('/api/me', asyncRoute(async (req, res) => {
    res.json({
      user: req.user,
      csrfToken: csrfTokenFor(req),
      harness: {
        version: HARNESS_VERSION,
        assemblyOrder: [
          'fixed A0 system prompt',
          'optional project instructions (verbatim, marker-prefixed)',
          'frozen conversation messages in chronological order with provider/model attribution',
          'attachment references hydrated from durable media',
          'tool history and results in shared conversation history',
        ],
        systemPrompt: systemPromptFor({}),
      },
    });
  }));

  app.use('/api', requireCsrf);

  // Owner password change (recovery-friendly; requires current password).
  app.patch('/api/me/password', asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 10) {
      return res.status(400).json({ error: 'validation', message: 'New password must be at least 10 characters.' });
    }
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found', message: 'Owner not found.' });
    const valid = await verifyPassword(currentPassword || '', rows[0].password_hash);
    if (!valid) return res.status(403).json({ error: 'unauthorized', message: 'Current password is incorrect.' });
    const passwordHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user.id, passwordHash]);
    await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    res.json({ ok: true, note: 'Password changed; other sessions were signed out.' });
  }));

  // --- Projects ----------------------------------------------------------------
  app.get('/api/projects', asyncRoute(async (req, res) => {
    const { rows } = await query(
      'SELECT id, name, instructions, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id],
    );
    res.json({ projects: rows });
  }));

  app.post('/api/projects', asyncRoute(async (req, res) => {
    const { name, instructions = '' } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'validation', message: 'Project name is required.' });
    const { rows } = await query(
      'INSERT INTO projects (user_id, name, instructions) VALUES ($1,$2,$3) RETURNING id, name, instructions, created_at, updated_at',
      [req.user.id, name.trim(), String(instructions)],
    );
    res.status(201).json({ project: rows[0] });
  }));

  app.patch('/api/projects/:id', asyncRoute(async (req, res) => {
    const { name, instructions } = req.body || {};
    const existing = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Project not found.' });
    const { rows } = await query(
      `UPDATE projects SET name = COALESCE($3, name), instructions = COALESCE($4, instructions), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id, name, instructions, updated_at`,
      [req.params.id, req.user.id, name?.trim() || null, instructions ?? null],
    );
    res.json({ project: rows[0] });
  }));

  app.delete('/api/projects/:id', asyncRoute(async (req, res) => {
    const { rowCount } = await query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found', message: 'Project not found.' });
    res.json({ ok: true });
  }));

  // --- Conversations -----------------------------------------------------------
  app.get('/api/conversations', asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT c.id, c.title, c.project_id, c.context_policy, c.harness_version, c.archived, c.created_at, c.updated_at,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT 200`,
      [req.user.id],
    );
    res.json({ conversations: rows });
  }));

  app.post('/api/conversations', asyncRoute(async (req, res) => {
    const { title, projectId } = req.body || {};
    if (projectId) {
      const proj = await query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [projectId, req.user.id]);
      if (!proj.rows.length) return res.status(400).json({ error: 'validation', message: 'Unknown project.' });
    }
    const { rows } = await query(
      `INSERT INTO conversations (user_id, project_id, title, harness_version)
       VALUES ($1,$2,$3,$4) RETURNING id, title, project_id, context_policy, harness_version, created_at, updated_at`,
      [req.user.id, projectId || null, (title || 'New conversation').slice(0, 200), HARNESS_VERSION],
    );
    res.status(201).json({ conversation: rows[0] });
  }));

  app.get('/api/conversations/:id', asyncRoute(async (req, res) => {
    const conv = await query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    const msgs = await query(
      `SELECT m.id, m.role, m.content, m.content_type, m.status, m.provider, m.model, m.participant_id,
              m.round, m.included_in_context, m.meta, m.created_at,
              COALESCE(json_agg(json_build_object('id', a.id, 'kind', a.kind, 'mime', a.mime, 'filename', a.filename, 'size_bytes', a.size_bytes, 'status', a.status))
                       FILTER (WHERE a.id IS NOT NULL), '[]') AS attachments
         FROM messages m
         LEFT JOIN attachments a ON a.message_id = m.id
        WHERE m.conversation_id = $1
        GROUP BY m.id ORDER BY m.created_at ASC, m.round ASC`,
      [req.params.id],
    );
    res.json({ conversation: conv.rows[0], messages: msgs.rows });
  }));

  app.patch('/api/conversations/:id', asyncRoute(async (req, res) => {
    const { title, projectId, contextPolicy, archived } = req.body || {};
    const existing = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    const { rows } = await query(
      `UPDATE conversations
          SET title = COALESCE($3, title),
              project_id = CASE WHEN $4::boolean THEN $5::uuid ELSE project_id END,
              context_policy = COALESCE($6::jsonb, context_policy),
              archived = COALESCE($7::boolean, archived),
              updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, title ?? null, projectId !== undefined, projectId || null, contextPolicy ? JSON.stringify(contextPolicy) : null, archived ?? null],
    );
    res.json({ conversation: rows[0] });
  }));

  app.delete('/api/conversations/:id', asyncRoute(async (req, res) => {
    const { rowCount } = await query('DELETE FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    res.json({ ok: true });
  }));

  // --- Participants --------------------------------------------------------------
  app.get('/api/participants', asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT * FROM participants WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]);
    res.json({ participants: rows });
  }));

  app.post('/api/participants', asyncRoute(async (req, res) => {
    const { name, provider, model, settings = {} } = req.body || {};
    const def = providerInfo(provider);
    const { rows } = await query(
      `INSERT INTO participants (user_id, name, provider, model, settings, capabilities)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, name || def.label, provider, model || defaultModelFor(provider), JSON.stringify(settings), JSON.stringify(defaultCapabilitiesFor(provider))],
    );
    res.status(201).json({ participant: rows[0] });
  }));

  app.patch('/api/participants/:id', asyncRoute(async (req, res) => {
    const { name, provider, model, settings, capabilities } = req.body || {};
    const existing = await query('SELECT * FROM participants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Participant not found.' });
    const { rows } = await query(
      `UPDATE participants
          SET name = COALESCE($3, name),
              provider = COALESCE($4, provider),
              model = COALESCE($5, model),
              settings = COALESCE($6::jsonb, settings),
              capabilities = COALESCE($7::jsonb, capabilities),
              updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, name ?? null, provider ?? null, model ?? null, settings ? JSON.stringify(settings) : null, capabilities ? JSON.stringify(capabilities) : null],
    );
    res.json({ participant: rows[0] });
  }));

  app.delete('/api/participants/:id', asyncRoute(async (req, res) => {
    const { rowCount } = await query('DELETE FROM participants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rowCount) return res.status(404).json({ error: 'not_found', message: 'Participant not found.' });
    res.json({ ok: true });
  }));

  app.post('/api/participants/seed-defaults', asyncRoute(async (req, res) => {
    const existing = await query('SELECT provider FROM participants WHERE user_id = $1', [req.user.id]);
    const have = new Set(existing.rows.map((r) => r.provider));
    const created = [];
    for (const [provider, def] of Object.entries(PROVIDER_DEFS)) {
      if (have.has(provider)) continue;
      const { rows } = await query(
        `INSERT INTO participants (user_id, name, provider, model, settings, capabilities)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, def.label, provider, defaultModelFor(provider), JSON.stringify({}), JSON.stringify(defaultCapabilitiesFor(provider))],
      );
      created.push(rows[0]);
    }
    res.status(201).json({ created, selectedByDefault: 'deepseek' });
  }));

  // --- Provider keys (BYOK) -----------------------------------------------------
  app.get('/api/providers', asyncRoute(async (req, res) => {
    const out = {};
    for (const [provider, def] of Object.entries(PROVIDER_DEFS)) {
      let hasKey = false;
      try {
        const secret = await vault.readSecret(def.secretPath);
        hasKey = Boolean(secret?.api_key);
      } catch {
        hasKey = false;
      }
      out[provider] = {
        label: def.label,
        defaultModel: def.defaultModel,
        defaultBaseUrl: def.defaultBaseUrl,
        capabilities: def.defaultCapabilities,
        selectedByDefault: Boolean(def.selectedByDefault),
        hasKey,
      };
    }
    res.json({ providers: out, note: 'Keys are write-only/masked in normal settings and resolved server-side through OpenBao.' });
  }));

  app.put('/api/providers/:provider/key', asyncRoute(async (req, res) => {
    const { apiKey } = req.body || {};
    const def = providerInfo(req.params.provider);
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 4) {
      return res.status(400).json({ error: 'validation', message: 'Provide a valid API key.' });
    }
    await vault.writeSecret(def.secretPath, { api_key: apiKey, provider: req.params.provider, updated_at: new Date().toISOString() });
    await query(
      `INSERT INTO credential_references (user_id, provider, vault_path)
       VALUES ($1,$2,$3)
       ON CONFLICT (provider) DO UPDATE SET vault_path = EXCLUDED.vault_path, updated_at = now()`,
      [req.user.id, req.params.provider, def.secretPath],
    );
    res.json({ ok: true, provider: req.params.provider, stored: true, note: 'Key stored in OpenBao; value is never returned.' });
  }));

  app.delete('/api/providers/:provider/key', asyncRoute(async (req, res) => {
    const def = providerInfo(req.params.provider);
    await vault.deleteSecret(def.secretPath);
    await query('DELETE FROM credential_references WHERE user_id = $1 AND provider = $2', [req.user.id, req.params.provider]);
    res.json({ ok: true, provider: req.params.provider, deleted: true });
  }));

  app.get('/api/providers/:provider/status', asyncRoute(async (req, res) => {
    const def = providerInfo(req.params.provider);
    const secret = await vault.readSecret(def.secretPath).catch(() => null);
    res.json({ provider: req.params.provider, hasKey: Boolean(secret?.api_key), vaultPath: def.secretPath });
  }));

  // Minimal real request used to diagnose credential vs adapter failures (F13).
  // Returns the provider's actual HTTP status/message with the key value redacted.
  app.post('/api/providers/:provider/test', asyncRoute(async (req, res) => {
    const def = providerInfo(req.params.provider);
    const apiKey = await resolveApiKey(vault, req.params.provider);
    const model = defaultModelFor(req.params.provider);
    try {
      if (def.kind === 'anthropic') {
        const r = await fetch(`${def.defaultBaseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(20000),
        });
        const text = await r.text().catch(() => '');
        res.json({ provider: req.params.provider, ok: r.ok, status: r.status, message: text.slice(0, 300) });
      } else {
        const base = def.defaultBaseUrl.replace(/\/$/, '');
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(20000),
        });
        const text = await r.text().catch(() => '');
        res.json({ provider: req.params.provider, ok: r.ok, status: r.status, message: text.slice(0, 300) });
      }
    } catch (err) {
      res.status(502).json({ provider: req.params.provider, ok: false, status: 0, message: `Adapter transport error: ${err.message}` });
    }
  }));

  // --- Attachments ---------------------------------------------------------------
  app.post('/api/attachments', asyncRoute(async (req, res) => {
    let parsed;
    try {
      parsed = await parseMultipart(req);
    } catch (err) {
      return res.status(400).json({ error: 'upload', message: err.message });
    }
    const { key, size } = await writeUpload(req.user.id, parsed.filename, parsed.stream);
    const kind = parsed.mime.startsWith('image/') ? 'image' : parsed.mime.startsWith('audio/') ? 'audio' : 'file';
    const { rows } = await query(
      `INSERT INTO attachments (user_id, kind, mime, filename, size_bytes, storage_key, status)
       VALUES ($1,$2,$3,$4,$5,$6,'ready') RETURNING id, kind, mime, filename, size_bytes, status, created_at`,
      [req.user.id, kind, parsed.mime, parsed.filename, size, key],
    );
    res.status(201).json({ attachment: rows[0] });
  }));

  app.get('/api/attachments/:id', asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT * FROM attachments WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found', message: 'Attachment not found.' });
    const att = rows[0];
    const stream = readUpload(att.storage_key);
    stream.on('error', () => res.status(404).json({ error: 'missing_media', message: 'Stored media is missing.' }));
    res.setHeader('Content-Type', att.mime);
    res.setHeader('Content-Disposition', `inline; filename="${att.filename.replace(/"/g, '')}"`);
    stream.pipe(res);
  }));

  app.delete('/api/attachments/:id', asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT * FROM attachments WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'not_found', message: 'Attachment not found.' });
    removeUpload(rows[0].storage_key);
    await query(`UPDATE attachments SET status = 'removed' WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  }));

  // --- MCP connections -----------------------------------------------------------
  app.get('/api/mcp', asyncRoute(async (req, res) => {
    const { rows } = await query('SELECT id, name, url, auth_type, vault_ref, enabled, allow_private_network, tools, status, last_error, created_at, updated_at FROM mcp_connections WHERE user_id = $1 ORDER BY created_at ASC', [req.user.id]);
    res.json({ connections: rows });
  }));

  app.post('/api/mcp', asyncRoute(async (req, res) => {
    const { name, url, authType = 'none', authHeader, allowPrivateNetwork = false } = req.body || {};
    if (!name?.trim() || !url) return res.status(400).json({ error: 'validation', message: 'Name and URL are required.' });
    await validateMcpUrl(url, { allowPrivateNetwork });
    let vaultRef = '';
    if (authHeader) {
      vaultRef = `mcp/${crypto.randomUUID()}`;
      await vault.writeSecret(vaultRef, { auth_header: authHeader, name: name.trim() });
    }
    const { rows } = await query(
      `INSERT INTO mcp_connections (user_id, name, url, auth_type, vault_ref, enabled, allow_private_network)
       VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id, name, url, auth_type, vault_ref, enabled, allow_private_network, tools, status, last_error, created_at`,
      [req.user.id, name.trim(), url, authHeader ? authType : 'none', vaultRef, Boolean(allowPrivateNetwork)],
    );
    res.status(201).json({ connection: rows[0] });
  }));

  app.patch('/api/mcp/:id', asyncRoute(async (req, res) => {
    const { name, url, enabled, allowPrivateNetwork, authHeader } = req.body || {};
    const existing = await query('SELECT * FROM mcp_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Connection not found.' });
    if (url) await validateMcpUrl(url, { allowPrivateNetwork: allowPrivateNetwork ?? existing.rows[0].allow_private_network });
    if (authHeader) {
      const vaultRef = existing.rows[0].vault_ref || `mcp/${crypto.randomUUID()}`;
      await vault.writeSecret(vaultRef, { auth_header: authHeader });
      await query('UPDATE mcp_connections SET vault_ref = $2 WHERE id = $1', [req.params.id, vaultRef]);
    }
    const { rows } = await query(
      `UPDATE mcp_connections
          SET name = COALESCE($3, name),
              url = COALESCE($4, url),
              enabled = COALESCE($5::boolean, enabled),
              allow_private_network = COALESCE($6::boolean, allow_private_network),
              updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, name?.trim() || null, url || null, enabled ?? null, allowPrivateNetwork ?? null],
    );
    res.json({ connection: rows[0] });
  }));

  app.delete('/api/mcp/:id', asyncRoute(async (req, res) => {
    const existing = await query('SELECT * FROM mcp_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Connection not found.' });
    if (existing.rows[0].vault_ref) await vault.deleteSecret(existing.rows[0].vault_ref).catch(() => {});
    await query('DELETE FROM mcp_connections WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  }));

  app.post('/api/mcp/:id/discover', asyncRoute(async (req, res) => {
    const existing = await query('SELECT * FROM mcp_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Connection not found.' });
    const conn = existing.rows[0];
    await validateMcpUrl(conn.url, { allowPrivateNetwork: conn.allow_private_network });
    const secret = conn.vault_ref ? await vault.readSecret(conn.vault_ref).catch(() => null) : null;
    const authHeader = secret?.auth_header || '';
    try {
      await query(`UPDATE mcp_connections SET status = 'connecting', last_error = NULL WHERE id = $1`, [conn.id]);
      const tools = await discoverTools({ url: new URL(conn.url), authHeader });
      await query(`UPDATE mcp_connections SET status = 'connected', tools = $2::jsonb, last_error = NULL, updated_at = now() WHERE id = $1`, [conn.id, JSON.stringify(tools)]);
      res.json({ ok: true, tools, status: 'connected' });
    } catch (err) {
      await query(`UPDATE mcp_connections SET status = 'failed', last_error = $2 WHERE id = $1`, [conn.id, err.message.slice(0, 500)]);
      res.status(502).json({ error: 'discovery_failed', message: err.message });
    }
  }));

  // --- Settings -------------------------------------------------------------------
  app.get('/api/settings', asyncRoute(async (req, res) => {
    res.json({ limits: config.defaults, voice: { mode: 'dictation_and_spoken_responses', engine: 'browser-web-speech-api' } });
  }));

  // Nonsecret acceptance canary for vault persistence checks (A12). Kept
  // separate from provider keys so acceptance never touches real credentials.
  app.post('/api/acceptance-canary', asyncRoute(async (req, res) => {
    const { value } = req.body || {};
    if (!value || typeof value !== 'string' || value.length > 200) {
      return res.status(400).json({ error: 'validation', message: 'Provide a short nonsecret canary value.' });
    }
    await vault.writeSecret('acceptance-canary', { value, written_at: new Date().toISOString() });
    res.json({ ok: true });
  }));

  app.get('/api/acceptance-canary', asyncRoute(async (req, res) => {
    const secret = await vault.readSecret('acceptance-canary').catch(() => null);
    res.json({ canary: secret?.value || null });
  }));

  // --- Runs (SSE) -----------------------------------------------------------------
  app.post('/api/conversations/:id/runs', asyncRoute(async (req, res) => {
    const conversationId = req.params.id;
    const { mode = 'single', participantIds = [], message } = req.body || {};
    const conv = await query('SELECT * FROM conversations WHERE id = $1 AND user_id = $2', [conversationId, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    if (!Array.isArray(participantIds) || !participantIds.length) {
      return res.status(400).json({ error: 'validation', message: 'Select at least one participant.' });
    }
    if (participantIds.length > config.defaults.maxParticipants) {
      return res.status(400).json({ error: 'validation', message: `At most ${config.defaults.maxParticipants} participants per run.` });
    }
    const participants = await query('SELECT * FROM participants WHERE id = ANY($1::uuid[]) AND user_id = $2', [participantIds, req.user.id]);
    if (participants.rows.length !== participantIds.length) {
      return res.status(400).json({ error: 'validation', message: 'One or more participants were not found.' });
    }

    let attachmentRows = [];
    if (message?.content || message?.attachmentIds?.length) {
      const attIds = message.attachmentIds || [];
      if (attIds.length) {
        attachmentRows = (await query('SELECT * FROM attachments WHERE id = ANY($1::uuid[]) AND user_id = $2', [attIds, req.user.id])).rows;
        if (attachmentRows.length !== attIds.length) {
          return res.status(400).json({ error: 'validation', message: 'One or more attachments were not found.' });
        }
      }
      // Idempotent retry (F05): a clientRequestId that already produced a user
      // message must not insert a duplicate billable message.
      const clientRequestId = message.clientRequestId || null;
      let userMsgId = null;
      if (clientRequestId) {
        const existing = await query(
          `SELECT id FROM messages WHERE conversation_id = $1 AND meta->>'clientRequestId' = $2 LIMIT 1`,
          [conversationId, clientRequestId],
        );
        if (existing.rows.length) userMsgId = existing.rows[0].id;
      }
      if (!userMsgId) {
        const userMsg = await query(
          `INSERT INTO messages (conversation_id, role, content, content_type, status, round, meta)
           VALUES ($1,'user',$2,'text','complete',0,$3) RETURNING id`,
          [conversationId, message.content || '', JSON.stringify({ attachmentIds: attIds, clientRequestId })],
        );
        userMsgId = userMsg.rows[0].id;
        for (const att of attachmentRows) {
          await query(`UPDATE attachments SET message_id = $2, conversation_id = $3 WHERE id = $1`, [att.id, userMsgId, conversationId]);
        }
      }
    }

    const { run, snapshot, round } = await insertRun({ conversationId, userId: req.user.id, mode, participantIds });
    const controller = new AbortController();
    const entry = registerRun(run.id, controller);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event, data) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send('run_start', { runId: run.id, conversationId, round, mode, participants: participants.rows.map((p) => ({ id: p.id, name: p.name, provider: p.provider, model: p.model })) });

    const hydrated = await hydrateSnapshotForRun(snapshot);
    const connections = (await query('SELECT * FROM mcp_connections WHERE user_id = $1 AND enabled = true', [req.user.id])).rows;

    const finish = async () => {
      unregisterRun(run.id);
      await query(`UPDATE runs SET status = 'complete', finished_at = now() WHERE id = $1`, [run.id]);
      send('run_complete', { runId: run.id, round });
      res.end();
    };

    const failRun = async (errorMessage) => {
      unregisterRun(run.id);
      await query(`UPDATE runs SET status = 'failed', finished_at = now() WHERE id = $1`, [run.id]);
      send('run_error', { runId: run.id, error: errorMessage });
      res.end();
    };

    const dispatchOne = async (participant) => {
      const messageRow = await createAssistantMessage({
        conversationId,
        participant,
        round,
        runId: run.id,
        status: 'streaming',
        content: '',
      });
      const state = { messageId: messageRow.id, content: '', status: 'streaming', usage: null };
      try {
        const result = await dispatchParticipant({
          run,
          participant,
          snapshot: hydrated,
          connections,
          vault,
          signal: controller.signal,
          onChunk: ({ text }) => {
            state.content += text;
            send('chunk', { participantId: participant.id, messageId: state.messageId, text });
          },
        });
        state.content = result.text;
        state.usage = result.usage;
        state.status = 'complete';
        await updateMessageContent(state.messageId, state.content, 'complete');
        await recordUsage({ runId: run.id, participantId: participant.id, provider: participant.provider, model: participant.model, usage: result.usage });
        await query(`UPDATE run_participants SET status = 'complete', usage = $3::jsonb, finished_at = now() WHERE run_id = $1 AND participant_id = $2`, [run.id, participant.id, JSON.stringify(result.usage || null)]);
        send('participant_done', { participantId: participant.id, messageId: state.messageId, status: 'complete', usage: result.usage });
        return { participant, result, state };
      } catch (err) {
        if (controller.signal.aborted) {
          state.status = 'stopped';
          await updateMessageContent(state.messageId, state.content || '', 'stopped');
          await query(`UPDATE run_participants SET status = 'stopped', finished_at = now() WHERE run_id = $1 AND participant_id = $2`, [run.id, participant.id]);
          send('participant_done', { participantId: participant.id, messageId: state.messageId, status: 'stopped' });
        } else {
          state.status = 'failed';
          await updateMessageContent(state.messageId, state.content || '', 'failed');
          await query(`UPDATE run_participants SET status = 'failed', error = $3, finished_at = now() WHERE run_id = $1 AND participant_id = $2`, [run.id, participant.id, err.message.slice(0, 1000)]);
          send('participant_done', { participantId: participant.id, messageId: state.messageId, status: 'failed', error: err.message, code: err.code });
        }
        return { participant, error: err, state };
      }
    };

    try {
      const results = await Promise.all(participants.rows.map((p) => dispatchOne(p)));

      // Map any returned tool calls to configured MCP connections.
      const proposals = [];
      for (const r of results) {
        if (!r.result?.toolCalls?.length) continue;
        for (const tc of r.result.toolCalls) {
          const target = mapToolNameToConnection(tc.name, connections);
          if (!target) continue;
          let args = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = { _raw: tc.arguments };
          }
          const id = crypto.randomUUID();
          proposals.push({
            id,
            providerToolCallId: tc.id,
            participantId: r.participant.id,
            toolName: target.toolName,
            connectionId: target.conn.id,
            arguments: args,
            rawName: tc.name,
          });
          await query(
            `INSERT INTO tool_actions (run_id, conversation_id, requester_participant_id, mcp_connection_id, tool_name, arguments, status, idempotency_key)
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,'proposed',$7)`,
            [run.id, conversationId, r.participant.id, target.conn.id, target.toolName, JSON.stringify(args), crypto.randomUUID()],
          );
        }
      }

      if (proposals.length && !controller.signal.aborted) {
        send('tool_proposals', {
          runId: run.id,
          proposals: proposals.map((p) => ({ id: p.id, participantId: p.participantId, toolName: p.toolName, connectionId: p.connectionId, arguments: p.arguments })),
        });
        const selection = await new Promise((resolve) => {
          entry.resolver = (sel) => resolve(sel);
        });
        if (selection.cancel || !selection.actionIds?.length) {
          await query(`UPDATE tool_actions SET status = 'cancelled', updated_at = now() WHERE run_id = $1 AND status = 'proposed'`, [run.id]);
          send('tools_cancelled', { runId: run.id });
        } else {
          const chosen = proposals.filter((p) => selection.actionIds.includes(p.id));
          const coordinated = coordinateToolSelections(chosen, { actionIds: selection.actionIds });
          for (const item of coordinated) {
            const conn = (await query('SELECT * FROM mcp_connections WHERE id = $1 AND user_id = $2', [item.connectionId, req.user.id])).rows[0];
            if (!conn) {
              await query(`UPDATE tool_actions SET status = 'failed', error = 'MCP connection not found.', updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds]);
              send('tool_result', { actionIds: item.actionIds, toolName: item.toolName, status: 'failed', error: 'MCP connection not found.' });
              continue;
            }
            const secret = conn.vault_ref ? await vault.readSecret(conn.vault_ref).catch(() => null) : null;
            const authHeader = secret?.auth_header || '';
            try {
              await query(`UPDATE tool_actions SET status = 'executing', updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds]);
              const result = await executeCoordinatedTool({ connection: conn, authHeader, toolName: item.toolName, args: item.arguments, signal: controller.signal });
              await appendToolResult(conversationId, round, run.id, item, result);
              await query(`UPDATE tool_actions SET status = 'complete', result = $2::jsonb, updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds, JSON.stringify({ text: result.text?.slice(0, 5000), isError: Boolean(result.isError) })]);
              send('tool_result', { actionIds: item.actionIds, toolName: item.toolName, status: result.isError ? 'failed' : 'complete', text: result.text?.slice(0, 5000) });
            } catch (err) {
              await query(`UPDATE tool_actions SET status = 'failed', error = $2, updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds, err.message.slice(0, 500)]);
              send('tool_result', { actionIds: item.actionIds, toolName: item.toolName, status: 'failed', error: err.message });
            }
          }
        }
      }
      await finish();
    } catch (err) {
      await failRun(err.message || 'Run failed.');
    }
  }));

  app.post('/api/runs/:id/stop', asyncRoute(async (req, res) => {
    const stopped = stopRun(req.params.id);
    res.json({ ok: true, stopped });
  }));

  app.post('/api/runs/:id/tool-authorize', asyncRoute(async (req, res) => {
    const { actionIds = [], cancel = false } = req.body || {};
    await authorizeTools(req.params.id, { actionIds, cancel });
    res.json({ ok: true });
  }));

  // --- Static web app ---------------------------------------------------------------
  app.use(express.static(webRoot));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(webRoot, 'index.html'));
  });

  // --- Error handling ---------------------------------------------------------------
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    sendError(res, err);
  });

  const server = app.listen(config.port, config.host, () => {
    console.log(`[a0] listening on ${config.host}:${config.port} (harness ${HARNESS_VERSION})`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

async function hydrateSnapshotForRun(snapshot) {
  const { readUploadBase64 } = await import('./media.js');
  for (const msg of snapshot.messages) {
    for (const att of msg.attachments || []) {
      try {
        att.data = await readUploadBase64(att.storageKey);
      } catch {
        att.data = null;
        att.hydrationError = 'attachment_missing';
      }
    }
  }
  return snapshot;
}

async function appendToolResult(conversationId, round, runId, item, result) {
  const text = result.text || (result.isError ? 'Tool reported an error.' : 'Tool completed.');
  await query(
    `INSERT INTO messages (conversation_id, role, content, content_type, status, round, meta)
     VALUES ($1,'tool',$2,'text','complete',$3,$4)`,
    [conversationId, text, round, JSON.stringify({ runId, toolName: item.toolName, actionIds: item.actionIds, isError: Boolean(result.isError) })],
  );
}

async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: config.maxUploadBytes } });
    let done = false;
    bb.on('file', (name, stream, info) => {
      if (done) {
        stream.resume();
        return;
      }
      done = true;
      const { filename, mimeType } = info;
      if (!filename) {
        stream.resume();
        reject(new Error('A filename is required.'));
        return;
      }
      resolve({ filename, mime: mimeType || 'application/octet-stream', stream });
    });
    bb.on('error', (err) => reject(new Error(err.message)));
    bb.on('close', () => {
      if (!done) reject(new Error('No file field received.'));
    });
    req.pipe(bb);
  });
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  start().catch((err) => {
    console.error('[a0] fatal startup error:', err.message);
    process.exit(1);
  });
}
