// DEFECT WITNESS: PASS reproduces the audited bug; this is not an acceptance gate.
// Original audited source: de66778dd1d9073f6a8b3d532e73514868f94e3c.
// See README.md for safe invocation, polarity, and conversion after repair.
import { sourcePath, sourceCommit, auditedCommit, sourceDirty, loadPlaywright, restrictBrowserToOrigin, outputPath } from './audit-runtime.mjs';
const { chromium } = await loadPlaywright();
// Real mobile Chromium + app/CSS; API and speech fixtures are inert. No production
// accounts, files, providers or microphones are accessed. Each case gets a fresh
// browser context; finally hooks close contexts, browser and local HTTP server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';

let browser, server, origin;
const streamHandlers = new Map();
before(async () => {
  server = http.createServer(async (req, res) => {
    if (streamHandlers.has(req.url)) return streamHandlers.get(req.url)(res);
    const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    if (!['index.html', 'app.js', 'markdown.js', 'styles.css', 'manifest.json'].includes(name)) {
      res.writeHead(404).end(); return;
    }
    const body = await readFile(sourcePath('apps', 'web', name));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json');
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

const time = '2026-11-03T15:00:00Z';
const replies = () => [
  { id: 'u1', role: 'user', round: 0, content: 'Compare these answers', created_at: time },
  { id: 'm1', role: 'assistant', round: 1, participant_id: 'p1', provider: 'deepseek', model: 'deepseek-chat', content: 'First answer', status: 'complete', created_at: time },
  { id: 'm2', role: 'assistant', round: 1, participant_id: 'p2', provider: 'openai', model: 'gpt-4o-mini', content: 'Second answer', status: 'complete', created_at: time },
];

async function fixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 820 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  t.after(async () => { await context.close(); });
  await restrictBrowserToOrigin(context, origin);
  await context.addInitScript(({ speech }) => {
    window.__speech = { texts: [], recognition: null, utterance: null };
    class Recognition {
      constructor() { window.__speech.recognition = this; }
      start() { this.onstart?.(); }
      stop() { this.onend?.(); }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: speech ? Recognition : undefined });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: class { constructor(text) { this.text = text; } } });
    Object.defineProperty(window, 'speechSynthesis', { value: {
      cancel() {}, resume() {}, getVoices() { return []; },
      speak(utterance) { window.__speech.texts.push(utterance.text); window.__speech.utterance = utterance; utterance.onstart?.(); },
    } });
  }, { speech: options.speech !== false });
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const data = {
    owner: 'owner1', settings: {}, calls: [], uploads: 0, signedOut: false,
    conversations: [
      { id: 'c1', title: 'Saved conversation', message_count: 3 },
      { id: 'c2', title: 'Other conversation', message_count: 0 },
    ],
    messages: { c1: replies(), c2: [] },
  };
  if (options.empty) { data.conversations = []; data.messages = {}; }
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    data.calls.push({ path, method: req.method(), body: req.postData() });
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (options.handle && await options.handle({ path, req, route, json, data })) return;
    if (path === '/api/me') return data.signedOut ? json({}, 401) : json({ user: { id: data.owner, username: 'fixture' }, csrfToken: 'fixture-csrf' });
    if (path === '/api/bootstrap/status') return json({ ownerExists: true });
    if (path === '/api/auth/logout') { data.signedOut = true; return json({}); }
    if (path === '/api/auth/login') { data.signedOut = false; return json({}); }
    if (path === '/api/conversations' && req.method() === 'GET') return json({ conversations: data.conversations });
    if (path === '/api/conversations' && req.method() === 'POST') {
      const c = { id: `c${data.conversations.length + 1}`, title: 'New conversation', message_count: 0 };
      data.conversations.push(c); data.messages[c.id] = []; return json({ conversation: c });
    }
    if (/^\/api\/conversations\/[^/]+$/.test(path)) {
      const id = path.split('/').pop();
      return json({ conversation: data.conversations.find(c => c.id === id), messages: data.messages[id], messageCount: data.messages[id]?.length });
    }
    if (path === '/api/projects') return json({ projects: [] });
    if (path === '/api/participants') return json({ participants: [
      { id: 'p1', name: 'DeepSeek', provider: 'deepseek', model: 'deepseek-chat', settings: {} },
      { id: 'p2', name: 'OpenAI', provider: 'openai', model: 'gpt-4o-mini', settings: {} },
    ] });
    if (path === '/api/providers') return json({ providers: {} });
    if (path === '/api/settings') {
      if (req.method() === 'PUT') Object.assign(data.settings, req.postDataJSON());
      return json({ owner: data.settings });
    }
    if (path === '/api/attachments') {
      data.uploads++; return json({ attachment: { id: `a${data.uploads}`, mime: 'text/plain', filename: 'notes.txt', status: 'ready' } });
    }
    if (path.endsWith('/runs')) {
      const id = path.split('/')[3], body = req.postDataJSON();
      data.messages[id].push({ id: 'sent', role: 'user', content: body.message.content, round: 0, created_at: time, meta: { clientRequestId: body.message.clientRequestId }, attachments: body.message.attachmentIds.map(id => ({ id, filename: 'notes.txt', mime: 'text/plain' })) });
      data.messages[id].push(...replies().slice(1).map(m => ({ ...m, round: 2, id: m.id + '-2' })));
      const event = (name, payload) => `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
      return route.fulfill({ contentType: 'text/event-stream', body:
        event('run_start', { runId: 'r2', conversationId: id, participants: [{ id: 'p1', name: 'DeepSeek', model: 'deepseek-chat' }, { id: 'p2', name: 'OpenAI', model: 'gpt-4o-mini' }] }) +
        event('chunk', { participantId: 'p1', text: 'First answer' }) +
        event('chunk', { participantId: 'p2', text: 'Second answer' }) +
        event('run_complete', { runId: 'r2', status: 'complete' }) });
    }
    return json({});
  });
  if (options.beforeLoad) await options.beforeLoad({ page, context, data });
  await page.goto(origin);
  if (options.waitForReady !== false) await page.waitForLoadState('networkidle');
  return { page, data, errors, context };
}

async function open(page, title = 'Saved conversation') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: `Open conversation ${title}`, exact: true }).click();
  await page.waitForFunction(title => document.querySelector('#chatTitle').textContent === title &&
    document.querySelector('#menuBtn').getAttribute('aria-expanded') === 'false', title);
}


test('audit G06 continue after picking another model retains old model', async t => {
  const {page,data,errors}=await fixture(t);
  await open(page);
  assert.equal(await page.locator('#participantPicker button[aria-pressed="true"]').textContent(), 'DeepSeek · deepseek-chat');
  await page.getByRole('button',{name:'OpenAI · gpt-4o-mini', exact:true}).click();
  const target=await page.locator('#switchTarget').innerText();
  await page.locator('#switchContinueBtn').click();
  const selected=await page.locator('#participantPicker button[aria-pressed="true"]').allTextContents();
  await page.locator('#composerInput').fill('Continue with the newly picked model');
  await page.locator('#sendBtn').click();
  await page.waitForLoadState('networkidle');
  const run=data.calls.filter(c=>c.path.endsWith('/runs')).at(-1);
  console.log('G06 observation '+JSON.stringify({target,selected,request:JSON.parse(run.body),errors}));
  assert.deepEqual(JSON.parse(run.body).participantIds,['p1']);
  assert.deepEqual(errors,[]);
});
test('audit G10 MCP discovered tool details are absent from the DOM', async t => {
  const {page,errors}=await fixture(t,{handle:async({path,json})=>{
    if(path==='/api/mcp'){
      await json({connections:[{id:'fixture-mcp',name:'Fixture MCP',url:'https://fixture.invalid/mcp',enabled:true,status:'connected',tools:[{name:'fixture_write_note',description:'Writes a note requiring a destination',inputSchema:{type:'object',properties:{destination:{type:'string'}},required:['destination']}}]}]});
      return true;
    }
  }});
  await page.locator('#menuBtn').click();
  await page.locator('[data-view="mcp"]').click();
  await page.waitForLoadState('networkidle');
  const text=await page.locator('#mcpCards').innerText();
  console.log('G10 observation '+JSON.stringify({text,toolCount:await page.getByText('fixture_write_note',{exact:false}).count(),schemaCount:await page.getByText('destination',{exact:false}).count(),errors}));
  assert.match(text,/1 tools/);
  assert.doesNotMatch(text,/fixture_write_note|destination/);
  assert.deepEqual(errors,[]);
});
test('audit G07 G09 late context chooser targets newer conversation', async t => {
  let delay=false, release;
  const gate=new Promise(resolve=>{release=resolve;});
  let reached;
  const waiting=new Promise(resolve=>{reached=resolve;});
  const {page,data,errors}=await fixture(t,{handle:async({path,req,json,data})=>{
    if(path==='/api/conversations/c1' && req.method()==='GET' && delay){
      delay=false;
      const snapshot=structuredClone({conversation:data.conversations[0],messages:data.messages.c1,messageCount:data.messages.c1.length});
      reached();await gate;await json(snapshot);return true;
    }
    if(path.startsWith('/api/conversations/') && req.method()==='PATCH'){
      const id=path.split('/').at(-1);
      const c=data.conversations.find(c=>c.id===id);
      c.context_policy=req.postDataJSON().contextPolicy;
      await json({conversation:c});return true;
    }
  }});
  t.after(()=>release());
  await open(page);
  data.messages.c2=[{id:'other-answer',role:'assistant',participant_id:'p1',model:'deepseek-chat',content:'Answer belonging only to the other conversation',status:'complete',round:1,created_at:time}];
  delay=true;
  await page.locator('#contextPolicyBtn').click();
  await waiting;
  await open(page,'Other conversation');
  release();
  await page.waitForFunction(()=>!document.querySelector('#contextModal').classList.contains('hidden'));
  const shown=await page.locator('#contextSelectionList').innerText();
  const title=await page.locator('#chatTitle').innerText();
  await page.locator('#contextSaveBtn').click();
  await page.waitForLoadState('networkidle');
  const patch=data.calls.filter(c=>c.method==='PATCH' && c.path.startsWith('/api/conversations/')).at(-1);
  console.log('G07/G09 observation '+JSON.stringify({title,shown,patch,errors}));
  assert.equal(title,'Other conversation');
  assert.match(shown,/First answer/);
  assert.equal(patch.path,'/api/conversations/c2');
  assert.deepEqual(JSON.parse(patch.body).contextPolicy.selectedMessageIds,['m1','m2']);
  assert.deepEqual(errors,[]);
});
