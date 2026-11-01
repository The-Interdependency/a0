#!/usr/bin/env node
// Issue #119 remaining FR2/FR3 gates (RA01, RA02, RD02, RM02, RM04) against
// the deployed website. RA03 tool approve/decline is exercised through the
// real run/tool-authorize path with a fake MCP server.
import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
const PROV_PORT = 9331;
const MCP_PORT = 9332;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const provRequests = [];
const provServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    provRequests.push(parsed);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (Array.isArray(parsed.tools) && parsed.tools.length) {
      // Emit one tool call so the run proposes an action for approve/decline.
      const tool = parsed.tools[0].function;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_decline', function: { name: tool.name, arguments: '{"text":"ping"}' } }] }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => provServer.listen(PROV_PORT, '127.0.0.1', r));

const mcpInvocations = [];
const mcpServer = http.createServer(async (req, res) => {
  const server = new McpServer({ name: 'fake-mcp', version: '1.0.0' });
  server.registerTool('echo', { description: 'Echo back', inputSchema: { text: z.string() } }, async (args) => {
    mcpInvocations.push(args);
    return { content: [{ type: 'text', text: `echo:${args.text || ''}` }] };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
});
await new Promise((r) => mcpServer.listen(MCP_PORT, '127.0.0.1', r));
await sleep(500);

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

// Clean stale MCP connections so runs before the tool block never offer tools.
for (const old of (await api('GET', '/api/mcp')).data.connections || []) {
  if (old.name === 'fake') await api('DELETE', `/api/mcp/${old.id}`);
}

// RA01: duplicate spawns produce one logical agent.
{
  const cid = crypto.randomUUID();
  const first = (await api('POST', '/api/agents', { name: 'Idem', templateId: 'sage', provider: 'openai', task: 'once', clientRequestId: cid })).data;
  const second = (await api('POST', '/api/agents', { name: 'Idem', templateId: 'sage', provider: 'openai', task: 'once', clientRequestId: cid })).data;
  check('RA01 duplicate spawn returns the same agent', first.agent.id === second.agent.id && second.duplicate === true);
}

// RD02: effective Forge instructions reach the real model payload.
{
  const parts = (await api('GET', '/api/participants')).data.participants;
  let p = parts.find((x) => x.provider === 'xai');
  if (!p) p = (await api('POST', '/api/participants', { name: 'X', provider: 'xai', model: 'ok' })).data.participant;
  await api('PATCH', `/api/participants/${p.id}`, { settings: { baseUrl: `http://127.0.0.1:${PROV_PORT}/v1` } });
  const agent = (await api('POST', '/api/agents', { name: 'Sage-Effective', templateId: 'sage', provider: 'xai', task: 'test' })).data.agent;
  await api('PATCH', `/api/participants/${agent.participant_id}`, { settings: { baseUrl: `http://127.0.0.1:${PROV_PORT}/v1`, toolSelection: [] } });
  provRequests.length = 0;
  const res = await fetch(`${BASE}/api/conversations/${agent.conversation_id}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ mode: 'single', participantIds: [agent.participant_id], message: { content: 'hello' } }),
  });
  const reader = res.body.getReader();
  while (true) { const { done } = await reader.read(); if (done) break; }
  const last = provRequests[provRequests.length - 1];
  const system = (last?.messages || []).find((m) => m.role === 'system')?.content || '';
  check('RD02 effective Forge instructions reach model payload', system.includes('You are The Sage — a patient scholar'), system.slice(0, 120));
}

// RM02: two agents keep independent conversations and messages.
{
  const a = (await api('POST', '/api/agents', { name: 'Iso-A', templateId: 'sage', provider: 'openai' })).data.agent;
  const b = (await api('POST', '/api/agents', { name: 'Iso-B', templateId: 'engineer', provider: 'openai' })).data.agent;
  check('RM02 agents have isolated conversations', a.conversation_id !== b.conversation_id && a.participant_id !== b.participant_id);
  const da = (await api('GET', `/api/conversations/${a.conversation_id}`)).data;
  const db = (await api('GET', `/api/conversations/${b.conversation_id}`)).data;
  check('RM02 per-agent chat histories isolated', da.messageCount === 0 && db.messageCount === 0);
}

// RM04: invalid swap rejected and known-good renderer retained.
{
  const agent = (await api('POST', '/api/agents', { name: 'Swap', templateId: 'sage', provider: 'openai' })).data;
  const bad = await api('POST', `/api/agent-modules/${agent.module.id}/swap`, { renderer: 'evil-renderer' });
  const after = (await api('GET', `/api/agents/${agent.agent.id}`)).data;
  check('RM04 invalid candidate rejected', bad.status === 400);
  check('RM04 previous renderer retained', after.module.renderer === 'agent-panel');
}

// RA03: tool approve and decline through the real coordinator path.
{
  // Approve path is covered by tests/issue120/tool-loop.js; decline must
  // cancel proposals without invoking the tool.
  for (const old of (await api('GET', '/api/mcp')).data.connections || []) {
    if (old.name === 'fake') await api('DELETE', `/api/mcp/${old.id}`);
  }
  const conn = (await api('POST', '/api/mcp', { name: 'fake', url: `http://127.0.0.1:${MCP_PORT}/mcp`, allowPrivateNetwork: true })).data.connection;
  await api('POST', `/api/mcp/${conn.id}/discover`);
  const parts = (await api('GET', '/api/participants')).data.participants;
  let p = parts.find((x) => x.provider === 'xai');
  if (!p) p = (await api('POST', '/api/participants', { name: 'X', provider: 'xai', model: 'ok' })).data.participant;
  await api('PATCH', `/api/participants/${p.id}`, { settings: { baseUrl: `http://127.0.0.1:${PROV_PORT}/v1` } });
  const conv = (await api('POST', '/api/conversations', { title: 'RA03 decline' })).data.conversation;
  const res = await fetch(`${BASE}/api/conversations/${conv.id}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ mode: 'single', participantIds: [p.id], message: { content: 'call echo' } }),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('event: ')) events.push({ event: t.slice(7), data: null });
      else if (t.startsWith('data: ') && events.length) {
        try { events[events.length - 1].data = JSON.parse(t.slice(6)); } catch {}
        const ev = events[events.length - 1];
        if (ev.event === 'tool_proposals' && ev.data?.runId) {
          await fetch(`${BASE}/api/runs/${ev.data.runId}/tool-authorize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
            body: JSON.stringify({ actionIds: [], cancel: true }),
          });
        }
      }
    }
  }
  check('RA03 declined tool never invokes', mcpInvocations.length === 0, JSON.stringify(mcpInvocations));
  check('RA03 cancellation visible', events.some((e) => e.event === 'tools_cancelled'));
}

provServer.close();
mcpServer.close();
if (failures) {
  console.log(`issue #119 agent-execution checks: ${failures} failures`);
  process.exit(1);
}
console.log('issue #119 agent-execution checks: all passed.');
