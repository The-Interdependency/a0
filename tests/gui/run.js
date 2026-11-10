#!/usr/bin/env node
// GUI handoff checks (G01-G14 surface): /api/system shape and integrity,
// options inventory presence, and served-source markers for the new views.
const BASE = 'https://35.212.252.101.nip.io';
const USERNAME = 'a0test';
const PASSWORD = process.env.A0_PASSWORD;
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

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

// G02/G03/G04 system payload
{
  const r = await api('GET', '/api/system');
  check('G02 /api/system served', r.status === 200 && Array.isArray(r.data?.objects), `status=${r.status}`);
  const d = r.data || {};
  const ids = new Set((d.objects || []).map((o) => o.id));
  check('G02 object identities unique', ids.size === (d.objects || []).length, `ids=${ids.size}`);
  check('G02 every relation endpoint resolves', (d.relations || []).every((rel) => ids.has(rel.from) && ids.has(rel.to)), 'unresolved endpoint found');
  check('G02 recorded/inferred relation kinds distinct', (d.relations || []).every((rel) => rel.kind === 'recorded' || rel.kind === 'inferred'));
  check('G03 every object has three next-step ranges', (d.objects || []).every((o) => o.next?.minimal && o.next?.maximalFeasible && o.next?.maximalPotential));
  check('G03 four action-decision conditions preserved', (d.decisionConditions || []).length === 4 && d.decisionConditions[0].includes('resources nearing depletion'));
  check('G04 knowledge entries have authority labels', (d.knowledge || []).length >= 8 && d.knowledge.every((k) => k.authority && k.usedIn));
  check('G04 not-held/inferred knowledge labeled', d.knowledge.some((k) => k.held === false) && d.knowledge.some((k) => String(k.authority).includes('inferred')));
  check('G02 state vocabulary distinct', (d.objects || []).every((o) => ['working', 'construction', 'broken', 'deprecated'].includes(o.state)));
  check('G02 provenance discloses freshness and scope', Boolean(d.provenance?.buildCommit) && /UCNS geometry/.test(d.provenance?.scopeNote || ''));
}

// G05/options inventory
{
  const r = await api('GET', '/api/options');
  check('Options inventory served', r.status === 200 && Array.isArray(r.data?.options), `status=${r.status}`);
  const areas = new Set((r.data?.options || []).map((o) => o.area));
  check('Options cover model/context/tools/voice/agents/AHBG areas', ['Provider/model', 'Context', 'Tools/web', 'Voice', 'Forge/retained agents', 'Temporary modules/AHBG'].every((a) => areas.has(a)), [...areas].join(','));
}

// Served-source markers for the new views
{
  const html = await (await fetch(`${BASE}/`)).text();
  const app = await (await fetch(`${BASE}/app.js`)).text();
  const css = await (await fetch(`${BASE}/styles.css`)).text();
  check('G02 System view served', html.includes('view-system') && html.includes('systemTabs'));
  check('G14 AHBG view served', html.includes('view-ahbg') && html.includes('ahbgForm'));
  check('G02 narrative/relations/attention tabs served', html.includes('data-sysview="narrative"') && html.includes('data-sysview="relations"') && html.includes('data-sysview="attention"'));
  check('G04 knowledge tab served', html.includes('data-sysview="knowledge"'));
  check('G03 intention never executes', app.includes('Select intention (does not execute)'));
  check('G14 mechanics matrix rendered', app.includes('ahbgMechanics'));
  check('System/AHBG styling present', css.includes('.system-main') && css.includes('.mini-table'));
}

if (failures) {
  console.log(`GUI handoff checks: ${failures} failures`);
  process.exit(1);
}
console.log('GUI handoff checks: all passed.');
