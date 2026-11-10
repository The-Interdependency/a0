// DEFECT WITNESS: PASS reproduces the audited bug; this is not an acceptance gate.
// Original audited source: de66778dd1d9073f6a8b3d532e73514868f94e3c.
// See README.md for safe invocation, polarity, and conversion after repair.
import { sourcePath } from './audit-runtime.mjs';
import { pathToFileURL } from 'node:url';
// Audit witness only. Imports the unchanged repository gate with all fetches
// replaced by inert responses. No sockets, credentials, or production writes.
const areas = ['Provider/model', 'Context', 'Tools/web', 'Voice', 'Forge/retained agents', 'Temporary modules/AHBG'];
const json = (body, headers = {}) => new Response(JSON.stringify(body), {status: 200, headers: {'Content-Type': 'application/json', ...headers}});
const payload = {
  objects: [],
  relations: [],
  decisionConditions: ['resources nearing depletion', '', '', ''],
  knowledge: Array.from({length: 8}, () => ({authority: 'inferred', usedIn: true, held: false})),
  provenance: {buildCommit: 'not-a-commit', scopeNote: 'UCNS geometry'},
};
const fetches = [];
process.env.A0_PASSWORD = 'inert-audit-fixture';
globalThis.fetch = async (input, options) => {
  const url = new URL(input);
  fetches.push({path: url.pathname, method: options?.method || 'GET'});
  if (url.hostname !== '35.212.252.101.nip.io') throw new Error('Unexpected URL: ' + input);
  switch (url.pathname) {
    case '/api/auth/login': return json({}, {'Set-Cookie': 'fixture=local-only'});
    case '/api/me': return json({csrfToken: 'fixture-only'});
    case '/api/system': return json(payload);
    case '/api/options': return json({options: areas.map(area => ({area}))});
    case '/': return new Response('<!-- view-system systemTabs view-ahbg ahbgForm data-sysview="narrative" data-sysview="relations" data-sysview="attention" data-sysview="knowledge" -->');
    case '/app.js': return new Response('// Select intention (does not execute) ahbgMechanics\n');
    case '/styles.css': return new Response('/* .system-main .mini-table */');
    default: throw new Error('Unexpected URL: ' + input);
  }
};
console.log('COUNTEREXAMPLE: zero system objects, zero relations, no DOM controls, no behavior, options missing every contract field except area. All fetches are local mocks.');
await import(pathToFileURL(sourcePath('tests', 'gui', 'run.js')).href);
console.log('Mocked fetches:', JSON.stringify(fetches));
