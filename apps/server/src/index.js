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
  modelInfo,
  capabilitiesForModel,
  streamProvider,
} from './providers.js';
import { HARNESS_VERSION, systemPromptFor } from './harness.js';
import {
  buildBlocks,
  latestRevision,
  createRevision,
  assembleBlocks,
  estimateCachePrefix,
  describeBlockType,
} from './contexts.js';
import { FORGE_TEMPLATES, CORES, RETAINED_SOURCE, forgeTemplate, effectivePromptFor } from './retained/definitions.js';
import { ptcna, ringSummary } from './ptcna.js';
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
    res.json({ conversation: conv.rows[0], messages: msgs.rows, messageCount: msgs.rows.length });
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
    let validatedSettings;
    try {
      validatedSettings = settings !== undefined ? validateParticipantSettings(settings) : undefined;
    } catch (err) {
      return res.status(400).json({ error: 'validation', message: err.message, code: err.code });
    }
    const existing = await query('SELECT * FROM participants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Participant not found.' });
    const current = existing.rows[0];
    const nextModel = model ?? current.model;
    const nextProvider = provider ?? current.provider;
    // C11/C12: a model change recomputes capability declarations from the
    // catalogue for that provider; custom IDs keep provider-wide caps.
    let nextCapabilities = capabilities ?? current.capabilities;
    if (model && model !== current.model) {
      nextCapabilities = capabilitiesForModel(nextProvider, nextModel);
    }
    const { rows } = await query(
      `UPDATE participants
          SET name = COALESCE($3, name),
              provider = COALESCE($4, provider),
              model = COALESCE($5, model),
              settings = COALESCE($6::jsonb, settings),
              capabilities = COALESCE($7::jsonb, capabilities),
              updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, name ?? null, provider ?? null, model ?? null, validatedSettings !== undefined ? JSON.stringify(validatedSettings) : null, JSON.stringify(nextCapabilities)],
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
      if (have.has(provider)) continue; // C02: defaults never overwrite a deliberate choice.
      const { rows } = await query(
        `INSERT INTO participants (user_id, name, provider, model, settings, capabilities)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.user.id, def.label, provider, defaultModelFor(provider), JSON.stringify({}), JSON.stringify(defaultCapabilitiesFor(provider))],
      );
      created.push(rows[0]);
    }
    res.status(201).json({ created, selectedByDefault: 'deepseek' });
  }));

  // FR0: upgrade an existing participant's OpenAI model in place, preserving
  // identity/history. Capabilities follow the selected model catalogue entry.
  const ALLOWED_PARTICIPANT_SETTINGS = {
    baseUrl: 'string',
    reasoningEffort: 'string',
    maxOutputTokens: 'number',
    verbosity: 'string',
    outputBudget: 'number',
    promptCacheKey: 'string',
    timeoutMs: 'number',
    toolSelection: 'stringArray',
  };
  const validateParticipantSettings = (settings) => {
    if (settings == null) return {};
    if (typeof settings !== 'object' || Array.isArray(settings)) {
      const err = new Error('settings must be an object of supported choices.');
      err.status = 400;
      throw err;
    }
    const out = {};
    for (const [key, value] of Object.entries(settings)) {
      if (!(key in ALLOWED_PARTICIPANT_SETTINGS)) {
        const err = new Error(`Unsupported setting "${key}". Supported: ${Object.keys(ALLOWED_PARTICIPANT_SETTINGS).join(', ')}.`);
        err.status = 400;
        err.code = 'unsupported_setting';
        throw err;
      }
      const type = ALLOWED_PARTICIPANT_SETTINGS[key];
      if (type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          const err = new Error(`Setting "${key}" must be a positive number.`);
          err.status = 400;
          err.code = 'invalid_setting';
          throw err;
        }
      } else if (type === 'stringArray') {
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
          const err = new Error(`Setting "${key}" must be an array of tool names.`);
          err.status = 400;
          err.code = 'invalid_setting';
          throw err;
        }
      } else if (typeof value !== 'string' || !value.trim()) {
        const err = new Error(`Setting "${key}" must be a ${type}.`);
        err.status = 400;
        err.code = 'invalid_setting';
        throw err;
      }
      out[key] = value;
    }
    return out;
  };

  app.post('/api/participants/:id/upgrade-model', asyncRoute(async (req, res) => {
    const { model } = req.body || {};
    const existing = await query('SELECT * FROM participants WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'not_found', message: 'Participant not found.' });
    const participant = existing.rows[0];
    const provider = participant.provider;
    if (provider !== 'openai') {
      return res.status(400).json({ error: 'validation', message: 'In-place model upgrade currently applies to OpenAI participants.' });
    }
    const info = modelInfo(provider, model);
    if (!info) {
      return res.status(400).json({ error: 'validation', message: `Unknown ${provider} model: ${model}` });
    }
    const capabilities = capabilitiesForModel(provider, model);
    const { rows } = await query(
      `UPDATE participants SET model = $3, capabilities = $4::jsonb, updated_at = now()
        WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, model, JSON.stringify(capabilities)],
    );
    res.json({ participant: rows[0] });
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
        models: def.models ? Object.entries(def.models).map(([id, info]) => ({ id, ...info })) : null,
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

  // Minimal real request used to diagnose credential vs adapter failures.
  // OpenAI uses the same Responses adapter as inference (FR0); optional `model`
  // lets the website test the exact selected model. Key value stays redacted.
  app.post('/api/providers/:provider/test', asyncRoute(async (req, res) => {
    const def = providerInfo(req.params.provider);
    const apiKey = await resolveApiKey(vault, req.params.provider);
    const model = (req.body?.model) || defaultModelFor(req.params.provider);
    try {
      if (def.kind === 'openai-responses') {
        const info = modelInfo(req.params.provider, model);
        if (!info) {
          return res.status(400).json({ provider: req.params.provider, ok: false, status: 0, message: `Unknown OpenAI model: ${model}` });
        }
        const snapshot = { system: 'A0 settings test.', messages: [{ role: 'user', content: 'ping', attachments: [] }] };
        let chunks = 0;
        // C11: diagnostic and inference share the adapter; saved settings apply,
        // with the bounded diagnostic output budget disclosed as an override.
        const saved = validateParticipantSettings(req.body?.settings || {});
        const diagSettings = { ...saved, maxOutputTokens: saved.maxOutputTokens || 256 };
        const result = await streamProvider({
          provider: req.params.provider,
          model,
          apiKey,
          snapshot,
          tools: [],
          signal: new AbortController().signal,
          onChunk: () => { chunks += 1; },
          timeoutMs: saved.timeoutMs || 20000,
          settings: diagSettings,
        });
        res.json({
          provider: req.params.provider,
          ok: result.finishReason === 'stop',
          status: 200,
          model,
          chunks,
          finishReason: result.finishReason,
          incompleteReason: result.incompleteReason || null,
          message: result.text.slice(0, 120),
        });
      } else if (def.kind === 'anthropic') {
        const r = await fetch(`${def.defaultBaseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(20000),
        });
        const text = await r.text().catch(() => '');
        res.json({ provider: req.params.provider, ok: r.ok, status: r.status, model, message: text.slice(0, 300) });
      } else {
        const base = def.defaultBaseUrl.replace(/\/$/, '');
        const r = await fetch(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
          body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          signal: AbortSignal.timeout(20000),
        });
        const text = await r.text().catch(() => '');
        res.json({ provider: req.params.provider, ok: r.ok, status: r.status, model, message: text.slice(0, 300) });
      }
    } catch (err) {
      const status = err.status || 502;
      res.status(status).json({ provider: req.params.provider, ok: false, status: status === 502 ? 0 : status, model, message: `${err.code || 'adapter_error'}: ${err.message}` });
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

  // --- FR2 retained agents (Forge + PTCNA) ----------------------------------------
  app.get('/api/forge/templates', asyncRoute(async (req, res) => {
    res.json({ templates: FORGE_TEMPLATES, cores: CORES, retainedSource: RETAINED_SOURCE });
  }));

  app.post('/api/agents', asyncRoute(async (req, res) => {
    const { name, templateId, task = '', provider = 'openai', model, parentId } = req.body || {};
    const template = forgeTemplate(templateId);
    if (!template) return res.status(400).json({ error: 'validation', message: `Unknown Forge template: ${templateId}` });
    const parent = parentId
      ? (await query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [parentId, req.user.id])).rows[0]
      : null;
    if (parentId && !parent) return res.status(404).json({ error: 'not_found', message: 'Parent agent not found.' });
    const effectiveInstructions = effectivePromptFor(template, {});
    // One durable creation path: conversation + participant + agent + module.
    const conv = await query(
      `INSERT INTO conversations (user_id, title, harness_version) VALUES ($1,$2,$3) RETURNING *`,
      [req.user.id, name || template.name, HARNESS_VERSION],
    );
    const participant = await query(
      `INSERT INTO participants (user_id, name, provider, model, settings, capabilities)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, `${name || template.name} (${template.id})`, provider, model || defaultModelFor(provider), JSON.stringify({}), JSON.stringify(defaultCapabilitiesFor(provider))],
    );
    const rootId = parent?.root_id || parent?.id || null;
    const agent = await query(
      `INSERT INTO agents (user_id, name, forge_template_id, effective_instructions, original_definition, participant_id, conversation_id, task, status, parent_id, root_id, lineage, tool_scope)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,'ready',$9,$10,$11::jsonb,$12::jsonb) RETURNING *`,
      [req.user.id, name || template.name, template.id, effectiveInstructions, JSON.stringify({ ...template, source: `${RETAINED_SOURCE.forgeTemplates}:ARCHETYPES`, digest: template.digest }), participant.rows[0].id, conv.rows[0].id, task, parentId || null, rootId, JSON.stringify([...(parent?.lineage || []), parentId || 'root']), JSON.stringify([])],
    );
    const moduleRow = await query(
      `INSERT INTO agent_modules (user_id, agent_id, descriptor) VALUES ($1,$2,$3::jsonb) RETURNING *`,
      [req.user.id, agent.rows[0].id, JSON.stringify({ type: 'agent-stats-chat', renderer: 'agent-panel', schemaVersion: 1, bindings: { agentId: agent.rows[0].id, conversationId: conv.rows[0].id, participantId: participant.rows[0].id } })],
    );
    let ptcnaSummary = null;
    let ptcnaError = null;
    try {
      const created = await ptcna.newRuntime(agent.rows[0].id);
      ptcnaSummary = ringSummary(created.state);
      await query(`UPDATE agents SET ptcna_summary = $2::jsonb WHERE id = $1`, [agent.rows[0].id, JSON.stringify(ptcnaSummary)]);
    } catch (err) {
      ptcnaError = err.message;
    }
    res.status(201).json({ agent: agent.rows[0], module: moduleRow.rows[0], ptcnaSummary, ptcnaError });
  }));

  app.get('/api/agents', asyncRoute(async (req, res) => {
    const { rows } = await query(
      `SELECT a.*, m.id AS module_id, m.renderer, m.descriptor AS module_descriptor
         FROM agents a
         LEFT JOIN agent_modules m ON m.agent_id = a.id AND m.status = 'active'
        WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
      [req.user.id],
    );
    res.json({ agents: rows });
  }));

  app.get('/api/agents/:id', asyncRoute(async (req, res) => {
    const agent = await query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!agent.rows.length) return res.status(404).json({ error: 'not_found', message: 'Agent not found.' });
    const module = await query('SELECT * FROM agent_modules WHERE agent_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 1', [req.params.id, 'active']);
    res.json({ agent: agent.rows[0], module: module.rows[0] || null });
  }));

  app.post('/api/agents/:id/retire', asyncRoute(async (req, res) => {
    const agent = await query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!agent.rows.length) return res.status(404).json({ error: 'not_found', message: 'Agent not found.' });
    await query(`UPDATE agents SET status = 'retired', retired_at = now() WHERE id = $1`, [req.params.id]);
    await query(`UPDATE agent_modules SET status = 'retired', retired_at = now() WHERE agent_id = $1 AND status = 'active'`, [req.params.id]);
    res.json({ ok: true, status: 'retired' });
  }));

  app.post('/api/agents/:id/ptcna/infer', asyncRoute(async (req, res) => {
    const agent = await query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!agent.rows.length) return res.status(404).json({ error: 'not_found', message: 'Agent not found.' });
    const input = String(req.body?.input || '').slice(0, 4000);
    const out = await ptcna.infer(req.params.id, input);
    const summary = ringSummary(out.state);
    await query(`UPDATE agents SET ptcna_summary = $2::jsonb WHERE id = $1`, [req.params.id, JSON.stringify(summary)]);
    res.json({ receipt: out.receipt, summary });
  }));

  app.post('/api/agent-modules/:id/swap', asyncRoute(async (req, res) => {
    const { renderer } = req.body || {};
    if (!['agent-panel', 'agent-stats', 'agent-chat'].includes(renderer)) {
      return res.status(400).json({ error: 'validation', message: 'Unknown renderer.' });
    }
    const mod = await query('SELECT * FROM agent_modules WHERE id = $1 AND user_id = $2 AND status = $3', [req.params.id, req.user.id, 'active']);
    if (!mod.rows.length) return res.status(404).json({ error: 'not_found', message: 'Active module not found.' });
    const previous = mod.rows[0].renderer;
    const descriptor = { ...mod.rows[0].descriptor, renderer };
    await query(`UPDATE agent_modules SET renderer = $3, previous_renderer = $4, descriptor = $5::jsonb WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id, renderer, previous, JSON.stringify(descriptor)]);
    res.json({ ok: true, previousRenderer: previous, renderer, note: 'Swap changes presentation only; agent state, chat and bindings are preserved.' });
  }));

  app.post('/api/agent-modules/:id/retire', asyncRoute(async (req, res) => {
    const mod = await query('SELECT * FROM agent_modules WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!mod.rows.length) return res.status(404).json({ error: 'not_found', message: 'Module not found.' });
    await query(`UPDATE agent_modules SET status = 'retired', retired_at = now() WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, status: 'retired' });
  }));

  // --- Settings -------------------------------------------------------------------
  const OWNER_SETTINGS_KEYS = ['voiceRate', 'autoSpeak', 'enterToSend', 'textSize', 'comparisonLayout'];
  app.get('/api/settings', asyncRoute(async (req, res) => {
    const user = await query('SELECT settings FROM users WHERE id = $1', [req.user.id]);
    res.json({
      limits: config.defaults,
      owner: user.rows[0]?.settings || {},
      voice: { mode: 'dictation_and_spoken_responses', engine: 'browser-web-speech-api' },
    });
  }));

  app.put('/api/settings', asyncRoute(async (req, res) => {
    const body = req.body || {};
    const out = {};
    for (const [key, value] of Object.entries(body)) {
      if (!OWNER_SETTINGS_KEYS.includes(key)) {
        return res.status(400).json({ error: 'validation', message: `Unsupported owner setting "${key}". Supported: ${OWNER_SETTINGS_KEYS.join(', ')}.` });
      }
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return res.status(400).json({ error: 'validation', message: `Owner setting "${key}" must be a string, number or boolean.` });
      }
      out[key] = value;
    }
    await query('UPDATE users SET settings = settings || $2::jsonb, updated_at = now() WHERE id = $1', [req.user.id, JSON.stringify(out)]);
    res.json({ ok: true, owner: (await query('SELECT settings FROM users WHERE id = $1', [req.user.id])).rows[0].settings });
  }));

  // --- FR1 context revisions -------------------------------------------------------
  // The editor preview and the run assembler share contexts.js, so a preview
  // reflects exactly what the next run will dispatch (RC01).
  app.get('/api/conversations/:id/context', asyncRoute(async (req, res) => {
    const conv = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    const latest = await latestRevision(req.params.id, req.user.id);
    const current = latest || { blocks: (await buildBlocks(req.params.id, req.user.id)).blocks, revision: 0, id: null, note: 'working draft' };
    res.json({
      conversationId: req.params.id,
      revision: current.revision,
      revisionId: current.id,
      note: current.note,
      blocks: current.blocks,
      preview: await assembleBlocks(current.blocks || [], {}),
    });
  }));

  app.get('/api/context-revisions/:id', asyncRoute(async (req, res) => {
    const rev = await query('SELECT * FROM context_revisions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rev.rows.length) return res.status(404).json({ error: 'not_found', message: 'Context revision not found.' });
    res.json({ revision: rev.rows[0] });
  }));

  app.post('/api/conversations/:id/context-revisions', asyncRoute(async (req, res) => {
    const { blocks, note = '', expectedRevision } = req.body || {};
    if (!Array.isArray(blocks)) {
      return res.status(400).json({ error: 'validation', message: 'Provide a blocks array.' });
    }
    const conv = await query('SELECT id FROM conversations WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'not_found', message: 'Conversation not found.' });
    // Validate against the canonical block identity set for this conversation.
    const canonical = await buildBlocks(req.params.id, req.user.id);
    const allowed = new Map(canonical.blocks.map((b) => [b.id, b]));
    const seen = new Set();
    for (const block of blocks) {
      if (!allowed.has(block.id)) {
        return res.status(400).json({ error: 'validation', message: `Unknown or unauthorized block: ${block.id}` });
      }
      if (seen.has(block.id)) {
        return res.status(400).json({ error: 'validation', message: `Duplicate block: ${block.id}` });
      }
      seen.add(block.id);
      const original = allowed.get(block.id);
      if (!original.editable && block.content !== undefined) {
        return res.status(400).json({ error: 'validation', message: `${block.id} is read-only (${original.readonlyReason || describeBlockType(original.type).readonlyReason}).` });
      }
    }
    // Rebase onto canonical order; edits only to editable fields.
    const ordered = canonical.blocks.map((original) => {
      const incoming = blocks.find((b) => b.id === original.id);
      if (!incoming) return original;
      return {
        ...original,
        included: incoming.included !== undefined ? Boolean(incoming.included) : original.included,
        content: original.editable ? (incoming.content ?? original.content) : original.content,
      };
    });
    const revision = await createRevision(req.params.id, req.user.id, { blocks: ordered, note, expectedRevision });
    const changedIndex = ordered.findIndex((b, i) => {
      const prev = canonical.blocks[i];
      return !prev || prev.included !== b.included || (prev.editable && prev.content !== b.content);
    });
    res.status(201).json({
      revision: revision.revision,
      revisionId: revision.id,
      blocks: revision.blocks,
      preview: await assembleBlocks(revision.blocks, {}),
      cacheEstimate: estimateCachePrefix(ordered, changedIndex < 0 ? 0 : changedIndex),
      note,
    });
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
      if (attIds.length > (config.defaults.maxAttachmentCount || 8)) {
        return res.status(400).json({ error: 'validation', message: `Too many attachments (max ${config.defaults.maxAttachmentCount}).` });
      }
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

    const finish = async (overallStatus = 'complete') => {
      unregisterRun(run.id);
      await query(`UPDATE runs SET status = $2, finished_at = now() WHERE id = $1`, [run.id, overallStatus]);
      send('run_complete', { runId: run.id, round, status: overallStatus });
      res.end();
    };

    const failRun = async (errorMessage) => {
      unregisterRun(run.id);
      await query(`UPDATE runs SET status = 'failed', finished_at = now() WHERE id = $1`, [run.id]);
      send('run_error', { runId: run.id, error: errorMessage });
      res.end();
    };

    const dispatchOne = async (participant, continuation = null) => {
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
          continuation,
          onChunk: ({ text }) => {
            state.content += text;
            send('chunk', { participantId: participant.id, messageId: state.messageId, text });
          },
        });
        state.content = result.text;
        state.usage = result.usage;
        // C10: failed/incomplete provider outcomes must not become complete.
        if (result.finishReason === 'failed') state.status = 'failed';
        else if (result.finishReason === 'incomplete') state.status = 'incomplete';
        else state.status = 'complete';
        await updateMessageContent(state.messageId, state.content, state.status);
        if (state.status !== 'complete') {
          await query(`UPDATE messages SET meta = jsonb_set(meta, '{error}', to_jsonb($3::text), true) WHERE id = $1 AND conversation_id = $2`,
            [state.messageId, conversationId, result.incompleteReason || `provider_${state.status}`]);
        }
        await recordUsage({ runId: run.id, participantId: participant.id, provider: participant.provider, model: participant.model, usage: result.usage });
        await query(`UPDATE run_participants SET status = $3, usage = $4::jsonb, finished_at = now() WHERE run_id = $1 AND participant_id = $2`, [run.id, participant.id, state.status, JSON.stringify(result.usage || null)]);
        send('participant_done', { participantId: participant.id, messageId: state.messageId, status: state.status, usage: result.usage, incompleteReason: result.incompleteReason || null });
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
          await query(`UPDATE messages SET meta = jsonb_set(jsonb_set(meta, '{error}', to_jsonb($3::text), true), '{code}', to_jsonb($4::text), true) WHERE id = $1 AND conversation_id = $2`,
            [state.messageId, conversationId, err.message.slice(0, 1000), err.code || 'provider_error']);
          await query(`UPDATE run_participants SET status = 'failed', error = $3, finished_at = now() WHERE run_id = $1 AND participant_id = $2`, [run.id, participant.id, err.message.slice(0, 1000)]);
          send('participant_done', { participantId: participant.id, messageId: state.messageId, status: 'failed', error: err.message, code: err.code });
        }
        return { participant, error: err, state };
      }
    };

    try {
      const results = await Promise.all(participants.rows.map((p) => dispatchOne(p)));

      // FR0 actual tool loop: authorize and execute proposals, then return
      // function_call_output items to OpenAI Responses participants until the
      // model answers or the step/stop budget is exhausted.
      const MAX_TOOL_STEPS = parseInt(process.env.A0_MAX_TOOL_STEPS || '6', 10);

      const authorizeAndExecute = async (proposals) => {
        if (!proposals.length || controller.signal.aborted) return { executed: [], cancelled: true };
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
          return { executed: [], cancelled: true };
        }
        const chosen = proposals.filter((p) => selection.actionIds.includes(p.id));
        const coordinated = coordinateToolSelections(chosen, { actionIds: selection.actionIds });
        const executed = [];
        for (const item of coordinated) {
          const conn = (await query('SELECT * FROM mcp_connections WHERE id = $1 AND user_id = $2 AND enabled = true', [item.connectionId, req.user.id])).rows[0];
          if (!conn) {
            await query(`UPDATE tool_actions SET status = 'failed', error = 'MCP connection not found or disabled.', updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds]);
            send('tool_result', { actionIds: item.actionIds, toolName: item.toolName, status: 'failed', error: 'MCP connection not found or disabled.' });
            executed.push({ item, error: 'MCP connection not found or disabled.', providerToolCallIds: item.providerToolCallIds || [item.providerToolCallId] });
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
            executed.push({ item, result, providerToolCallIds: item.providerToolCallIds || [item.providerToolCallId] });
          } catch (err) {
            await query(`UPDATE tool_actions SET status = 'failed', error = $2, updated_at = now() WHERE id = ANY($1::uuid[])`, [item.actionIds, err.message.slice(0, 500)]);
            send('tool_result', { actionIds: item.actionIds, toolName: item.toolName, status: 'failed', error: err.message });
            executed.push({ item, error: err.message, providerToolCallIds: item.providerToolCallIds || [item.providerToolCallId] });
          }
        }
        return { executed, cancelled: false };
      };

      const buildProposals = async (roundResults) => {
        const proposals = [];
        for (const r of roundResults) {
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
              `INSERT INTO tool_actions (id, run_id, conversation_id, requester_participant_id, mcp_connection_id, tool_name, arguments, status, idempotency_key)
               VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'proposed',$8)`,
              [id, run.id, conversationId, r.participant.id, target.conn.id, target.toolName, JSON.stringify(args), crypto.randomUUID()],
            );
          }
        }
        return proposals;
      };

      // Round 1 proposals from the initial dispatch.
      const firstProposals = await buildProposals(results);
      let step = 0;
      let executedAll = await authorizeAndExecute(firstProposals);

      // OpenAI Responses continuation: feed function_call_output back to the
      // same participant until an answer, budget, stop or failure. Compatible
      // output items accumulate per participant so later rounds never drop
      // earlier reasoning/tool state (C10).
      const continuationByParticipant = new Map();
      for (const r of results) {
        if (r.participant.provider === 'openai' && r.result?.outputItems?.length) {
          continuationByParticipant.set(r.participant.id, r.result.outputItems);
        }
      }
      while (!controller.signal.aborted && !executedAll.cancelled && step < MAX_TOOL_STEPS) {
        const openaiWithCalls = results.filter((r) => r.result?.toolCalls?.length && r.participant.provider === 'openai');
        if (!openaiWithCalls.length) break;
        step += 1;
        const roundResults = [];
        for (const r of openaiWithCalls) {
          const prior = continuationByParticipant.get(r.participant.id) || [];
          const continuation = [...prior];
          for (const tc of r.result.toolCalls) {
            const executed = executedAll.executed.find((e) => (e.providerToolCallIds || []).includes(tc.id));
            const callItem = prior.find((i) => i.type === 'function_call' && (i.call_id === tc.id || i.id === tc.id)) || { type: 'function_call', call_id: tc.id, name: tc.name, arguments: tc.arguments };
            continuation.push(callItem);
            continuation.push({
              type: 'function_call_output',
              call_id: tc.id,
              output: JSON.stringify(executed?.result || { error: executed?.error || 'not executed' }),
            });
          }
          const contResult = await dispatchOne(r.participant, continuation);
          if (contResult.result?.outputItems?.length) {
            continuationByParticipant.set(r.participant.id, [...continuation, ...contResult.result.outputItems]);
          }
          roundResults.push(contResult);
        }
        for (const r of roundResults) {
          const idx = results.findIndex((x) => x.participant.id === r.participant.id);
          if (idx >= 0) results[idx] = r;
          else results.push(r);
        }
        const nextProposals = await buildProposals(roundResults);
        if (!nextProposals.length) break;
        executedAll = await authorizeAndExecute(nextProposals);
      }
      // C10: the run outcome reflects its participants, never a blanket success.
      const overallStatus = results.some((r) => r.state?.status === 'failed') ? 'failed'
        : results.some((r) => r.state?.status === 'incomplete') ? 'incomplete'
        : 'complete';
      await finish(overallStatus);
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
