#!/usr/bin/env node
// Issue #119 FR4 AHBG: the real deployed agent drives an AHBG turn through
// the successor website path (observe -> model plan -> resolve -> persist).
// The fake provider returns a legal plan for the exact observed turn.
import http from 'node:http';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
const PORT = 9335;
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
    // Extract the AHBG observation from the user message and answer with a
    // legal empty plan for that exact session/turn.
    const user = (parsed.messages || []).find((m) => m.role === 'user');
    let plan = { schema: 'interdependency.ahbg.harness.plan/1', session_id: '', turn: -1, intents: [], note: 'stay' };
    const marker = 'AHBG_OBSERVATION ';
    if (typeof user?.content === 'string' && user.content.includes(marker)) {
      try {
        const obs = JSON.parse(user.content.slice(user.content.indexOf(marker) + marker.length));
        plan.session_id = obs.session_id;
        plan.turn = obs.turn;
      } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(plan) }, finish_reason: null }] })}\n\n`);
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

const parts = (await api('GET', '/api/participants')).data.participants;
let p = parts.find((x) => x.provider === 'xai');
if (!p) p = (await api('POST', '/api/participants', { name: 'X', provider: 'xai', model: 'ok' })).data.participant;
await api('PATCH', `/api/participants/${p.id}`, { settings: { baseUrl: `http://127.0.0.1:${PORT}/v1` } });
const agent = (await api('POST', '/api/agents', { name: 'AHBG-Agent', templateId: 'sage', provider: 'xai', task: 'drive AHBG turns' })).data.agent;
await api('PATCH', `/api/participants/${agent.participant_id}`, { settings: { baseUrl: `http://127.0.0.1:${PORT}/v1` } });

const created = (await api('POST', '/api/ahbg/sessions', { agentId: agent.id, seed: 7, turns: 2 })).data;
check('FR4 session created with board and provenance', Boolean(created.summary?.board) && Boolean(created.summary?.provenance), JSON.stringify({ board: Boolean(created.summary?.board), prov: Boolean(created.summary?.provenance) }));

const turn = await api('POST', `/api/ahbg/sessions/${created.session.id}/turn`);
check('FR4 turn accepted and resolved', turn.status === 200 && turn.data?.turn?.turn !== undefined && turn.data?.turn?.state_digest, JSON.stringify(turn.data?.error || turn.data?.turn?.turn));
check('FR4 agent received the exact observation', seen.length >= 1 && JSON.stringify(seen[seen.length - 1]?.messages || []).includes('AHBG_OBSERVATION'));

const after = (await api('GET', `/api/ahbg/sessions/${created.session.id}`)).data;
check('FR4 game state persisted with records', (after.session.records || []).length >= 1 && after.session.board?.turn !== undefined, JSON.stringify({ records: (after.session.records || []).length, turn: after.session.turn }));

const replay = await api('GET', `/api/ahbg/sessions/${created.session.id}/replay`);
check('RG04 replay verification matches the live field', replay.status === 200 && replay.data?.match === true, JSON.stringify(replay.data));

const mechanics = (await api('GET', '/api/ahbg/mechanics')).data.mechanics;
check('RG02 mechanic matrix exposed', Array.isArray(mechanics) && mechanics.some((m) => m.mechanic === 'relocate' && m.status === 'implemented') && mechanics.some((m) => m.status === 'NOT RUN'));

// RG05: swapping the agent module must not reset the AHBG session.
const agentDetail = (await api('GET', `/api/agents/${agent.id}`)).data;
await api('POST', `/api/agent-modules/${agentDetail.module.id}/swap`, { renderer: 'agent-stats' });
const afterSwap = (await api('GET', `/api/ahbg/sessions/${created.session.id}`)).data;
check('RG05 module swap preserves AHBG session state', afterSwap.session.turn === after.session.turn && (afterSwap.session.records || []).length === (after.session.records || []).length, JSON.stringify({ turn: afterSwap.session.turn, records: (afterSwap.session.records || []).length }));

server.close();
if (failures) {
  console.log(`issue #119 AHBG checks: ${failures} failures`);
  process.exit(1);
}
console.log('issue #119 AHBG checks: all passed (successor adapter turn path live).');
