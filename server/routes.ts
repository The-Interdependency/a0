import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import { storage } from "./storage";
import { getUncachableGmailClient } from "./gmail";
import { getUncachableGoogleDriveClient } from "./drive";
import { getGrokClient } from "./xai";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { InsertConversation, InsertMessage } from "@shared/schema";
import {
  processA0Request, verifyHashChain, startHeartbeat, stopHeartbeat,
  emergencyStopEngine, resumeEngine, ENGINE_STATUS,
  trackCost, estimateCost, edcmDisposition, ptcaSolve,
  type A0Request,
} from "./a0p-engine";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { db } from "./db";
import { sql } from "drizzle-orm";

const execAsync = promisify(exec);

const geminiAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function buildGeminiHistory(msgs: { role: string; content: string }[]) {
  return msgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ============ CONVERSATIONS ============

  app.get("/api/conversations", async (_req, res) => {
    try {
      const convs = await storage.getConversations();
      res.json(convs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/conversations", async (req, res) => {
    try {
      const { title = "New Task", model = "agent" } = req.body;
      const conv = await storage.createConversation({ title, model } as InsertConversation);
      res.json(conv);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const [conv, msgs] = await Promise.all([
        storage.getConversation(id),
        storage.getMessages(id),
      ]);
      if (!conv) return res.status(404).json({ error: "Not found" });
      res.json({ ...conv, messages: msgs });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/conversations/:id", async (req, res) => {
    try {
      await storage.deleteConversation(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ CHAT / AI ============

  const userContextStore: Record<string, { systemPrompt: string; contextPrefix: string }> = {};
  const userApiKeys: Record<string, Record<string, string>> = {};

  app.post("/api/context", (req, res) => {
    const { systemPrompt, contextPrefix } = req.body;
    const userId = (req as any).user?.claims?.sub || "default";
    userContextStore[userId] = { systemPrompt, contextPrefix };
    res.json({ ok: true });
  });

  app.get("/api/context", (req, res) => {
    const userId = (req as any).user?.claims?.sub || "default";
    res.json(userContextStore[userId] || {
      systemPrompt: "You are a0p, an elite AI agent. You help with cloud infrastructure, file automation, system tasks, and coding. Be concise, technical, and precise.",
      contextPrefix: "EDCMBONE operator discernment active. PCNA 53-node topology. PTCA explicit-Euler. SHA-256 hash chain. 9 sentinels preflight/postflight. hmmm invariant enforced.",
    });
  });

  app.get("/api/keys", (req, res) => {
    const userId = (req as any).user?.claims?.sub || "default";
    const keys = userApiKeys[userId] || {};
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) {
      masked[k] = v ? `${v.slice(0, 4)}...${v.slice(-4)}` : "";
    }
    res.json(masked);
  });

  app.post("/api/keys", (req, res) => {
    const userId = (req as any).user?.claims?.sub || "default";
    const { provider, key } = req.body;
    const validProviders = ["openai", "anthropic", "mistral", "cohere", "perplexity"];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Valid: ${validProviders.join(", ")}` });
    }
    if (!userApiKeys[userId]) userApiKeys[userId] = {};
    if (key) {
      userApiKeys[userId][provider] = key;
    } else {
      delete userApiKeys[userId][provider];
    }
    res.json({ ok: true, provider, set: !!key });
  });

  // ============ AI REST ENDPOINTS ============

  const BUILTIN_MODELS = [
    { id: "gemini", provider: "gemini", name: "Gemini 2.5 Flash", contextWindow: 1048576, maxOutput: 8192, builtin: true },
    { id: "grok", provider: "grok", name: "Grok-3 Mini", contextWindow: 131072, maxOutput: 16384, builtin: true },
  ];

  const BYO_MODELS: Record<string, { models: { id: string; name: string; contextWindow: number; maxOutput: number }[]; baseURL?: string; openaiCompat: boolean }> = {
    openai: {
      openaiCompat: true,
      models: [
        { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, maxOutput: 16384 },
        { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, maxOutput: 16384 },
        { id: "o3-mini", name: "o3-mini", contextWindow: 200000, maxOutput: 100000 },
      ],
    },
    anthropic: {
      openaiCompat: false,
      models: [
        { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000, maxOutput: 16384 },
        { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000, maxOutput: 8192 },
      ],
    },
    mistral: {
      openaiCompat: true,
      baseURL: "https://api.mistral.ai/v1",
      models: [
        { id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128000, maxOutput: 8192 },
        { id: "mistral-small-latest", name: "Mistral Small", contextWindow: 32000, maxOutput: 8192 },
      ],
    },
    cohere: {
      openaiCompat: false,
      models: [
        { id: "command-r-plus", name: "Command R+", contextWindow: 128000, maxOutput: 4096 },
        { id: "command-r", name: "Command R", contextWindow: 128000, maxOutput: 4096 },
      ],
    },
    perplexity: {
      openaiCompat: true,
      baseURL: "https://api.perplexity.ai",
      models: [
        { id: "sonar-pro", name: "Sonar Pro", contextWindow: 200000, maxOutput: 8192 },
        { id: "sonar", name: "Sonar", contextWindow: 128000, maxOutput: 8192 },
      ],
    },
  };

  app.get("/api/ai/models", (req, res) => {
    const userId = (req as any).user?.claims?.sub || "default";
    const keys = userApiKeys[userId] || {};
    const models = [...BUILTIN_MODELS];
    for (const [provider, cfg] of Object.entries(BYO_MODELS)) {
      const hasKey = !!keys[provider];
      for (const m of cfg.models) {
        const entry: any = {
          id: `${provider}/${m.id}`,
          provider,
          name: m.name,
          contextWindow: m.contextWindow,
          maxOutput: m.maxOutput,
          builtin: false,
          openaiCompat: cfg.openaiCompat,
        };
        if (!hasKey) {
          entry.disabled = true;
          entry.reason = "API key not configured";
        } else if (!cfg.openaiCompat) {
          entry.disabled = true;
          entry.reason = "Native adapter coming soon (stubbed)";
        }
        models.push(entry);
      }
    }
    res.json(models);
  });

  function getOpenAICompatClient(provider: string, apiKey: string): OpenAI {
    const cfg = BYO_MODELS[provider];
    return new OpenAI({
      apiKey,
      ...(cfg?.baseURL ? { baseURL: cfg.baseURL } : {}),
    });
  }

  function validateBYOModel(model: string, userId: string) {
    const parts = model.split("/");
    if (parts.length !== 2) return { error: `Invalid model format. Use "gemini", "grok", or "provider/model-id"`, status: 400 };
    const [provider, modelId] = parts;
    const keys = userApiKeys[userId] || {};
    const apiKey = keys[provider];
    if (!apiKey) return { error: `No API key configured for ${provider}. Add one in Console > Context.`, status: 401 };
    const providerCfg = BYO_MODELS[provider];
    if (!providerCfg) return { error: `Unknown provider: ${provider}`, status: 400 };
    const modelCfg = providerCfg.models.find((m) => m.id === modelId);
    if (!modelCfg) return { error: `Unknown model: ${modelId} for provider ${provider}`, status: 400 };
    return { provider, modelId, modelCfg, apiKey, providerCfg };
  }

  app.post("/api/ai/complete", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { model, messages, systemPrompt: customSystem, maxTokens, temperature } = req.body;

      if (!model) return res.status(400).json({ error: "model is required" });
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const ctx = userContextStore[userId] || {
        systemPrompt: "You are a0p, an elite AI agent.",
        contextPrefix: "EDCMBONE operator discernment active.",
      };
      const sysPrompt = customSystem || `${ctx.systemPrompt}\n\n${ctx.contextPrefix}`;

      if (model === "gemini") {
        const geminiHistory = messages.slice(0, -1).map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const lastMsg = messages[messages.length - 1];
        const result = await geminiAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [...geminiHistory, { role: "user", parts: [{ text: lastMsg.content }] }],
          config: { systemInstruction: sysPrompt, maxOutputTokens: maxTokens || 8192 },
        });
        const text = result.text || "";
        const promptTokens = Math.ceil(messages.reduce((s: number, m: any) => s + m.content.length, 0) / 4);
        const completionTokens = Math.ceil(text.length / 4);
        await trackCost(userId === "default" ? null : userId, "gemini", promptTokens, completionTokens);
        return res.json({
          model: "gemini-2.5-flash",
          content: text,
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
        });
      }

      if (model === "grok") {
        const client = getGrokClient();
        const chatMsgs = [
          { role: "system" as const, content: sysPrompt },
          ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const result = await client.chat.completions.create({
          model: "grok-3-mini",
          messages: chatMsgs,
          max_tokens: maxTokens || 16384,
          ...(temperature != null ? { temperature } : {}),
        });
        const text = result.choices[0]?.message?.content || "";
        const usage = result.usage;
        await trackCost(userId === "default" ? null : userId, "grok", usage?.prompt_tokens || 0, usage?.completion_tokens || 0);
        return res.json({
          model: "grok-3-mini",
          content: text,
          usage: {
            promptTokens: usage?.prompt_tokens || 0,
            completionTokens: usage?.completion_tokens || 0,
            totalTokens: usage?.total_tokens || 0,
          },
        });
      }

      const validated = validateBYOModel(model, userId);
      if (validated.error) return res.status(validated.status!).json({ error: validated.error });
      const { provider, modelId, modelCfg, apiKey: byoKey, providerCfg } = validated;

      if (!providerCfg!.openaiCompat) {
        return res.status(400).json({
          error: `${provider} requires a native SDK adapter (not OpenAI-compatible). Use built-in Gemini/Grok, or an OpenAI-compatible provider (OpenAI, Mistral, Perplexity).`,
          hint: `${provider} integration is stubbed — full native adapter coming soon.`,
        });
      }

      const client = getOpenAICompatClient(provider!, byoKey!);
      const chatMsgs = [
        { role: "system" as const, content: sysPrompt },
        ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      const result = await client.chat.completions.create({
        model: modelId!,
        messages: chatMsgs,
        max_tokens: maxTokens || modelCfg!.maxOutput,
        ...(temperature != null ? { temperature } : {}),
      });

      const text = result.choices[0]?.message?.content || "";
      const usage = result.usage;
      await trackCost(userId === "default" ? null : userId, provider!, usage?.prompt_tokens || 0, usage?.completion_tokens || 0);
      return res.json({
        model: modelId,
        provider,
        content: text,
        usage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
      });
    } catch (e: any) {
      console.error("AI complete error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai/stream", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { model, messages, systemPrompt: customSystem, maxTokens, temperature } = req.body;

      if (!model) return res.status(400).json({ error: "model is required" });
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const ctx = userContextStore[userId] || {
        systemPrompt: "You are a0p, an elite AI agent.",
        contextPrefix: "EDCMBONE operator discernment active.",
      };
      const sysPrompt = customSystem || `${ctx.systemPrompt}\n\n${ctx.contextPrefix}`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let fullResponse = "";

      if (model === "gemini") {
        const geminiHistory = messages.slice(0, -1).map((m: any) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const lastMsg = messages[messages.length - 1];
        const stream = await geminiAI.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [...geminiHistory, { role: "user", parts: [{ text: lastMsg.content }] }],
          config: { systemInstruction: sysPrompt, maxOutputTokens: maxTokens || 8192 },
        });
        for await (const chunk of stream) {
          const text = chunk.text || "";
          if (text) {
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          }
        }
      } else if (model === "grok") {
        const client = getGrokClient();
        const chatMsgs = [
          { role: "system" as const, content: sysPrompt },
          ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const stream = await client.chat.completions.create({
          model: "grok-3-mini",
          messages: chatMsgs,
          max_tokens: maxTokens || 16384,
          ...(temperature != null ? { temperature } : {}),
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }
      } else {
        const validated = validateBYOModel(model, userId);
        if (validated.error) {
          res.write(`data: ${JSON.stringify({ error: validated.error, done: true })}\n\n`);
          return res.end();
        }
        const { provider, modelId, modelCfg, apiKey: byoKey, providerCfg } = validated;

        if (!providerCfg!.openaiCompat) {
          res.write(`data: ${JSON.stringify({ error: `${provider} requires a native SDK adapter (not OpenAI-compatible). Use OpenAI, Mistral, or Perplexity.`, done: true })}\n\n`);
          return res.end();
        }

        const client = getOpenAICompatClient(provider!, byoKey!);
        const chatMsgs = [
          { role: "system" as const, content: sysPrompt },
          ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];
        const stream = await client.chat.completions.create({
          model: modelId!,
          messages: chatMsgs,
          max_tokens: maxTokens || modelCfg!.maxOutput,
          ...(temperature != null ? { temperature } : {}),
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }
      }

      const promptTokens = Math.ceil(messages.reduce((s: number, m: any) => s + m.content.length, 0) / 4);
      const completionTokens = Math.ceil(fullResponse.length / 4);
      const resolvedProvider = model.includes("/") ? model.split("/")[0] : model;
      await trackCost(userId === "default" ? null : userId, resolvedProvider, promptTokens, completionTokens);

      res.write(`data: ${JSON.stringify({ done: true, usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens } })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("AI stream error:", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.post("/api/ai/estimate", (req, res) => {
    const { model, promptLength, maxTokens } = req.body;
    if (!model || !promptLength) return res.status(400).json({ error: "model and promptLength required" });
    const cost = estimateCost(model.includes("/") ? model.split("/")[0] : model, promptLength, maxTokens || 2048);
    res.json({ model, estimatedCost: cost });
  });

  const AGENT_TOOLS = [
    {
      name: "run_command",
      description: "Execute a shell command. Available commands: ls, pwd, echo, cat, find, grep, head, tail, mkdir, touch, cp, mv, rm, curl, wget, python3, node, npm, npx, git, sed, awk, sort, wc, diff, date, ps, df, du, whoami, uname",
      parameters: { type: "object" as const, properties: { command: { type: "string" as const, description: "The shell command to execute" } }, required: ["command"] },
    },
    {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: { type: "object" as const, properties: { path: { type: "string" as const, description: "File path relative to project root" } }, required: ["path"] },
    },
    {
      name: "write_file",
      description: "Write content to a file (creates or overwrites)",
      parameters: { type: "object" as const, properties: { path: { type: "string" as const, description: "File path" }, content: { type: "string" as const, description: "File content" } }, required: ["path", "content"] },
    },
    {
      name: "list_files",
      description: "List files and directories at a path",
      parameters: { type: "object" as const, properties: { path: { type: "string" as const, description: "Directory path, defaults to ." } }, required: [] as string[] },
    },
    {
      name: "search_files",
      description: "Search for a pattern across files using grep",
      parameters: { type: "object" as const, properties: { pattern: { type: "string" as const, description: "Search pattern (regex)" }, path: { type: "string" as const, description: "Directory to search in, defaults to ." } }, required: ["pattern"] },
    },
    {
      name: "list_gmail",
      description: "List recent Gmail inbox messages",
      parameters: { type: "object" as const, properties: { maxResults: { type: "number" as const, description: "Max messages to return (default 10)" } }, required: [] as string[] },
    },
    {
      name: "read_gmail",
      description: "Read a specific Gmail message by ID",
      parameters: { type: "object" as const, properties: { messageId: { type: "string" as const, description: "Gmail message ID" } }, required: ["messageId"] },
    },
    {
      name: "send_gmail",
      description: "Send an email via Gmail",
      parameters: { type: "object" as const, properties: { to: { type: "string" as const }, subject: { type: "string" as const }, body: { type: "string" as const } }, required: ["to", "subject", "body"] },
    },
    {
      name: "list_drive",
      description: "List Google Drive files, optionally filtered by folder",
      parameters: { type: "object" as const, properties: { folderId: { type: "string" as const, description: "Folder ID (optional, defaults to root)" } }, required: [] as string[] },
    },
  ];

  async function executeAgentTool(toolName: string, args: any): Promise<string> {
    try {
      switch (toolName) {
        case "run_command": {
          const cmd = (args.command || "").trim();
          const baseCmd = cmd.split(/\s+/)[0].split("/").pop()!;
          if (!ALLOWED_COMMANDS.has(baseCmd)) return `Error: '${baseCmd}' is not an allowed command.`;
          const { stdout, stderr } = await execAsync(cmd, { timeout: 10000, cwd: BASE_DIR });
          return (stdout + stderr).trim().slice(0, 4000) || "(no output)";
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
        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
  }

  app.post("/api/conversations/:id/chat", async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content?.trim()) return res.status(400).json({ error: "Content required" });

      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      await storage.createMessage({ conversationId, role: "user", content, model: "agent" } as InsertMessage);

      const history = await storage.getMessages(conversationId);
      const prevMessages = history.slice(0, -1);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const userId = (req as any).user?.claims?.sub || "default";
      const ctx = userContextStore[userId] || {
        systemPrompt: "You are a0p, an elite AI agent.",
        contextPrefix: "EDCMBONE operator discernment active.",
      };

      const agentSystemPrompt = `${ctx.systemPrompt}

${ctx.contextPrefix}

You are agent zero (a0p) — an autonomous AI agent with tool access. You can execute commands, read/write files, search code, check Gmail, browse Google Drive, and send emails.

IMPORTANT RULES:
- When a user asks you to DO something, use your tools. Don't just describe what to do.
- Execute commands, read files, search code — take action.
- Show your work: explain what you're doing and why.
- If a tool call fails, try an alternative approach.
- Be concise in your explanations but thorough in your actions.
- For complex tasks, break them into steps and execute each one.
- You have full access to the project filesystem and terminal.`;

      const geminiTools = [{
        functionDeclarations: AGENT_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];

      const geminiHistory = prevMessages.map((m) => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      }));

      let contents = [
        ...geminiHistory,
        { role: "user" as const, parts: [{ text: content }] },
      ];

      let fullResponse = "";
      let totalPromptTokens = 0;
      let totalCompletionTokens = 0;
      const MAX_TOOL_ROUNDS = 8;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await geminiAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: agentSystemPrompt,
            maxOutputTokens: 8192,
            tools: geminiTools,
          },
        });

        totalPromptTokens += Math.ceil(JSON.stringify(contents).length / 4);

        const candidate = result.candidates?.[0];
        if (!candidate?.content?.parts) break;

        const parts = candidate.content.parts;
        let hasToolCalls = false;
        const toolResultParts: any[] = [];

        for (const part of parts) {
          if (part.text) {
            fullResponse += part.text;
            res.write(`data: ${JSON.stringify({ content: part.text })}\n\n`);
          }

          if (part.functionCall) {
            hasToolCalls = true;
            const { name, args } = part.functionCall;
            res.write(`data: ${JSON.stringify({ tool_call: { name, args } })}\n\n`);

            const toolResult = await executeAgentTool(name, args || {});
            res.write(`data: ${JSON.stringify({ tool_result: { name, result: toolResult.slice(0, 2000) } })}\n\n`);

            toolResultParts.push({
              functionResponse: { name, response: { result: toolResult } },
            });
          }
        }

        if (!hasToolCalls) break;

        contents = [
          ...contents,
          { role: "model" as const, parts },
          { role: "user" as const, parts: toolResultParts },
        ];
      }

      totalCompletionTokens = Math.ceil(fullResponse.length / 4);

      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: fullResponse,
        model: "agent",
      } as InsertMessage);

      await trackCost(userId === "default" ? null : userId, "gemini", totalPromptTokens, totalCompletionTokens);

      if (history.length === 1) {
        const title = content.slice(0, 60).replace(/\n/g, " ") || "New Task";
        await storage.updateConversationTitle(conversationId, title);
      }

      res.write(`data: ${JSON.stringify({ done: true, tokens: { prompt: totalPromptTokens, completion: totalCompletionTokens } })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("Agent error:", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // ============ TERMINAL ============

  const ALLOWED_COMMANDS = new Set([
    "ls", "pwd", "echo", "cat", "find", "grep", "head", "tail",
    "mkdir", "touch", "cp", "mv", "rm", "chmod", "env", "date",
    "ps", "df", "du", "which", "whoami", "uname", "curl", "wget",
    "python3", "node", "npm", "npx", "git", "tar", "zip", "unzip",
    "sed", "awk", "sort", "wc", "diff",
  ]);

  app.post("/api/terminal/exec", async (req, res) => {
    try {
      const { command } = req.body;
      if (!command?.trim()) return res.status(400).json({ error: "Command required" });

      const cmd = command.trim();
      const baseCmd = cmd.split(/\s+/)[0].split("/").pop()!;

      if (!ALLOWED_COMMANDS.has(baseCmd)) {
        const entry = await storage.addCommandHistory({ command: cmd, output: `Permission denied: '${baseCmd}' not allowed`, exitCode: 1 });
        return res.json({ output: entry.output, exitCode: 1 });
      }

      try {
        const { stdout, stderr } = await execAsync(cmd, {
          timeout: 10000,
          cwd: process.cwd(),
          env: { ...process.env },
        });
        const output = (stdout + stderr).trim() || "(no output)";
        const entry = await storage.addCommandHistory({ command: cmd, output, exitCode: 0 });
        res.json({ output: entry.output, exitCode: 0 });
      } catch (err: any) {
        const output = (err.stderr || err.message || "Command failed").trim();
        const entry = await storage.addCommandHistory({ command: cmd, output, exitCode: err.code || 1 });
        res.json({ output: entry.output, exitCode: err.code || 1 });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/terminal/history", async (_req, res) => {
    try {
      const hist = await storage.getCommandHistory();
      res.json(hist);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/terminal/history", async (_req, res) => {
    try {
      await storage.clearCommandHistory();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ FILE MANAGER ============

  const BASE_DIR = process.cwd();

  function safePath(p: string) {
    const resolved = path.resolve(BASE_DIR, p || ".");
    if (!resolved.startsWith(BASE_DIR)) throw new Error("Path traversal not allowed");
    return resolved;
  }

  app.get("/api/files", async (req, res) => {
    try {
      const dir = req.query.path as string || ".";
      const resolved = safePath(dir);
      const entries = await readdir(resolved, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (e) => {
          const itemPath = path.join(resolved, e.name);
          let size = 0;
          try {
            const s = await stat(itemPath);
            size = s.size;
          } catch {}
          return {
            name: e.name,
            type: e.isDirectory() ? "directory" : "file",
            path: path.relative(BASE_DIR, itemPath),
            size,
          };
        })
      );
      items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
      res.json({ path: path.relative(BASE_DIR, resolved) || ".", items });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/files/read", async (req, res) => {
    try {
      const filePath = req.query.path as string;
      if (!filePath) return res.status(400).json({ error: "Path required" });
      const resolved = safePath(filePath);
      const content = await readFile(resolved, "utf-8");
      res.json({ content, path: filePath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/files/write", async (req, res) => {
    try {
      const { path: filePath, content } = req.body;
      const resolved = safePath(filePath);
      await writeFile(resolved, content, "utf-8");
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/files/move", async (req, res) => {
    try {
      const { from, to } = req.body;
      const src = safePath(from);
      const dst = safePath(to);
      await rename(src, dst);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ AUTOMATION / SPEC PARSER ============

  app.get("/api/automation", async (_req, res) => {
    try {
      res.json(await storage.getAutomationTasks());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/automation", async (req, res) => {
    try {
      const { name, specContent } = req.body;
      const task = await storage.createAutomationTask({ name, specContent, status: "pending" });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/automation/:id/run", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const task = await storage.getAutomationTask(id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      await storage.updateAutomationTask(id, { status: "running" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const prompt = `You are a cloud infrastructure automation agent. Analyze this spec.md and provide a detailed step-by-step implementation plan with commands to run:\n\n${task.specContent}`;

      const stream = await geminiAI.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      let fullResult = "";
      for await (const chunk of stream) {
        const text = chunk.text || "";
        if (text) {
          fullResult += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      await storage.updateAutomationTask(id, { status: "completed", result: fullResult });
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("Automation error:", e);
      await storage.updateAutomationTask(parseInt(req.params.id), { status: "failed", result: e.message });
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  });

  app.delete("/api/automation/:id", async (req, res) => {
    try {
      await storage.deleteAutomationTask(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ GMAIL ============

  app.get("/api/gmail/messages", async (_req, res) => {
    try {
      const gmail = await getUncachableGmailClient();
      const list = await gmail.users.messages.list({ userId: "me", maxResults: 20, labelIds: ["INBOX"] });
      const ids = list.data.messages || [];

      const details = await Promise.all(
        ids.slice(0, 15).map(async (m) => {
          const msg = await gmail.users.messages.get({
            userId: "me",
            id: m.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From", "Date"],
          });
          const headers = msg.data.payload?.headers || [];
          const get = (name: string) => headers.find((h) => h.name === name)?.value || "";
          return {
            id: m.id,
            subject: get("Subject") || "(no subject)",
            from: get("From"),
            date: get("Date"),
            snippet: msg.data.snippet || "",
          };
        })
      );
      res.json(details);
    } catch (e: any) {
      console.error("Gmail error:", e);
      res.status(503).json({ error: "Gmail not connected or unauthorized", detail: e.message });
    }
  });

  app.get("/api/gmail/messages/:id", async (req, res) => {
    try {
      const gmail = await getUncachableGmailClient();
      const msg = await gmail.users.messages.get({ userId: "me", id: req.params.id, format: "full" });
      const headers = msg.data.payload?.headers || [];
      const get = (name: string) => headers.find((h) => h.name === name)?.value || "";
      let body = "";
      const parts = msg.data.payload?.parts || [];
      const textPart = parts.find((p) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      } else if (msg.data.payload?.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, "base64").toString("utf-8");
      }
      res.json({
        id: msg.data.id,
        subject: get("Subject"),
        from: get("From"),
        to: get("To"),
        date: get("Date"),
        body,
        snippet: msg.data.snippet,
      });
    } catch (e: any) {
      res.status(503).json({ error: e.message });
    }
  });

  app.post("/api/gmail/send", async (req, res) => {
    try {
      const { to, subject, body } = req.body;
      const gmail = await getUncachableGmailClient();
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
      )
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(503).json({ error: e.message });
    }
  });

  // ============ GOOGLE DRIVE ============

  app.get("/api/drive/files", async (req, res) => {
    try {
      const drive = await getUncachableGoogleDriveClient();
      const folderId = req.query.folderId as string | undefined;
      const query = folderId
        ? `'${folderId}' in parents and trashed=false`
        : "'root' in parents and trashed=false";

      const list = await drive.files.list({
        q: query,
        fields: "files(id,name,mimeType,size,modifiedTime,parents)",
        pageSize: 50,
        orderBy: "folder,name",
      });
      res.json(list.data.files || []);
    } catch (e: any) {
      console.error("Drive error:", e);
      res.status(503).json({ error: "Google Drive not connected", detail: e.message });
    }
  });

  app.get("/api/drive/files/:id", async (req, res) => {
    try {
      const drive = await getUncachableGoogleDriveClient();
      const file = await drive.files.get({
        fileId: req.params.id,
        fields: "id,name,mimeType,size,modifiedTime",
      });
      res.json(file.data);
    } catch (e: any) {
      res.status(503).json({ error: e.message });
    }
  });

  // ============ A0P ENGINE ============

  startHeartbeat();
  ENGINE_STATUS.isRunning = true;

  app.post("/api/a0p/process", async (req, res) => {
    try {
      if (ENGINE_STATUS.emergencyStop) {
        return res.status(503).json({ error: "Engine emergency stopped" });
      }
      const request: A0Request = req.body;
      const result = await processA0Request(request);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/a0p/events", async (req, res) => {
    try {
      const taskId = req.query.taskId as string | undefined;
      if (taskId) {
        const events = await storage.getEvents(taskId);
        res.json(events);
      } else {
        const events = await storage.getRecentEvents(100);
        res.json(events);
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/a0p/chain/verify", async (_req, res) => {
    try {
      const result = await verifyHashChain();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/a0p/heartbeat", async (_req, res) => {
    try {
      const logs = await storage.getHeartbeats(24);
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/a0p/status", (_req, res) => {
    res.json({
      isRunning: ENGINE_STATUS.isRunning,
      emergencyStop: ENGINE_STATUS.emergencyStop,
      uptime: process.uptime(),
    });
  });

  app.post("/api/a0p/emergency-stop", (_req, res) => {
    emergencyStopEngine();
    res.json({ ok: true, status: "STOPPED" });
  });

  app.post("/api/a0p/resume", (_req, res) => {
    resumeEngine();
    res.json({ ok: true, status: "RUNNING" });
  });

  // ============ COST METRICS ============

  app.get("/api/metrics/costs", async (_req, res) => {
    try {
      const summary = await storage.getCostSummary();
      res.json(summary);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/metrics/costs/history", async (_req, res) => {
    try {
      const metrics = await storage.getCostMetrics();
      res.json(metrics);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ EDCM SNAPSHOTS ============

  app.get("/api/edcm/snapshots", async (_req, res) => {
    try {
      const snaps = await storage.getEdcmSnapshots(50);
      res.json(snaps);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/edcm/evaluate", async (req, res) => {
    try {
      const { grokVec, geminiVec, userVec } = req.body;
      const result = edcmDisposition(grokVec, geminiVec, userVec);
      const ptca = ptcaSolve([]);
      res.json({ edcm: result, ptca: { energy: ptca.energy, statePreview: ptca.state.slice(0, 10) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ STRIPE PAYMENTS ============

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true
        ORDER BY pr.unit_amount
      `);
      res.json(result.rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId required" });

      const stripe = await getUncachableStripeClient();
      const user = (req as any).user?.claims;
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      let customerId: string | undefined;
      if (user?.email) {
        const existing = await stripe.customers.list({ email: user.email, limit: 1 });
        if (existing.data.length > 0) {
          customerId = existing.data[0].id;
        } else {
          const customer = await stripe.customers.create({
            email: user.email,
            name: `${user.first_name || ""} ${user.last_name || ""}`.trim() || undefined,
            metadata: { userId: user.sub },
          });
          customerId = customer.id;
        }
      }

      const price = await stripe.prices.retrieve(priceId);
      const mode = price.recurring ? "subscription" : "payment";

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode,
        success_url: `${baseUrl}/pricing?success=true`,
        cancel_url: `${baseUrl}/pricing?canceled=true`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Checkout error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/portal", async (req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const user = (req as any).user?.claims;
      if (!user?.email) return res.status(401).json({ error: "Not authenticated" });

      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        return res.status(404).json({ error: "No billing account found" });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${baseUrl}/pricing`,
      });

      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
