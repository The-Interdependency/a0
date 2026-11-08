// Usage: mount /api/reliability before cookie auth. A separate bearer grants only
// live status and an inert handoff inbox; it grants no chat, key or shell access.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readTokenFile } from './vault.js';

export const BRIDGE_SCHEMA = 'a0.reliability/1';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';

export function evidenceReceipts(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter(r => r && sha(r.commit) && iso(r.observedAt)
    && ['vm', 'browser', 'provider'].includes(r.scope) && ['passed', 'failed', 'blocked'].includes(r.status))
    .map(r => ({id: text(r.id, 100), commit: r.commit, observedAt: new Date(r.observedAt).toISOString(),
      scope: r.scope, status: r.status, summary: text(r.summary, 600)}));
}

export function createReliabilityRouter({vault, databaseCheck, tokenFile, siteOrigin,
  directory, buildFile = '/opt/a0/build-info.json', now = () => new Date().toISOString()}) {
  const router = express.Router();
  const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(() =>
    res.status(503).json({error: 'bridge_unavailable', message: 'VM bridge storage or status is unavailable.'}));
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    let expected;
    try { expected = tokenFile && readTokenFile(tokenFile); } catch {}
    if (!expected || !/^[a-f0-9]{64}$/.test(expected)) return res.status(503).json({error: 'bridge_not_configured'});
    const supplied = /^Bearer ([a-f0-9]{64})$/.exec(req.get('authorization') || '')?.[1];
    if (!supplied || !crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex')))
      return res.status(401).json({error: 'bridge_unauthorized'});
    if (req.get('origin') && req.get('origin') !== siteOrigin) return res.status(403).json({error: 'origin_denied'});
    next();
  });
  router.use(express.json({limit: '128kb'}));
  router.get('/status', wrap(async (_req, res) => {
    let build = {commit: 'unrecorded', dirty: null, builtAt: null};
    try {
      const data = JSON.parse(await fs.readFile(buildFile, 'utf8'));
      build = {commit: sha(data.commit) ? data.commit : 'unrecorded',
        dirty: typeof data.dirty === 'boolean' ? data.dirty : null,
        builtAt: iso(data.builtAt) ? new Date(data.builtAt).toISOString() : null};
    } catch {}
    let vaultState = {state: 'unavailable'};
    try {
      const health = await vault.healthCheck();
      vaultState = {state: 'ready', initialized: health.initialized, sealed: health.sealed,
        version: text(health.version, 80), clusterId: text(health.clusterId, 100)};
    } catch {}
    let database = 'unavailable';
    try { await databaseCheck(); database = 'ready'; } catch {}
    const providers = [];
    for (const provider of ['openai', 'xai', 'deepseek', 'anthropic']) {
      let credential = 'unavailable';
      if (vaultState.state === 'ready') {
        try { const key = await vault.readSecret(`provider/${provider}`); credential = key?.api_key || key?.key ? 'present' : 'missing'; } catch {}
      }
      providers.push({provider, credential});
    }
    let evidence = [], evidenceState = 'not_recorded';
    try {
      const raw = await fs.readFile(path.join(directory, 'evidence.json'), 'utf8');
      if (raw.length > 100000) throw new Error('size');
      evidence = evidenceReceipts(JSON.parse(raw)); evidenceState = 'reported';
    } catch (err) { if (err.code !== 'ENOENT') evidenceState = 'unavailable'; }
    res.json({schema: BRIDGE_SCHEMA, observedAt: now(), build,
      services: {app: 'ready', database, vault: vaultState}, providers, evidence, evidenceState,
      capabilities: ['status.read', 'handoff.create', 'handoff.read'],
      hmmm: ['Credential presence does not prove a provider call.', 'VM state does not establish physical-phone acceptance.',
        'Handoffs are stored for a builder; receipt does not mean execution.']});
  }));
  const inbox = path.join(directory, 'handoffs');
  router.post('/handoffs', wrap(async (req, res) => {
    const {target, text: body} = req.body || {};
    if (!['Codex', 'DeepSeek'].includes(target) || typeof body !== 'string' || !body.trim() || Buffer.byteLength(body) > 100000)
      return res.status(400).json({error: 'invalid_handoff'});
    const id = hash(JSON.stringify([target, body]));
    await fs.mkdir(inbox, {recursive: true, mode: 0o700});
    const destination = path.join(inbox, id + '.json');
    let receipt;
    try { receipt = JSON.parse(await fs.readFile(destination, 'utf8')); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (receipt) return res.json({id, target, state: 'received', receivedAt: receipt.receivedAt, duplicate: true});
    if ((await fs.readdir(inbox)).filter(n => /^[a-f0-9]{64}\.json$/.test(n)).length >= 500)
      return res.status(507).json({error: 'inbox_full', message: 'Archive completed handoffs on the VM before submitting more.'});
    receipt = {schema: 'a0.handoff/1', id, target, text: body, state: 'received', receivedAt: now()};
    const temporary = path.join(inbox, '.pending-' + crypto.randomUUID());
    await fs.writeFile(temporary, JSON.stringify(receipt) + '\n', {flag: 'wx', mode: 0o600});
    let duplicate = false;
    try {
      try { await fs.link(temporary, destination); }
      catch (err) { if (err.code !== 'EEXIST') throw err; duplicate = true; receipt = JSON.parse(await fs.readFile(destination, 'utf8')); }
    } finally { await fs.unlink(temporary); }
    res.status(duplicate ? 200 : 201).json({id, target, state: 'received', receivedAt: receipt.receivedAt, duplicate});
  }));
  router.get('/handoffs', wrap(async (_req, res) => {
    const names = await fs.readdir(inbox).catch(err => { if (err.code === 'ENOENT') return []; throw err; });
    const items = [];
    for (const name of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n))) {
      const r = JSON.parse(await fs.readFile(path.join(inbox, name), 'utf8'));
      items.push({id: r.id, target: r.target, state: 'received', receivedAt: r.receivedAt});
    }
    res.json({schema: 'a0.handoff-list/1', items: items.sort((a,b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 100)});
  }));
  router.get('/handoffs/:id', wrap(async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.status(400).json({error: 'invalid_id'});
    let receipt;
    try { receipt = JSON.parse(await fs.readFile(path.join(inbox, req.params.id + '.json'), 'utf8')); }
    catch (err) { if (err.code === 'ENOENT') return res.status(404).json({error: 'not_found'}); throw err; }
    res.json(receipt);
  }));
  router.use((_req, res) => res.status(404).json({error: 'unknown_bridge_operation'}));
  router.use((_err, _req, res, _next) => res.status(400).json({error: 'invalid_bridge_request'}));
  return router;
}
