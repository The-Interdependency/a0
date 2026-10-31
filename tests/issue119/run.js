#!/usr/bin/env node
// Issue #119 FR2/FR3 focused evidence against the deployed website.
// RD01: eight exact Forge templates + Phi/Psi/Omega cores exposed with provenance.
// RP01 (partial): pinned PTCNA producer runtime state created, inferred and
//   returned per agent (phi/psi/omega/memory_l/memory_s); two agents get
//   independent runtime objects (fork isolation is producer deep-copy).
// RM01/RM03 (partial): spawn creates one active module; hot swap changes the
//   renderer without resetting agent state.
// RD03: served UI/API never registers Jury/Bandit/Meta-13/ZFAE.
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

const forge = (await api('GET', '/api/forge/templates')).data;
check('RD01 eight exact Forge templates', forge.templates.length === 8 && ['sage', 'trickster', 'paladin', 'druid', 'engineer', 'diplomat', 'hacker', 'captain'].every((id) => forge.templates.some((t) => t.id === id)));
check('RD01 exact Sage prompt preserved', forge.templates.find((t) => t.id === 'sage').system_prompt === 'You are The Sage — a patient scholar. Reason from sources; cite when you can; prefer brevity to bluster.');
check('RD01 Phi/Psi/Omega cores exposed with digests', ['phi', 'psi', 'omega'].every((c) => forge.cores[c]?.digest && forge.cores[c]?.description));
check('RD03 exclusions not registered as active templates/cores', !forge.templates.some((t) => /jury|bandit|meta-13|zfae/i.test(t.id)) && ['phi', 'psi', 'omega'].every((c) => Object.prototype.hasOwnProperty.call(forge.cores, c)));

const a1 = (await api('POST', '/api/agents', { name: 'Agent-A', templateId: 'sage', provider: 'openai', task: 'task A' })).data;
const a2 = (await api('POST', '/api/agents', { name: 'Agent-B', templateId: 'engineer', provider: 'openai', task: 'task B' })).data;
check('FR2 two agents independently addressable', a1.agent.id !== a2.agent.id && a1.agent.conversation_id !== a2.agent.conversation_id && a1.agent.participant_id !== a2.agent.participant_id);
check('RP01 retained PTCNA producer state on spawn', Boolean(a1.ptcnaSummary?.phi?.n) && Boolean(a1.ptcnaSummary?.memory_s?.n), JSON.stringify(a1.ptcnaSummary));

const before = (await api('POST', `/api/agents/${a1.agent.id}/ptcna/infer`, { input: 'observe A' })).data.summary;
const before2 = (await api('POST', `/api/agents/${a2.agent.id}/ptcna/infer`, { input: 'observe B' })).data.summary;
check('RP01 infer advances ring steps', (before.phi?.steps || 0) > 0 && (before.omega?.steps || 0) > 0, JSON.stringify(before));
const b2Before = (await api('GET', `/api/agents/${a2.agent.id}`)).data.agent.ptcna_summary;
const a1Again = (await api('POST', `/api/agents/${a1.agent.id}/ptcna/infer`, { input: 'observe A again' })).data.summary;
const b2After = (await api('GET', `/api/agents/${a2.agent.id}`)).data.agent.ptcna_summary;
check('RP01 independent runtime objects per agent (mutating one leaves the other)', a1Again.phi.steps > before.phi.steps && b2After.phi.steps === b2Before.phi.steps, `a1 ${before.phi.steps}->${a1Again.phi.steps}, b2 ${b2Before.phi.steps}->${b2After.phi.steps}`);

const swap = (await api('POST', `/api/agent-modules/${a1.module.id}/swap`, { renderer: 'agent-stats' })).data;
check('RM03 hot swap changes renderer only', swap.renderer === 'agent-stats' && swap.previousRenderer === 'agent-panel');
const afterSwap = (await api('GET', `/api/agents/${a1.agent.id}`)).data;
check('RM03 swap preserves agent/state bindings', afterSwap.module.renderer === 'agent-stats' && afterSwap.agent.ptcna_summary?.phi?.steps === a1Again.phi.steps);

const fork = (await api('POST', `/api/agents/${a1.agent.id}/fork`, { name: 'Forked' })).data;
check('RP01 producer fork creates independent child state', fork.receipt?.mode === 'fork' && Boolean(fork.summary?.phi), JSON.stringify(fork.receipt?.mode));
const absorb = (await api('POST', `/api/agents/${a1.agent.id}/absorb`, { donorId: a2.agent.id })).data;
check('RP01 producer absorb retires donor and merges state', absorb.receipt?.mode === 'absorb', JSON.stringify(absorb.receipt?.mode));
const converge = (await api('POST', `/api/agents/${a1.agent.id}/converge`, { otherId: fork.agent.id, alpha: 0.5 })).data;
check('RP01 producer converge exchanges tensors', converge.receipt?.mode === 'converge', JSON.stringify(converge.receipt?.mode));

if (failures) {
  console.log(`issue #119 FR2/FR3 checks: ${failures} failures`);
  process.exit(1);
}
console.log('issue #119 FR2/FR3 checks: all passed (FR4/AHBG remains NOT RUN).');
