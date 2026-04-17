#!/usr/bin/env node
// Lightweight regression guard for the console tab renderer.
//
// Why: The console tabs (Agents, CLI Keys, ...) silently regressed once
// because their tab_id was missing from the renderer switch and they fell
// through to a generic placeholder. This script catches that class of bug
// statically (registry vs API alignment) and at runtime (every system tab
// must either have schema-driven sections or a custom renderer).
//
// Run against a live dev server:
//   API_BASE=http://localhost:5000 node scripts/check-console-tabs.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_FILE = resolve(__dirname, "..", "client/src/pages/console.tsx");
const API_BASE = process.env.API_BASE || "http://localhost:5000";

function parseRegistry() {
  const raw = readFileSync(REGISTRY_FILE, "utf8");
  // Strip line and block comments before scanning so commented-out entries
  // are correctly treated as removed.
  const src = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const m = src.match(/CUSTOM_TAB_RENDERERS[^=]*=\s*\{([^}]+)\}/);
  if (!m) throw new Error("Could not find CUSTOM_TAB_RENDERERS in console.tsx");
  const body = m[1];
  const ids = [...body.matchAll(/(\w+)\s*:/g)].map((x) => x[1]);
  return new Set(ids);
}

async function fetchTabs() {
  const url = `${API_BASE}/api/v1/ui/structure`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json.tabs)) throw new Error("Response missing tabs[]");
  return json.tabs;
}

async function main() {
  const registry = parseRegistry();
  const tabs = await fetchTabs();

  const errors = [];
  const ok = [];

  for (const tab of tabs) {
    const id = tab.tab_id;
    const sections = Array.isArray(tab.sections) ? tab.sections : [];
    const hasCustom = registry.has(id);
    if (hasCustom) {
      ok.push(`  custom    ${id}`);
    } else if (sections.length > 0) {
      ok.push(`  generic   ${id} (${sections.length} sections)`);
    } else {
      errors.push(
        `  MISSING   ${id} -> no custom renderer and 0 sections; would render placeholder`
      );
    }
  }

  // Registry entries that no longer exist in the API are dead code (the
  // renderer is wired but the user can never reach the tab). Flag as a
  // warning rather than failure — this is a different class of bug than
  // a tab silently falling through to the generic placeholder.
  const apiIds = new Set(tabs.map((t) => t.tab_id));
  const orphans = [];
  for (const id of registry) {
    if (!apiIds.has(id)) orphans.push(id);
  }

  console.log(`Registered custom renderers: ${[...registry].join(", ")}`);
  console.log(`Tabs returned by API (${tabs.length}):`);
  ok.forEach((line) => console.log(line));

  if (orphans.length) {
    console.warn(
      `\nWARN — ${orphans.length} orphan renderer(s) (registered but not returned by API): ${orphans.join(", ")}`
    );
  }

  if (errors.length) {
    console.error("\nFAIL — broken console tabs detected:");
    errors.forEach((line) => console.error(line));
    process.exit(1);
  }
  console.log("\nOK — every tab returned by the API has a renderer.");
}

main().catch((err) => {
  console.error("check-console-tabs failed:", err.message);
  process.exit(2);
});
