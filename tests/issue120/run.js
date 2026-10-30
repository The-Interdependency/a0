#!/usr/bin/env node
// Issue #120 focused regression checks against the deployed website.
// Covers C01/C03/C04/C05/C06/C09 static+API evidence; C07 stays covered by
// tests/fr0-fr1/run.js (Stop during stream aborts the read).
import http from 'node:http';
import crypto from 'node:crypto';
import { coordinateToolSelections } from '../../apps/server/src/mcp.js';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

// ---- static served-source checks (C01/C03/C13/C15) ---------------------
{
  const appJs = await (await fetch(`${BASE}/app.js`)).text();
  const css = await (await fetch(`${BASE}/styles.css`)).text();
  check('C01 loadProviders rerenders participant cards', appJs.includes('renderProviderCards();\n  renderParticipantCards();') || (appJs.includes('renderProviderCards();') && /loadProviders[\s\S]{0,400}renderParticipantCards\(\);/.test(appJs)));
  check('C01 pills show model IDs', appJs.includes('`${p.name} · ${p.model}`'));
  check('C03 authoritative history presence', appJs.includes('state.currentConversation.message_count = data.messageCount'));
  check('C03 Continue is one model', appJs.includes("state.selectedParticipantIds = [singleId]"));
  check('C03 Compare requires two', appJs.includes("'Select at least two participants to compare.'"));
  check('C13 draft tolerates legacy drafts', appJs.includes('(state.draft.attachments || (state.draft.attachmentIds || []).map((id) => ({ id })))'));
  check('C15 owner preferences bound', appJs.includes('initOwnerPreferences'));
  check('C15 readable pills CSS', css.includes('.participant-pill { color:'));
}

// ---- C09 unit: coordinator preserves provider-call identity --------------
{
  const coordinated = coordinateToolSelections(
    [{ id: 'a1', participantId: 'p1', providerToolCallId: 'call_1', connectionId: 'c1', toolName: 'echo__tool', arguments: { x: 1 } }],
    { actionIds: ['a1'] },
  );
  check('C09 coordinator keeps participantId', coordinated[0]?.participantId === 'p1');
  check('C09 coordinator keeps providerToolCallId', coordinated[0]?.providerToolCallId === 'call_1' && coordinated[0]?.providerToolCallIds?.includes('call_1'));
}

// ---- fake OpenAI-compatible server for chat-context flows ----------------
const FAKE_PORT = 9323;
let fakeRequestLog = [];
const fakeServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    fakeRequestLog.push(parsed);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'fake-answer' }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => fakeServer.listen(FAKE_PORT, '127.0.0.1', r));

// ---- authenticated flow ----------------------------------------------------
const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const me = await (await fetch(`${BASE}/api/me`, { headers: { Cookie: cookie } })).json();
const csrf = me.csrfToken;
const api = async (method, path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
};

// Participant on the fake server (xai keeps Chat Completions transport).
const parts = (await api('GET', '/api/participants')).data.participants;
let fakeParticipant = parts.find((p) => p.provider === 'xai');
if (fakeParticipant) {
  await api('PATCH', `/api/participants/${fakeParticipant.id}`, { settings: { baseUrl: `http://127.0.0.1:${FAKE_PORT}/v1` } });
} else {
  fakeParticipant = (await api('POST', '/api/participants', { name: 'Fake120', provider: 'xai', model: 'ok', settings: { baseUrl: `http://127.0.0.1:${FAKE_PORT}/v1` } })).data.participant;
}

const run = async (conversationId, message) => {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ mode: 'single', participantIds: [fakeParticipant.id], message }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
  }
};

// C04: saved context override must survive a new message + next dispatch.
{
  const proj = (await api('POST', '/api/projects', { name: 'C04', instructions: 'PROJECT-V1' })).data.project;
  const conv = (await api('POST', '/api/conversations', { title: 'C04', projectId: proj.id })).data.conversation;
  await run(conv.id, { content: 'hello' });
  const ctx = (await api('GET', `/api/conversations/${conv.id}/context`)).data;
  const blocks = ctx.blocks.map((b) => b.type === 'project' ? { id: b.id, content: 'OWNER_EDITED_PROJECT_OVERRIDE', included: true } : { id: b.id, included: b.included });
  await api('POST', `/api/conversations/${conv.id}/context-revisions`, { blocks, note: 'c04' });
  fakeRequestLog = [];
  await run(conv.id, { content: 'second' });
  const last = fakeRequestLog[fakeRequestLog.length - 1];
  const system = (last?.messages || []).find((m) => m.role === 'system')?.content || '';
  check('C04 saved project override survives new message + dispatch', system.includes('OWNER_EDITED_PROJECT_OVERRIDE') && !system.includes('PROJECT-V1'), system.slice(0, 120));
}

// C05: attachment bytes reach the provider intact (not base64 null).
{
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const up = await fetch(`${BASE}/api/attachments`, { method: 'POST', headers: { 'X-A0-CSRF': csrf, Cookie: cookie }, body: form });
  const att = (await up.json()).attachment;
  const conv = (await api('POST', '/api/conversations', { title: 'C05' })).data.conversation;
  fakeRequestLog = [];
  await run(conv.id, { content: 'look', attachmentIds: [att.id] });
  const last = fakeRequestLog[fakeRequestLog.length - 1];
  const withImage = (last?.messages || []).find((m) => Array.isArray(m.content));
  const imagePart = (withImage?.content || []).find((c) => c.type === 'image_url');
  check('C05 image bytes preserved through context assembly', Boolean(imagePart?.image_url?.url?.startsWith('data:image/png;base64,') && !imagePart.image_url.url.includes('base64,null')), imagePart?.image_url?.url?.slice(0, 60));
}

// C06: failed run messages carry the structured diagnostic.
{
  const failing = (await api('POST', '/api/participants', { name: 'Fail120', provider: 'xai', model: 'fail', settings: { baseUrl: 'http://127.0.0.1:9/v1' } })).data.participant;
  const conv = (await api('POST', '/api/conversations', { title: 'C06' })).data.conversation;
  const res = await fetch(`${BASE}/api/conversations/${conv.id}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ mode: 'single', participantIds: [failing.id], message: { content: 'fail me' } }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); }
  const detail = (await api('GET', `/api/conversations/${conv.id}`)).data;
  const failedMsg = detail.messages.find((m) => m.role === 'assistant' && m.status === 'failed');
  check('C06 failed message persists provider error', Boolean(failedMsg?.meta?.error), JSON.stringify(failedMsg?.meta));
}

fakeServer.close();
if (failures) {
  console.log(`issue #120 checks: ${failures} failures`);
  process.exit(1);
}
console.log('issue #120 checks: all passed.');
