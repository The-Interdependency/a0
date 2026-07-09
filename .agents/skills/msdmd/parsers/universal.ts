// ratios: loc_comments=176:0 imports_exports=2:0 calls_definitions=53:0
/**
 * Universal msdmd parser — pure Node stdlib (fs, path).
 *
 * TypeScript counterpart to parsers/universal.py. Implements the
 * parser contract from msdmd/SKILL.md: extracts every
 * `// === <BLOCK_NAME> ===` … `// === END <BLOCK_NAME> ===` block
 * from a source file and returns its entries as flat objects.
 *
 * Comment marker auto-detected by file extension. The block syntax
 * itself is identical across languages; only the per-line marker
 * changes.
 *
 * RATIOS is the one msdmd declaration that is not a fenced block — it is a
 * single comment line on a file's first and last non-blank lines. Its reader
 * (parseRatios / parseRatiosFile / ratiosPlacement) lives here too, as a
 * sanctioned extension rather than a fork.
 *
 * Zero non-stdlib dependencies. Safe to copy verbatim into any
 * Node/Deno/Bun project that wants msdmd support.
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

export type Entry = Record<string, string>;

const MARKERS: Record<string, string> = {
  ".py": "#", ".rb": "#", ".ex": "#", ".exs": "#", ".sh": "#",
  ".ts": "//", ".tsx": "//", ".js": "//", ".jsx": "//", ".mjs": "//",
  ".rs": "//", ".go": "//", ".java": "//", ".c": "//", ".cpp": "//",
  ".cc": "//", ".h": "//", ".hpp": "//", ".swift": "//", ".kt": "//",
  ".sql": "--", ".lua": "--", ".hs": "--",
};

const DEFAULT_SKIP = new Set([
  "__pycache__", "node_modules", ".git", ".venv", "venv",
  "dist", "build", ".next", ".nuxt", "target", ".pytest_cache",
  ".mypy_cache", ".tox",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function markerFor(path: string): string | null {
  return MARKERS[extname(path).toLowerCase()] ?? null;
}

export function parseText(
  text: string,
  blockName: string,
  marker: string = "#",
): Entry[] {
  const m = escapeRegex(marker);
  const name = escapeRegex(blockName);
  const blockRe = new RegExp(
    `^${m} === ${name} ===\\s*$([\\s\\S]*?)^${m} === END ${name} ===\\s*$`,
    "gm",
  );
  const idRe = new RegExp(`^\\s*${m}\\s*id:\\s*(\\S+)\\s*$`);
  const fieldRe = new RegExp(`^\\s*${m}\\s+([a-z_]+):\\s*(.+?)\\s*$`);

  const entries: Entry[] = [];
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(text)) !== null) {
    const body = match[1];
    let current: Entry | null = null;
    for (const rawLine of body.split("\n")) {
      const line = rawLine.replace(/\s+$/, "");
      const mid = idRe.exec(line);
      if (mid) {
        if (current !== null) entries.push(current);
        current = { id: mid[1] };
        continue;
      }
      if (current === null) continue;
      const mf = fieldRe.exec(line);
      if (mf) current[mf[1]] = mf[2];
    }
    if (current !== null) entries.push(current);
  }
  return entries;
}

export function parseFile(path: string, blockName: string): Entry[] {
  const marker = markerFor(path);
  if (marker === null) return [];
  try {
    return parseText(readFileSync(path, "utf-8"), blockName, marker);
  } catch {
    return [];
  }
}

export interface WalkOptions {
  skip?: Set<string>;
  extensions?: Set<string>;
}

export function walkTree(
  root: string,
  blockName: string,
  opts: WalkOptions = {},
): { annotated: Array<[string, Entry[]]>; untested: string[] } {
  const skip = opts.skip ?? DEFAULT_SKIP;
  const extensions =
    opts.extensions ?? new Set(Object.keys(MARKERS));

  const annotated: Array<[string, Entry[]]> = [];
  const untested: string[] = [];

  function visit(dir: string): void {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (skip.has(name)) continue;
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        visit(full);
      } else if (st.isFile()) {
        if (!extensions.has(extname(full).toLowerCase())) continue;
        const entries = parseFile(full, blockName);
        if (entries.length > 0) {
          annotated.push([full, entries]);
        } else {
          untested.push(full);
        }
      }
    }
  }

  visit(root);
  return { annotated, untested };
}

// --- RATIOS single-line declaration (msdmd extension) --------------------
// Unlike every other declaration, RATIOS is not fenced. It is a single
// comment line carrying the three canonical ratios, placed on the file's
// first and last non-blank lines:
//   <marker> ratios: loc_comments=N:M imports_exports=N:M calls_definitions=N:M
export const RATIO_IDS = ["loc_comments", "imports_exports", "calls_definitions"] as const;

function ratiosLineRe(marker: string): RegExp {
  return new RegExp(`^${escapeRegex(marker)}\\s*ratios:\\s*(.+?)\\s*$`);
}

export function parseRatios(text: string, marker: string = "#"): Entry[] {
  const lineRe = ratiosLineRe(marker);
  const tokenRe = /([a-z_]+)=(\S+)/g;
  const out: Entry[] = [];
  for (const raw of text.split("\n")) {
    const lm = lineRe.exec(raw.replace(/\s+$/, ""));
    if (!lm) continue;
    let tm: RegExpExecArray | null;
    tokenRe.lastIndex = 0;
    while ((tm = tokenRe.exec(lm[1])) !== null) {
      out.push({ id: tm[1], value: tm[2] });
    }
  }
  return out;
}

export function parseRatiosFile(path: string): Entry[] {
  const marker = markerFor(path);
  if (marker === null) return [];
  try {
    return parseRatios(readFileSync(path, "utf-8"), marker);
  } catch {
    return [];
  }
}

export function ratiosPlacement(text: string, marker: string = "#"): [boolean, boolean] {
  const lineRe = ratiosLineRe(marker);
  const lines = text.split("\n");
  if (lines.length === 0) return [false, false];
  const firstOk = lineRe.test(lines[0].replace(/\s+$/, ""));
  let lastOk = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    lastOk = lineRe.test(lines[i].replace(/\s+$/, ""));
    break;
  }
  return [firstOk, lastOk];
}
// ratios: loc_comments=176:0 imports_exports=2:0 calls_definitions=53:0
