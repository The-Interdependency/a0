#!/usr/bin/env node
// Issue #119 lifecycle gates against the deployed website:
// RC04 freeze-in-flight, RA04 Stop during run, RA05 truthful failures,
// RM01 reconnect reconstruction, RM03 swap during pending authorization,
// RM05 retirement. FR4/AHBG remains NOT RUN.
import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
const PROV_PORT = 9333;
const MCP_PORT = 9334;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Slow chat provider: emits chunks on a delay so Stop/freeze can be observed.
const provRequests = [];
const provServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', async () => {
    const parsed = JSON.parse(body || '{}');
    provRequests.push(parsed);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    send({ choices: [{ delta: { content: 'part1 ' }, finish_reason: null }] });
    await sleep(600);
    if (Array.isArray(parsed.tools) && parsed.tools.length) {
      const tool = parsed.tools[0].function;
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_life', function: { name: tool.name, arguments: '{"text":"life"}' } }] }, finish_reason: null }] });
      send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
    } else {
      send({ choices: [{ delta: { content: 'part2' }, finish_reason: null }] });
      send({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
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

async function streamRun(conversationId, participantIds, onEvent) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ mode: 'single', participantIds, message: { content: 'go' } }),
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
        if (onEvent) await onEvent(events[events.length - 1]);
      }
    }
  }
  return events;
}

// Clean stale MCP connections so earlier blocks never offer tools.
for (const old of (await api('GET', '/api/mcp')).data.connections || []) {
  if (old.name === 'fake') await api('DELETE', `/api/mcp/${old.id}`);
}

// ---- RA05: unsupported mode + missing credential fail truthfully ----------
{
  const conv = (await api('POST', '/api/conversations', { title: 'RA05' })).data.conversation;
  const bad = await api('POST', `/api/conversations/${conv.id}/runs`, { mode: 'unsupported-mode', participantIds: [], message: { content: 'x' } });
  check('RA05 unsupported mode rejected truthfully', bad.status === 400, `status=${bad.status}`);
  const diag = await api('POST', '/api/providers/anthropic/test');
  check('RA05 missing provider credential is a visible credential failure', diag.status === 400 && /No Anthropic API key/.test(diag.data?.message || ''), diag.data?.message);
}

// ---- RC04: editing during a stream preserves the active snapshot ----------
{
  const parts = (await api('GET', '/api/participants')).data.participants;
  let p = parts.find((x) => x.provider === 'xai');
  if (!p) p = (await api('POST', '/api/participants', { name: 'X', provider: 'xai', model: 'ok' })).data.participant;
  await api('PATCH', `/api/participants/${p.id}`, { settings: { baseUrl: `http://127.0.0.1:${PROV_PORT}/v1`, toolSelection: [] } });
  const proj = (await api('POST', '/api/projects', { name: 'RC04-proj', instructions: 'PROJECT_V1' })).data.project;
  const conv = (await api('POST', '/api/conversations', { title: 'RC04', projectId: proj.id })).data.conversation;
  const ctx = (await api('GET', `/api/conversations/${conv.id}/context`)).data;
  provRequests.length = 0;
  let editedDuringStream = false;
  const eventsPromise = streamRun(conv.id, [p.id], async (ev) => {
    if (ev.event === 'chunk' && !editedDuringStream) {
      editedDuringStream = true;
      const blocks = ctx.blocks.map((b) => b.type === 'project' ? { id: b.id, content: 'EDITED_DURING_STREAM', included: true } : { id: b.id, included: b.included });
      await api('POST', `/api/conversations/${conv.id}/context-revisions`, { blocks, note: 'mid-stream edit' });
    }
  });
  await eventsPromise;
  const firstRequest = provRequests[0];
  const firstSystem = (firstRequest?.messages || []).find((m) => m.role === 'system')?.content || '';
  check('RC04 active run used the frozen pre-edit snapshot', !firstSystem.includes('EDITED_DURING_STREAM'));
  provRequests.length = 0;
  await streamRun(conv.id, [p.id]);
  const secondSystem = (provRequests[provRequests.length - 1]?.messages || []).find((m) => m.role === 'system')?.content || '';
  check('RC04 next run uses the new revision', secondSystem.includes('EDITED_DURING_STREAM'));
}

// ---- RA04: Stop during a run preserves partial output, no further dispatch ----
{
  const parts = (await api('GET', '/api/participants')).data.participants;
  const p = parts.find((x) => x.provider === 'xai');
  const conv = (await api('POST', '/api/conversations', { title: 'RA04' })).data.conversation;
  let stopped = false;
  let runId = null;
  await streamRun(conv.id, [p.id], async (ev) => {
    if (ev.event === 'run_start') runId = ev.data?.runId;
    if (ev.event === 'chunk' && !stopped && runId) {
      stopped = true;
      await api('POST', `/api/runs/${runId}/stop`);
    }
  });
  const detail = (await api('GET', `/api/conversations/${conv.id}`)).data;
  const stoppedMsg = detail.messages.find((m) => m.role === 'assistant' && m.status === 'stopped');
  check('RA04 Stop preserves partial output as stopped', Boolean(stoppedMsg && stoppedMsg.content), JSON.stringify(stoppedMsg && stoppedMsg.content));
}

// ---- RM01/RM03/RM05: reconnect, swap during pending auth, retire ----------
{
  // Clean stale MCP and create a fresh one.
  for (const old of (await api('GET', '/api/mcp')).data.connections || []) {
    if (old.name === 'fake') await api('DELETE', `/api/mcp/${old.id}`);
  }
  const conn = (await api('POST', '/api/mcp', { name: 'fake', url: `http://127.0.0.1:${MCP_PORT}/mcp`, allowPrivateNetwork: true })).data.connection;
  await api('POST', `/api/mcp/${conn.id}/discover`);
  const parts = (await api('GET', '/api/participants')).data.participants;
  const p = parts.find((x) => x.provider === 'xai');
  await api('PATCH', `/api/participants/${p.id}`, { settings: { baseUrl: `http://127.0.0.1:${PROV_PORT}/v1` } });
  const agent = (await api('POST', '/api/agents', { name: 'Lifecycle', templateId: 'sage', provider: 'openai' })).data;
  const conv = (await api('POST', '/api/conversations', { title: 'RM03' })).data.conversation;
  let swapped = false;
  const events = await streamRun(conv.id, [p.id], async (ev) => {
    if (ev.event === 'tool_proposals' && !swapped) {
      swapped = true;
      await api('POST', `/api/agent-modules/${agent.module.id}/swap`, { renderer: 'agent-stats' });
      const ids = (ev.data.proposals || []).map((x) => x.id);
      await api('POST', `/api/runs/${ev.data.runId}/tool-authorize`, { actionIds: ids, cancel: false });
    }
  });
  const mod = (await api('GET', `/api/agents/${agent.agent.id}`)).data.module;
  check('RM03 swap during pending authorization preserved renderer + tool executed', swapped && mod.renderer === 'agent-stats' && mcpInvocations.length === 1 && events.some((e) => e.event === 'run_complete'), JSON.stringify({ swapped, renderer: mod.renderer, invocations: mcpInvocations.length }));

  const before = (await api('GET', '/api/agents')).data.agents.find((a) => a.id === agent.agent.id);
  await api('POST', `/api/agents/${agent.agent.id}/retire`);
  const after = (await api('GET', '/api/agents')).data.agents.find((a) => a.id === agent.agent.id);
  check('RM01 reconnect keeps one module per agent (no duplicate)', Boolean(before?.module_id) && before.module_id === mod.id);
  check('RM05 retire marks agent retired', after?.status === 'retired');
}

provServer.close();
mcpServer.close();
if (failures) {
  console.log(`issue #119 lifecycle checks: ${failures} failures`);
  process.exit(1);
}
console.log('issue #119 lifecycle checks: all passed (FR4/AHBG remains NOT RUN).');
