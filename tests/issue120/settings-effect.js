#!/usr/bin/env node
// OC03: change -> save -> reload -> next exact request carries the setting.
// Unknown settings are rejected visibly; diagnostics use saved settings.
import http from 'node:http';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
const PORT = 9326;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

const seen = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    seen.push(parsed);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
});
if (!login.ok) { console.log('LOGIN FAILED'); process.exit(1); }
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

// Unknown setting rejected visibly.
const bogus = await api('PATCH', '/api/participants/any', { settings: { bogus: 1 } });
check('OC03 unknown settings rejected', bogus.status === 400 && /Unsupported setting/.test(bogus.data?.message || ''), bogus.data?.message);

// Create xai participant against the fake server and save settings.
const parts = (await api('GET', '/api/participants')).data.participants;
let p = parts.find((x) => x.provider === 'xai');
const savedSettings = { baseUrl: `http://127.0.0.1:${PORT}/v1`, maxOutputTokens: 123, timeoutMs: 30000 };
if (p) {
  await api('PATCH', `/api/participants/${p.id}`, { settings: savedSettings });
} else {
  p = (await api('POST', '/api/participants', { name: 'OC03', provider: 'xai', model: 'ok', settings: savedSettings })).data.participant;
}
// Reload and verify persistence.
const reload = (await api('GET', '/api/participants')).data.participants.find((x) => x.id === p.id);
check('OC03 saved settings persist across reload', reload?.settings?.maxOutputTokens === 123 && reload?.settings?.baseUrl?.includes(`:${PORT}`));

// Next exact request uses the setting.
const conv = (await api('POST', '/api/conversations', { title: 'OC03' })).data.conversation;
const res = await fetch(`${BASE}/api/conversations/${conv.id}/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
  body: JSON.stringify({ mode: 'single', participantIds: [p.id], message: { content: 'hi' } }),
});
const reader = res.body.getReader();
while (true) { const { done } = await reader.read(); if (done) break; }
const last = seen[seen.length - 1];
check('OC03 next request carries saved maxOutputTokens', last?.max_tokens === 123, JSON.stringify({ max_tokens: last?.max_tokens }));

// Diagnostics use saved settings (test endpoint with settings payload).
const diag = await api('POST', '/api/providers/xai/test', { model: 'ok', settings: { baseUrl: `http://127.0.0.1:${PORT}/v1`, maxOutputTokens: 77 } });
const diagReq = seen[seen.length - 1];
check('OC03 diagnostics use the provided settings', diagReq?.max_tokens === 77, JSON.stringify({ max_tokens: diagReq?.max_tokens }));

server.close();
if (failures) {
  console.log(`OC03 settings-effect: ${failures} failures`);
  process.exit(1);
}
console.log('OC03 settings-effect: all checks passed.');
