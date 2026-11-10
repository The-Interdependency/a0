// Run: node --test tests/frontend/browser.test.js (after npm ci and npx playwright install chromium).
// Real mobile Chromium + app/CSS; API and speech fixtures are inert. No production
// accounts, files, providers or microphones are accessed. Each case gets a fresh
// browser context; finally hooks close contexts, browser and local HTTP server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

let browser, server, origin;
const streamHandlers = new Map();
before(async () => {
  server = http.createServer(async (req, res) => {
    if (streamHandlers.has(req.url)) return streamHandlers.get(req.url)(res);
    const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    if (!['index.html', 'app.js', 'markdown.js', 'styles.css', 'gui-msdmd.mjs', 'manifest.json'].includes(name)) {
      res.writeHead(404).end(); return;
    }
    const body = await readFile(process.env.A0_TEST_WEB_ROOT ? join(process.env.A0_TEST_WEB_ROOT, name) : new URL(`../../apps/web/${name}`, import.meta.url));
    res.setHeader('Content-Type', name.endsWith('.js') || name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html' : 'application/json');
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
  const context = await browser.newContext({ viewport: { width: 393, height: 820 }, isMobile: true, hasTouch: true });
  const artifacts = process.env.A0_TEST_ARTIFACT_DIR;
  if (artifacts) { await mkdir(artifacts, { recursive: true }); await context.tracing.start({ screenshots: true, snapshots: true }); }
  t.after(async () => {
    try {
      if (artifacts) {
        const name = t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 100) + (options.speech === false ? '-unsupported' : '');
        await page.screenshot({ path: join(artifacts, `${name}.png`) });
        await context.tracing.stop({ path: join(artifacts, `${name}.zip`) });
      }
    } finally { await context.close(); }
  });
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

test('menu/history initialize with saved participants and no uncaught errors', async t => {
  const { page, errors } = await fixture(t);
  assert.deepEqual(errors, []);
  await open(page);
  assert.match(await page.locator('#messages').innerText(), /First answer/);
  assert.equal(await page.locator('#menuBtn').getAttribute('aria-expanded'), 'false');
});

test('a failed provider settings request does not disable navigation', async t => {
  const { page } = await fixture(t, { handle: async ({ path, json }) => {
    if (path === '/api/providers') { await json({ message: 'Provider settings unavailable' }, 503); return true; }
  } });
  await open(page);
  assert.match(await page.locator('#messages').innerText(), /Second answer/);
});

test('reload restores conversation, typed draft and uploaded file; drafts stay with their conversation', async t => {
  const { page, data } = await fixture(t);
  await open(page);
  await page.locator('#composerInput').fill('unsent thought');
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => document.querySelector('#attachmentChips').textContent.includes('notes.txt'));
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#chatTitle').innerText(), 'Saved conversation');
  assert.equal(await page.locator('#composerInput').inputValue(), 'unsent thought');
  assert.match(await page.locator('#attachmentChips').innerText(), /notes.txt/);
  await open(page, 'Other conversation');
  assert.equal(await page.locator('#composerInput').inputValue(), '');
  assert.equal(await page.locator('#attachmentChips').innerText(), '');
  await page.locator('#composerInput').fill('other draft');
  await open(page);
  assert.equal(await page.locator('#composerInput').inputValue(), 'unsent thought');
  assert.equal(data.uploads, 1);
});

test('upload pending/error are visible and never reset the conversation', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = await fixture(t, { handle: async ({ path, json }) => {
    if (path === '/api/attachments') { await gate; await json({ message: 'File too large' }, 400); return true; }
  } });
  await open(page);
  await page.locator('#composerInput').fill('keep this');
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => /Uploading/.test(document.querySelector('#attachmentChips').textContent));
  assert.equal(await page.locator('#sendBtn').isDisabled(), true);
  release();
  await page.waitForFunction(() => /File too large/.test(document.querySelector('#attachmentChips').textContent));
  assert.equal(await page.locator('#chatTitle').innerText(), 'Saved conversation');
  assert.equal(await page.locator('#composerInput').inputValue(), 'keep this');
});

test('accepted sends clear only sent attachments and restore saved comparison panes', async t => {
  const { page } = await fixture(t);
  await open(page);
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => document.querySelector('#attachmentChips').textContent.includes('notes.txt'));
  await page.locator('#composerInput').fill('another round');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('another round') && document.querySelectorAll('.response-group').length === 2);
  assert.equal(await page.locator('#attachmentChips').innerText(), '');
  assert.equal(await page.locator('#composerInput').inputValue(), '');
  assert.equal(await page.locator('#messages .attachments a').count(), 1);
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#attachmentChips').innerText(), '');
});

test('carousel advances saved answers; layout changes persist and do not overflow the page', async t => {
  const { page, data } = await fixture(t);
  await open(page);
  assert.equal(await page.locator('.response-group').count(), 1);
  assert.equal(await page.locator('.response-group .compare-pane').count(), 2);
  await page.getByRole('button', { name: 'Next answer', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.response-group .compare-wrap').scrollLeft > 0);
  await page.locator('#comparisonLayout').selectOption('side');
  await page.waitForFunction(() => document.querySelector('.response-group .compare-wrap').classList.contains('side'));
  await page.waitForLoadState('networkidle');
  assert.equal(data.settings.comparisonLayout, 'side');
  if (process.env.A0_TEST_ARTIFACT_DIR) await page.screenshot({ path: join(process.env.A0_TEST_ARTIFACT_DIR, 'comparison-mobile.png') });
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#comparisonLayout').inputValue(), 'side');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('microphone errors survive end event; unsupported recognition explains the action', async t => {
  const { page } = await fixture(t);
  await page.getByRole('button', { name: 'Dictate', exact: true }).click();
  await page.evaluate(() => { __speech.recognition.onerror({ error: 'not-allowed' }); __speech.recognition.onend(); });
  assert.equal(await page.locator('#voiceStatus').isVisible(), true);
  assert.match(await page.locator('#voiceStatus').innerText(), /permission.*denied/i);
  const unsupported = await fixture(t, { speech: false });
  await unsupported.page.getByRole('button', { name: 'Dictate', exact: true }).click();
  assert.match(await unsupported.page.locator('#voiceStatus').innerText(), /not available|not supported/i);
});

test('dictation adds to the typed draft and survives reload', async t => {
  const { page } = await fixture(t);
  await open(page);
  await page.locator('#composerInput').fill('Typed first.');
  await page.getByRole('button', { name: 'Dictate', exact: true }).click();
  await page.evaluate(() => __speech.recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Spoken next.' }], { isFinal: true })] }));
  assert.equal(await page.locator('#composerInput').inputValue(), 'Typed first. Spoken next.');
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').inputValue(), 'Typed first. Spoken next.');
});

test('per-answer speech reports playback errors and the top toggle gives immediate feedback', async t => {
  const { page } = await fixture(t);
  await open(page);
  await page.getByRole('button', { name: 'Speak this answer', exact: true }).first().click();
  assert.deepEqual(await page.evaluate(() => __speech.texts), ['First answer']);
  await page.evaluate(() => __speech.utterance.onerror({ error: 'audio-busy' }));
  assert.match(await page.locator('#voiceStatus').innerText(), /audio-busy/);
  await page.locator('#voiceReadBtn').click();
  assert.equal(await page.locator('#voiceReadBtn').getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#voiceStatus').innerText(), /on|Reading/i);
});

test('Enter defaults to newline', async t => {
  const { page, data } = await fixture(t);
  await open(page);
  await page.locator('#composerInput').fill('line one');
  await page.locator('#composerInput').press('End');
  await page.locator('#composerInput').press('Enter');
  assert.equal(await page.locator('#composerInput').inputValue(), 'line one\n');
  assert.equal(data.calls.filter(c => c.path.endsWith('/runs')).length, 0);
});

test('return from another app refreshes server history without losing the draft', async t => {
  const { page, data } = await fixture(t);
  await open(page);
  await page.locator('#composerInput').fill('thought while away');
  data.messages.c1.push({ id: 'later', role: 'assistant', round: 3, content: 'Saved while away', created_at: time, status: 'complete' });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('Saved while away'));
  assert.equal(await page.locator('#composerInput').inputValue(), 'thought while away');
  assert.equal(await page.locator('#chatTitle').innerText(), 'Saved conversation');
});

test('an upload finishing after navigation stays with its original conversation', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = await fixture(t, { handle: async ({ path, json }) => {
    if (path === '/api/attachments') {
      await gate; await json({ attachment: { id: 'a1', filename: 'notes.txt', mime: 'text/plain', status: 'ready' } }); return true;
    }
  } });
  await open(page);
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => /Uploading/.test(document.querySelector('#attachmentChips').textContent));
  await open(page, 'Other conversation');
  release(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#attachmentChips').innerText(), '');
  await open(page);
  assert.match(await page.locator('#attachmentChips').innerText(), /notes.txt.*Ready/);
});

test('failed delivery keeps its request identity on retry and preserves a newer draft', async t => {
  let first = true;
  const { page, data } = await fixture(t, { handle: async ({ path, route }) => {
    if (path.endsWith('/runs') && first) { first = false; await route.abort('failed'); return true; }
  } });
  await open(page);
  await page.locator('#composerInput').fill('retry this');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => !document.querySelector('#retryBar').classList.contains('hidden'));
  await page.locator('#composerInput').fill('next thought');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('retry this') && document.querySelectorAll('.response-group').length === 2);
  const sends = data.calls.filter(c => c.path.endsWith('/runs')).map(c => JSON.parse(c.body));
  assert.equal(sends.length, 2);
  assert.equal(sends[0].message.clientRequestId, sends[1].message.clientRequestId);
  assert.equal(sends[1].message.content, 'retry this');
  assert.equal(await page.locator('#composerInput').inputValue(), 'next thought');
});

test('storage failures leave menu and chat working and explain missing recovery', async t => {
  const { page, errors } = await fixture(t);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Fixture quota', 'QuotaExceededError'); }; });
  await open(page);
  await page.locator('#composerInput').fill('still editable');
  assert.equal(await page.locator('#composerInput').inputValue(), 'still editable');
  assert.match(await page.locator('#toast').innerText(), /draft storage is unavailable/);
  assert.deepEqual(errors, []);
});

test('a new conversation carries the unsent draft and file through creation', async t => {
  const { page, data } = await fixture(t, { empty: true });
  await page.locator('#composerInput').fill('first prompt');
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => /Ready/.test(document.querySelector('#attachmentChips').textContent));
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('First answer'));
  const sent = JSON.parse(data.calls.find(c => c.path.endsWith('/runs')).body);
  assert.equal(sent.message.content, 'first prompt');
  assert.deepEqual(sent.message.attachmentIds, ['a1']);
  assert.equal(data.conversations.length, 1);
});

test('a late history response cannot replace the newer selected conversation', async t => {
  let release, delayed = false;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = await fixture(t, { handle: async ({ path, json, data }) => {
    if (path === '/api/conversations/c1' && delayed) {
      delayed = false; await gate;
      await json({ conversation: data.conversations[0], messages: data.messages.c1, messageCount: 3 }); return true;
    }
  } });
  await open(page, 'Other conversation');
  delayed = true;
  await page.locator('#menuBtn').click();
  await page.getByRole('button', { name: 'Open conversation Saved conversation', exact: true }).click();
  await page.getByRole('button', { name: 'Open conversation Other conversation', exact: true }).click();
  release(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#chatTitle').innerText(), 'Other conversation');
});

test('late dictation results remain in the conversation where recording started', async t => {
  const { page } = await fixture(t);
  await open(page);
  await page.locator('#composerInput').fill('Original.');
  await page.locator('#voiceBtn').click();
  await open(page, 'Other conversation');
  await page.evaluate(() => __speech.recognition.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'Late transcript.' }], { isFinal: true })] }));
  assert.equal(await page.locator('#composerInput').inputValue(), '');
  await open(page);
  assert.equal(await page.locator('#composerInput').inputValue(), 'Original. Late transcript.');
});

test('long spoken answers are fully queued in bounded chunks and Stop ends playback', async t => {
  const { page, data } = await fixture(t);
  const text = Array(180).fill('word').join(' ');
  data.messages.c1[1].content = text;
  await open(page);
  await page.getByRole('button', { name: 'Speak this answer', exact: true }).first().click();
  const spoken = await page.evaluate(() => {
    for (let i = 0; i < 20 && !document.querySelector('#stopSpeechBtn').classList.contains('hidden'); i++) __speech.utterance.onend();
    return __speech.texts;
  });
  assert.equal(spoken.join(' '), text);
  assert.ok(spoken.every(chunk => chunk.length <= 200));
  await page.getByRole('button', { name: 'Speak this answer', exact: true }).first().click();
  await page.getByRole('button', { name: 'Stop reading', exact: true }).click();
  assert.equal(await page.locator('#stopSpeechBtn').isVisible(), false);
  assert.match(await page.locator('#voiceStatus').innerText(), /stopped/i);
});

test('definitively rejected attachments can be corrected and sent', async t => {
  const { page, data } = await fixture(t, { handle: async ({ path, req, json }) => {
    if (path.endsWith('/runs') && req.postDataJSON().message.attachmentIds.length > 1) {
      await json({ message: 'Too many attachments (fixture max 1)' }, 400); return true;
    }
  } });
  await open(page);
  await page.locator('#composerInput').fill('correct this upload');
  const file = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') };
  await page.locator('#fileInput').setInputFiles([file, file]);
  await page.waitForFunction(() => document.querySelectorAll('#attachmentChips .chip-x').length === 2);
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => /Too many attachments/.test(document.querySelector('#toast').textContent));
  await page.getByRole('button', { name: 'Remove notes.txt', exact: true }).first().click();
  await page.reload(); await page.waitForLoadState('networkidle');
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => document.querySelectorAll('.response-group').length === 2);
  const sends = data.calls.filter(c => c.path.endsWith('/runs')).map(c => JSON.parse(c.body));
  assert.equal(sends.length, 2);
  assert.equal(sends[1].message.attachmentIds.length, 1);
  assert.notEqual(sends[0].message.clientRequestId, sends[1].message.clientRequestId);
});

test('desktop carousel Next reveals the third answer with the sidebar visible', async t => {
  const { page, data } = await fixture(t);
  data.messages.c1.push({ ...data.messages.c1[2], id: 'm3', participant_id: 'p3', provider: 'xai', model: 'grok-4-fast', content: 'Third answer' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('button', { name: 'Open conversation Saved conversation', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.response-group .compare-pane').length === 3);
  await page.getByRole('button', { name: 'Next answer', exact: true }).click();
  await page.waitForFunction(() => {
    const track = document.querySelector('.response-group .compare-wrap');
    const last = track.lastElementChild.getBoundingClientRect();
    return track.scrollLeft > 400 && last.right <= track.getBoundingClientRect().right + 2;
  });
});

test('new chat creation transfers text and uploads entered while the request is pending', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { page } = await fixture(t, { empty: true, handle: async ({ path, req }) => {
    if (path === '/api/conversations' && req.method() === 'POST') await gate;
  } });
  await page.locator('#composerInput').fill('early thought');
  await page.locator('#menuBtn').click();
  await Promise.all([
    page.waitForRequest(req => new URL(req.url()).pathname === '/api/conversations' && req.method() === 'POST'),
    page.getByRole('button', { name: '＋ New conversation', exact: true }).click(),
  ]);
  await page.locator('#composerInput').fill('latest thought');
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => /Ready/.test(document.querySelector('#attachmentChips').textContent));
  release();
  await page.waitForFunction(() => location.hash.includes('conversation=c1'));
  assert.equal(await page.locator('#composerInput').inputValue(), 'latest thought');
  assert.match(await page.locator('#attachmentChips').innerText(), /notes.txt.*Ready/);
});

// Review regressions: synchronize on requests/events, not sleeps. All message
// identities and saved history below are inert fixtures, independent of app state.
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function failedSend(page) {
  await page.locator('#composerInput').fill('uncertain delivery');
  await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') });
  await page.waitForFunction(() => /Ready/.test(document.querySelector('#attachmentChips').textContent));
  await page.locator('#sendBtn').click();
  await page.waitForFunction(() => !document.querySelector('#retryBar').classList.contains('hidden'));
}

function saveUnconfirmed(req, data) {
  const message = req.postDataJSON().message;
  data.messages.c1.push({
    id: 'accepted-without-ack', role: 'user', content: message.content, round: 0,
    created_at: time, meta: { clientRequestId: message.clientRequestId },
    attachments: message.attachmentIds.map(id => ({ id, filename: 'notes.txt', mime: 'text/plain' })),
  });
}

for (const edited of [false, true]) test('acknowledged retry clears sent content and preserves newer edits: ' + edited, async t => {
  let first = true;
  const { page, data } = await fixture(t, { handle: async ({ path, req, route, data }) => {
    if (path.endsWith('/runs') && first) {
      first = false; saveUnconfirmed(req, data); await route.abort('failed'); return true;
    }
  } });
  await failedSend(page);
  if (edited) {
    await page.locator('#composerInput').fill('newer private thought');
    await page.locator('#fileInput').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('new fixture') });
    await page.waitForFunction(() => document.querySelectorAll('#attachmentChips .chip-x').length === 2);
  }
  await page.locator('#retryBtn').click();
  await page.waitForFunction(() => document.querySelector('#retryBar').classList.contains('hidden'));
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').inputValue(), edited ? 'newer private thought' : '');
  assert.equal(await page.locator('#attachmentChips .chip-x').count(), edited ? 1 : 0);
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').inputValue(), edited ? 'newer private thought' : '');
  await page.locator('#sendBtn').click();
  await page.waitForLoadState('networkidle');
  const sends = data.calls.filter(c => c.path.endsWith('/runs')).map(c => JSON.parse(c.body));
  assert.equal(sends.length, edited ? 2 : 1);
  if (edited) {
    assert.equal(sends[1].message.content, 'newer private thought');
    assert.deepEqual(sends[1].message.attachmentIds, ['a2']);
    assert.notEqual(sends[1].message.clientRequestId, sends[0].message.clientRequestId);
  }
  assert.equal(data.messages.c1.filter(m => m.content === 'uncertain delivery').length, 1);
});

for (const accepted of [false, true]) for (const returnBeforeReply of [false, true]) {
  test('delayed retry respects later navigation: accepted=' + accepted + ', return=' + returnBeforeReply, async t => {
    let first = true, delayHistory = false;
    const waiting = deferred(), release = deferred();
    t.after(() => release.resolve());
    const { page, data } = await fixture(t, { handle: async ({ path, req, route, data }) => {
      if (path.endsWith('/runs') && first) {
        first = false;
        if (accepted) saveUnconfirmed(req, data);
        await route.abort('failed'); return true;
      }
      if (path === '/api/conversations/c1' && delayHistory) {
        delayHistory = false; waiting.resolve(); await release.promise;
      }
    } });
    await failedSend(page);
    delayHistory = true;
    await page.locator('#retryBtn').click(); await waiting.promise;
    await open(page, 'Other conversation');
    await page.locator('#composerInput').fill('belongs to c2');
    if (returnBeforeReply) {
      await open(page);
      await page.locator('#composerInput').fill('new c1 edit');
    }
    release.resolve(); await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#chatTitle').innerText(), returnBeforeReply ? 'Saved conversation' : 'Other conversation');
    assert.equal(await page.locator('#composerInput').inputValue(), returnBeforeReply ? 'new c1 edit' : 'belongs to c2');
    assert.equal(await page.locator('#typingBar').isVisible(), false);
    assert.equal(await page.locator('#stopBtn').isVisible(), false);
    if (!returnBeforeReply) assert.equal(await page.locator('#messages').innerText(), '');
    assert.equal(data.calls.filter(c => c.path.endsWith('/runs')).length, 1);
    // The abandoned retry must keep its protected identity for a deliberate retry.
    const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem('a0.ui.v1:owner1')).pending.c1);
    assert.equal(pending.clientRequestId, JSON.parse(data.calls.find(c => c.path.endsWith('/runs')).body).message.clientRequestId);
    await open(page, 'Other conversation');
    assert.equal(await page.locator('#composerInput').inputValue(), 'belongs to c2');
  });
}

for (const restored of [false, true]) test('initialization never discards editable text: recovered=' + restored, async t => {
  const waiting = deferred(), release = deferred();
  t.after(() => release.resolve());
  const { page } = await fixture(t, {
    waitForReady: false, empty: !restored,
    beforeLoad: async ({ context }) => {
      if (restored) await context.addInitScript(() => sessionStorage.setItem('a0.ui.v1:owner1', JSON.stringify({
        conversationId: 'c1', drafts: { c1: { content: 'recovered thought', attachments: [] } },
      })));
    },
    handle: async ({ path }) => { if (path === '/api/providers') { waiting.resolve(); await release.promise; } },
  });
  await waiting.promise;
  const input = page.locator('#composerInput');
  const editable = await input.isVisible() && await input.isEnabled();
  if (editable) await input.fill('typed during initialization');
  release.resolve(); await page.waitForLoadState('networkidle');
  assert.equal(await input.inputValue(), editable ? 'typed during initialization' : restored ? 'recovered thought' : '');
  assert.equal(await input.isEnabled(), true);
  await input.fill('ready to compose');
  assert.equal(await input.inputValue(), 'ready to compose');
});

// A real local HTTP stream can end without a terminal event or lose its socket.
// This exercises the browser's fetch reader, not a replacement application parser.
function responseStream(t) {
  const path = '/fixture-stream/' + streamHandlers.size;
  const connected = deferred();
  let response;
  streamHandlers.set(path, res => {
    response = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.flushHeaders();
    res.write('event: run_start\ndata: ' + JSON.stringify({
      runId: 'disconnected-run', conversationId: 'c1',
      participants: [{ id: 'p1', name: 'DeepSeek', model: 'deepseek-chat' }],
    }) + '\n\n');
    connected.resolve(res);
  });
  t.after(() => { response?.destroy(); streamHandlers.delete(path); });
  return { path, connected: connected.promise };
}

for (const disconnect of ['eof', 'socket']) test('disconnected stream cannot revive Working or Stop: ' + disconnect, async t => {
  const stream = responseStream(t);
  const { page, data } = await fixture(t, { handle: async ({ path, req, route, data }) => {
    if (path.endsWith('/runs')) { saveUnconfirmed(req, data); await route.continue({ url: origin + stream.path }); return true; }
  } });
  await page.locator('#composerInput').fill('uncertain delivery');
  await page.locator('#sendBtn').click();
  const response = await stream.connected;
  await page.waitForFunction(() => !document.querySelector('#stopBtn').classList.contains('hidden'));
  if (disconnect === 'socket') await open(page, 'Other conversation');
  data.messages.c1.push({ id: 'completed-offline', role: 'assistant', content: 'Saved after disconnect', status: 'complete', round: 4, created_at: time });
  if (disconnect === 'socket') response.destroy(); else response.end();
  await page.waitForFunction(() => /Connection interrupted/.test(document.querySelector('#toast').textContent));
  await open(page);
  assert.match(await page.locator('#messages').innerText(), /Saved after disconnect/);
  assert.equal(await page.locator('#typingBar').isVisible(), false);
  assert.equal(await page.locator('#stopBtn').isVisible(), false);
  assert.equal(await page.locator('#retryBar').isVisible(), false);
  await open(page, 'Other conversation'); await open(page);
  assert.equal(await page.locator('#typingBar').isVisible(), false);
  assert.equal(await page.locator('#stopBtn').isVisible(), false);
});

test('Stop reconciles a run the server reports is no longer active', async t => {
  const stream = responseStream(t);
  const { page } = await fixture(t, { handle: async ({ path, route, json }) => {
    if (path.endsWith('/runs')) { await route.continue({ url: origin + stream.path }); return true; }
    if (path.endsWith('/stop')) { await json({ stopped: false }); return true; }
  } });
  await page.locator('#composerInput').fill('stop reconciliation');
  await page.locator('#sendBtn').click();
  const response = await stream.connected;
  await page.waitForFunction(() => !document.querySelector('#stopBtn').classList.contains('hidden'));
  await Promise.all([
    page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/stop')),
    page.locator('#stopBtn').click(),
  ]);
  assert.equal(await page.locator('#typingBar').isVisible(), false);
  assert.equal(await page.locator('#stopBtn').isVisible(), false);
  await open(page, 'Other conversation'); await open(page);
  assert.equal(await page.locator('#typingBar').isVisible(), false);
  response.end();
});

test('sign-out removes all recovery through pagehide and signing back into the same account', async t => {
  const { page } = await fixture(t, { handle: async ({ path, route }) => {
    if (path.endsWith('/runs')) { await route.abort('failed'); return true; }
  } });
  await failedSend(page);
  await open(page, 'Other conversation');
  await page.locator('#composerInput').fill('second private draft');
  await page.locator('#logoutBtn').click();
  await page.waitForFunction(() => !document.querySelector('#view-auth').classList.contains('hidden'));
  assert.deepEqual(await page.evaluate(() => [
    sessionStorage.getItem('a0.ui.v1:owner1'), localStorage.getItem('a0.ui.v1:owner1:last'),
  ]), [null, null]);
  await page.locator('#authUsername').fill('fixture');
  await page.locator('#authPassword').fill('inert-fixture-password');
  await page.locator('#authSubmit').click();
  await page.waitForFunction(() => !document.querySelector('#view-chat').classList.contains('hidden'));
  await page.waitForLoadState('networkidle');
  for (const title of ['Saved conversation', 'Other conversation']) {
    await open(page, title);
    assert.equal(await page.locator('#composerInput').inputValue(), '');
    assert.equal(await page.locator('#attachmentChips').innerText(), '');
    assert.equal(await page.locator('#retryBar').isVisible(), false);
  }
});

test('initial composer remains unavailable until saved conversation detail is restored', async t => {
  const waiting = deferred(), release = deferred();
  t.after(() => release.resolve());
  const { page } = await fixture(t, {
    waitForReady: false,
    handle: async ({ path }) => { if (path === '/api/conversations/c1') { waiting.resolve(); await release.promise; } },
  });
  await waiting.promise;
  for (const id of ['composerInput', 'attachBtn', 'voiceBtn', 'sendBtn']) {
    assert.equal(await page.locator('#' + id).isDisabled(), true, id + ' must wait for draft recovery');
  }
  release.resolve(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').isEnabled(), true);
  await page.locator('#composerInput').fill('written after recovery');
  await open(page, 'Other conversation'); await open(page);
  assert.equal(await page.locator('#composerInput').inputValue(), 'written after recovery');
});

test('failed sign-out reports the error and preserves the current recovery', async t => {
  const { page, errors } = await fixture(t, { handle: async ({ path, json }) => {
    if (path === '/api/auth/logout') { await json({ message: 'Fixture logout unavailable' }, 503); return true; }
  } });
  await page.locator('#composerInput').fill('keep until sign-out succeeds');
  await page.locator('#logoutBtn').click();
  await page.waitForFunction(() => /Could not sign out/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.locator('#composerInput').isEnabled(), true);
  assert.equal(await page.locator('#composerInput').inputValue(), 'keep until sign-out succeeds');
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').inputValue(), 'keep until sign-out succeeds');
  assert.deepEqual(errors, []);
});

for (const retry of [false, true]) test('stream completion preserves a pending newer navigation: retry=' + retry, async t => {
  const stream = responseStream(t);
  const waiting = deferred(), release = deferred();
  t.after(() => release.resolve());
  let first = true;
  const { page } = await fixture(t, { handle: async ({ path, route }) => {
    if (path.endsWith('/runs')) {
      if (retry && first) { first = false; await route.abort('failed'); return true; }
      await route.continue({ url: origin + stream.path }); return true;
    }
    if (path === '/api/conversations/c2') { waiting.resolve(); await release.promise; }
  } });
  if (retry) {
    await failedSend(page);
    await page.locator('#retryBtn').click();
  } else {
    await page.locator('#composerInput').fill('navigation while answering');
    await page.locator('#sendBtn').click();
  }
  const response = await stream.connected;
  await page.waitForFunction(() => !document.querySelector('#stopBtn').classList.contains('hidden'));
  await page.locator('#menuBtn').click();
  await page.getByRole('button', { name: 'Open conversation Other conversation', exact: true }).click();
  await waiting.promise;
  response.end('event: run_complete\ndata: {"runId":"disconnected-run","status":"complete"}\n\n');
  await page.waitForFunction(() => !document.querySelector('#sendBtn').disabled);
  release.resolve(); await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === 'Other conversation' &&
    document.querySelector('#menuBtn').getAttribute('aria-expanded') === 'false');
  assert.equal(await page.locator('#chatTitle').innerText(), 'Other conversation');
  assert.equal(await page.locator('#messages').innerText(), '');
  assert.equal(await page.locator('#typingBar').isVisible(), false);
});

test('late dictation follows the first draft into its adopted conversation', async t => {
  const { page, errors } = await fixture(t, { empty: true });
  await page.locator('#composerInput').fill('Typed first.');
  await page.locator('#voiceBtn').click();
  await page.locator('#menuBtn').click();
  await page.locator('#newChatBtn').click();
  await page.waitForFunction(() => location.hash === '#conversation=c1');
  await page.evaluate(() => __speech.recognition.onresult({ resultIndex: 0,
    results: [Object.assign([{ transcript: 'Final dictated words.' }], { isFinal: true })] }));
  assert.equal(await page.locator('#composerInput').inputValue(), 'Typed first. Final dictated words.');
  assert.equal(await page.evaluate(() => Object.hasOwn(JSON.parse(sessionStorage.getItem('a0.ui.v1:owner1')).drafts, 'new')), false);
  await page.reload(); await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('#composerInput').inputValue(), 'Typed first. Final dictated words.');
  assert.deepEqual(errors, []);
});

for (const pendingReturn of [false, true]) test('returned streaming conversation displays its final history: pending=' + pendingReturn, async t => {
  const stream = responseStream(t);
  const waiting = deferred(), release = deferred();
  t.after(() => release.resolve());
  let delayReturn = false;
  const { page, data, errors } = await fixture(t, { handle: async ({ path, req, route, json, data }) => {
    if (path.endsWith('/runs')) { saveUnconfirmed(req, data); await route.continue({ url: origin + stream.path }); return true; }
    if (path === '/api/conversations/c1' && delayReturn) {
      delayReturn = false;
      const snapshot = structuredClone({ conversation: data.conversations[0], messages: data.messages.c1, messageCount: data.messages.c1.length });
      waiting.resolve(); await release.promise;
      await json(snapshot); return true;
    }
  } });
  await page.locator('#composerInput').fill('finish after I return');
  await page.locator('#sendBtn').click();
  const response = await stream.connected;
  await page.waitForFunction(() => !document.querySelector('#stopBtn').classList.contains('hidden'));
  const answer = { id: 'return-answer', participant_id: 'p1', role: 'assistant', content: 'Partial on return', status: 'streaming', round: 4, created_at: time };
  data.messages.c1.push(answer);
  await open(page, 'Other conversation');
  if (pendingReturn) {
    delayReturn = true;
    await page.locator('#menuBtn').click();
    await page.getByRole('button', { name: 'Open conversation Saved conversation', exact: true }).click();
    await waiting.promise;
  } else {
    await open(page);
    assert.match(await page.locator('#messages').innerText(), /Partial on return/);
    await page.locator('#composerInput').fill('New thought while answering');
  }
  answer.content = 'Final answer after returning'; answer.status = 'complete';
  response.end('event: chunk\ndata: {"participantId":"p1","text":"Final answer after returning"}\n\n' +
    'event: run_complete\ndata: {"runId":"disconnected-run","status":"complete"}\n\n');
  await page.waitForFunction(() => !document.querySelector('#sendBtn').disabled);
  release.resolve(); await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelector('#chatTitle').textContent === 'Saved conversation' &&
    document.querySelector('#menuBtn').getAttribute('aria-expanded') === 'false');
  assert.equal(await page.locator('#chatTitle').innerText(), 'Saved conversation');
  assert.match(await page.locator('#messages').innerText(), /Final answer after returning/);
  assert.doesNotMatch(await page.locator('#messages').innerText(), /Partial on return/);
  assert.equal(await page.locator('#typingBar').isVisible(), false);
  assert.equal(await page.locator('#stopBtn').isVisible(), false);
  assert.equal(await page.locator('#composerInput').inputValue(), pendingReturn ? '' : 'New thought while answering');
  assert.deepEqual(errors, []);
});
