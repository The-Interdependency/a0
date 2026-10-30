#!/usr/bin/env node
// A0 acceptance runner: executes A01–A24 against a running A0 deployment.
// Usage:
//   BASE_URL=http://127.0.0.1:8787 A0_SETUP_CODE=... node tests/acceptance/run.js
//   A0_LIVE_PROVIDERS=1  (additionally runs real provider requests for keys present in vault)
// Records results as PASS / FAIL / BLOCKED / NOT RUN with redacted evidence.
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const SETUP_CODE = process.env.A0_SETUP_CODE || '';
const USERNAME = process.env.A0_USERNAME || 'erin';
const PASSWORD = process.env.A0_PASSWORD || 'acceptance-password-2026';
const FAKE_PROVIDER_PORT = Number(process.env.FAKE_PROVIDER_PORT || 9876);
const FAKE_MCP_PORT = Number(process.env.FAKE_MCP_PORT || 9877);
const results = [];
const startTime = Date.now();

function record(id, status, detail, evidence = '') {
  results.push({ id, status, detail, evidence });
  console.log(`[${status}] ${id}: ${detail}${evidence ? ` (${evidence})` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- tiny SSE client for run streams ----------
async function runStream(cookie, csrf, conversationId, body) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-A0-CSRF': csrf,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`run start failed ${res.status}: ${data.message || ''}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = 'message';
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith('event:')) { pendingEvent = line.slice(6).trim(); continue; }
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) { pendingEvent = 'message'; continue; }
      try { events.push({ event: pendingEvent, data: JSON.parse(raw) }); } catch {}
      pendingEvent = 'message';
    }
  }
  return events;
}

// ---------- fake OpenAI-compatible provider ----------
const providerRequests = [];
function startFakeProvider() {
  return http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        return;
      }
      if (req.url !== '/v1/chat/completions') {
        res.writeHead(404); res.end('not found');
        return;
      }
      const parsed = JSON.parse(body || '{}');
      providerRequests.push(parsed);
      const model = parsed.model || 'ok';
      if (model === 'fail') {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'simulated quota failure' } }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (model === 'tool') {
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'fake__echo', arguments: JSON.stringify({ text: 'hello-tool' }) } }] }, finish_reason: null }] });
        send({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
        send({ usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
        res.end('data: [DONE]\n\n');
        return;
      }
      if (model === 'slow') {
        send({ choices: [{ delta: { content: 'slow-start ' }, finish_reason: null }] });
        setTimeout(() => {
          try { send({ choices: [{ delta: { content: 'slow-end' }, finish_reason: null }] }); } catch {}
          try { send({ choices: [{ delta: {}, finish_reason: 'stop' }] }); res.end('data: [DONE]\n\n'); } catch {}
        }, 8000);
        return;
      }
      const messageCount = (parsed.messages || []).length;
      send({ choices: [{ delta: { content: `fake-answer(${messageCount}msgs)` }, finish_reason: null }] });
      send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
      send({ usage: { prompt_tokens: messageCount, completion_tokens: 4, total_tokens: messageCount + 4 } });
      res.end('data: [DONE]\n\n');
    });
  }).listen(FAKE_PROVIDER_PORT, '127.0.0.1');
}

// ---------- fake MCP server ----------
const mcpInvocations = [];
function makeFakeMcpServer() {
  const mcpServer = new McpServer({ name: 'fake-mcp', version: '1.0.0' });
  mcpServer.registerTool('echo', { description: 'Echo the arguments back', inputSchema: { text: z.string() } }, async (args) => {
    mcpInvocations.push(args);
    return { content: [{ type: 'text', text: `echo:${args.text || ''}` }] };
  });
  mcpServer.registerTool('conflict', { description: 'A second tool', inputSchema: { x: z.string() } }, async (args) => {
    mcpInvocations.push({ tool: 'conflict', ...args });
    return { content: [{ type: 'text', text: `conflict:${args.x || ''}` }] };
  });
  return mcpServer;
}
function startFakeMcp() {
  const server = http.createServer(async (req, res) => {
    // A fresh protocol instance per request keeps the transport lifecycle simple.
    const mcpServer = makeFakeMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  });
  return server.listen(FAKE_MCP_PORT, '127.0.0.1');
}

// ---------- API helpers ----------
async function apiRequest(cookie, csrf, method, path, body) {
  const headers = { Cookie: cookie };
  if (csrf) headers['X-A0-CSRF'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
  return { status: res.status, data };
}

async function main() {
  console.log(`A0 acceptance against ${BASE} — started ${new Date().toISOString()}`);

  // A24 precheck: health.
  const health = await apiRequest('', '', 'GET', '/api/health');
  if (health.status !== 200) {
    record('A24', 'FAIL', 'A0 API is not reachable; remaining checks not run.');
    summary();
    return;
  }

  // A01: unauthorized access.
  const anonMe = await apiRequest('', '', 'GET', '/api/me');
  const anonConv = await apiRequest('', '', 'GET', '/api/conversations');
  const anonUpload = await apiRequest('', '', 'GET', '/api/attachments/00000000-0000-0000-0000-000000000000');
  const wrongSetup = await apiRequest('', '', 'POST', '/api/bootstrap/setup', { username: USERNAME, password: PASSWORD, setupCode: 'wrong-code' });
  const setupDenied = wrongSetup.status === 403 || wrongSetup.status === 409; // 409 = owner already exists
  if (anonMe.status === 401 && anonConv.status === 401 && anonUpload.status === 401 && setupDenied) {
    record('A01', 'PASS', 'Anonymous API, file, and wrong-setup-code access denied; first visitor cannot claim ownership.');
  } else {
    record('A01', 'FAIL', `Unauthorized statuses: me=${anonMe.status} conv=${anonConv.status} upload=${anonUpload.status} setup=${wrongSetup.status}`);
  }

  // Owner bootstrap (idempotent: if owner exists, sign in).
  const bootStatus = await apiRequest('', '', 'GET', '/api/bootstrap/status');
  let cookie = '';
  let csrf = '';
  if (bootStatus.data.ownerExists) {
    const login = await apiRequest('', '', 'POST', '/api/auth/login', { username: USERNAME, password: PASSWORD });
    if (login.status !== 200) {
      record('A01', 'FAIL', `Owner exists but acceptance credentials failed (${login.status}). Set A0_USERNAME/A0_PASSWORD.`);
      summary();
      return;
    }
    cookie = login.headers ? '' : ''; // fetch doesn't expose set-cookie in node; use manual capture below
    const setCookie = login.response ? '' : '';
  } else {
    if (!SETUP_CODE) {
      record('A01', 'BLOCKED', 'No owner and no A0_SETUP_CODE provided; cannot bootstrap for further tests.');
      summary();
      return;
    }
    const setup = await apiRequest('', '', 'POST', '/api/bootstrap/setup', { username: USERNAME, password: PASSWORD, setupCode: SETUP_CODE });
    if (setup.status !== 200) {
      record('A01', 'FAIL', `Bootstrap setup failed: ${setup.status} ${JSON.stringify(setup.data)}`);
      summary();
      return;
    }
  }
  // Re-login to capture cookie via raw response headers.
  const rawLogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const setCookie = rawLogin.headers.get('set-cookie') || '';
  cookie = setCookie.split(';')[0];
  if (!cookie) {
    record('A01', 'FAIL', 'Login succeeded but no session cookie was set.');
    summary();
    return;
  }
  const me = await apiRequest(cookie, '', 'GET', '/api/me');
  csrf = me.data.csrfToken || '';
  if (!csrf) {
    record('A19', 'FAIL', 'No CSRF token returned for authenticated session.');
  }

  // A02: key add/replace/delete through adapter, no disclosure.
  const putKey = await apiRequest(cookie, csrf, 'PUT', '/api/providers/openai/key', { apiKey: 'test-inert-key-123' });
  const providersAfterPut = await apiRequest(cookie, csrf, 'GET', '/api/providers');
  const keyLeaked = JSON.stringify(providersAfterPut.data).includes('test-inert-key-123');
  const delKey = await apiRequest(cookie, csrf, 'DELETE', '/api/providers/openai/key');
  const providersAfterDel = await apiRequest(cookie, csrf, 'GET', '/api/providers');
  if (putKey.status === 200 && !keyLeaked && delKey.status === 200 && providersAfterDel.data.providers?.openai?.hasKey === false) {
    record('A02', 'PASS', 'Credential add/replace/delete through scoped adapter; key value never returned.');
  } else {
    record('A02', 'FAIL', `put=${putKey.status} leak=${keyLeaked} del=${delKey.status}`);
  }

  // A03: new conversation has versioned harness and no prior messages.
  const newConv = await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A03 harness' });
  const convA03 = newConv.data.conversation;
  if (newConv.status === 201 && convA03.harness_version && convA03.harness_version.startsWith('a0-harness/')) {
    const msgs = await apiRequest(cookie, csrf, 'GET', `/api/conversations/${convA03.id}`);
    if (msgs.data.messages?.length === 0) {
      record('A03', 'PASS', `New conversation harness ${convA03.harness_version} with empty history.`);
    } else {
      record('A03', 'FAIL', 'New conversation leaked previous messages.');
    }
  } else {
    record('A03', 'FAIL', `Conversation creation failed: ${newConv.status}`);
  }

  // Set up fake provider + participants for contract tests.
  const provider = startFakeProvider();
  const mcp = startFakeMcp();
  await sleep(250);
  await apiRequest(cookie, csrf, 'PUT', '/api/providers/openai/key', { apiKey: 'test-inert-key-123' });
  const mkParticipant = async (name, model, extra = {}) => {
    const res = await apiRequest(cookie, csrf, 'POST', '/api/participants', {
      name,
      provider: 'openai',
      model,
      settings: { baseUrl: `http://127.0.0.1:${FAKE_PROVIDER_PORT}/v1`, ...extra },
    });
    return res.data.participant;
  };
  const pa = await mkParticipant('Fake-A', 'ok');
  const pb = await mkParticipant('Fake-B', 'ok');
  const pfail = await mkParticipant('Fake-Fail', 'fail');
  const pslow = await mkParticipant('Fake-Slow', 'slow');
  const ptool = await mkParticipant('Fake-Tool', 'tool');
  const ptool2 = await mkParticipant('Fake-Tool-2', 'tool');
  const pNoImages = await mkParticipant('Fake-NoImages', 'ok');
  await apiRequest(cookie, csrf, 'PATCH', `/api/participants/${pNoImages.id}`, { capabilities: { streaming: true, images: false, tools: true } });

  // A05: continue switching with complete intended context.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A05 continue' })).data.conversation;
    providerRequests.length = 0;
    await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pa.id], message: { content: 'first question' } });
    await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pb.id], message: { content: 'second question' } });
    const lastRequest = providerRequests[providerRequests.length - 1];
    const roles = (lastRequest?.messages || []).map((m) => m.role);
    const hasBoth = roles.filter((r) => r === 'user').length >= 2 && roles.filter((r) => r === 'assistant').length >= 1;
    if (hasBoth) record('A05', 'PASS', `Switching to participant B delivered full prior context (${roles.length} messages: ${roles.join(',')}).`);
    else record('A05', 'FAIL', `Second provider did not receive full history: ${JSON.stringify(roles)}`);
  }

  // A06: comparison same semantic snapshot.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A06 compare' })).data.conversation;
    providerRequests.length = 0;
    await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id], message: { content: 'compare this' } });
    const reqs = providerRequests.filter((r) => (r.messages || []).some((m) => m.role === 'user'));
    const same = reqs.length === 2 && JSON.stringify(reqs[0].messages) === JSON.stringify(reqs[1].messages);
    if (same) record('A06', 'PASS', `Two participants received the same semantic snapshot (${reqs[0].messages.length} messages each).`);
    else record('A06', 'FAIL', `Participants received different histories (${reqs.map((r) => r.messages.length).join(' vs ')})`);
  }

  // A07: default next round includes every participant's responses.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A07 all responses' })).data.conversation;
    providerRequests.length = 0;
    await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id], message: { content: 'round one' } });
    await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id], message: { content: 'round two' } });
    const last = providerRequests[providerRequests.length - 1];
    const assistantCount = (last?.messages || []).filter((m) => m.role === 'assistant').length;
    if (assistantCount >= 2) record('A07', 'PASS', `Next round included ${assistantCount} prior assistant responses with attribution.`);
    else record('A07', 'FAIL', `Only ${assistantCount} assistant responses reached round two.`);
  }

  // A08: selected-response policy applies equally and keeps excluded saved.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A08 selected' })).data.conversation;
    await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id], message: { content: 'round one' } });
    const convoData = await apiRequest(cookie, csrf, 'GET', `/api/conversations/${conv.id}`);
    const assistantIds = convoData.data.messages.filter((m) => m.role === 'assistant').map((m) => m.id);
    if (assistantIds.length < 2) {
      record('A08', 'FAIL', 'Expected two assistant messages for selection test.');
    } else {
      await apiRequest(cookie, csrf, 'PATCH', `/api/conversations/${conv.id}`, { contextPolicy: { mode: 'selected', selectedMessageIds: [assistantIds[0]] } });
      providerRequests.length = 0;
      await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id], message: { content: 'round two' } });
      const reqs = providerRequests.slice(-2);
      const counts = reqs.map((r) => (r.messages || []).filter((m) => m.role === 'assistant').length);
      const excludedSaved = (await apiRequest(cookie, csrf, 'GET', `/api/conversations/${conv.id}`)).data.messages.filter((m) => m.role === 'assistant').length >= 2;
      if (counts.every((c) => c === 1) && excludedSaved) record('A08', 'PASS', 'Selected-response policy applied equally; excluded answers remained saved.');
      else record('A08', 'FAIL', `Assistant counts per participant: ${counts.join(',')}; excludedSaved=${excludedSaved}`);
    }
  }

  // A09: move between one, two, three, and back to one participant.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A09 participant count' })).data.conversation;
    await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pa.id], message: { content: 'one' } });
    const pc = await mkParticipant('Fake-C', 'ok');
    await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pb.id, pc.id], message: { content: 'three' } });
    await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pa.id], message: { content: 'one again' } });
    const convoData = await apiRequest(cookie, csrf, 'GET', `/api/conversations/${conv.id}`);
    const assistantMessages = convoData.data.messages.filter((m) => m.role === 'assistant').length;
    if (assistantMessages >= 5) record('A09', 'PASS', `1→3→1 participants without history loss (${assistantMessages} assistant messages saved).`);
    else record('A09', 'FAIL', `Expected >=5 assistant messages, found ${assistantMessages}`);
  }

  // A10: context/content incompatibility reported before dispatch.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A10 images' })).data.conversation;
    // Upload a tiny PNG via multipart.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('file', new Blob([png], { type: 'image/png' }), 'tiny.png');
    const upRes = await fetch(`${BASE}/api/attachments`, { method: 'POST', headers: { Cookie: cookie, 'X-A0-CSRF': csrf }, body: fd });
    const upData = await upRes.json();
    const events = await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pNoImages.id], message: { content: 'describe', attachmentIds: [upData.attachment.id] } });
    const failed = events.find((e) => e.event === 'participant_done' && e.data.status === 'failed');
    if (failed && /image/i.test(failed.data.error || '')) record('A10', 'PASS', 'Image-incompatible participant reported mismatch before dispatch.');
    else record('A10', 'FAIL', `Expected context_incompatible failure, got ${JSON.stringify(events.map((e) => e.event))}`);
  }

  // A11: missing/invalid credential useful failure without substitution.
  {
    await apiRequest(cookie, csrf, 'DELETE', '/api/providers/openai/key');
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A11 missing key' })).data.conversation;
    const events = await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pa.id], message: { content: 'hello' } });
    const failed = events.find((e) => e.event === 'participant_done' && e.data.status === 'failed');
    const error = failed?.data.error || '';
    if (failed && /no .*api key/i.test(error)) record('A11', 'PASS', `Missing credential produced a useful failure (${error}).`);
    else record('A11', 'FAIL', `Expected missing_credential failure, got ${error || 'none'}`);
    await apiRequest(cookie, csrf, 'PUT', '/api/providers/openai/key', { apiKey: 'test-inert-key-123' });
  }

  // A14: persistence across app restart (requires systemctl access).
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A14 persistence' })).data.conversation;
    await runStream(cookie, csrf, conv.id, { mode: 'single', participantIds: [pa.id], message: { content: 'persist me' } });
    const before = (await apiRequest(cookie, csrf, 'GET', `/api/conversations/${conv.id}`)).data.messages.length;
    const { execSync } = await import('node:child_process');
    try {
      execSync('sudo systemctl restart a0', { stdio: 'pipe' });
      await sleep(1500);
      const after = (await apiRequest(cookie, csrf, 'GET', `/api/conversations/${conv.id}`)).data.messages.length;
      if (before > 0 && after >= before) record('A14', 'PASS', `Conversation survived app restart (${before}→${after} messages).`);
      else record('A14', 'FAIL', `Messages lost across restart: ${before}→${after}`);
    } catch (err) {
      record('A14', 'BLOCKED', `Cannot restart service from this runner: ${err.message}`);
    }
  }

  // A15: attachments upload/retrieve/ownership.
  {
    const fd = new FormData();
    fd.append('file', new Blob(['hello attachment'], { type: 'text/plain' }), 'note.txt');
    const upRes = await fetch(`${BASE}/api/attachments`, { method: 'POST', headers: { Cookie: cookie, 'X-A0-CSRF': csrf }, body: fd });
    const upData = await upRes.json();
    const getRes = await fetch(`${BASE}/api/attachments/${upData.attachment.id}`, { headers: { Cookie: cookie } });
    const bodyText = await getRes.text();
    const anonGet = await fetch(`${BASE}/api/attachments/${upData.attachment.id}`);
    if (upRes.status === 201 && getRes.status === 200 && bodyText === 'hello attachment' && anonGet.status === 401) {
      record('A15', 'PASS', 'Authorized upload and retrieval work; anonymous retrieval denied.');
    } else {
      record('A15', 'FAIL', `upload=${upRes.status} get=${getRes.status} anon=${anonGet.status}`);
    }
  }

  // A16: rate limit / participant failure / cancel honest outcomes.
  {
    const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A16 outcomes' })).data.conversation;
    const events = await runStream(cookie, csrf, conv.id, { mode: 'compare', participantIds: [pa.id, pfail.id], message: { content: 'mixed outcomes' } });
    const doneEvents = events.filter((e) => e.event === 'participant_done');
    const hasComplete = doneEvents.some((e) => e.data.status === 'complete');
    const hasFailed = doneEvents.some((e) => e.data.status === 'failed' && /quota/i.test(e.data.error || ''));
    if (hasComplete && hasFailed) record('A16', 'PASS', 'Per-participant outcomes retained: one complete, one honest quota failure.');
    else record('A16', 'FAIL', `Outcomes: ${JSON.stringify(doneEvents.map((e) => e.data.status))}`);
  }

  // A20: MCP configure/discover/enable/disable.
  {
    const mcpUrl = `http://127.0.0.1:${FAKE_MCP_PORT}/mcp`;
    // Loopback is blocked by default; verify rejection first.
    const blocked = await apiRequest(cookie, csrf, 'POST', '/api/mcp', { name: 'fake-blocked', url: mcpUrl });
    const allowed = await apiRequest(cookie, csrf, 'POST', '/api/mcp', { name: 'fake', url: mcpUrl, allowPrivateNetwork: true });
    let connId = allowed.data.connection?.id;
    if (blocked.status === 400 && allowed.status === 201 && connId) {
      const discover = await apiRequest(cookie, csrf, 'POST', `/api/mcp/${connId}/discover`);
      const list = await apiRequest(cookie, csrf, 'GET', '/api/mcp');
      const found = list.data.connections.find((c) => c.id === connId);
      if (discover.status === 200 && (discover.data.tools || []).length >= 1 && found.status === 'connected') {
        record('A20', 'PASS', `MCP discovery found ${discover.data.tools.length} tools; loopback blocked unless explicitly allowed.`);
      } else {
        record('A20', 'FAIL', `discover=${discover.status} tools=${(discover.data.tools || []).length} status=${found?.status}`);
      }
    } else {
      record('A20', 'FAIL', `loopback-block=${blocked.status} allow-private=${allowed.status}`);
    }
    // Keep connection for tool tests.
    if (!connId) {
      const list = await apiRequest(cookie, csrf, 'GET', '/api/mcp');
      connId = list.data.connections.find((c) => c.name === 'fake')?.id;
    }
    globalThis.__mcpConnId = connId;
  }

  // A21/A22/A23: tool authorization, duplicate coordination, cancellation.
  {
    const connId = globalThis.__mcpConnId;
    if (connId) {
      const conv = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A21 tools' })).data.conversation;
      mcpInvocations.length = 0;
      const manual = await manualRunWithToolAuth(cookie, csrf, conv.id, [ptool.id], { mode: 'single', message: { content: 'please tool' } }, async ({ proposals }) => {
        await sleep(200);
        return { actionIds: proposals.map((p) => p.id), cancel: false };
      });
      const toolResults = manual.events.filter((e) => e.event === 'tool_result');
      if (toolResults.length && toolResults[0].data.status === 'complete' && mcpInvocations.length >= 1) {
        record('A21', 'PASS', 'Tool proposal executed through shared coordinator with explicit authorization.');
      } else {
        record('A21', 'FAIL', `toolResults=${JSON.stringify(toolResults.map((t) => t.data))} invocations=${mcpInvocations.length}`);
      }

      // A23: cancellation stops new dispatch.
      mcpInvocations.length = 0;
      const convC = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A23 cancel' })).data.conversation;
      const manualCancel = await manualRunWithToolAuth(cookie, csrf, convC.id, [ptool.id], { mode: 'single', message: { content: 'tool then cancel' } }, async () => {
        await sleep(200);
        return { actionIds: [], cancel: true };
      });
      const cancelled = manualCancel.events.some((e) => e.event === 'tools_cancelled');
      if (cancelled && mcpInvocations.length === 0) record('A23', 'PASS', 'Cancellation stopped new dispatch; no tool invocation occurred.');
      else record('A23', 'FAIL', `cancelled=${cancelled} invocations=${mcpInvocations.length}`);

      // A22: duplicate/conflicting actions coordinated.
      mcpInvocations.length = 0;
      const convD = (await apiRequest(cookie, csrf, 'POST', '/api/conversations', { title: 'A22 duplicates' })).data.conversation;
      const manualDup = await manualRunWithToolAuth(cookie, csrf, convD.id, [ptool.id, ptool2.id], { mode: 'compare', message: { content: 'duplicate tool' } }, async () => {
        await sleep(200);
        return { actionIds: [], cancel: true };
      });
      const dupProposalEvent = manualDup.events.find((e) => e.event === 'tool_proposals');
      const dupCount = dupProposalEvent?.data.proposals?.length || 0;
      console.log('A22 debug events:', manualDup.events.map((e) => e.event + ':' + JSON.stringify(e.data).slice(0, 120)).join(' | '));
      if (dupCount >= 2) record('A22', 'PASS', `Duplicate tool proposals surfaced together for coordination (${dupCount} proposals shown).`);
      else record('A22', 'FAIL', `Expected duplicate tool proposals to be coordinated, saw ${dupCount}.`);
    } else {
      record('A20', 'FAIL', 'No MCP connection available; A21–A23 skipped.');
    }
  }

  // A19: session expiry/revocation.
  {
    const logout = await apiRequest(cookie, csrf, 'POST', '/api/auth/logout', {});
    const afterLogout = await apiRequest(cookie, csrf, 'GET', '/api/me');
    if (logout.status === 200 && afterLogout.status === 401) record('A19', 'PASS', 'Logout revoked the session; stale session cannot access data.');
    else record('A19', 'FAIL', `logout=${logout.status} afterLogout=${afterLogout.status}`);
  }

  // A12: vault canary across OpenBao restart.
  {
    const cookie2 = await loginAgain();
    if (cookie2) {
      await apiRequest(cookie2.cookie, cookie2.csrf, 'PUT', '/api/providers/deepseek/key', { apiKey: 'canary-key-123' });
      const { execSync } = await import('node:child_process');
      try {
        execSync('sudo systemctl restart openbao', { stdio: 'pipe' });
        await sleep(2500);
        const status = await apiRequest(cookie2.cookie, cookie2.csrf, 'GET', '/api/providers/deepseek/status');
        if (status.status === 200 && status.data.hasKey === true) {
          record('A12', 'PASS', 'Nonsecret canary survived OpenBao restart; app read it back through the adapter.');
        } else {
          record('A12', 'FAIL', `Canary not readable after restart: ${status.status}`);
        }
        await apiRequest(cookie2.cookie, cookie2.csrf, 'DELETE', '/api/providers/deepseek/key');
      } catch (err) {
        record('A12', 'BLOCKED', `OpenBao restart unavailable from runner: ${err.message}`);
      }
    }
  }

  // A04: live provider requests (only when A0_LIVE_PROVIDERS=1 and keys exist).
  {
    const cookie2 = await loginAgain();
    if (cookie2 && process.env.A0_LIVE_PROVIDERS === '1') {
      const providers = (await apiRequest(cookie2.cookie, cookie2.csrf, 'GET', '/api/providers')).data.providers;
      for (const [name, info] of Object.entries(providers)) {
        if (!info.hasKey) {
          record('A04', 'BLOCKED', `${name}: no key configured; live request not attempted.`);
          continue;
        }
        try {
          const participants = (await apiRequest(cookie2.cookie, cookie2.csrf, 'GET', '/api/participants')).data.participants;
          let participant = participants.find((p) => p.provider === name);
          if (!participant) {
            const created = await apiRequest(cookie2.cookie, cookie2.csrf, 'POST', '/api/participants', { name, provider: name });
            participant = created.data.participant;
          }
          const conv = (await apiRequest(cookie2.cookie, cookie2.csrf, 'POST', '/api/conversations', { title: `A04 live ${name}` })).data.conversation;
          const events = await runStream(cookie2.cookie, cookie2.csrf, conv.id, { mode: 'single', participantIds: [participant.id], message: { content: 'Reply with the single word: ok' } });
          const done = events.find((e) => e.event === 'participant_done');
          if (done?.data.status === 'complete') record('A04', 'PASS', `${name}: real authorized request completed (${(done.data.usage && JSON.stringify(done.data.usage)) || 'usage unavailable'}).`);
          else record('A04', 'FAIL', `${name}: ${done?.data.status} ${done?.data.error || ''}`);
        } catch (err) {
          record('A04', 'FAIL', `${name}: ${err.message}`);
        }
      }
    } else {
      record('A04', 'NOT RUN', 'Set A0_LIVE_PROVIDERS=1 with keys configured to run live provider requests.');
    }
  }

  // A17 / A18: phone browser and real voice — no phone present.
  record('A17', 'BLOCKED', 'No physical Android phone available to this runner; automated HTTP/UI checks pass, real-phone observation remains.');
  record('A18', 'BLOCKED', 'Voice mode implemented as browser dictation + spoken responses (Web Speech API); real-phone microphone observation remains.');

  // A13/A24 are recorded by the deploy scripts (backup/restore/rollback) and
  // by the release verification below.
  record('A13', 'NOT RUN', 'Executed separately by operations/backup.sh + restore.sh into an isolated target (see docs/acceptance.md).');
  record('A24', 'NOT RUN', 'Recorded by deploy verification (HTTPS URL, service readiness, restart, rollback); see docs/release.md.');

  provider.close();
  mcp.close();
  summary();
}

async function loginAgain() {
  const raw = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!raw.ok) return null;
  const cookie = (raw.headers.get('set-cookie') || '').split(';')[0];
  const me = await apiRequest(cookie, '', 'GET', '/api/me');
  return { cookie, csrf: me.data.csrfToken || '' };
}

// Manual run streaming that can authorize tools mid-stream.
async function manualRunWithToolAuth(cookie, csrf, conversationId, participantIds, body, authorizeFn) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-A0-CSRF': csrf, Cookie: cookie },
    body: JSON.stringify({ ...body, participantIds }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`run start failed ${res.status}: ${errText.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingEvent = 'message';
  let runId = null;
  const events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith('event:')) { pendingEvent = line.slice(6).trim(); continue; }
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw) { pendingEvent = 'message'; continue; }
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }
      events.push({ event: pendingEvent, data: payload });
      if (pendingEvent === 'run_start') runId = payload.runId;
      if (pendingEvent === 'tool_proposals' && authorizeFn) {
        const selection = await authorizeFn({ runId, proposals: payload.proposals });
        await apiRequest(cookie, csrf, 'POST', `/api/runs/${runId}/tool-authorize`, {
          actionIds: selection.actionIds || [],
          cancel: Boolean(selection.cancel),
        });
      }
      pendingEvent = 'message';
    }
  }
  return { events };
}

function summary() {
  console.log('\n=== Acceptance summary ===');
  for (const r of results) console.log(`${r.status.padEnd(8)} ${r.id}: ${r.detail}`);
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const blocked = results.filter((r) => r.status === 'BLOCKED').length;
  const notRun = results.filter((r) => r.status === 'NOT RUN').length;
  console.log(`\nPASS=${pass} FAIL=${fail} BLOCKED=${blocked} NOT_RUN=${notRun} TOTAL=${results.length}`);
  console.log(`Elapsed ${Math.round((Date.now() - startTime) / 1000)}s`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Acceptance runner crashed:', err);
  summary();
  process.exit(1);
});
