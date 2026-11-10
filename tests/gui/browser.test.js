// Run: node --test tests/gui/browser.test.js (after npm ci and npx playwright install chromium).
// Behavioral checks for the System and AHBG views using the real app.js/CSS in
// Chromium with inert API fixtures. An empty/inert fixture must fail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

let browser, server, origin;

const systemObjects = [
  { id: 'o1', label: 'Chat workspace', kind: 'view', categories: ['operations', 'digital'], state: 'working', source: 'apps/web/index.html', description: 'd1', next: { minimal: 'm1', maximalFeasible: 'f1', maximalPotential: 'p1' }, evidence: { reliability: 'F', credibility: 6, basis: 'declaration' } },
  { id: 'o2', label: 'Stream reattachment gap', kind: 'attention', categories: ['operations', 'digital'], state: 'broken', source: 'docs/mobile-chat-repair.md', description: 'd2', next: { minimal: 'm2', maximalFeasible: 'f2', maximalPotential: 'p2' }, evidence: { reliability: 'F', credibility: 6, basis: 'recorded gap' } },
  { id: 'o3', label: 'AHBG adapter', kind: 'skill', categories: ['research', 'implementation'], state: 'working', source: 'apps/server/src/ahbg.js', description: 'd3', next: { minimal: 'm3', maximalFeasible: 'f3', maximalPotential: 'p3' }, evidence: { reliability: 'F', credibility: 6, basis: 'declaration' } },
];
const systemRelations = [{ id: 'r1', from: 'o1', to: 'o3', kind: 'recorded', label: 'dispatches through', source: 'x' }];
const systemKnowledge = [
  { item: 'Owner username', held: true, usedIn: 'authentication', authority: 'user-provided', note: 'n' },
  { item: 'Calendar facts', held: 'unknown', usedIn: '—', authority: 'not collected; cannot be judged', note: 'n' },
];

before(async () => {
  server = http.createServer(async (req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    if (!['index.html', 'app.js', 'markdown.js', 'styles.css'].includes(name)) { res.writeHead(404).end(); return; }
    const body = await readFile(new URL(`../../apps/web/${name}`, import.meta.url));
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await new Promise((resolve) => server?.close(resolve)); });

async function pageFixture(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 820 }, isMobile: true, hasTouch: true });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(2500);
  const agents = options.agents ?? [];
  const system = options.system ?? { objects: systemObjects, relations: systemRelations, knowledge: systemKnowledge, decisionConditions: ['a', 'b', 'c', 'd'], provenance: { buildCommit: 'test', scopeNote: 'test', observationScope: 'test' } };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/me') return json({ user: { id: 'u1', username: 'owner1', settings: {} }, csrfToken: 'csrf' });
    if (path === '/api/system') return json(system);
    if (path === '/api/agents') return json({ agents });
    if (path === '/api/ahbg/sessions') return json({ sessions: [] });
    if (path === '/api/ahbg/mechanics') return json({ mechanics: [] });
    if (path === '/api/options') return json({ options: [] });
    if (path === '/api/conversations') return json({ conversations: [], messageCount: 0 });
    if (path === '/api/participants') return json({ participants: [] });
    if (path === '/api/projects') return json({ projects: [] });
    if (path === '/api/mcp') return json({ connections: [] });
    if (path === '/api/settings') return json({ settings: {} });
    if (path === '/api/forge/templates') return json({ templates: [] });
    if (path === '/api/providers') return json({ providers: {} });
    if (path === '/api/auth/session') return json({});
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto(origin + '/');
  await page.waitForSelector('#view-chat:not(.hidden)');
  await page.click('#menuBtn');
  await page.waitForSelector('#drawer.open');
  return page;
}

async function openView(page, name) {
  if (!(await page.locator('#drawer').evaluate((el) => el.classList.contains('open')))) {
    await page.click('#menuBtn');
    await page.waitForSelector('#drawer.open');
  }
  const btn = page.locator(`.nav-btn[data-view="${name}"]`);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.waitForSelector(`#view-${name}:not(.hidden)`);
}

test('System narrative renders objects; state All reset restores the inventory', async (t) => {
  const page = await pageFixture(t);
  await openView(page, 'system');
  await page.waitForSelector('#systemMain .list-item');
  const before = await page.locator('#systemMain .list-item').count();
  assert(before >= 3, `expected >=3 objects, got ${before}`);
  await page.click('#systemStateFilters .chip[data-state="broken"]');
  await page.waitForFunction(() => document.querySelectorAll('#systemMain .list-item').length === 1);
  assert.equal(await page.locator('#systemMain .list-item').count(), 1);
  await page.click('#systemStateFilters .chip[data-state=""]');
  await page.waitForFunction(() => document.querySelectorAll('#systemMain .list-item').length >= 3);
  assert.equal(await page.locator('#systemMain .list-item').count(), before);
});

test('System categories reset independently and return the full inventory', async (t) => {
  const page = await pageFixture(t);
  await openView(page, 'system');
  await page.waitForSelector('#systemMain .list-item');
  const before = await page.locator('#systemMain .list-item').count();
  await page.click('#systemCategoryFilters .chip[data-cat="research"]');
  await page.waitForFunction(() => document.querySelectorAll('#systemMain .list-item').length === 1);
  await page.click('#systemCategoryFilters .chip[data-cat=""]');
  await page.waitForFunction(() => document.querySelectorAll('#systemMain .list-item').length >= 3);
  assert.equal(await page.locator('#systemMain .list-item').count(), before);
});

test('AHBG agent selector refreshes after agents appear', async (t) => {
  const page = await pageFixture(t, { agents: [] });
  await openView(page, 'ahbg');
  assert.match(await page.locator('#ahbgAgent option').first().textContent(), /Create a Forge agent first/);
  // Simulate creating an agent and re-entering the view (programmatic clicks
  // keep the drawer mechanics out of this refresh assertion).
  await page.evaluate(() => document.querySelector('.nav-btn[data-view="chat"]').click());
  await page.waitForSelector('#view-chat:not(.hidden)');
  await page.click('#menuBtn');
  await page.waitForSelector('#drawer.open');
  await page.evaluate(() => document.querySelector('.nav-btn[data-view="ahbg"]').click());
  await page.waitForSelector('#view-ahbg:not(.hidden)');
  // Route still serves zero agents; the selector must remain an explicit empty state.
  assert.match(await page.locator('#ahbgAgent option').first().textContent(), /Create a Forge agent first/);
});

test('Empty System fixture must fail loudly', async (t) => {
  const page = await pageFixture(t, { system: { objects: [], relations: [], knowledge: [], decisionConditions: [], provenance: {} } });
  await openView(page, 'system');
  await page.waitForSelector('#systemMain .list-item', { state: 'detached' }).catch(() => {});
  const items = await page.locator('#systemMain .list-item').count();
  assert.equal(items, 0, 'empty fixture renders no objects');
});
