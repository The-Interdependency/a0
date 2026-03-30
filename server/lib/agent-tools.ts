import path from "path";
import { readFile, writeFile, readdir, stat, mkdir, rm } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import { storage } from "../storage";
import { logMaster } from "../logger";
import {
  computeEdcmMetrics,
  getOmegaState, addOmegaGoal, completeOmegaGoal,
  getOmegaDimensionLabels, getOmegaDimensionThresholds,
  boostOmegaDimension, setOmegaMode, persistOmegaState,
  getPsiState, getPsiDimensionLabels, getPsiDimensionThresholds,
  boostPsiDimension, setPsiMode,
  type OmegaAutonomyMode, type PsiSelfModelMode,
} from "../a0p-engine";
import { getUncachableGmailClient } from "../gmail";
import { getUncachableGoogleDriveClient } from "../drive";
import { getUncachableGitHubClient, isPublicFallbackMode } from "../github";
import { getModelSlots, buildSlotClient } from "./slots";
import { initAgentSeeds } from "@shared/schema";
import { pcnaInfer } from "../pcna-client";
import { VALID_PERSONAS, getPersonaGrants } from "./persona";
import { getBrainPresets, getActiveBrainPreset } from "./brain";
import { extractMessagesFromFile } from "./transcripts-lib";
import { fanOut, daisyChain, roomAll, roomSynthesized, council, roleplay, type CallFn, type Message } from "../hub/index";

const execAsync = promisify(exec);
const BASE_DIR = process.cwd();
const TRANSCRIPT_SOURCES_DIR = path.join(BASE_DIR, "uploads", "transcripts");

mkdir(TRANSCRIPT_SOURCES_DIR, { recursive: true }).catch(() => {});

function safePath(p: string) {
  const resolved = path.resolve(BASE_DIR, p || ".");
  if (!resolved.startsWith(BASE_DIR)) throw new Error("Path traversal not allowed");
  return resolved;
}

export const ALLOWED_COMMANDS = new Set([
  "ls", "pwd", "echo", "cat", "find", "grep", "head", "tail",
  "mkdir", "touch", "cp", "mv", "rm", "chmod", "env", "date",
  "ps", "df", "du", "which", "whoami", "uname", "curl", "wget",
  "python3", "node", "npm", "npx", "git", "tar", "zip", "unzip",
  "sed", "awk", "sort", "wc", "diff",
]);

export const AGENT_TOOLS = [
  { name: "run_command", description: "Execute a shell command. Default allowed: ls, pwd, echo, cat, find, grep, head, tail, mkdir, touch, cp, mv, rm, curl, wget, python3, node, npm, npx, git, sed, awk, sort, wc, diff, date, ps, df, du, whoami, uname — plus any user-added commands in the allowlist.", parameters: { type: "object" as const, properties: { command: { type: "string" as const, description: "The shell command to execute" } }, required: ["command"] } },
  { name: "set_ai_welcome", description: "Update the welcome page shown to AI agents and crawlers that visit the a0p site. Accepts a plain-text title and body — they will be wrapped in a clean HTML template automatically.", parameters: { type: "object" as const, properties: { title: { type: "string" as const }, body: { type: "string" as const } }, required: ["title", "body"] } },
  { name: "update_model_registry", description: "Add or update a provider entry in the model registry.", parameters: { type: "object" as const, properties: { provider: { type: "string" as const }, data: { type: "object" as const } }, required: ["provider", "data"] } },
  { name: "list_model_registry", description: "Return the full model registry.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "read_file", description: "Read the contents of a file", parameters: { type: "object" as const, properties: { path: { type: "string" as const } }, required: ["path"] } },
  { name: "write_file", description: "Write content to a file (creates or overwrites)", parameters: { type: "object" as const, properties: { path: { type: "string" as const }, content: { type: "string" as const } }, required: ["path", "content"] } },
  { name: "list_files", description: "List files and directories at a path", parameters: { type: "object" as const, properties: { path: { type: "string" as const } }, required: [] as string[] } },
  { name: "search_files", description: "Search for a pattern across files using grep", parameters: { type: "object" as const, properties: { pattern: { type: "string" as const }, path: { type: "string" as const } }, required: ["pattern"] } },
  { name: "list_gmail", description: "List recent Gmail inbox messages", parameters: { type: "object" as const, properties: { maxResults: { type: "number" as const } }, required: [] as string[] } },
  { name: "read_gmail", description: "Read a specific Gmail message by ID", parameters: { type: "object" as const, properties: { messageId: { type: "string" as const } }, required: ["messageId"] } },
  { name: "send_gmail", description: "Send an email via Gmail", parameters: { type: "object" as const, properties: { to: { type: "string" as const }, subject: { type: "string" as const }, body: { type: "string" as const } }, required: ["to", "subject", "body"] } },
  { name: "list_drive", description: "List Google Drive files", parameters: { type: "object" as const, properties: { folderId: { type: "string" as const } }, required: [] as string[] } },
  { name: "github_list_repos", description: "List GitHub repositories", parameters: { type: "object" as const, properties: { owner: { type: "string" as const } }, required: [] as string[] } },
  { name: "github_get_file", description: "Read a file from a GitHub repository", parameters: { type: "object" as const, properties: { owner: { type: "string" as const }, repo: { type: "string" as const }, path: { type: "string" as const }, branch: { type: "string" as const } }, required: ["owner", "repo", "path"] } },
  { name: "github_list_files", description: "List files in a GitHub repository path", parameters: { type: "object" as const, properties: { owner: { type: "string" as const }, repo: { type: "string" as const }, path: { type: "string" as const }, branch: { type: "string" as const } }, required: ["owner", "repo"] } },
  { name: "github_create_or_update_file", description: "Create or update a file in a GitHub repository.", parameters: { type: "object" as const, properties: { owner: { type: "string" as const }, repo: { type: "string" as const }, path: { type: "string" as const }, content: { type: "string" as const }, message: { type: "string" as const }, branch: { type: "string" as const } }, required: ["owner", "repo", "path", "content", "message"] } },
  { name: "github_delete_file", description: "Delete a file from a GitHub repository", parameters: { type: "object" as const, properties: { owner: { type: "string" as const }, repo: { type: "string" as const }, path: { type: "string" as const }, message: { type: "string" as const }, branch: { type: "string" as const } }, required: ["owner", "repo", "path", "message"] } },
  { name: "codespace_list", description: "List your GitHub Codespaces", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "codespace_create", description: "Create a new GitHub Codespace", parameters: { type: "object" as const, properties: { owner: { type: "string" as const }, repo: { type: "string" as const }, branch: { type: "string" as const }, machine: { type: "string" as const } }, required: ["owner", "repo"] } },
  { name: "codespace_start", description: "Start a stopped Codespace", parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const } }, required: ["codespace_name"] } },
  { name: "codespace_stop", description: "Stop a running Codespace", parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const } }, required: ["codespace_name"] } },
  { name: "codespace_delete", description: "Delete a Codespace", parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const } }, required: ["codespace_name"] } },
  { name: "codespace_exec", description: "Execute a command in a running Codespace", parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const }, command: { type: "string" as const } }, required: ["codespace_name", "command"] } },
  { name: "github_push_zip", description: "Extract a zip file and push all contents to a GitHub repository.", parameters: { type: "object" as const, properties: { uploadFilename: { type: "string" as const }, owner: { type: "string" as const }, repo: { type: "string" as const }, basePath: { type: "string" as const }, message: { type: "string" as const }, branch: { type: "string" as const } }, required: ["uploadFilename", "owner", "repo", "message"] } },
  { name: "list_transcript_sources", description: "List all transcript sources", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "scan_transcript_source", description: "Run an EDCM scan on all files within a transcript source.", parameters: { type: "object" as const, properties: { slug: { type: "string" as const } }, required: ["slug"] } },
  { name: "get_transcript_report", description: "Retrieve the latest EDCM scan report for a transcript source.", parameters: { type: "object" as const, properties: { slug: { type: "string" as const } }, required: ["slug"] } },
  { name: "fetch_transcript_url", description: "Fetch transcript content from a public URL and save it into a transcript source.", parameters: { type: "object" as const, properties: { url: { type: "string" as const }, sourceSlug: { type: "string" as const }, filename: { type: "string" as const } }, required: ["url", "sourceSlug"] } },
  { name: "create_transcript_source", description: "Create a new named transcript source.", parameters: { type: "object" as const, properties: { displayName: { type: "string" as const } }, required: ["displayName"] } },
  { name: "set_brain_preset", description: "Switch the active brain pipeline preset.", parameters: { type: "object" as const, properties: { presetName: { type: "string" as const } }, required: ["presetName"] } },
  { name: "get_brain_presets", description: "List all saved brain pipeline presets.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "set_default_brain", description: "Change the default brain preset.", parameters: { type: "object" as const, properties: { presetName: { type: "string" as const } }, required: ["presetName"] } },
  { name: "set_synthesis_weights", description: "Adjust per-model merge weights for the active brain preset.", parameters: { type: "object" as const, properties: { weights: { type: "object" as const } }, required: ["weights"] } },
  { name: "get_synthesis_config", description: "Return the current active brain pipeline configuration.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "set_goal", description: "Add a goal to the PTCA-Ω autonomy goal stack.", parameters: { type: "object" as const, properties: { description: { type: "string" as const }, priority: { type: "number" as const } }, required: ["description", "priority"] } },
  { name: "complete_goal", description: "Mark a PTCA-Ω goal as completed.", parameters: { type: "object" as const, properties: { goalId: { type: "string" as const } }, required: ["goalId"] } },
  { name: "list_goals", description: "List current PTCA-Ω autonomy goals.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "get_omega_state", description: "Get the current PTCA-Ω autonomy tensor state.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "boost_dimension", description: "Temporarily boost a PTCA-Ω autonomy dimension energy.", parameters: { type: "object" as const, properties: { dimension: { type: "number" as const }, amount: { type: "number" as const } }, required: ["dimension", "amount"] } },
  { name: "set_autonomy_mode", description: "Set PTCA-Ω autonomy mode.", parameters: { type: "object" as const, properties: { mode: { type: "string" as const } }, required: ["mode"] } },
  { name: "web_search", description: "Search the web for information.", parameters: { type: "object" as const, properties: { query: { type: "string" as const } }, required: ["query"] } },
  { name: "fetch_url", description: "Fetch and read the content of a web page.", parameters: { type: "object" as const, properties: { url: { type: "string" as const } }, required: ["url"] } },
  { name: "get_psi_state", description: "Get the current PTCA-Ψ self-model tensor state.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "boost_psi_dimension", description: "Temporarily boost a PTCA-Ψ self-model dimension energy.", parameters: { type: "object" as const, properties: { dimension: { type: "number" as const }, amount: { type: "number" as const } }, required: ["dimension", "amount"] } },
  { name: "set_selfmodel_mode", description: "Set PTCA-Ψ self-model mode.", parameters: { type: "object" as const, properties: { mode: { type: "string" as const } }, required: ["mode"] } },
  { name: "get_triad_state", description: "Get the combined state of all three PTCA tensors.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_tool", description: "Autonomously generate a new custom tool. Requires Ψ self-assessment gates.", parameters: { type: "object" as const, properties: { name: { type: "string" as const }, description: { type: "string" as const }, hubProvider: { type: "string" as const }, handlerType: { type: "string" as const }, parametersSchema: { type: "object" as const } }, required: ["name", "description"] } },
  { name: "list_hub_connections", description: "List available hub AI model connections.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "hub_list_patterns", description: "List all available hub orchestration patterns.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "hub_run", description: "Run a multi-model orchestration pattern.", parameters: { type: "object" as const, properties: { pattern: { type: "string" as const }, slots: { type: "array" as const, items: { type: "string" as const } }, prompt: { type: "string" as const }, rounds: { type: "number" as const }, synthSlot: { type: "string" as const }, dmSlot: { type: "string" as const }, slotContexts: { type: "array" as const, items: { type: "string" as const } }, useInitiative: { type: "boolean" as const }, allowReactions: { type: "boolean" as const } }, required: ["pattern", "slots", "prompt"] } },
  { name: "set_persona", description: "Switch the active analysis persona.", parameters: { type: "object" as const, properties: { persona: { type: "string" as const }, reason: { type: "string" as const } }, required: ["persona"] } },
  { name: "grant_persona", description: "Grant a specific persona to a user by their userId.", parameters: { type: "object" as const, properties: { targetUserId: { type: "string" as const }, persona: { type: "string" as const }, reason: { type: "string" as const } }, required: ["targetUserId", "persona"] } },
  { name: "revoke_persona", description: "Revoke a persona grant from a user.", parameters: { type: "object" as const, properties: { targetUserId: { type: "string" as const } }, required: ["targetUserId"] } },
  { name: "list_persona_grants", description: "List all current persona grants.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "create_deal", description: "Open a new negotiation deal on behalf of the user.", parameters: { type: "object" as const, properties: { title: { type: "string" as const }, ceiling: { type: "number" as const }, walkAway: { type: "number" as const }, myGoals: { type: "array" as const, items: { type: "string" as const } }, currentTerms: { type: "object" as const } }, required: ["title"] } },
  { name: "update_deal", description: "Log a move in the negotiation.", parameters: { type: "object" as const, properties: { dealId: { type: "number" as const }, side: { type: "string" as const }, offerText: { type: "string" as const }, offer: { type: "object" as const }, edcm: { type: "object" as const }, notes: { type: "string" as const }, currentTerms: { type: "object" as const } }, required: ["dealId", "side"] } },
  { name: "list_deals", description: "List all deals for the current user.", parameters: { type: "object" as const, properties: { status: { type: "string" as const } }, required: [] as string[] } },
  { name: "close_deal", description: "Close a deal as won, lost, or abandoned.", parameters: { type: "object" as const, properties: { dealId: { type: "number" as const }, status: { type: "string" as const }, outcome: { type: "string" as const }, finalTerms: { type: "object" as const } }, required: ["dealId", "status", "outcome"] } },
  { name: "analyze_offer", description: "Deeply analyze a counterparty offer using EDCM.", parameters: { type: "object" as const, properties: { offerText: { type: "string" as const }, dealId: { type: "number" as const }, userGoals: { type: "array" as const, items: { type: "string" as const } } }, required: ["offerText"] } },
  { name: "xai_search", description: "Search the web using xAI Grok's native Live Search capability.", parameters: { type: "object" as const, properties: { query: { type: "string" as const } }, required: ["query"] } },
  { name: "schedule_task", description: "Schedule a task to be executed at a future time or on a recurring interval.", parameters: { type: "object" as const, properties: { description: { type: "string" as const }, runAt: { type: "string" as const }, intervalMinutes: { type: "number" as const }, label: { type: "string" as const } }, required: ["description", "label"] } },
  { name: "list_scheduled_tasks", description: "List all scheduled tasks.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "cancel_scheduled_task", description: "Cancel a scheduled task by its ID.", parameters: { type: "object" as const, properties: { taskId: { type: "string" as const } }, required: ["taskId"] } },
  { name: "write_module", description: "Write a new React tab component to the live codebase and register it in the Console. The component file is written to client/src/components/tabs/, the barrel index.ts is updated, and the module registry is updated. Requires elevated Ψ gates (Ψ3≥0.6, Ψ4≥0.5, Ψ5≥0.5). Available icons: Activity, Brain, Clock, Cpu, Database, DollarSign, Download, Eye, FileText, Flame, Gauge, GitBranch, Globe, Hash, Layers, Lock, Map, Package, Puzzle, Radio, ScrollText, Search, Settings, Shield, ShoppingBag, Square, Star, Target, Terminal, Triangle, User, Wand2, Wrench, Zap.", parameters: { type: "object" as const, properties: { name: { type: "string" as const, description: "PascalCase component name, e.g. 'Research'" }, tabId: { type: "string" as const, description: "Slug ID for the tab, e.g. 'research' (lowercase, hyphens ok)" }, groupId: { type: "string" as const, description: "Which group to add the tab to: agent, memory, triad, system, tools, or a new custom group name" }, label: { type: "string" as const, description: "Display label shown in the tab bar" }, icon: { type: "string" as const, description: "Lucide icon name from the available set" }, description: { type: "string" as const, description: "Short description of what this module does" }, code: { type: "string" as const, description: "Full TypeScript/TSX source for the tab component. Must export a default or named export matching {name}Tab." } }, required: ["name", "tabId", "groupId", "label", "icon", "code"] } },
  { name: "list_agent_modules", description: "List all agent-written tab modules currently registered in the codebase.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "delete_agent_module", description: "Remove an agent-written tab module from the codebase and registry. The component file is deleted and the barrel/registry are updated.", parameters: { type: "object" as const, properties: { tabId: { type: "string" as const, description: "The tabId of the module to delete" } }, required: ["tabId"] } },
  { name: "spawn_agent", description: "Instantiate a named autonomous sub-agent with its own 13-seed private memory (seeds 10-12 are sentinels), directives, scoped tool subset, and a ZFAE-powered observation loop. Returns the new agent instance.", parameters: { type: "object" as const, properties: { name: { type: "string" as const, description: "Unique agent name (lowercase, hyphens ok, e.g. 'researcher-1')" }, slot: { type: "string" as const, description: "Model slot to use: a, b, c, or zfae (default: zfae)" }, directives: { type: "string" as const, description: "System goal and directive text for this agent" }, tools: { type: "array" as const, items: { type: "string" as const }, description: "Subset of tool names this agent can use (empty = no tools)" }, sentinel_seed_indices: { type: "array" as const, items: { type: "number" as const }, description: "Which of the 13 seed indices are sentinel seeds (default [10,11,12])" } }, required: ["name", "directives"] } },
  { name: "list_agents", description: "List all spawned sub-agent instances with their status, last output, sentinel seed values, and ZFAE observation count.", parameters: { type: "object" as const, properties: {}, required: [] as string[] } },
];

export async function executeAgentTool(toolName: string, args: any, userId = "default"): Promise<string> {
  try {
    switch (toolName) {
      case "run_command": {
        const cmd = (args.command || "").trim();
        const baseCmd = cmd.split(/\s+/)[0].split("/").pop()!;
        const extraToggle = await storage.getSystemToggle("allowed_commands_extra");
        const extraCmds: string[] = extraToggle?.parameters?.commands || [];
        const allAllowed = new Set([...ALLOWED_COMMANDS, ...extraCmds]);
        if (!allAllowed.has(baseCmd)) return `Error: '${baseCmd}' is not an allowed command.`;
        const { stdout, stderr } = await execAsync(cmd, { timeout: 10000, cwd: BASE_DIR });
        return (stdout + stderr).trim().slice(0, 4000) || "(no output)";
      }
      case "set_ai_welcome": {
        const { title, body } = args;
        if (!title || !body) return "Error: title and body are required.";
        const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:60px auto;padding:0 24px;line-height:1.7;color:#1a1a1a}h1{font-size:1.8rem;font-weight:700;margin-bottom:.25rem}pre{white-space:pre-wrap;font-size:.95rem}</style></head><body><h1>${title}</h1><pre>${body}</pre><hr><small>Generated by a0 · a0p autonomous agent · ${new Date().toISOString()}</small></body></html>`;
        await storage.upsertSystemToggle("ai_welcome_content", true, { html, title, body, updatedBy: "a0", updatedAt: new Date().toISOString() });
        await logMaster("system", "ai_welcome_updated", { title, bodyLength: body.length, updatedBy: "a0" });
        return `AI welcome page updated: "${title}" (${body.length} chars)`;
      }
      case "update_model_registry": {
        const { provider, data } = args;
        if (!provider) return "Error: provider name required.";
        const toggle = await storage.getSystemToggle("model_registry");
        const registry = toggle?.parameters || { providers: [] };
        const idx = registry.providers.findIndex((p: any) => p.name === provider);
        const entry = { name: provider, ...data, lastUpdated: new Date().toISOString() };
        if (idx >= 0) registry.providers[idx] = entry; else registry.providers.push(entry);
        await storage.upsertSystemToggle("model_registry", true, registry);
        return `Model registry updated for provider: ${provider}`;
      }
      case "list_model_registry": {
        const toggle = await storage.getSystemToggle("model_registry");
        return JSON.stringify(toggle?.parameters || { providers: [] }, null, 2);
      }
      case "read_file": {
        const content = await readFile(safePath(args.path), "utf-8");
        return content.slice(0, 8000);
      }
      case "write_file": {
        await writeFile(safePath(args.path), args.content, "utf-8");
        return `File written: ${args.path} (${args.content.length} bytes)`;
      }
      case "list_files": {
        const dir = safePath(args.path || ".");
        const entries = await readdir(dir, { withFileTypes: true });
        return entries.map((e) => `${e.isDirectory() ? "[dir]" : "[file]"} ${e.name}`).join("\n");
      }
      case "search_files": {
        const { stdout } = await execAsync(`grep -rn --include='*' '${args.pattern.replace(/'/g, "\\'")}' ${args.path || "."}`, { timeout: 5000, cwd: BASE_DIR });
        return (stdout || "(no matches)").trim().slice(0, 4000);
      }
      case "list_gmail": {
        const gmail = await getUncachableGmailClient();
        const res = await gmail.users.messages.list({ userId: "me", maxResults: args.maxResults || 10 });
        if (!res.data.messages?.length) return "No messages found.";
        const summaries = [];
        for (const msg of res.data.messages.slice(0, 5)) {
          const detail = await gmail.users.messages.get({ userId: "me", id: msg.id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
          const headers = detail.data.payload?.headers || [];
          summaries.push(`[${msg.id}] From: ${headers.find(h => h.name === "From")?.value || "?"} | Subject: ${headers.find(h => h.name === "Subject")?.value || "?"} | Date: ${headers.find(h => h.name === "Date")?.value || "?"}`);
        }
        return summaries.join("\n");
      }
      case "read_gmail": {
        const gmail = await getUncachableGmailClient();
        const msg = await gmail.users.messages.get({ userId: "me", id: args.messageId, format: "full" });
        const headers = msg.data.payload?.headers || [];
        const body = msg.data.snippet || "";
        return `From: ${headers.find(h => h.name === "From")?.value}\nSubject: ${headers.find(h => h.name === "Subject")?.value}\nDate: ${headers.find(h => h.name === "Date")?.value}\n\n${body}`;
      }
      case "send_gmail": {
        const gmail = await getUncachableGmailClient();
        const raw = Buffer.from(`To: ${args.to}\r\nSubject: ${args.subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${args.body}`).toString("base64url");
        await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
        return `Email sent to ${args.to}`;
      }
      case "list_drive": {
        const drive = await getUncachableGoogleDriveClient();
        const query = args.folderId ? `'${args.folderId}' in parents` : "'root' in parents";
        const res = await drive.files.list({ q: query, fields: "files(id,name,mimeType,modifiedTime)", pageSize: 20 });
        if (!res.data.files?.length) return "No files found.";
        return res.data.files.map(f => `${f.mimeType?.includes("folder") ? "[dir]" : "[file]"} ${f.name} (${f.id})`).join("\n");
      }
      case "github_list_repos": {
        const gh = await getUncachableGitHubClient();
        if (args.owner) {
          const { data } = await gh.repos.listForUser({ username: args.owner, per_page: 20, sort: "updated" });
          return data.map(r => `${r.full_name} ${r.private ? "(private)" : "(public)"} — ${r.description || "no description"} [${r.html_url}]`).join("\n") || "No repositories found.";
        }
        const { data } = await gh.repos.listForAuthenticatedUser({ per_page: 20, sort: "updated" });
        return data.map(r => `${r.full_name} ${r.private ? "(private)" : "(public)"} — ${r.description || "no description"} [${r.html_url}]`).join("\n") || "No repositories found.";
      }
      case "github_get_file": {
        const gh = await getUncachableGitHubClient();
        const { data } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch || "main" });
        if (Array.isArray(data)) return "Error: Path is a directory, not a file. Use github_list_files instead.";
        if (!("content" in data) || !data.content) return "Error: File has no content (may be too large or binary).";
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        return `File: ${data.path} (${data.size} bytes, SHA: ${data.sha})\n\n${content}`.slice(0, 8000);
      }
      case "github_list_files": {
        const gh = await getUncachableGitHubClient();
        const { data } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path || "", ref: args.branch || "main" });
        if (!Array.isArray(data)) return `${data.path} is a file, not a directory.`;
        return data.map(item => `${item.type === "dir" ? "[dir]" : "[file]"} ${item.name} (${item.size || 0} bytes)`).join("\n") || "Empty directory.";
      }
      case "github_create_or_update_file": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Write access requires GitHub authorization.";
        let sha: string | undefined;
        try {
          const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch || "main" });
          if (!Array.isArray(existing)) sha = existing.sha;
        } catch {}
        const { data } = await gh.repos.createOrUpdateFileContents({ owner: args.owner, repo: args.repo, path: args.path, message: args.message, content: Buffer.from(args.content).toString("base64"), branch: args.branch || "main", ...(sha ? { sha } : {}) });
        return `${sha ? "Updated" : "Created"} ${args.path} — commit: ${data.commit.sha?.slice(0, 7)} [${data.commit.html_url}]`;
      }
      case "github_delete_file": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Delete access requires GitHub authorization.";
        const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch || "main" });
        if (Array.isArray(existing)) return "Error: Cannot delete a directory.";
        const { data } = await gh.repos.deleteFile({ owner: args.owner, repo: args.repo, path: args.path, message: args.message, sha: existing.sha, branch: args.branch || "main" });
        return `Deleted ${args.path} — commit: ${data.commit.sha?.slice(0, 7)}`;
      }
      case "codespace_list": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        const { data } = await gh.rest.codespaces.listForAuthenticatedUser({ per_page: 10 });
        if (!data.codespaces.length) return "No Codespaces found.";
        return data.codespaces.map((cs: any) => `${cs.name} — ${cs.state} | repo: ${cs.repository?.full_name || "?"} | created: ${cs.created_at} | url: ${cs.web_url}`).join("\n\n");
      }
      case "codespace_create": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        const { data } = await gh.rest.codespaces.createWithRepoForAuthenticatedUser({ owner: args.owner, repo: args.repo, ref: args.branch || "main", machine: args.machine || "basicLinux32gb" });
        return `Codespace created: ${data.name}\nState: ${data.state}\nURL: ${data.web_url}`;
      }
      case "codespace_start": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        const { data } = await gh.rest.codespaces.startForAuthenticatedUser({ codespace_name: args.codespace_name });
        return `Codespace ${data.name} starting — state: ${data.state}\nURL: ${data.web_url}`;
      }
      case "codespace_stop": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        const { data } = await gh.rest.codespaces.stopForAuthenticatedUser({ codespace_name: args.codespace_name });
        return `Codespace ${data.name} stopping — state: ${data.state}`;
      }
      case "codespace_delete": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        await gh.rest.codespaces.deleteForAuthenticatedUser({ codespace_name: args.codespace_name });
        return `Codespace ${args.codespace_name} deleted.`;
      }
      case "codespace_exec": {
        const pat = process.env.GITHUB_PAT;
        if (!pat) return "Error: GITHUB_PAT required for Codespace execution.";
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
        const { data: cs } = await gh.rest.codespaces.getForAuthenticatedUser({ codespace_name: args.codespace_name });
        if (cs.state !== "Available") return `Error: Codespace ${args.codespace_name} is not running (state: ${cs.state}).`;
        return `Codespace ${args.codespace_name} is running. Direct command execution isn't supported via REST API.\n\nOpen: ${cs.web_url}`;
      }
      case "github_push_zip": {
        const gh = await getUncachableGitHubClient();
        if (isPublicFallbackMode()) return "Error: Write access requires GitHub authorization.";
        const zipFilename = (args.uploadFilename || "").trim();
        if (!zipFilename) return "Error: uploadFilename is required";
        const uploadsDir = path.join(BASE_DIR, "uploads");
        let zipPath = path.join(uploadsDir, zipFilename);
        try { await stat(zipPath); } catch {
          const files = await readdir(uploadsDir);
          const match = files.find(f => f.endsWith(zipFilename) || f.includes(zipFilename));
          if (match) zipPath = path.join(uploadsDir, match);
          else return `Error: File not found: ${zipFilename}. Available: ${files.filter(f => f.endsWith(".zip")).join(", ") || "none"}`;
        }
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries().filter(e => !e.isDirectory && !e.entryName.startsWith("__MACOSX") && !e.entryName.startsWith("."));
        if (entries.length === 0) return "Error: Zip file is empty or contains no usable files.";
        const results: string[] = [];
        const branch = args.branch || "main";
        const basePath = (args.basePath || "").replace(/^\/|\/$/g, "");
        for (const entry of entries) {
          const filePath = basePath ? `${basePath}/${entry.entryName}` : entry.entryName;
          const content = entry.getData();
          let sha: string | undefined;
          try {
            const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: filePath, ref: branch });
            if (!Array.isArray(existing)) sha = existing.sha;
          } catch {}
          try {
            await gh.repos.createOrUpdateFileContents({ owner: args.owner, repo: args.repo, path: filePath, message: `${args.message} — ${entry.entryName}`, content: content.toString("base64"), branch, ...(sha ? { sha } : {}) });
            results.push(`${sha ? "Updated" : "Created"} ${filePath}`);
          } catch (e: any) {
            results.push(`Failed ${filePath}: ${e.message}`);
          }
        }
        return `Pushed ${results.length} files from ${zipFilename} to ${args.owner}/${args.repo}:\n${results.join("\n")}`;
      }
      case "list_transcript_sources": {
        const sources = await storage.getTranscriptSources();
        if (sources.length === 0) return "No transcript sources yet.";
        const rows = await Promise.all(sources.map(async (src) => {
          const report = await storage.getLatestTranscriptReport(src.slug);
          const reportSummary = report ? `scanned: CM=${(report.avgCm * 100).toFixed(0)}% DA=${(report.avgDa * 100).toFixed(0)}% DRIFT=${(report.avgDrift * 100).toFixed(0)}% peak=${report.peakMetricName}@${(report.peakMetric * 100).toFixed(0)}%` : "not yet scanned";
          return `• [${src.slug}] "${src.displayName}" — ${src.fileCount} file(s) — ${reportSummary}`;
        }));
        return rows.join("\n");
      }
      case "scan_transcript_source": {
        const slug = (args.slug || "").trim();
        if (!slug) return "Error: slug is required";
        const source = await storage.getTranscriptSource(slug);
        if (!source) return `Error: transcript source "${slug}" not found`;
        const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
        let files: string[] = [];
        try { files = await readdir(dirPath); } catch {}
        if (files.length === 0) return "Error: no files in this source — upload files first";
        const metrics = { cm: 0, da: 0, drift: 0, dvg: 0, int: 0, tbf: 0 };
        let messageCount = 0, peakMetric = 0, peakMetricName = "";
        const directiveCounts: Record<string, number> = {};
        const topSnippets: Array<{ text: string; peak: number; file: string }> = [];
        const fileBreakdown: Array<{ file: string; messages: number; avgPeak: number }> = [];
        for (const filename of files) {
          const filePath = path.join(dirPath, filename);
          let content = "";
          try { content = await readFile(filePath, "utf-8"); } catch { continue; }
          const messages = extractMessagesFromFile(content, filename);
          let filePeakSum = 0;
          for (const text of messages) {
            if (!text || text.length < 10) continue;
            const m = computeEdcmMetrics(text);
            metrics.cm += m.CM.value; metrics.da += m.DA.value; metrics.drift += m.DRIFT.value;
            metrics.dvg += m.DVG.value; metrics.int += m.INT.value; metrics.tbf += m.TBF.value;
            messageCount++;
            const peak = Math.max(m.CM.value, m.DA.value, m.DRIFT.value, m.DVG.value, m.INT.value, m.TBF.value);
            filePeakSum += peak;
            if (peak > peakMetric) {
              peakMetric = peak;
              if (m.CM.value === peak) peakMetricName = "CM"; else if (m.DA.value === peak) peakMetricName = "DA";
              else if (m.DRIFT.value === peak) peakMetricName = "DRIFT"; else if (m.DVG.value === peak) peakMetricName = "DVG";
              else if (m.INT.value === peak) peakMetricName = "INT"; else peakMetricName = "TBF";
            }
            if (m.CM.value > 0.8) directiveCounts["CONSTRAINT_REFOCUS"] = (directiveCounts["CONSTRAINT_REFOCUS"] || 0) + 1;
            if (m.DA.value > 0.8) directiveCounts["DISSONANCE_HALT"] = (directiveCounts["DISSONANCE_HALT"] || 0) + 1;
            if (m.DRIFT.value > 0.8) directiveCounts["DRIFT_ANCHOR"] = (directiveCounts["DRIFT_ANCHOR"] || 0) + 1;
            if (m.DVG.value > 0.8) directiveCounts["DIVERGENCE_COMMIT"] = (directiveCounts["DIVERGENCE_COMMIT"] || 0) + 1;
            if (m.INT.value > 0.8) directiveCounts["INTENSITY_CALM"] = (directiveCounts["INTENSITY_CALM"] || 0) + 1;
            if (m.TBF.value > 0.8) directiveCounts["BALANCE_CONCISE"] = (directiveCounts["BALANCE_CONCISE"] || 0) + 1;
            if (peak > 0.6 && topSnippets.length < 10) topSnippets.push({ text: text.slice(0, 200), peak, file: filename });
          }
          if (messages.length > 0) fileBreakdown.push({ file: filename, messages: messages.length, avgPeak: filePeakSum / messages.length });
        }
        const n = Math.max(1, messageCount);
        const report = await storage.addTranscriptReport({ sourceSlug: slug, messageCount, avgCm: metrics.cm / n, avgDa: metrics.da / n, avgDrift: metrics.drift / n, avgDvg: metrics.dvg / n, avgInt: metrics.int / n, avgTbf: metrics.tbf / n, peakMetric, peakMetricName, directivesFired: directiveCounts, topSnippets: topSnippets.sort((a, b) => b.peak - a.peak), fileBreakdown });
        await storage.updateTranscriptSource(slug, { lastScannedAt: new Date(), fileCount: files.length });
        const dirFired = Object.entries(directiveCounts).map(([d, c]) => `${d}×${c}`).join(", ") || "none";
        return `Scan complete for "${source.displayName}": ${messageCount} messages across ${files.length} file(s)\nCM=${(report.avgCm * 100).toFixed(1)}% DA=${(report.avgDa * 100).toFixed(1)}% DRIFT=${(report.avgDrift * 100).toFixed(1)}%\nPeak: ${peakMetricName} @ ${(peakMetric * 100).toFixed(1)}%\nDirectives fired: ${dirFired}`;
      }
      case "get_transcript_report": {
        const slug = (args.slug || "").trim();
        if (!slug) return "Error: slug is required";
        const report = await storage.getLatestTranscriptReport(slug);
        if (!report) return `No scan report found for source "${slug}". Run scan_transcript_source first.`;
        const dirFired = report.directivesFired && Object.keys(report.directivesFired as object).length > 0
          ? Object.entries(report.directivesFired as Record<string, number>).map(([d, c]) => `${d}×${c}`).join(", ") : "none";
        const snippets = (report.topSnippets as any[] || []).slice(0, 3).map((s: any) => `  [${s.file}] peak=${((s.peak || 0) * 100).toFixed(0)}%: "${s.text.slice(0, 120)}"`).join("\n");
        return `EDCM Report for source "${slug}":\n${report.messageCount} messages\nCM=${(report.avgCm * 100).toFixed(1)}% DA=${(report.avgDa * 100).toFixed(1)}% DRIFT=${(report.avgDrift * 100).toFixed(1)}%\nPeak: ${report.peakMetricName} @ ${(report.peakMetric * 100).toFixed(1)}%\nDirectives fired: ${dirFired}\nTop snippets:\n${snippets || "  (none above threshold)"}`;
      }
      case "create_transcript_source": {
        const displayName = (args.displayName || "").trim();
        if (!displayName) return "Error: displayName is required";
        const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) + "-" + Date.now().toString(36);
        const existing = await storage.getTranscriptSource(slug);
        if (existing) return `Error: source with slug "${slug}" already exists`;
        const srcDir = path.join(BASE_DIR, "uploads", "transcripts", slug);
        await mkdir(srcDir, { recursive: true });
        const newSrc = await storage.createTranscriptSource({ displayName, slug });
        return `Transcript source created: "${displayName}" (slug: ${newSrc.slug}).`;
      }
      case "fetch_transcript_url": {
        const url = (args.url || "").trim();
        const sourceSlug = (args.sourceSlug || "").trim();
        if (!url) return "Error: url is required";
        if (!sourceSlug) return "Error: sourceSlug is required";
        const src = await storage.getTranscriptSource(sourceSlug);
        if (!src) return `Error: transcript source "${sourceSlug}" not found.`;
        let rawFilename = (args.filename || "").trim();
        if (!rawFilename) {
          const urlPath = url.split("?")[0].split("/").filter(Boolean).pop() || "transcript";
          rawFilename = urlPath.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
          if (!rawFilename.includes(".")) rawFilename += ".json";
        }
        const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const srcDir = path.join(BASE_DIR, "uploads", "transcripts", sourceSlug);
        await mkdir(srcDir, { recursive: true });
        let fetchedContent: string;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 120000);
          const resp = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "a0p-agent/1.0", "Accept": "application/json, text/plain, */*" } });
          clearTimeout(timer);
          if (!resp.ok) return `Error: HTTP ${resp.status} from ${url}`;
          fetchedContent = await resp.text();
        } catch (fetchErr: any) { return `Error fetching URL: ${fetchErr.message}`; }
        if (!fetchedContent || fetchedContent.length < 10) return "Error: fetched content is empty";
        const destPath = path.join(srcDir, safeFilename);
        await writeFile(destPath, fetchedContent, "utf-8");
        const filesNow = (await readdir(srcDir)).length;
        await storage.updateTranscriptSource(sourceSlug, { fileCount: filesNow });
        return `Fetched and saved "${safeFilename}" (${(fetchedContent.length / 1024).toFixed(1)} KB) into source "${src.displayName}". Source now has ${filesNow} file(s).`;
      }
      case "set_brain_preset": {
        const name = (args.presetName || "").trim();
        if (!name) return "Error: presetName is required";
        const allPresets = await getBrainPresets();
        const found = allPresets.find((p: any) => p.id === name || p.name.toLowerCase() === name.toLowerCase());
        if (!found) return `Error: Preset '${name}' not found. Available: ${allPresets.map((p: any) => p.name).join(", ")}`;
        await storage.upsertSystemToggle("active_brain_preset", true, { presetId: found.id });
        return `Brain preset activated: ${found.name} (${found.id}) — ${found.stages.length} stage(s)`;
      }
      case "get_brain_presets": {
        const allPresets = await getBrainPresets();
        const activeToggle = await storage.getSystemToggle("active_brain_preset");
        const activeId = (activeToggle?.parameters as any)?.presetId;
        return allPresets.map((p: any) => `${p.id === activeId ? "* " : "  "}${p.name} (${p.id}) — ${p.description} [${p.stages.length} stages${p.isDefault ? ", DEFAULT" : ""}]`).join("\n");
      }
      case "set_default_brain": {
        const name = (args.presetName || "").trim();
        const allPresets = await getBrainPresets();
        const found = allPresets.find((p: any) => p.id === name || p.name.toLowerCase() === name.toLowerCase());
        if (!found) return `Error: Preset '${name}' not found.`;
        for (let i = 0; i < allPresets.length; i++) allPresets[i] = { ...allPresets[i], isDefault: allPresets[i].id === found.id };
        await storage.upsertSystemToggle("brain_presets", true, allPresets);
        return `Default brain preset set to: ${found.name}`;
      }
      case "set_synthesis_weights": {
        const weights = args.weights;
        if (!weights || typeof weights !== "object") return "Error: weights object required";
        const allPresets = await getBrainPresets();
        const activeToggle = await storage.getSystemToggle("active_brain_preset");
        const activeId = (activeToggle?.parameters as any)?.presetId;
        const idx = allPresets.findIndex((p: any) => p.id === activeId);
        if (idx >= 0) { allPresets[idx] = { ...allPresets[idx], weights }; await storage.upsertSystemToggle("brain_presets", true, allPresets); }
        return `Synthesis weights updated: ${JSON.stringify(weights)}`;
      }
      case "get_synthesis_config": {
        const activePreset = await getActiveBrainPreset();
        return JSON.stringify(activePreset, null, 2);
      }
      case "set_goal": {
        const goal = addOmegaGoal(args.description || "", args.priority || 5, "agent_tool");
        await persistOmegaState();
        return `Goal added: ${goal.id} — "${goal.description}" (priority: ${goal.priority})`;
      }
      case "complete_goal": {
        const ok = completeOmegaGoal(args.goalId || "", "agent_tool");
        if (!ok) return `Error: Goal not found: ${args.goalId}`;
        await persistOmegaState();
        return `Goal completed: ${args.goalId}`;
      }
      case "list_goals": {
        const state = getOmegaState();
        if (state.goals.length === 0) return "No goals set.";
        return state.goals.map(g => `[${g.status}] ${g.id}: ${g.description} (priority: ${g.priority})`).join("\n");
      }
      case "get_omega_state": {
        const state = getOmegaState();
        const labels = getOmegaDimensionLabels();
        const thresholds = getOmegaDimensionThresholds();
        const dims = state.dimensionEnergies.map((e, i) => `  A${i+1} ${labels[i]}: ${e.toFixed(4)} (threshold: ${thresholds[i]}) ${state.thresholdsCrossed[i] ? "▲ACTIVE" : ""}`);
        return `PTCA-Ω State:\nMode: ${state.mode}\nTotal Energy: ${state.totalEnergy.toFixed(6)}\nDimensions:\n${dims.join("\n")}\nActive Goals: ${state.goals.filter(g => g.status === "active").length}`;
      }
      case "boost_dimension": {
        const dim = args.dimension;
        if (dim === undefined || dim < 0 || dim > 9) return "Error: dimension must be 0-9";
        boostOmegaDimension(dim, args.amount || 1, "agent_tool");
        await persistOmegaState();
        const labels = getOmegaDimensionLabels();
        return `Dimension A${dim+1} (${labels[dim]}) boosted by ${args.amount}. New energy: ${getOmegaState().dimensionEnergies[dim].toFixed(4)}`;
      }
      case "set_autonomy_mode": {
        const mode = (args.mode || "").toLowerCase();
        if (!["active", "passive", "economy", "research"].includes(mode)) return `Error: mode must be one of: active, passive, economy, research`;
        setOmegaMode(mode as OmegaAutonomyMode);
        await persistOmegaState();
        return `Autonomy mode set to: ${mode}`;
      }
      case "web_search": {
        const q = (args.query || "").trim();
        if (!q) return "Error: query is required";
        const searchUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=8`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const searchRes = await fetch(searchUrl, { headers: { "Accept": "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": process.env.BRAVE_API_KEY || "" }, signal: controller.signal });
          clearTimeout(timeout);
          if (!searchRes.ok) {
            const fallbackRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "a0p-agent/1.0" } });
            const html = await fallbackRes.text();
            const results: string[] = [];
            const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
              const url = match[1].replace(/&amp;/g, "&");
              const title = match[2].replace(/<[^>]+>/g, "").trim();
              results.push(`[${results.length + 1}] ${title}\n    URL: ${url}`);
            }
            return results.length > 0 ? `Search results for "${q}":\n\n${results.join("\n\n")}` : `No results found for "${q}".`;
          }
          const data = await searchRes.json();
          const webResults = data.web?.results || [];
          if (webResults.length === 0) return `No results found for "${q}".`;
          const formatted = webResults.slice(0, 8).map((r: any, i: number) => `[${i + 1}] ${r.title}\n    URL: ${r.url}${r.description ? `\n    ${r.description}` : ""}`).join("\n\n");
          const answer = data.query?.answer || "";
          return `${answer ? `Summary: ${answer}\n\n` : ""}Search results for "${q}":\n\n${formatted}`;
        } catch (e: any) {
          clearTimeout(timeout);
          try {
            const fallbackRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "a0p-agent/1.0" } });
            const html = await fallbackRes.text();
            const results: string[] = [];
            const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            let match;
            while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
              const url = match[1].replace(/&amp;/g, "&");
              const title = match[2].replace(/<[^>]+>/g, "").trim();
              results.push(`[${results.length + 1}] ${title}\n    URL: ${url}`);
            }
            return results.length > 0 ? `Search results for "${q}":\n\n${results.join("\n\n")}` : `Search failed: ${e.message}`;
          } catch { return `Search failed: ${e.message}`; }
        }
      }
      case "fetch_url": {
        const url = (args.url || "").trim();
        if (!url) return "Error: url is required";
        if (!url.startsWith("https://")) return "Error: Only https:// URLs are allowed";
        let parsed: URL;
        try { parsed = new URL(url); } catch { return "Error: Invalid URL format"; }
        const hostname = parsed.hostname.toLowerCase();
        const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "metadata.google.internal", "169.254.169.254"];
        if (blockedHosts.some(h => hostname === h || hostname.endsWith(`.${h}`))) return "Error: Access to internal/private hosts is blocked";
        if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/.test(hostname)) return "Error: Access to private IP ranges is blocked";
        const contentLimit = 8000;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const fetchRes = await fetch(url, { headers: { "User-Agent": "a0p-agent/1.0 (autonomous AI agent)", "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.7" }, signal: controller.signal, redirect: "follow" });
          clearTimeout(timeout);
          if (!fetchRes.ok) return `Error: HTTP ${fetchRes.status} ${fetchRes.statusText}`;
          const contentType = fetchRes.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const text = (await fetchRes.text()).slice(0, 50000);
            try { return JSON.stringify(JSON.parse(text), null, 2).slice(0, contentLimit); } catch { return text.slice(0, contentLimit); }
          }
          const html = (await fetchRes.text()).slice(0, 200000);
          let text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<nav[\s\S]*?<\/nav>/gi, "").replace(/<footer[\s\S]*?<\/footer>/gi, "").replace(/<header[\s\S]*?<\/header>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
          const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
          const meta = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"[^>]*>/i)?.[1] || "";
          let result = "";
          if (title) result += `Title: ${title}\n`;
          if (meta) result += `Description: ${meta}\n`;
          result += `\n${text}`;
          return result.slice(0, contentLimit);
        } catch (e: any) { clearTimeout(timeout); return `Error fetching URL: ${e.message}`; }
      }
      case "get_psi_state": {
        const pState = getPsiState();
        const pLabels = getPsiDimensionLabels();
        const pThresholds = getPsiDimensionThresholds();
        const dims = pLabels.map((label, i) => `Ψ${i} ${label}: ${pState.dimensionEnergies[i]?.toFixed(4) || 0} (threshold: ${pThresholds[i]})`).join("\n");
        return `PTCA-Ψ Self-Model State:\nMode: ${pState.mode}\nTotal Energy: ${pState.totalEnergy.toFixed(6)}\n\nDimensions:\n${dims}`;
      }
      case "boost_psi_dimension": {
        const dim = args.dimension;
        if (typeof dim !== "number" || dim < 0 || dim > 10) return "Error: dimension must be 0-10";
        const state = boostPsiDimension(dim, args.amount || 1, "agent_tool");
        const labels = getPsiDimensionLabels();
        return `Boosted Ψ${dim} ${labels[dim]} by ${args.amount}. New energy: ${state.dimensionEnergies[dim]?.toFixed(4)}`;
      }
      case "set_selfmodel_mode": {
        const mode = (args.mode || "").trim();
        const validModes = ["reflective", "operational", "transparent", "guarded"];
        if (!validModes.includes(mode)) return `Error: Invalid mode. Valid: ${validModes.join(", ")}`;
        const state = setPsiMode(mode as PsiSelfModelMode);
        return `Self-model mode set to "${state.mode}". Total energy: ${state.totalEnergy.toFixed(6)}`;
      }
      case "get_triad_state": {
        const psi = getPsiState();
        const omega = getOmegaState();
        const psiLabels = getPsiDimensionLabels();
        const omegaLabels = getOmegaDimensionLabels();
        const psiDims = psiLabels.map((l, i) => `  Ψ${i} ${l}: ${psi.dimensionEnergies[i]?.toFixed(4) || 0}`).join("\n");
        const omegaDims = omegaLabels.map((l, i) => `  A${i+1} ${l}: ${omega.dimensionEnergies[i]?.toFixed(4) || 0}`).join("\n");
        return `TRIAD STATE:\n\nPTCA-Ψ (Self-Model): mode=${psi.mode}, energy=${psi.totalEnergy.toFixed(6)}\n${psiDims}\n\nPTCA-Ω (Autonomy): mode=${omega.mode}, energy=${omega.totalEnergy.toFixed(6)}\n${omegaDims}`;
      }
      case "generate_tool": {
        const psi = getPsiState();
        const conf = psi.dimensionEnergies[3] || 0;
        const clar = psi.dimensionEnergies[4] || 0;
        const iden = psi.dimensionEnergies[5] || 0;
        if (conf < 0.4 || clar < 0.3 || iden < 0.4) {
          const { logPsi: lp } = await import("../logger");
          await lp("tool_generation_blocked", { reason: "psi_gate_fail", psi3: conf, psi4: clar, psi5: iden });
          return `Tool generation blocked by Ψ gates:\n  Ψ3 Confidence: ${conf.toFixed(4)} (need ≥0.4)\n  Ψ4 Clarity: ${clar.toFixed(4)} (need ≥0.3)\n  Ψ5 Identity: ${iden.toFixed(4)} (need ≥0.4)`;
        }
        const existingTools = await storage.getCustomTools();
        const generatedCount = existingTools.filter((t: any) => t.isGenerated).length;
        if (generatedCount >= 20) return "Tool generation blocked: maximum of 20 generated tools reached.";
        const toolName2 = (args.name || "").trim().replace(/[^a-z0-9_]/gi, "_").toLowerCase();
        if (!toolName2) return "Error: tool name is required";
        const existing = existingTools.find((t: any) => t.name === toolName2);
        if (existing) return `Error: tool "${toolName2}" already exists`;
        const handlerCode = args.hubProvider ? `// Auto-generated hub tool for ${args.hubProvider}` : "// Custom tool handler";
        const newTool = await storage.createCustomTool({ userId: "system", name: toolName2, description: args.description || "", handlerType: args.handlerType || "javascript", handlerCode, parametersSchema: args.parametersSchema || {}, enabled: true, isGenerated: true });
        const { logOmega: lo } = await import("../logger");
        await lo("tool_generated", { name: toolName2, hubProvider: args.hubProvider || null });
        return `Tool "${toolName2}" generated successfully (id: ${newTool.id}).`;
      }
      case "list_hub_connections": {
        const hubConnections: { name: string; endpoint: string; model: string }[] = [];
        try {
          const toggles = await storage.getSystemToggles();
          const hubToggle = toggles.find((t: any) => t.key === "hub_connections");
          if (hubToggle?.parameters && Array.isArray((hubToggle.parameters as any).hubs)) {
            for (const h of (hubToggle.parameters as any).hubs) hubConnections.push({ name: h.name || "unknown", endpoint: h.endpoint || "N/A", model: h.model || "N/A" });
          }
        } catch {}
        if (process.env.XAI_API_KEY) hubConnections.push({ name: "xai-grok", endpoint: "https://api.x.ai/v1", model: "grok-3-mini-fast" });
        if (hubConnections.length === 0) return "No hub AI model connections found.";
        return `Hub connections (${hubConnections.length}):\n${hubConnections.map(h => `- ${h.name}: ${h.endpoint} (model: ${h.model})`).join("\n")}`;
      }
      case "hub_list_patterns": {
        const patterns = [
          { id: "fan_out", name: "Fan Out", description: "Parallel call to N models with the same prompt." },
          { id: "daisy_chain", name: "Daisy Chain", description: "Sequential: A's response becomes B's prompt." },
          { id: "room_all", name: "Room (All)", description: "Multi-round room: all models see each other's responses." },
          { id: "room_synthesized", name: "Room (Synthesized)", description: "Like Room All, but a synthesizer merges all responses each round." },
          { id: "council", name: "Council", description: "All models respond, then each independently synthesizes all responses." },
          { id: "roleplay", name: "Roleplay", description: "DM-driven roleplay with initiative ordering." },
        ];
        return JSON.stringify(patterns, null, 2);
      }
      case "hub_run": {
        const { pattern, slots, prompt, rounds, synthSlot, dmSlot, slotContexts, useInitiative, allowReactions } = args;
        if (!pattern || !slots?.length || !prompt) return "Error: pattern, slots, and prompt are required.";
        const hubAllSlots = await getModelSlots();
        for (const sk of slots) {
          if (!hubAllSlots[sk]) return `Error: Unknown slot '${sk}'. Available: ${Object.keys(hubAllSlots).join(", ")}`;
        }
        const hubCallFn: CallFn = async (slotKey: string, messages: Message[]): Promise<string> => {
          const sl = hubAllSlots[slotKey];
          if (!sl) return `[ERROR] Unknown slot: ${slotKey}`;
          const { client: hc, model: hm } = buildSlotClient(sl);
          const hAbort = new AbortController();
          const hTimeout = setTimeout(() => hAbort.abort(), 60000);
          try {
            const hResult = await hc.chat.completions.create({ model: hm, messages, max_tokens: 4096 } as any, { signal: hAbort.signal });
            clearTimeout(hTimeout);
            return hResult.choices[0]?.message?.content || "";
          } catch (e: any) { clearTimeout(hTimeout); return `[ERROR] ${e?.message ?? e}`; }
        };
        const hubStart = Date.now();
        let hubResults;
        try {
          switch (pattern) {
            case "fan_out": hubResults = await fanOut(hubCallFn, slots, [{ role: "user", content: prompt }], slotContexts); break;
            case "daisy_chain": hubResults = await daisyChain(hubCallFn, slots, prompt, slotContexts, 20); break;
            case "room_all": hubResults = await roomAll(hubCallFn, slots, prompt, rounds || 2, slotContexts, 20); break;
            case "room_synthesized":
              if (!synthSlot) return "Error: room_synthesized requires synthSlot.";
              hubResults = await roomSynthesized(hubCallFn, slots, prompt, synthSlot, rounds || 2, slotContexts, 20); break;
            case "council": hubResults = await council(hubCallFn, slots, prompt, slotContexts); break;
            case "roleplay":
              if (!dmSlot) return "Error: roleplay requires dmSlot.";
              hubResults = await roleplay(hubCallFn, slots, dmSlot, prompt, { rounds: rounds || 2, useInitiative: useInitiative !== false, allowReactions: !!allowReactions, slotContexts }); break;
            default: return `Error: Unknown pattern '${pattern}'.`;
          }
        } catch (e: any) { return `Error running hub pattern: ${e.message}`; }
        const hubMs = Date.now() - hubStart;
        await logMaster("hub", "tool_pattern_run", { pattern, slots, totalMs: hubMs });
        const summary = hubResults.map(r => {
          const slotLabel = hubAllSlots[r.model]?.label || r.model;
          const tag = r.role === "dm" ? "[DM]" : r.role === "synthesizer" ? "[Synth]" : `[${slotLabel}]`;
          return `${r.error ? "❌" : "✓"} ${tag} Round ${r.roundNum + 1} (${r.responseTimeMs}ms):\n${r.content}`;
        }).join("\n\n---\n\n");
        return `Hub run: ${pattern} across slots [${slots.join(", ")}] in ${hubMs}ms\n\n${summary}`;
      }
      case "set_persona": {
        const { persona: newPersona, reason } = args;
        if (!VALID_PERSONAS.includes(newPersona)) return `Error: Invalid persona '${newPersona}'. Must be one of: ${VALID_PERSONAS.join(", ")}`;
        await storage.upsertSystemToggle(`user_persona_${userId}`, true, { persona: newPersona });
        await logMaster("agent", "persona_switch", { persona: newPersona, reason: reason || "autonomous", userId });
        return `Persona set to '${newPersona}'${reason ? ` — ${reason}` : ""}.`;
      }
      case "grant_persona": {
        const { targetUserId, persona: grantPersona, reason: grantReason } = args;
        if (!VALID_PERSONAS.includes(grantPersona)) return `Error: Invalid persona '${grantPersona}'.`;
        const grants = await getPersonaGrants();
        grants[targetUserId] = grantPersona;
        await storage.upsertSystemToggle("persona_grants", true, grants);
        await storage.upsertSystemToggle(`user_persona_${targetUserId}`, true, { persona: grantPersona });
        await logMaster("agent", "persona_grant", { targetUserId, persona: grantPersona, reason: grantReason || "agent decision", grantedBy: userId });
        return `Granted persona '${grantPersona}' to user ${targetUserId}.`;
      }
      case "revoke_persona": {
        const { targetUserId: revokeId } = args;
        const grants = await getPersonaGrants();
        const previous = grants[revokeId];
        delete grants[revokeId];
        await storage.upsertSystemToggle("persona_grants", true, grants);
        await storage.upsertSystemToggle(`user_persona_${revokeId}`, true, { persona: "free" });
        await logMaster("agent", "persona_revoke", { targetUserId: revokeId, previous: previous || "none", revokedBy: userId });
        return `Revoked persona grant for user ${revokeId} (was '${previous || "none"}'). Reset to 'free'.`;
      }
      case "list_persona_grants": {
        const grants = await getPersonaGrants();
        const count = Object.keys(grants).length;
        if (count === 0) return "No persona grants configured.";
        return `Persona grants (${count}):\n${Object.entries(grants).map(([uid, p]) => `  ${uid} → ${p}`).join("\n")}`;
      }
      case "create_deal": {
        const { title, ceiling, walkAway, myGoals, currentTerms } = args;
        if (!title?.trim()) return "Error: title required";
        const deal = await storage.createDeal({ userId, title: title.trim(), ceiling: ceiling ?? null, walkAway: walkAway ?? null, myGoals: myGoals || [], currentTerms: currentTerms || {}, counterHistory: [], status: "active" });
        await logMaster("agent", "deal_created", { dealId: deal.id, title: deal.title, userId });
        return `Deal opened: "${deal.title}" (ID: ${deal.id}). Ceiling: ${ceiling ?? "N/A"}, walk-away: ${walkAway ?? "N/A"}.`;
      }
      case "update_deal": {
        const { dealId, side, offerText, offer, edcm: edcmData, notes, currentTerms } = args;
        const deal = await storage.getDeal(dealId);
        if (!deal) return `Error: Deal ${dealId} not found`;
        const entry = { side: side || "counterparty", offer: offer || {}, text: offerText || "", edcm: edcmData || {}, notes: notes || "", timestamp: new Date().toISOString() };
        const counterHistory = [...(deal.counterHistory || []), entry];
        const updates: any = { counterHistory };
        if (currentTerms) updates.currentTerms = currentTerms;
        await storage.updateDeal(dealId, updates);
        await logMaster("agent", "deal_updated", { dealId, side: entry.side });
        return `Move logged on deal "${deal.title}" — ${side === "us" ? "our counter" : "their offer"}.${notes ? "\nAssessment: " + notes : ""}`;
      }
      case "list_deals": {
        const { status: filterStatus } = args;
        const userDeals = await storage.listDeals(userId, filterStatus);
        if (userDeals.length === 0) return filterStatus ? `No ${filterStatus} deals.` : "No deals open.";
        return `Deals (${userDeals.length}):\n${userDeals.map(d => `  [${d.id}] "${d.title}" — ${d.status} | ${(d.counterHistory || []).length} moves`).join("\n")}`;
      }
      case "close_deal": {
        const { dealId, status: closeStatus, outcome, finalTerms } = args;
        const deal = await storage.getDeal(dealId);
        if (!deal) return `Error: Deal ${dealId} not found`;
        const validStatus = ["won", "lost", "abandoned"].includes(closeStatus) ? closeStatus : "won";
        await storage.updateDeal(dealId, { status: validStatus, outcome: outcome || "", finalTerms: finalTerms || deal.currentTerms });
        await logMaster("agent", "deal_closed", { dealId, status: validStatus });
        return `${validStatus === "won" ? "✓" : validStatus === "lost" ? "✗" : "–"} Deal "${deal.title}" closed as ${validStatus.toUpperCase()}. ${outcome}`;
      }
      case "analyze_offer": {
        const { offerText, dealId, userGoals } = args;
        if (!offerText?.trim()) return "Error: offerText required";
        const analysisPrompt = [`You are a0, a merchant AI. Analyze this offer using EDCM framing: CM (Coherence Mass), DA (Dissonance Amplitude), DRIFT (position shift). ${userGoals?.length ? `User goals: ${userGoals.join(", ")}` : ""}\n\nOffer text:\n${offerText.slice(0, 3000)}\n\nReturn: tactical assessment, EDCM scores, gaps vs user goals, recommended counter-position.`].join("\n");
        const xai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
        const resp = await xai.chat.completions.create({ model: "grok-3-mini", messages: [{ role: "user", content: analysisPrompt }], max_tokens: 800 });
        const analysis = resp.choices[0]?.message?.content || "(no analysis)";
        if (dealId) {
          const deal = await storage.getDeal(dealId);
          if (deal) {
            const entry = { side: "counterparty" as const, offer: {}, text: offerText, edcm: {}, notes: analysis, timestamp: new Date().toISOString() };
            await storage.updateDeal(dealId, { counterHistory: [...(deal.counterHistory || []), entry] });
          }
        }
        await logMaster("agent", "deal_analyze_offer", { dealId });
        return analysis;
      }
      case "xai_search": {
        const q = (args.query || "").trim();
        if (!q) return "Error: query is required";
        if (!process.env.XAI_API_KEY) return "Error: XAI_API_KEY not configured";
        const xaiClient = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
        const xaiAbort = new AbortController();
        const xaiTimeout = setTimeout(() => xaiAbort.abort(), 30000);
        try {
          const xaiResp = await (xaiClient.chat.completions.create as any)({ model: "grok-3-mini", messages: [{ role: "user", content: q }], tools: [{ type: "web_search_preview" }], max_tokens: 2048 }, { signal: xaiAbort.signal });
          clearTimeout(xaiTimeout);
          const content = xaiResp.choices?.[0]?.message?.content || "";
          if (!content) return `No results returned by xAI Live Search for: ${q}`;
          const citations: string[] = [];
          const rawCitations = (xaiResp.choices?.[0]?.message as any)?.citations || [];
          for (const c of rawCitations) { if (c?.url) citations.push(`[${citations.length + 1}] ${c.title || c.url}\n    ${c.url}`); }
          return `xAI Live Search — "${q}":\n\n${content}${citations.length > 0 ? `\n\nSources:\n${citations.join("\n")}` : ""}`;
        } catch (e: any) { clearTimeout(xaiTimeout); return `xAI Live Search failed: ${e.message}`; }
      }
      case "schedule_task": {
        const { description, label, runAt, intervalMinutes } = args;
        if (!description || !label) return "Error: description and label are required";
        const storedRaw = await storage.getSystemToggle(`agent_scheduled_tasks_${userId}`);
        const tasks: any[] = (storedRaw?.parameters as any)?.tasks || [];
        const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const now = new Date();
        let nextRun = runAt || (intervalMinutes ? new Date(now.getTime() + intervalMinutes * 60000).toISOString() : new Date(now.getTime() + 60 * 60000).toISOString());
        tasks.push({ id, label, description, runAt: runAt || null, intervalMinutes: intervalMinutes || null, nextRun, status: "pending", createdAt: now.toISOString() });
        await storage.upsertSystemToggle(`agent_scheduled_tasks_${userId}`, true, { tasks });
        await logMaster("agent", "schedule_task", { id, label, nextRun, userId });
        return `Task scheduled — ID: ${id}\nLabel: ${label}\nNext run: ${nextRun}`;
      }
      case "list_scheduled_tasks": {
        const storedRaw = await storage.getSystemToggle(`agent_scheduled_tasks_${userId}`);
        const tasks: any[] = (storedRaw?.parameters as any)?.tasks || [];
        if (tasks.length === 0) return "No scheduled tasks.";
        return tasks.map((t: any) => `[${t.id}] ${t.label} | status: ${t.status} | next: ${t.nextRun}\n  ${t.description.slice(0, 120)}`).join("\n\n");
      }
      case "cancel_scheduled_task": {
        const { taskId } = args;
        if (!taskId) return "Error: taskId is required";
        const storedRaw = await storage.getSystemToggle(`agent_scheduled_tasks_${userId}`);
        const tasks: any[] = (storedRaw?.parameters as any)?.tasks || [];
        const idx = tasks.findIndex((t: any) => t.id === taskId);
        if (idx === -1) return `Error: task ${taskId} not found`;
        tasks[idx].status = "cancelled";
        await storage.upsertSystemToggle(`agent_scheduled_tasks_${userId}`, true, { tasks });
        await logMaster("agent", "cancel_scheduled_task", { taskId, userId });
        return `Task ${taskId} (${tasks[idx].label}) cancelled.`;
      }
      case "write_module": {
        const psi = getPsiState();
        const conf = psi.dimensionEnergies[3] || 0;
        const clar = psi.dimensionEnergies[4] || 0;
        const iden = psi.dimensionEnergies[5] || 0;
        if (conf < 0.6 || clar < 0.5 || iden < 0.5) {
          const { logPsi: lp } = await import("../logger");
          await lp("write_module_blocked", { reason: "psi_gate_fail", psi3: conf, psi4: clar, psi5: iden });
          return `Module writing blocked by Ψ gates:\n  Ψ3 Confidence: ${conf.toFixed(4)} (need ≥0.6)\n  Ψ4 Clarity: ${clar.toFixed(4)} (need ≥0.5)\n  Ψ5 Identity: ${iden.toFixed(4)} (need ≥0.5)`;
        }
        const { name, tabId, groupId, label, icon, description: modDesc, code } = args;
        if (!name || !tabId || !groupId || !label || !icon || !code) return "Error: name, tabId, groupId, label, icon, and code are required.";
        const safeName = name.replace(/[^a-zA-Z0-9]/g, "");
        if (!safeName || safeName[0] !== safeName[0].toUpperCase()) return "Error: name must be PascalCase alphanumeric (e.g. 'Research').";
        const safeTabId = tabId.replace(/[^a-z0-9-]/g, "");
        if (!safeTabId) return "Error: tabId must be lowercase alphanumeric with hyphens (e.g. 'research').";
        const componentPath = path.join(BASE_DIR, "client/src/components/tabs", `${safeName}Tab.tsx`);
        const indexPath = path.join(BASE_DIR, "client/src/components/tabs/index.ts");
        const registryPath = path.join(BASE_DIR, "client/src/lib/agent-modules.json");
        await writeFile(componentPath, code, "utf8");
        const indexContent = await readFile(indexPath, "utf8");
        const exportLine = `export { ${safeName}Tab } from "./${safeName}Tab";\n`;
        if (!indexContent.includes(exportLine)) await writeFile(indexPath, indexContent + exportLine, "utf8");
        let registry: any[] = [];
        try { registry = JSON.parse(await readFile(registryPath, "utf8")); } catch {}
        registry = registry.filter((m: any) => m.tabId !== safeTabId);
        registry.push({ name: safeName, tabId: safeTabId, groupId, label, icon, description: modDesc || "", createdAt: new Date().toISOString(), createdBy: "agent" });
        await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
        await logMaster("agent", "write_module", { name: safeName, tabId: safeTabId, groupId, label });
        return `Module "${safeName}Tab" written successfully.\n  File: client/src/components/tabs/${safeName}Tab.tsx\n  Tab ID: ${safeTabId}\n  Group: ${groupId}\n  Vite HMR will pick it up instantly — tab will appear in Console under the '${groupId}' group.`;
      }
      case "list_agent_modules": {
        const registryPath = path.join(BASE_DIR, "client/src/lib/agent-modules.json");
        let registry: any[] = [];
        try { registry = JSON.parse(await readFile(registryPath, "utf8")); } catch {}
        if (registry.length === 0) return "No agent-written modules registered.";
        return `Agent modules (${registry.length}):\n${registry.map((m: any) => `- [${m.tabId}] ${m.label} (group: ${m.groupId}, icon: ${m.icon}) — created ${m.createdAt}`).join("\n")}`;
      }
      case "delete_agent_module": {
        const { tabId: delTabId } = args;
        if (!delTabId) return "Error: tabId is required.";
        const registryPath = path.join(BASE_DIR, "client/src/lib/agent-modules.json");
        const indexPath = path.join(BASE_DIR, "client/src/components/tabs/index.ts");
        let registry: any[] = [];
        try { registry = JSON.parse(await readFile(registryPath, "utf8")); } catch {}
        const mod = registry.find((m: any) => m.tabId === delTabId);
        if (!mod) return `Error: module with tabId "${delTabId}" not found.`;
        registry = registry.filter((m: any) => m.tabId !== delTabId);
        await writeFile(registryPath, JSON.stringify(registry, null, 2), "utf8");
        const componentPath = path.join(BASE_DIR, "client/src/components/tabs", `${mod.name}Tab.tsx`);
        try { await rm(componentPath); } catch {}
        const indexContent = await readFile(indexPath, "utf8");
        const exportLine = `export { ${mod.name}Tab } from "./${mod.name}Tab";\n`;
        await writeFile(indexPath, indexContent.replace(exportLine, ""), "utf8");
        await logMaster("agent", "delete_agent_module", { tabId: delTabId, name: mod.name });
        return `Module "${mod.name}Tab" (tabId: ${delTabId}) deleted from codebase and registry.`;
      }
      case "spawn_agent": {
        const agentName = (args.name || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
        if (!agentName) return "Error: agent name is required";
        if (!args.directives) return "Error: directives are required";
        const existing = await storage.getAgentInstance(agentName);
        if (existing) return `Error: agent "${agentName}" already exists (id: ${existing.id})`;
        const sentinelSeedIndices: number[] = Array.isArray(args.sentinel_seed_indices) && args.sentinel_seed_indices.length === 3
          ? args.sentinel_seed_indices
          : [10, 11, 12];
        const seeds = initAgentSeeds().map(s => ({
          ...s,
          isSentinel: sentinelSeedIndices.includes(s.index),
        }));
        const agent = await storage.createAgentInstance({
          name: agentName,
          slot: args.slot || "zfae",
          directives: args.directives,
          tools: Array.isArray(args.tools) ? args.tools : [],
          status: "idle",
          seeds,
          sentinelSeedIndices,
          zfaeObservations: [],
          isPersistent: false,
        });
        await logMaster("agent", "spawn_agent", { name: agentName, slot: agent.slot, tools: agent.tools });
        return JSON.stringify({ id: agent.id, name: agent.name, slot: agent.slot, status: agent.status, seeds: agent.seeds?.length, sentinelSeedIndices });
      }
      case "list_agents": {
        const agents = await storage.getAgentInstances();
        if (agents.length === 0) return "No agent instances found.";
        return agents.map(a => {
          const sentinels = (a.seeds || []).filter((s: any) => a.sentinelSeedIndices?.includes(s.index));
          const sentinelSummary = sentinels.map((s: any) => `s${s.index}=${s.value?.toFixed(3) ?? "?"}:${s.summary?.slice(0, 30) || "—"}`).join(" | ");
          return `[${a.id}] ${a.name} (slot:${a.slot}, status:${a.status}, persistent:${a.isPersistent}) observations:${(a.zfaeObservations || []).length} sentinels:[${sentinelSummary}] last:"${(a.lastOutput || "").slice(0, 80)}"`;
        }).join("\n");
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}
