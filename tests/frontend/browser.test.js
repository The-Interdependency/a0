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
before(async () => {
  server = http.createServer(async (req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    if (!['index.html', 'app.js', 'markdown.js', 'styles.css', 'manifest.json'].includes(name)) {
      res.writeHead(404).end(); return;
    }
    const body = await readFile(process.env.A0_TEST_WEB_ROOT ? join(process.env.A0_TEST_WEB_ROOT, name) : new URL(`../../apps/web/${name}`, import.meta.url));
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
    owner: 'owner1', settings: {}, calls: [], uploads: 0,
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
    if (path === '/api/me') return json({ user: { id: data.owner, username: 'fixture' }, csrfToken: 'fixture-csrf' });
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
  await page.goto(origin);
  await page.waitForLoadState('networkidle');
  return { page, data, errors, context };
}

async function open(page, title = 'Saved conversation') {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('button', { name: `Open conversation ${title}`, exact: true }).click();
  await page.waitForFunction(title => document.querySelector('#chatTitle').textContent === title, title);
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
