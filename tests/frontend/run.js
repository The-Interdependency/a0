#!/usr/bin/env node
// F01 regression: the served Markdown renderer must keep adversarial fixtures
// inert. The assertion is structural: after removing the renderer's own
// allowed tags, no raw '<' may remain (so no injected tag/attribute survived),
// and anchor hrefs must never use executable protocols.
import { renderMarkdown, ADVERSARIAL_FIXTURES } from '../../apps/web/markdown.js';

const ALLOWED_TAG_RE = /<\/?(p|pre|code|strong|em|a|br)( [^>]*)?>/g;

function assertInert(html, fixture) {
  const stripped = html.replace(ALLOWED_TAG_RE, '');
  if (stripped.includes('<')) {
    return `raw tag survived: ${html}`;
  }
  const anchorMatch = html.match(/<a [^>]*href="([^"]*)"/g) || [];
  for (const anchor of anchorMatch) {
    if (/href="(javascript|data|vbscript):/i.test(anchor)) {
      return `executable href survived: ${anchor}`;
    }
  }
  return null;
}

let failures = 0;
for (const fixture of ADVERSARIAL_FIXTURES) {
  const html = renderMarkdown(fixture);
  const problem = assertInert(html, fixture);
  if (problem) {
    failures += 1;
    console.log(`FAIL fixture ${JSON.stringify(fixture)} → ${problem}`);
  } else {
    console.log(`PASS fixture ${JSON.stringify(fixture)} → inert`);
  }
}

// Safe link must still work.
const link = renderMarkdown('[example](https://example.com/ok)');
if (!link.includes('<a href="https://example.com/ok"')) {
  failures += 1;
  console.log('FAIL safe link was not preserved:', link);
} else {
  console.log('PASS safe link preserved:', link);
}

if (failures) {
  console.log(`F01 frontend renderer: ${failures} failures`);
  process.exit(1);
}
console.log('F01 frontend renderer: all adversarial fixtures inert; safe links preserved.');
