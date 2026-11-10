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

import vm from 'node:vm';
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


// Diagnostic witnesses against the real app.js/CSS with inert intercepted APIs.
// Assertions establish observed defects, not successful product behavior.
const sysSource = (await readFile(sourcePath('apps', 'server', 'src', 'system.js'), 'utf8'))
  .replace("import { HARNESS_VERSION } from './harness.js';", "const HARNESS_VERSION = 'audit-fixture';")
  .replaceAll('export ', '');
const sysVm = {};
vm.runInNewContext(sysSource + "\nglobalThis.payload = systemPayload('audit-de66778');", sysVm);
const systemPayload = JSON.parse(JSON.stringify(sysVm.payload));
async function navigate(page, view) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.locator(`.nav-btn[data-view="${view}"]`).click();
}

test('G02 witness: All reset does not clear a System state filter', async t => {
  const { page } = await fixture(t, { handle: async ({path,json}) => {
    if (path === '/api/system') { await json(systemPayload); return true; }
  }});
  await navigate(page, 'system');
  await page.waitForSelector('#systemMain .list-item');
  const fullCount = await page.locator('#systemMain .list-item').count();
  await page.locator('#systemStateFilters button[data-state="broken"]').click();
  const filteredCount = await page.locator('#systemMain .list-item').count();
  await page.locator('#systemStateFilters button[data-state=""]').click();
  const resetCount = await page.locator('#systemMain .list-item').count();
  assert.equal(filteredCount,1);
  assert.equal(resetCount,filteredCount);
  assert.ok(fullCount>resetCount);
  console.log(JSON.stringify({witness:'system-reset',fullCount,filteredCount,resetCount}));
});

test('G03/G04 witness: source-only System payload becomes observed runtime and false absence', async t => {
  const { page } = await fixture(t, { handle: async ({path,json}) => {
    if (path === '/api/system') { await json(systemPayload); return true; }
  }});
  await navigate(page, 'system');
  await page.locator('#systemMain button').filter({hasText:'OpenBao service'}).click();
  const evidence = await page.locator('#systemDetail').innerText();
  assert.match(evidence,/deployed behavior observed/);
  assert.match(evidence,/reliability: F2/);
  assert.equal(systemPayload.objects.some(o=>'observedAt' in o || 'observation' in o || 'reliability' in o),false);
  await page.locator('#systemTabs [data-sysview="knowledge"]').click();
  const absence = await page.locator('#systemMain .list-item').filter({hasText:'Personal facts outside A0'}).innerText();
  assert.match(absence,/not held/);
  assert.match(absence,/No such inventory exists; treat as not collected/);
  console.log(JSON.stringify({witness:'system-evidence',evidence:evidence.split('\n').filter(x=>/freshness|reliability/.test(x)),absence}));
});

test('G14 witness: creating first agent after opening AHBG leaves empty agent selector', async t => {
  const agents=[];
  const a={id:'a1',name:'Fixture Sage',forge_template_id:'sage',status:'ready',conversation_id:'c2',renderer:'agent-panel',module_id:'mod1',ptcna_summary:{}};
  const {page}=await fixture(t,{handle:async({path,req,json})=>{
    if(path==='/api/agents') {
      if(req.method()==='POST'){agents.push(a); await json({agent:a,ptcnaError:null},201);} else await json({agents});
      return true;
    }
    if(path==='/api/forge/templates'){await json({templates:[{id:'sage',name:'Sage'}]});return true;}
    if(path==='/api/ahbg/sessions'){await json({sessions:[]});return true;}
  }});
  await navigate(page,'ahbg');
  assert.equal(await page.locator('#ahbgAgent').inputValue(),'');
  await navigate(page,'agents');
  await page.locator('#agentName').fill('Fixture Sage');
  await page.locator('#agentForm button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#agentCards').textContent.includes('Fixture Sage'));
  assert.equal(agents.length,1);
  await navigate(page,'ahbg');
  assert.equal(await page.locator('#ahbgAgent').inputValue(),'');
  const options=await page.locator('#ahbgAgent').innerText();
  assert.match(options,/Create a Forge agent first/);
  console.log(JSON.stringify({witness:'ahbg-stale-selector',agentsCreated:agents.length,options}));
});

test('G13 witness: module swap changes a label but renders identical controls and content',async t=>{
  const a={id:'a1',name:'Fixture Sage',forge_template_id:'sage',status:'ready',conversation_id:'c2',renderer:'agent-panel',module_id:'mod1',ptcna_summary:{},original_definition:{source:'fixture',system_prompt:'Sage original'},effective_instructions:'Sage effective'};
  const {page}=await fixture(t,{handle:async({path,req,json})=>{
    if(path==='/api/agents'){await json({agents:[a]});return true;}
    if(path==='/api/forge/templates'){await json({templates:[{id:'sage',name:'Sage'}]});return true;}
    if(path==='/api/agent-modules/mod1/swap'){a.renderer=req.postDataJSON().renderer;await json({ok:true,renderer:a.renderer});return true;}
  }});
  await navigate(page,'agents');
  await page.waitForSelector('#agentCards button');
  const before=await page.locator('#agentCards').innerHTML();
  await page.locator('#agentCards button').filter({hasText:'Swap module'}).click();
  await page.waitForFunction(()=>document.querySelector('#agentCards').textContent.includes('module agent-stats'));
  const after=await page.locator('#agentCards').innerHTML();
  assert.equal(before.replaceAll('agent-panel','RENDERER'),after.replaceAll('agent-stats','RENDERER'));
  console.log(JSON.stringify({witness:'module-swap-label-only',renderer:a.renderer,controls:await page.locator('#agentCards button').allTextContents()}));
});

test('G11 witness: delayed context request saves conversation A project text into B',async t=>{
  let releaseContext,requested;
  const gate=new Promise(r=>releaseContext=r);
  const started=new Promise(r=>requested=r);
  let saved;
  const {page}=await fixture(t,{beforeLoad:async({data})=>{data.messages.c1=[];data.messages.c2=[];data.conversations[0].message_count=0;data.conversations[0].project_id='project-a';data.conversations[1].project_id='project-b';},handle:async({path,req,json,data})=>{
    if(path==='/api/conversations/c1/context'){
      requested();await gate;
      await json({conversationId:'c1',revision:0,blocks:[{id:'harness',label:'Harness',editable:false,content:'inert',included:true},{id:'project',label:'Project A',source:'project:project-a',editable:true,content:'Private context from conversation A',included:true},{id:'tools',label:'Tools',editable:false,content:'inert',included:true}]});return true;
    }
    if(path.endsWith('/context-revisions')){saved={path,body:req.postDataJSON()};await json({revision:1,blocks:[],cacheEstimate:{}});return true;}
  }});
  await open(page,'Saved conversation');
  await page.locator('#contextEditorBtn').click();
  await started;
  await open(page,'Other conversation');
  releaseContext();
  await page.waitForSelector('#contextEditorModal:not(.hidden)');
  await page.locator('#contextEditorSaveBtn').click();
  await page.waitForFunction(()=>document.querySelector('#contextRevisionBadge').textContent.includes('revision 1'));
  assert.equal(saved.path,'/api/conversations/c2/context-revisions');
  assert.equal(saved.body.blocks.find(b=>b.id==='project').content,'Private context from conversation A');
  console.log(JSON.stringify({witness:'context-navigation-misroute',saved}));
});
