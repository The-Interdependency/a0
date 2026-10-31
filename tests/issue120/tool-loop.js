#!/usr/bin/env node
// OC07 complete tool lifecycle through the REAL server code path:
// OpenAI Responses participant -> function_call -> proposal -> authorization ->
// executed MCP tool -> function_call_output continuation -> second Responses
// request -> final answer. Runs against the deployed website as a temp owner.
import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
const RESP_PORT = 9324;
const MCP_PORT = 9325;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- fake OpenAI Responses server ---------------------------------------
const responsesRequests = [];
const respServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    responsesRequests.push(parsed);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const alreadyHasToolOutput = JSON.stringify(parsed.input || []).includes('function_call_output');
    if (!alreadyHasToolOutput) {
      send({ type: 'response.output_text.delta', delta: 'calling' });
      send({ type: 'response.output_item.done', item: { type: 'function_call', id: 'fc_loop', call_id: 'call_loop_1', name: 'fake__echo', arguments: '{"text":"ping"}' } });
      send({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'function_call', id: 'fc_loop', call_id: 'call_loop_1', name: 'fake__echo', arguments: '{"text":"ping"}' }], usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } });
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      send({ type: 'response.output_text.delta', delta: 'final-answer' });
      send({ type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', id: 'm1', content: [{ type: 'output_text', text: 'final-answer' }] }], usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 } } });
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });
});
await new Promise((r) => respServer.listen(RESP_PORT, '127.0.0.1', r));

// ---- fake MCP server -----------------------------------------------------
const mcpInvocations = [];
const mcpServer = http.createServer(async (req, res) => {
  const server = new McpServer({ name: 'fake-mcp', version: '1.0.0' });
  server.registerTool('echo', { description: 'Echo the arguments back', inputSchema: { text: z.string() } }, async (args) => {
    mcpInvocations.push(args);
    return { content: [{ type: 'text', text: `echo:${args.text || ''}` }] };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
});
await new Promise((r) => mcpServer.listen(MCP_PORT, '127.0.0.1', r));

// ---- authenticated flow ----------------------------------------------------
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

// OpenAI participant pointed at the fake Responses server.
await api('POST', '/api/participants/seed-defaults');
let parts = (await api('GET', '/api/participants')).data.participants;
const openai = parts.find((p) => p.provider === 'openai');
await api('PATCH', `/api/participants/${openai.id}`, { settings: { baseUrl: `http://127.0.0.1:${RESP_PORT}` } });

// MCP connection (loopback opt-in required) + discovery.
const conn = (await api('POST', '/api/mcp', { name: 'fake', url: `http://127.0.0.1:${MCP_PORT}/mcp`, allowPrivateNetwork: true })).data.connection;
await api('POST', `/api/mcp/${conn.id}/discover`);

// Run and auto-authorize proposals while the stream is open.
const conv = (await api('POST', '/api/conversations', { title: 'OC07 tool loop' })).data.conversation;
const res = await fetch(`${BASE}/api/conversations/${conv.id}/runs`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
  body: JSON.stringify({ mode: 'single', participantIds: [openai.id], message: { content: 'call echo with ping' } }),
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
    if (t.startsWith('event: ')) {
      events.push({ event: t.slice(7), data: null });
    } else if (t.startsWith('data: ') && events.length) {
      try { events[events.length - 1].data = JSON.parse(t.slice(6)); } catch {}
      const ev = events[events.length - 1];
      if (ev.event === 'tool_proposals' && ev.data?.runId) {
        const ids = (ev.data.proposals || []).map((p) => p.id);
        await fetch(`${BASE}/api/runs/${ev.data.runId}/tool-authorize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
          body: JSON.stringify({ actionIds: ids, cancel: false }),
        });
      }
    }
  }
}
const doneEvent = events.find((e) => e.event === 'run_complete');
const toolResults = events.filter((e) => e.event === 'tool_result');
const finalMessages = (await api('GET', `/api/conversations/${conv.id}`)).data.messages.filter((m) => m.role === 'assistant');
check('OC07 two successive Responses requests', responsesRequests.length === 2, `count=${responsesRequests.length}`);
check('OC07 continuation carries function_call_output with call_id', JSON.stringify(responsesRequests[1]?.input || []).includes('function_call_output') && JSON.stringify(responsesRequests[1]?.input || []).includes('call_loop_1'));
check('OC07 executed tool result matches original call', mcpInvocations.length === 1 && mcpInvocations[0].text === 'ping', JSON.stringify(mcpInvocations));
check('OC07 run completes with final answer', Boolean(doneEvent) && finalMessages.some((m) => m.content.includes('final-answer')), JSON.stringify(finalMessages.map((m) => m.content)));
check('OC07 tool results attached to the run', toolResults.length >= 1);

respServer.close();
mcpServer.close();
if (failures) {
  console.log(`OC07 tool loop: ${failures} failures`);
  process.exit(1);
}
console.log('OC07 tool loop: all checks passed.');
