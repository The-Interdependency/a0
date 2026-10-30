// Safe Markdown renderer for A0. Untrusted content (saved messages, streamed
// chunks, tool results) must stay inert: text is escaped first, links are
// rebuilt through validated protocols, and attribute values are escaped
// separately. The output is an HTML string used with innerHTML, so it is kept
// free of executable attributes; a Content-Security-Policy header is layered
// on top as defense in depth.
const ALLOWED_PROTOCOLS = new Set(['https:', 'http:']);

function escapeText(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(raw) {
  let url;
  try {
    url = new URL(String(raw));
  } catch {
    return null;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  return url.href;
}

function inline(text) {
  let t = escapeText(text);
  t = t.replace(/`([^`\n]+)`/g, (m, code) => `<code>${code}</code>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, href) => {
    const url = safeUrl(href);
    if (!url) return escapeText(label);
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return t;
}

export function renderMarkdown(text) {
  const source = String(text ?? '');
  const blocks = source.split(/(```[\s\S]*?```)/g);
  const out = [];
  for (const block of blocks) {
    if (block.startsWith('```')) {
      const code = block.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
      out.push(`<pre>${escapeText(code.replace(/\n$/, ''))}</pre>`);
    } else if (block.length) {
      const paras = block.split(/\n{2,}/).map((p) => `<p>${inline(p).replace(/\n/g, '<br>')}</p>`);
      out.push(paras.join(''));
    }
  }
  return out.join('');
}

// Adversarial fixtures for regression tests (inert markers only).
export const ADVERSARIAL_FIXTURES = [
  'hello',
  '[click](javascript:alert(1))',
  '[x](JaVaScRiPt:alert(1))',
  '[x](data:text/html,<script>alert(1)</script>)',
  '[x](https://example.com/ok)',
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '`<img src=x onerror=alert(1)>`',
  '```\n<script>alert(1)</script>\n```',
  '**bold** and *em* and `code`',
  '[a](https://e.com/" onmouseover="alert(1))',
  'onmouseover=alert(1)',
];
