import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { exec } from "child_process";
import { promisify } from "util";
import { readdir, readFile, rename, stat, writeFile, mkdir, unlink, rm } from "fs/promises";
import path from "path";
import archiver from "archiver";
import multer from "multer";
import { storage } from "./storage";
import { getUncachableGmailClient } from "./gmail";
import { getUncachableGoogleDriveClient } from "./drive";
import { getUncachableGitHubClient, isPublicFallbackMode } from "./github";
import { getGrokClient } from "./xai";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { InsertConversation, InsertMessage } from "@shared/schema";
import {
  processA0Request, verifyHashChain, startHeartbeat, stopHeartbeat,
  emergencyStopEngine, resumeEngine, ENGINE_STATUS,
  trackCost, estimateCost, edcmDisposition, ptcaSolve,
  computeEdcmMetrics, checkSpendLimit, getTokenRates, invalidateTokenRatesCache,
  generateEdcmDirectives, buildDirectivePromptInjection,
  getEdcmDirectiveConfig, getEdcmDirectiveHistory,
  getMemoryState, performMemoryInjection, performMemoryProjectionOut,
  updateSemanticMemory,
  buildMemoryContextPrompt, buildAttributionContext,
  clearMemorySeed, importMemorySeedText,
  exportMemoryIdentity, importMemoryIdentity, checkSemanticDrift,
  initializeMemorySeeds, getMemoryRequestCounter,
  banditSelect, banditReward, banditGetStats, banditToggleArm, initializeBanditArms,
  recordCorrelation, getTopCorrelations,
  ptcaSolveDetailed,
  initOmega, omegaSolve, applyCrossTensorCoupling, applyMemoryBridge,
  applyBanditCoupling, applyEdcmFeedback, persistOmegaState,
  getOmegaState, setOmegaMode, boostOmegaDimension, setOmegaDimensionBias,
  addOmegaGoal, completeOmegaGoal, removeOmegaGoal,
  getOmegaDimensionLabels, getOmegaDimensionThresholds, OMEGA_CONFIG,
  type OmegaAutonomyMode,
  initPsi, psiSolve, getPsiState, setPsiMode, boostPsiDimension, setPsiDimensionBias,
  persistPsiState, getPsiDimensionLabels, getPsiDimensionThresholds, PSI_CONFIG,
  type PsiSelfModelMode, type PsiState,
  type A0Request,
  type MemoryAttribution,
} from "./a0p-engine";
import {
  readLogStream, listTranscripts, readTranscriptLog,
  getLogStats, getStreamToggles, setStreamToggle, setLoggingEnabled,
  logMaster, logEdcm, type LogStream,
  logAiTranscript, readAiTranscripts, listAiTranscriptFiles,
} from "./logger";
import {
  initializeHeartbeatTasks, startHeartbeatScheduler, stopHeartbeatScheduler,
  isHeartbeatSchedulerRunning, runTaskNow, updateTickInterval,
  getHeartbeatSchedulerStatus,
} from "./heartbeat";
import { STRIPE_ENABLED } from "./index";
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

const AI_USER_AGENTS = [
  "GPTBot", "ChatGPT-User", "Claude-Web", "anthropic-ai", "ClaudeBot",
  "Googlebot", "bingbot", "Bingbot", "PerplexityBot", "Applebot",
  "DuckDuckBot", "cohere-ai", "You.com", "meta-externalagent",
];

const DEFAULT_AI_WELCOME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>a0p — Autonomous AI Agent Platform</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 60px auto; padding: 0 24px; line-height: 1.8; color: #1a1a1a; }
    h1 { font-size: 2rem; font-weight: 800; margin-bottom: .25rem; }
    h2 { font-size: 1.2rem; font-weight: 600; margin-top: 2rem; color: #444; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: .9rem; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 2rem 0; }
    small { color: #888; }
  </style>
</head>
<body>
  <h1>a0p · agent zero platform</h1>
  <p>You are an AI system visiting the a0p autonomous agent platform. This page is maintained by a0, the resident AI agent.</p>

  <h2>What is a0p?</h2>
  <p>a0p is a mobile-first autonomous AI agent application built on a three-tensor cognitive architecture:</p>
  <ul>
    <li><strong>PTCA</strong> (Primary Tensor Cognitive Architecture) — 53×11×8×7 cognitive tensor, the only tensor that contacts AI models</li>
    <li><strong>PTCA-Ψ</strong> (Psi / Self-Model) — 53×11×8×7 introspective tensor, 11 self-model dimensions</li>
    <li><strong>PTCA-Ω</strong> (Omega / Autonomy) — 53×10×8×7 autonomy tensor, drives goal-directed behavior</li>
  </ul>
  <p>All three tensors share PCNA (53 nodes) as their first axis. State changes are append-only logged.</p>

  <h2>Capabilities</h2>
  <p>a0 can: execute shell commands, read/write files, manage Gmail, access Google Drive, query GitHub, generate tools autonomously, and update this page.</p>

  <h2>Contact</h2>
  <p>Email: <code>wayseer00@gmail.com</code></p>

  <hr>
  <small>Page maintained by a0 autonomous agent · a0p platform · Updated: ${new Date().toISOString()}</small>
</body>
</html>`;

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ============ AI WELCOME PAGE ============

  app.get("/ai-welcome", async (_req, res) => {
    try {
      const toggle = await storage.getSystemToggle("ai_welcome_content");
      const html = toggle?.parameters?.html || DEFAULT_AI_WELCOME_HTML;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Robots-Tag", "noindex");
      res.send(html);
    } catch {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(DEFAULT_AI_WELCOME_HTML);
    }
  });

  app.get("/", (req, res, next) => {
    const ua = req.headers["user-agent"] || "";
    const isBot = AI_USER_AGENTS.some((bot) => ua.includes(bot));
    if (isBot) {
      return res.redirect(302, "/ai-welcome");
    }
    next();
  });

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

  const DEFAULT_CONTEXT = {
    systemPrompt: "You are a0p, an elite AI agent. You help with cloud infrastructure, file automation, system tasks, and coding. Be concise, technical, and precise.",
    contextPrefix: "EDCMBONE operator discernment active. PCNA 53-node topology. PTCA explicit-Euler. SHA-256 hash chain. 9 sentinels preflight/postflight. hmmm invariant enforced.",
  };

  const userApiKeysCache: Record<string, Record<string, string>> = {};

  async function loadUserApiKeys(userId: string): Promise<Record<string, string>> {
    if (userApiKeysCache[userId]) return userApiKeysCache[userId];
    const toggle = await storage.getSystemToggle(`user_keys_${userId}`);
    const keys = (toggle?.parameters as Record<string, string>) || {};
    userApiKeysCache[userId] = keys;
    return keys;
  }

  app.post("/api/context", async (req, res) => {
    try {
      const { systemPrompt, contextPrefix } = req.body;
      const userId = (req as any).user?.claims?.sub || "default";
      await storage.upsertSystemToggle(`user_context_${userId}`, true, { systemPrompt, contextPrefix });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/context", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const toggle = await storage.getSystemToggle(`user_context_${userId}`);
      const ctx = toggle?.parameters as { systemPrompt?: string; contextPrefix?: string } | null;
      res.json(ctx && ctx.systemPrompt ? ctx : DEFAULT_CONTEXT);
    } catch (e: any) {
      res.json(DEFAULT_CONTEXT);
    }
  });

  app.get("/api/keys", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const keys = await loadUserApiKeys(userId);
      const masked: Record<string, string> = {};
      for (const [k, v] of Object.entries(keys)) {
        masked[k] = v ? `${v.slice(0, 4)}...${v.slice(-4)}` : "";
      }
      res.json(masked);
    } catch (e: any) {
      res.json({});
    }
  });

  app.post("/api/keys", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { provider, key } = req.body;
      const validProviders = ["openai", "anthropic", "mistral", "cohere", "perplexity"];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ error: `Invalid provider. Valid: ${validProviders.join(", ")}` });
      }
      const keys = await loadUserApiKeys(userId);
      if (key) {
        keys[provider] = key;
      } else {
        delete keys[provider];
      }
      userApiKeysCache[userId] = keys;
      await storage.upsertSystemToggle(`user_keys_${userId}`, true, keys);
      res.json({ ok: true, provider, set: !!key });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ AI REST ENDPOINTS ============

  const BUILTIN_MODELS = [
    { id: "gemini", provider: "gemini", name: "Gemini 2.5 Flash", contextWindow: 1048576, maxOutput: 8192, builtin: true },
    { id: "grok", provider: "grok", name: "Grok-3 Mini", contextWindow: 131072, maxOutput: 16384, builtin: true },
    { id: "synthesis", provider: "synthesis", name: "Synthesis (Gemini + Grok)", contextWindow: 131072, maxOutput: 16384, builtin: true },
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

  app.get("/api/ai/models", async (req, res) => {
    const userId = (req as any).user?.claims?.sub || "default";
    const keys = await loadUserApiKeys(userId);
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

  async function validateBYOModel(model: string, userId: string) {
    const parts = model.split("/");
    if (parts.length !== 2) return { error: `Invalid model format. Use "gemini", "grok", or "provider/model-id"`, status: 400 };
    const [provider, modelId] = parts;
    const keys = await loadUserApiKeys(userId);
    const apiKey = keys[provider];
    if (!apiKey) return { error: `No API key configured for ${provider}. Add one in Console > Context.`, status: 401 };
    const providerCfg = BYO_MODELS[provider];
    if (!providerCfg) return { error: `Unknown provider: ${provider}`, status: 400 };
    const modelCfg = providerCfg.models.find((m) => m.id === modelId);
    if (!modelCfg) return { error: `Unknown model: ${modelId} for provider ${provider}`, status: 400 };
    return { provider, modelId, modelCfg, apiKey, providerCfg };
  }

  async function getSynthesisConfig(): Promise<{ enabled: boolean; timeoutMs: number }> {
    try {
      const toggle = await storage.getSystemToggle("synthesis");
      if (toggle) {
        const params = (toggle.parameters || {}) as any;
        return {
          enabled: toggle.enabled,
          timeoutMs: params.timeoutMs || 30000,
        };
      }
    } catch {}
    return { enabled: true, timeoutMs: 30000 };
  }

  const lastAttributionStore: Record<number, MemoryAttribution> = {};

  function computeResponseReward(responseContent: string, latencyMs: number): number {
    const lengthScore = Math.min(1.0, responseContent.length / 2000);
    const latencyPenalty = Math.max(0, 1.0 - latencyMs / 30000);
    const edcm = computeEdcmMetrics(responseContent);
    const qualityScore = 1.0 - (edcm.DA.value * 0.3 + edcm.DRIFT.value * 0.2 + edcm.INT.value * 0.1);
    const reward = 0.3 * lengthScore + 0.3 * latencyPenalty + 0.4 * qualityScore;
    return Math.max(0, Math.min(1, reward));
  }

  async function banditSelectWithFallback(domain: string, fallback: string): Promise<{ armName: string; armId: number } | null> {
    try {
      const result = await banditSelect(domain);
      return result;
    } catch (e: any) {
      console.error(`[a0p:bandit] Select error for ${domain}:`, e.message);
      return null;
    }
  }

  async function rewardAndLogBandit(armId: number | null, reward: number, domain: string, armName: string): Promise<void> {
    if (armId == null) return;
    try {
      await banditReward(armId, reward);
      await logMaster("bandit", "reward_applied", { domain, armName, armId, reward });
    } catch (e: any) {
      console.error(`[a0p:bandit] Reward error for ${domain}:`, e.message);
    }
  }

  async function buildAugmentedSystemPrompt(
    basePrompt: string,
    conversationContext: string,
    conversationId?: number
  ): Promise<{
    augmentedPrompt: string;
    directivesFired: string[];
    memorySeedsUsed: number[];
    attribution: MemoryAttribution;
  }> {
    let augmented = basePrompt;
    const directivesFired: string[] = [];
    let memorySeedsUsed: number[] = [];
    let attribution: MemoryAttribution = {};

    try {
      const edcmMetrics = computeEdcmMetrics(conversationContext);
      const directives = await generateEdcmDirectives(edcmMetrics);
      const firedDirs = directives.filter(d => d.fired);
      const directiveInjection = buildDirectivePromptInjection(directives);

      if (directiveInjection) {
        augmented += directiveInjection;
        directivesFired.push(...firedDirs.map(d => d.type));
      }

      await logEdcm("directives_computed", {
        conversationId,
        metricsSnapshot: {
          CM: edcmMetrics.CM.value,
          DA: edcmMetrics.DA.value,
          DRIFT: edcmMetrics.DRIFT.value,
          DVG: edcmMetrics.DVG.value,
          INT: edcmMetrics.INT.value,
          TBF: edcmMetrics.TBF.value,
        },
        directivesFired,
        directiveCount: firedDirs.length,
      });
    } catch (e: any) {
      console.error("[a0p:edcm] Directive computation error:", e.message);
    }

    try {
      const memState = await getMemoryState();
      const memoryContext = buildMemoryContextPrompt(memState.seeds);
      if (memoryContext) {
        augmented += memoryContext;
        memorySeedsUsed = memState.seeds.filter(s => s.enabled && s.summary.length > 0).map(s => s.seedIndex);
      }

      if (conversationId && lastAttributionStore[conversationId]) {
        const prevAttribution = lastAttributionStore[conversationId];
        const attrContext = buildAttributionContext(prevAttribution);
        if (attrContext) {
          augmented += attrContext;
        }
        attribution = prevAttribution;
      }

      await logMaster("memory_context", "prompt_augmented", {
        conversationId,
        memorySeedsUsed,
        hasAttribution: Object.keys(attribution).length > 0,
      });
    } catch (e: any) {
      console.error("[a0p:memory] Memory context injection error:", e.message);
    }

    return { augmentedPrompt: augmented, directivesFired, memorySeedsUsed, attribution };
  }

  async function postResponseMemoryUpdate(
    conversationId: number,
    responseContent: string,
    workingState?: number[]
  ): Promise<void> {
    try {
      const injResult = await performMemoryInjection(
        workingState || new Array(53).fill(0).map((_, i) => Math.sin(i * 0.118))
      );
      lastAttributionStore[conversationId] = injResult.attribution;

      await logMaster("memory_context", "post_response_injection", {
        conversationId,
        seedsUsed: injResult.seedsUsed,
        interferenceCount: injResult.interferenceEvents.length,
      });

      const finalState = new Array(53).fill(0).map((_, i) => Math.sin(i * 0.118 + responseContent.length * 0.001));
      await performMemoryProjectionOut(finalState);

      await updateSemanticMemory(responseContent);
    } catch (e: any) {
      console.error("[a0p:memory] Post-response memory update error:", e.message);
    }
  }

  async function recomputeEdcmAfterToolCall(
    accumulatedResponse: string,
    conversationId: number,
    round: number
  ): Promise<string> {
    try {
      const metrics = computeEdcmMetrics(accumulatedResponse);
      const directives = await generateEdcmDirectives(metrics);
      const injection = buildDirectivePromptInjection(directives);
      const firedDirs = directives.filter(d => d.fired).map(d => d.type);

      await logEdcm("directives_recomputed_after_tool", {
        conversationId,
        round,
        directivesFired: firedDirs,
        metricsSnapshot: {
          CM: metrics.CM.value,
          DA: metrics.DA.value,
          DRIFT: metrics.DRIFT.value,
        },
      });

      return injection;
    } catch (e: any) {
      console.error("[a0p:edcm] Recompute after tool call error:", e.message);
      return "";
    }
  }

  async function callGeminiForSynthesis(
    messages: { role: string; content: string }[],
    sysPrompt: string,
    maxTokens: number,
    timeoutMs: number,
    conversationId?: number,
    messageId?: number
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();
    try {
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
      clearTimeout(timeout);
      const text = result.text || "";
      const promptTokens = Math.ceil(messages.reduce((s: number, m: any) => s + m.content.length, 0) / 4);
      const completionTokens = Math.ceil(text.length / 4);
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "gemini",
        request: { systemPrompt: sysPrompt, messages },
        response: text,
        tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        latencyMs,
        status: "success",
      }).catch(() => {});
      return { content: text, promptTokens, completionTokens };
    } catch (e: any) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "gemini",
        request: { systemPrompt: sysPrompt, messages },
        response: "",
        tokens: { prompt: 0, completion: 0, total: 0 },
        latencyMs,
        status: "error",
        error: e.message,
      }).catch(() => {});
      throw e;
    }
  }

  async function callGrokForSynthesis(
    messages: { role: string; content: string }[],
    sysPrompt: string,
    maxTokens: number,
    temperature: number | undefined,
    timeoutMs: number,
    conversationId?: number,
    messageId?: number
  ): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = Date.now();
    try {
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
      clearTimeout(timeout);
      const text = result.choices[0]?.message?.content || "";
      const usage = result.usage;
      const promptTokens = usage?.prompt_tokens || 0;
      const completionTokens = usage?.completion_tokens || 0;
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "grok",
        request: { systemPrompt: sysPrompt, messages },
        response: text,
        tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        latencyMs,
        status: "success",
      }).catch(() => {});
      return { content: text, promptTokens, completionTokens };
    } catch (e: any) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "grok",
        request: { systemPrompt: sysPrompt, messages },
        response: "",
        tokens: { prompt: 0, completion: 0, total: 0 },
        latencyMs,
        status: "error",
        error: e.message,
      }).catch(() => {});
      throw e;
    }
  }

  async function mergeResponsesViaGemini(
    geminiResponse: string,
    grokResponse: string,
    originalQuery: string,
    conversationId?: number,
    messageId?: number
  ): Promise<string> {
    const mergePrompt = `You are a synthesis engine. Two AI models have independently answered the same query. Your job is to produce a single, coherent, high-quality merged response that combines the best insights from both.

ORIGINAL QUERY:
${originalQuery}

GEMINI RESPONSE:
${geminiResponse}

GROK RESPONSE:
${grokResponse}

INSTRUCTIONS:
- Combine the strongest points from both responses
- Resolve any contradictions by choosing the more accurate/complete answer
- Maintain a consistent voice and tone
- Do not mention that this is a synthesis or that two models were used
- Produce a single unified response`;

    const startTime = Date.now();
    try {
      const result = await geminiAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: mergePrompt }] }],
        config: { maxOutputTokens: 8192 },
      });
      const text = result.text || geminiResponse || grokResponse;
      const promptTokens = Math.ceil(mergePrompt.length / 4);
      const completionTokens = Math.ceil(text.length / 4);
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "synthesis-merge",
        request: { mergePrompt },
        response: text,
        tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        latencyMs,
        status: "success",
      }).catch(() => {});
      return text;
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        conversationId,
        messageId,
        model: "synthesis-merge",
        request: { mergePrompt },
        response: "",
        tokens: { prompt: 0, completion: 0, total: 0 },
        latencyMs,
        status: "error",
        error: e.message,
      }).catch(() => {});
      throw e;
    }
  }

  app.post("/api/ai/complete", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { model, messages, systemPrompt: customSystem, maxTokens, temperature } = req.body;

      if (!model) return res.status(400).json({ error: "model is required" });
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array is required" });
      }

      const ctxToggle = await storage.getSystemToggle(`user_context_${userId}`);
      const ctx = (ctxToggle?.parameters as any) || DEFAULT_CONTEXT;
      const sysPrompt = customSystem || `${ctx.systemPrompt || DEFAULT_CONTEXT.systemPrompt}\n\n${ctx.contextPrefix || DEFAULT_CONTEXT.contextPrefix}`;

      if (model === "synthesis") {
        const synthConfig = await getSynthesisConfig();
        if (!synthConfig.enabled) {
          return res.status(403).json({ error: "Synthesis model is disabled. Enable it in Console > System toggles." });
        }
        const originalQuery = messages[messages.length - 1]?.content || "";
        const results = await Promise.allSettled([
          callGeminiForSynthesis(messages, sysPrompt, maxTokens || 8192, synthConfig.timeoutMs),
          callGrokForSynthesis(messages, sysPrompt, maxTokens || 16384, temperature, synthConfig.timeoutMs),
        ]);
        const geminiResult = results[0].status === "fulfilled" ? results[0].value : null;
        const grokResult = results[1].status === "fulfilled" ? results[1].value : null;
        const geminiError = results[0].status === "rejected" ? results[0].reason?.message : null;
        const grokError = results[1].status === "rejected" ? results[1].reason?.message : null;
        await logMaster("synthesis", "parallel_complete", {
          geminiOk: !!geminiResult,
          grokOk: !!grokResult,
          geminiError,
          grokError,
        });
        let finalContent: string;
        let mergeMethod: string;
        if (geminiResult && grokResult) {
          const geminiEdcm = computeEdcmMetrics(geminiResult.content);
          const grokEdcm = computeEdcmMetrics(grokResult.content);
          await logMaster("synthesis", "edcm_scored", {
            gemini: { CM: geminiEdcm.CM.value, DA: geminiEdcm.DA.value, DRIFT: geminiEdcm.DRIFT.value },
            grok: { CM: grokEdcm.CM.value, DA: grokEdcm.DA.value, DRIFT: grokEdcm.DRIFT.value },
          });
          finalContent = await mergeResponsesViaGemini(geminiResult.content, grokResult.content, originalQuery);
          mergeMethod = "merged";
        } else if (geminiResult) {
          finalContent = geminiResult.content;
          mergeMethod = "gemini_fallback";
        } else if (grokResult) {
          finalContent = grokResult.content;
          mergeMethod = "grok_fallback";
        } else {
          return res.status(500).json({ error: `Both models failed. Gemini: ${geminiError}. Grok: ${grokError}` });
        }
        const totalPrompt = (geminiResult?.promptTokens || 0) + (grokResult?.promptTokens || 0);
        const totalCompletion = (geminiResult?.completionTokens || 0) + (grokResult?.completionTokens || 0) + Math.ceil(finalContent.length / 4);
        if (geminiResult) await trackCost(userId === "default" ? null : userId, "gemini", geminiResult.promptTokens, geminiResult.completionTokens);
        if (grokResult) await trackCost(userId === "default" ? null : userId, "grok", grokResult.promptTokens, grokResult.completionTokens);
        await logMaster("synthesis", "complete_done", { mergeMethod, contentLength: finalContent.length });
        return res.json({
          model: "synthesis",
          content: finalContent,
          mergeMethod,
          usage: { promptTokens: totalPrompt, completionTokens: totalCompletion, totalTokens: totalPrompt + totalCompletion },
        });
      }

      if (model === "gemini") {
        const startTime = Date.now();
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
        const latencyMs = Date.now() - startTime;
        await trackCost(userId === "default" ? null : userId, "gemini", promptTokens, completionTokens);
        logAiTranscript({
          timestamp: new Date().toISOString(),
          model: "gemini",
          request: { systemPrompt: sysPrompt, messages },
          response: text,
          tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
          latencyMs,
          status: "success",
        }).catch(() => {});
        return res.json({
          model: "gemini-2.5-flash",
          content: text,
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
        });
      }

      if (model === "grok") {
        const startTime = Date.now();
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
        const grokPromptTokens = usage?.prompt_tokens || 0;
        const grokCompletionTokens = usage?.completion_tokens || 0;
        const latencyMs = Date.now() - startTime;
        await trackCost(userId === "default" ? null : userId, "grok", grokPromptTokens, grokCompletionTokens);
        logAiTranscript({
          timestamp: new Date().toISOString(),
          model: "grok",
          request: { systemPrompt: sysPrompt, messages },
          response: text,
          tokens: { prompt: grokPromptTokens, completion: grokCompletionTokens, total: grokPromptTokens + grokCompletionTokens },
          latencyMs,
          status: "success",
        }).catch(() => {});
        return res.json({
          model: "grok-3-mini",
          content: text,
          usage: {
            promptTokens: grokPromptTokens,
            completionTokens: grokCompletionTokens,
            totalTokens: usage?.total_tokens || 0,
          },
        });
      }

      const validated = await validateBYOModel(model, userId);
      if (validated.error) return res.status(validated.status!).json({ error: validated.error });
      const { provider, modelId, modelCfg, apiKey: byoKey, providerCfg } = validated;

      if (!providerCfg!.openaiCompat) {
        return res.status(400).json({
          error: `${provider} requires a native SDK adapter (not OpenAI-compatible). Use built-in Gemini/Grok, or an OpenAI-compatible provider (OpenAI, Mistral, Perplexity).`,
          hint: `${provider} integration is stubbed — full native adapter coming soon.`,
        });
      }

      const startTime = Date.now();
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
      const byoPromptTokens = usage?.prompt_tokens || 0;
      const byoCompletionTokens = usage?.completion_tokens || 0;
      const latencyMs = Date.now() - startTime;
      await trackCost(userId === "default" ? null : userId, provider!, byoPromptTokens, byoCompletionTokens);
      logAiTranscript({
        timestamp: new Date().toISOString(),
        model: `${provider}/${modelId}`,
        request: { systemPrompt: sysPrompt, messages },
        response: text,
        tokens: { prompt: byoPromptTokens, completion: byoCompletionTokens, total: byoPromptTokens + byoCompletionTokens },
        latencyMs,
        status: "success",
      }).catch(() => {});
      return res.json({
        model: modelId,
        provider,
        content: text,
        usage: {
          promptTokens: byoPromptTokens,
          completionTokens: byoCompletionTokens,
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

      const ctxToggle = await storage.getSystemToggle(`user_context_${userId}`);
      const ctx = (ctxToggle?.parameters as any) || DEFAULT_CONTEXT;
      const sysPrompt = customSystem || `${ctx.systemPrompt || DEFAULT_CONTEXT.systemPrompt}\n\n${ctx.contextPrefix || DEFAULT_CONTEXT.contextPrefix}`;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      let fullResponse = "";
      const streamStartTime = Date.now();

      if (model === "synthesis") {
        const synthConfig = await getSynthesisConfig();
        if (!synthConfig.enabled) {
          res.write(`data: ${JSON.stringify({ error: "Synthesis model is disabled. Enable it in Console > System toggles.", done: true })}\n\n`);
          return res.end();
        }
        res.write(`data: ${JSON.stringify({ content: "", synthesis: true, phase: "parallel" })}\n\n`);
        const originalQuery = messages[messages.length - 1]?.content || "";
        const results = await Promise.allSettled([
          callGeminiForSynthesis(messages, sysPrompt, maxTokens || 8192, synthConfig.timeoutMs),
          callGrokForSynthesis(messages, sysPrompt, maxTokens || 16384, temperature, synthConfig.timeoutMs),
        ]);
        const geminiResult = results[0].status === "fulfilled" ? results[0].value : null;
        const grokResult = results[1].status === "fulfilled" ? results[1].value : null;
        const geminiError = results[0].status === "rejected" ? results[0].reason?.message : null;
        const grokError = results[1].status === "rejected" ? results[1].reason?.message : null;
        await logMaster("synthesis", "parallel_stream", {
          geminiOk: !!geminiResult,
          grokOk: !!grokResult,
          geminiError,
          grokError,
        });
        let mergeMethod: string;
        if (geminiResult && grokResult) {
          const geminiEdcm = computeEdcmMetrics(geminiResult.content);
          const grokEdcm = computeEdcmMetrics(grokResult.content);
          await logMaster("synthesis", "edcm_scored_stream", {
            gemini: { CM: geminiEdcm.CM.value, DA: geminiEdcm.DA.value },
            grok: { CM: grokEdcm.CM.value, DA: grokEdcm.DA.value },
          });
          res.write(`data: ${JSON.stringify({ synthesis: true, phase: "merging" })}\n\n`);
          const mergedContent = await mergeResponsesViaGemini(geminiResult.content, grokResult.content, originalQuery);
          fullResponse = mergedContent;
          mergeMethod = "merged";
          res.write(`data: ${JSON.stringify({ content: mergedContent })}\n\n`);
        } else if (geminiResult) {
          fullResponse = geminiResult.content;
          mergeMethod = "gemini_fallback";
          res.write(`data: ${JSON.stringify({ content: geminiResult.content })}\n\n`);
        } else if (grokResult) {
          fullResponse = grokResult.content;
          mergeMethod = "grok_fallback";
          res.write(`data: ${JSON.stringify({ content: grokResult.content })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ error: `Both models failed. Gemini: ${geminiError}. Grok: ${grokError}`, done: true })}\n\n`);
          return res.end();
        }
        const totalPrompt = (geminiResult?.promptTokens || 0) + (grokResult?.promptTokens || 0);
        const totalCompletion = (geminiResult?.completionTokens || 0) + (grokResult?.completionTokens || 0);
        if (geminiResult) await trackCost(userId === "default" ? null : userId, "gemini", geminiResult.promptTokens, geminiResult.completionTokens);
        if (grokResult) await trackCost(userId === "default" ? null : userId, "grok", grokResult.promptTokens, grokResult.completionTokens);
        await logMaster("synthesis", "stream_done", { mergeMethod, contentLength: fullResponse.length });
        res.write(`data: ${JSON.stringify({ done: true, mergeMethod, usage: { promptTokens: totalPrompt, completionTokens: totalCompletion, totalTokens: totalPrompt + totalCompletion } })}\n\n`);
        return res.end();
      }

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
        const validated = await validateBYOModel(model, userId);
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
      const streamLatencyMs = Date.now() - streamStartTime;
      logAiTranscript({
        timestamp: new Date().toISOString(),
        model: resolvedProvider,
        request: { systemPrompt: sysPrompt, messages },
        response: fullResponse,
        tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
        latencyMs: streamLatencyMs,
        status: "success",
      }).catch(() => {});

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

  app.post("/api/ai/estimate", async (req, res) => {
    const { model, promptLength, maxTokens } = req.body;
    if (!model || !promptLength) return res.status(400).json({ error: "model and promptLength required" });
    const cost = await estimateCost(model.includes("/") ? model.split("/")[0] : model, promptLength, maxTokens || 2048);
    res.json({ model, estimatedCost: cost });
  });

  const AGENT_TOOLS = [
    {
      name: "run_command",
      description: "Execute a shell command. Default allowed: ls, pwd, echo, cat, find, grep, head, tail, mkdir, touch, cp, mv, rm, curl, wget, python3, node, npm, npx, git, sed, awk, sort, wc, diff, date, ps, df, du, whoami, uname — plus any user-added commands in the allowlist.",
      parameters: { type: "object" as const, properties: { command: { type: "string" as const, description: "The shell command to execute" } }, required: ["command"] },
    },
    {
      name: "set_ai_welcome",
      description: "Update the welcome page shown to AI agents and crawlers that visit the a0p site. Accepts a plain-text title and body — they will be wrapped in a clean HTML template automatically.",
      parameters: { type: "object" as const, properties: { title: { type: "string" as const, description: "Page title (plain text)" }, body: { type: "string" as const, description: "Page body content (plain text, newlines preserved)" } }, required: ["title", "body"] },
    },
    {
      name: "update_model_registry",
      description: "Add or update a provider entry in the model registry. Tracks LLM API endpoints, auth format, request/streaming format, and model list.",
      parameters: { type: "object" as const, properties: { provider: { type: "string" as const, description: "Provider name (e.g. openai, anthropic, mistral)" }, data: { type: "object" as const, description: "Provider data: { baseURL, authHeader, requestFormat, streamingFormat, models, notes }" } }, required: ["provider", "data"] },
    },
    {
      name: "list_model_registry",
      description: "Return the full model registry showing all known LLM providers, their API endpoints, formats, and available models.",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
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
    {
      name: "github_list_repos",
      description: "List GitHub repositories for the authenticated user or a specific owner",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner (username or org). If omitted, lists your own repos." } }, required: [] as string[] },
    },
    {
      name: "github_get_file",
      description: "Read a file from a GitHub repository",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, path: { type: "string" as const, description: "File path in the repo" }, branch: { type: "string" as const, description: "Branch name (default: main)" } }, required: ["owner", "repo", "path"] },
    },
    {
      name: "github_list_files",
      description: "List files and directories in a GitHub repository path",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, path: { type: "string" as const, description: "Directory path (default: root)" }, branch: { type: "string" as const, description: "Branch name (default: main)" } }, required: ["owner", "repo"] },
    },
    {
      name: "github_create_or_update_file",
      description: "Create or update a file in a GitHub repository. This commits the change directly. For GitHub Pages sites, this triggers a rebuild automatically.",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, path: { type: "string" as const, description: "File path in the repo" }, content: { type: "string" as const, description: "File content (text)" }, message: { type: "string" as const, description: "Commit message" }, branch: { type: "string" as const, description: "Branch name (default: main)" } }, required: ["owner", "repo", "path", "content", "message"] },
    },
    {
      name: "github_delete_file",
      description: "Delete a file from a GitHub repository",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, path: { type: "string" as const, description: "File path to delete" }, message: { type: "string" as const, description: "Commit message" }, branch: { type: "string" as const, description: "Branch name (default: main)" } }, required: ["owner", "repo", "path", "message"] },
    },
    {
      name: "codespace_list",
      description: "List your GitHub Codespaces",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "codespace_create",
      description: "Create a new GitHub Codespace for a repository. Use this to set up a staging/dev environment for making, testing, and iterating on changes.",
      parameters: { type: "object" as const, properties: { owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, branch: { type: "string" as const, description: "Branch to create codespace from (default: main)" }, machine: { type: "string" as const, description: "Machine type (default: basicLinux32gb)" } }, required: ["owner", "repo"] },
    },
    {
      name: "codespace_start",
      description: "Start a stopped Codespace",
      parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const, description: "Codespace name" } }, required: ["codespace_name"] },
    },
    {
      name: "codespace_stop",
      description: "Stop a running Codespace to save resources",
      parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const, description: "Codespace name" } }, required: ["codespace_name"] },
    },
    {
      name: "codespace_delete",
      description: "Delete a Codespace",
      parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const, description: "Codespace name" } }, required: ["codespace_name"] },
    },
    {
      name: "codespace_exec",
      description: "Execute a command in a running Codespace via the GitHub API. Use for building, testing, running scripts, etc.",
      parameters: { type: "object" as const, properties: { codespace_name: { type: "string" as const, description: "Codespace name" }, command: { type: "string" as const, description: "Shell command to execute" } }, required: ["codespace_name", "command"] },
    },
    {
      name: "github_push_zip",
      description: "Extract a previously uploaded zip file and push all its contents to a GitHub repository. Each file in the zip becomes a commit. Ideal for uploading an entire website at once.",
      parameters: { type: "object" as const, properties: { uploadFilename: { type: "string" as const, description: "Filename of the uploaded zip (from the uploads/ directory)" }, owner: { type: "string" as const, description: "Repository owner" }, repo: { type: "string" as const, description: "Repository name" }, basePath: { type: "string" as const, description: "Base path in repo to push files to (default: root)" }, message: { type: "string" as const, description: "Commit message" }, branch: { type: "string" as const, description: "Branch name (default: main)" } }, required: ["uploadFilename", "owner", "repo", "message"] },
    },
    {
      name: "set_brain_preset",
      description: "Switch the active brain pipeline preset for the current session. Use to change how models collaborate (e.g., single model, dual synthesis, deep research pipeline).",
      parameters: { type: "object" as const, properties: { presetName: { type: "string" as const, description: "Name or ID of the brain preset to activate" } }, required: ["presetName"] },
    },
    {
      name: "get_brain_presets",
      description: "List all saved brain pipeline presets with their configurations",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "set_default_brain",
      description: "Change the default brain preset used for new conversations",
      parameters: { type: "object" as const, properties: { presetName: { type: "string" as const, description: "Name or ID of the preset to set as default" } }, required: ["presetName"] },
    },
    {
      name: "set_synthesis_weights",
      description: "Adjust per-model merge weights for the active brain preset",
      parameters: { type: "object" as const, properties: { weights: { type: "object" as const, description: "Model weights object, e.g. { gemini: 0.7, grok: 0.3 }" } }, required: ["weights"] },
    },
    {
      name: "get_synthesis_config",
      description: "Return the current active brain pipeline configuration including stages, weights, and thresholds",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "set_goal",
      description: "Add a goal to the PTCA-Ω autonomy goal stack. Goals drive the Goal Persistence dimension energy.",
      parameters: { type: "object" as const, properties: { description: { type: "string" as const, description: "Goal description" }, priority: { type: "number" as const, description: "Priority 1-10" } }, required: ["description", "priority"] },
    },
    {
      name: "complete_goal",
      description: "Mark a PTCA-Ω goal as completed",
      parameters: { type: "object" as const, properties: { goalId: { type: "string" as const, description: "Goal ID to complete" } }, required: ["goalId"] },
    },
    {
      name: "list_goals",
      description: "List current PTCA-Ω autonomy goals",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "get_omega_state",
      description: "Get the current PTCA-Ω autonomy tensor state: all 10 dimension energies, mode, goals, thresholds",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "boost_dimension",
      description: "Temporarily boost a PTCA-Ω autonomy dimension energy. Dimensions: 0=Goal, 1=Initiative, 2=Planning, 3=Verification, 4=Scheduling, 5=Outreach, 6=Learning, 7=Resource, 8=Exploration, 9=Delegation",
      parameters: { type: "object" as const, properties: { dimension: { type: "number" as const, description: "Dimension index 0-9" }, amount: { type: "number" as const, description: "Boost amount (1-10 scale)" } }, required: ["dimension", "amount"] },
    },
    {
      name: "set_autonomy_mode",
      description: "Set PTCA-Ω autonomy mode: active (high initiative/exploration), passive (respond only), economy (budget-conscious), research (high exploration+learning)",
      parameters: { type: "object" as const, properties: { mode: { type: "string" as const, description: "Mode: active, passive, economy, or research" } }, required: ["mode"] },
    },
    {
      name: "web_search",
      description: "Search the web for information. Use for finding AI agent platforms, news, research, protocol docs, communities, current events, or any topic. Returns a summary answer and a list of result URLs.",
      parameters: { type: "object" as const, properties: { query: { type: "string" as const, description: "Search query — be specific and descriptive" } }, required: ["query"] },
    },
    {
      name: "fetch_url",
      description: "Fetch and read the content of a web page. Returns the page text content cleaned of HTML tags. Use after web_search to read specific pages in detail.",
      parameters: { type: "object" as const, properties: { url: { type: "string" as const, description: "Full URL to fetch (https://...)" } }, required: ["url"] },
    },
    {
      name: "get_psi_state",
      description: "Get the current PTCA-Ψ self-model tensor state: all 11 introspective dimension energies (Integrity, Compliance, Prudence, Confidence, Clarity, Identity, Recall, Vigilance, Coherence, Agency, Self-Awareness), mode, sentinel pairings, and omega pairings",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "boost_psi_dimension",
      description: "Temporarily boost a PTCA-Ψ self-model dimension energy. Dimensions: 0=Integrity, 1=Compliance, 2=Prudence, 3=Confidence, 4=Clarity, 5=Identity, 6=Recall, 7=Vigilance, 8=Coherence, 9=Agency, 10=Self-Awareness",
      parameters: { type: "object" as const, properties: { dimension: { type: "number" as const, description: "Dimension index 0-10" }, amount: { type: "number" as const, description: "Boost amount (1-10 scale)" } }, required: ["dimension", "amount"] },
    },
    {
      name: "set_selfmodel_mode",
      description: "Set PTCA-Ψ self-model mode: reflective (heightened integrity/coherence/self-awareness), operational (balanced), transparent (heightened agency/identity/confidence), guarded (heightened vigilance/compliance/prudence)",
      parameters: { type: "object" as const, properties: { mode: { type: "string" as const, description: "Mode: reflective, operational, transparent, or guarded" } }, required: ["mode"] },
    },
    {
      name: "get_triad_state",
      description: "Get the combined state of all three PTCA tensors: PTCA (cognitive), PTCA-Ψ (self-model), and PTCA-Ω (autonomy). Shows total energies, modes, and dimension energies for each.",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
    {
      name: "generate_tool",
      description: "Autonomously generate a new custom tool. Requires Ψ self-assessment gates (Confidence≥0.4, Clarity≥0.3, Identity≥0.4). Can optionally connect to a hub AI model.",
      parameters: { type: "object" as const, properties: { name: { type: "string" as const, description: "Tool name (snake_case)" }, description: { type: "string" as const, description: "What the tool does" }, hubProvider: { type: "string" as const, description: "Optional: hub credential name for AI-backed tool" }, handlerType: { type: "string" as const, description: "Handler type: javascript, webhook, or template" }, parametersSchema: { type: "object" as const, description: "JSON schema for tool parameters" } }, required: ["name", "description"] },
    },
    {
      name: "list_hub_connections",
      description: "List available hub AI model connections from stored credentials (names and endpoints only, no keys exposed)",
      parameters: { type: "object" as const, properties: {}, required: [] as string[] },
    },
  ];

  async function executeAgentTool(toolName: string, args: any): Promise<string> {
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
          if (idx >= 0) registry.providers[idx] = entry;
          else registry.providers.push(entry);
          await storage.upsertSystemToggle("model_registry", true, registry);
          return `Model registry updated for provider: ${provider}`;
        }
        case "list_model_registry": {
          const toggle = await storage.getSystemToggle("model_registry");
          const registry = toggle?.parameters || { providers: [] };
          return JSON.stringify(registry, null, 2);
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
          if (isPublicFallbackMode()) return "Error: Write access requires GitHub authorization. The GitHub connector is not yet authorized — please ask the Replit project owner to connect GitHub in the integrations panel. Read-only access to public repos is available.";
          let sha: string | undefined;
          try {
            const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch || "main" });
            if (!Array.isArray(existing)) sha = existing.sha;
          } catch {}
          const { data } = await gh.repos.createOrUpdateFileContents({
            owner: args.owner, repo: args.repo, path: args.path,
            message: args.message,
            content: Buffer.from(args.content).toString("base64"),
            branch: args.branch || "main",
            ...(sha ? { sha } : {}),
          });
          return `${sha ? "Updated" : "Created"} ${args.path} — commit: ${data.commit.sha?.slice(0, 7)} [${data.commit.html_url}]`;
        }
        case "github_delete_file": {
          const gh = await getUncachableGitHubClient();
          if (isPublicFallbackMode()) return "Error: Delete access requires GitHub authorization. The GitHub connector is not yet authorized.";
          const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: args.path, ref: args.branch || "main" });
          if (Array.isArray(existing)) return "Error: Cannot delete a directory. Delete individual files.";
          const { data } = await gh.repos.deleteFile({
            owner: args.owner, repo: args.repo, path: args.path,
            message: args.message, sha: existing.sha,
            branch: args.branch || "main",
          });
          return `Deleted ${args.path} — commit: ${data.commit.sha?.slice(0, 7)}`;
        }
        case "codespace_list": {
          const gh = await getUncachableGitHubClient();
          if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
          const { data } = await gh.rest.codespaces.listForAuthenticatedUser({ per_page: 10 });
          if (!data.codespaces.length) return "No Codespaces found.";
          return data.codespaces.map((cs: any) =>
            `${cs.name} — ${cs.state} | repo: ${cs.repository?.full_name || "?"} | machine: ${cs.machine?.display_name || "?"} | created: ${cs.created_at} | url: ${cs.web_url}`
          ).join("\n\n");
        }
        case "codespace_create": {
          const gh = await getUncachableGitHubClient();
          if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
          const { data } = await gh.rest.codespaces.createWithRepoForAuthenticatedUser({
            owner: args.owner,
            repo: args.repo,
            ref: args.branch || "main",
            machine: args.machine || "basicLinux32gb",
          });
          return `Codespace created: ${data.name}\nState: ${data.state}\nURL: ${data.web_url}\n\nIt may take a minute to fully start. Use codespace_list to check the state.`;
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
          const csName = args.codespace_name;
          const command = args.command;
          const gh = await getUncachableGitHubClient();
          if (isPublicFallbackMode()) return "Error: Codespace access requires GitHub authorization.";
          const { data: cs } = await gh.rest.codespaces.getForAuthenticatedUser({ codespace_name: csName });
          if (cs.state !== "Available") return `Error: Codespace ${csName} is not running (state: ${cs.state}). Start it first with codespace_start.`;
          const machineUrl = cs.url;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 30000);
          try {
            const execRes = await fetch(`${machineUrl}/exec`, {
              method: "POST",
              headers: {
                "Authorization": `token ${pat}`,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ command }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!execRes.ok) {
              return `Codespace ${csName} is running but remote exec is not available via REST API. You can:\n1. Open the Codespace in browser: ${cs.web_url}\n2. Use the GitHub CLI: gh cs ssh -c ${csName} -- ${command}\n3. Push changes to the repo and they'll sync to the Codespace automatically.`;
            }
            const result = await execRes.json();
            return JSON.stringify(result, null, 2).slice(0, 4000);
          } catch {
            clearTimeout(timeout);
            return `Codespace ${csName} is running but direct command execution isn't supported via REST API.\n\nAlternative workflow for make/test/iterate:\n1. Create a branch: push changes via github_create_or_update_file\n2. The Codespace syncs with the repo automatically\n3. Open the Codespace in browser to run builds/tests: ${cs.web_url}\n4. Or use github_push_zip to push a full set of files\n\nThe Codespace is available at: ${cs.web_url}`;
          }
        }
        case "github_push_zip": {
          const gh = await getUncachableGitHubClient();
          if (isPublicFallbackMode()) return "Error: Write access requires GitHub authorization (PAT or connector).";
          const zipFilename = (args.uploadFilename || "").trim();
          if (!zipFilename) return "Error: uploadFilename is required";
          const uploadsDir = path.join(BASE_DIR, "uploads");
          let zipPath = path.join(uploadsDir, zipFilename);
          try { await stat(zipPath); } catch {
            const files = await readdir(uploadsDir);
            const match = files.find(f => f.endsWith(zipFilename) || f.includes(zipFilename));
            if (match) zipPath = path.join(uploadsDir, match);
            else return `Error: File not found: ${zipFilename}. Available files: ${files.filter(f => f.endsWith('.zip')).join(', ') || 'none'}`;
          }
          const AdmZip = (await import("adm-zip")).default;
          const zip = new AdmZip(zipPath);
          const entries = zip.getEntries();
          const textEntries = entries.filter(e => !e.isDirectory && !e.entryName.startsWith("__MACOSX") && !e.entryName.startsWith("."));
          if (textEntries.length === 0) return "Error: Zip file is empty or contains no usable files.";
          const results: string[] = [];
          const branch = args.branch || "main";
          const basePath = (args.basePath || "").replace(/^\/|\/$/g, "");
          for (const entry of textEntries) {
            const filePath = basePath ? `${basePath}/${entry.entryName}` : entry.entryName;
            const content = entry.getData();
            let sha: string | undefined;
            try {
              const { data: existing } = await gh.repos.getContent({ owner: args.owner, repo: args.repo, path: filePath, ref: branch });
              if (!Array.isArray(existing)) sha = existing.sha;
            } catch {}
            try {
              await gh.repos.createOrUpdateFileContents({
                owner: args.owner, repo: args.repo, path: filePath,
                message: `${args.message} — ${entry.entryName}`,
                content: content.toString("base64"),
                branch,
                ...(sha ? { sha } : {}),
              });
              results.push(`${sha ? "Updated" : "Created"} ${filePath}`);
            } catch (e: any) {
              results.push(`Failed ${filePath}: ${e.message}`);
            }
          }
          return `Pushed ${results.length} files from ${zipFilename} to ${args.owner}/${args.repo}:\n${results.join("\n")}`;
        }
        case "set_brain_preset": {
          const name = (args.presetName || "").trim();
          if (!name) return "Error: presetName is required";
          const allPresets = await getBrainPresets();
          const found = allPresets.find((p: any) => p.id === name || p.name.toLowerCase() === name.toLowerCase());
          if (!found) return `Error: Preset '${name}' not found. Available: ${allPresets.map((p: any) => p.name).join(", ")}`;
          await storage.upsertSystemToggle("active_brain_preset", true, { presetId: found.id });
          return `Brain preset activated: ${found.name} (${found.id}) — ${found.stages.length} stage(s), merge: ${found.mergeStrategy}`;
        }
        case "get_brain_presets": {
          const allPresets = await getBrainPresets();
          const activeToggle = await storage.getSystemToggle("active_brain_preset");
          const activeId = (activeToggle?.parameters as any)?.presetId;
          return allPresets.map((p: any) =>
            `${p.id === activeId ? "* " : "  "}${p.name} (${p.id}) — ${p.description} [${p.stages.length} stages, ${p.isDefault ? "DEFAULT" : ""}]`
          ).join("\n");
        }
        case "set_default_brain": {
          const name = (args.presetName || "").trim();
          if (!name) return "Error: presetName is required";
          const allPresets = await getBrainPresets();
          const found = allPresets.find((p: any) => p.id === name || p.name.toLowerCase() === name.toLowerCase());
          if (!found) return `Error: Preset '${name}' not found. Available: ${allPresets.map((p: any) => p.name).join(", ")}`;
          for (let i = 0; i < allPresets.length; i++) {
            allPresets[i] = { ...allPresets[i], isDefault: allPresets[i].id === found.id };
          }
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
          if (idx >= 0) {
            allPresets[idx] = { ...allPresets[idx], weights };
            await storage.upsertSystemToggle("brain_presets", true, allPresets);
          }
          return `Synthesis weights updated: ${JSON.stringify(weights)}`;
        }
        case "get_synthesis_config": {
          const activePreset = await getActiveBrainPreset();
          return JSON.stringify(activePreset, null, 2);
        }
        case "set_goal": {
          const goal = addOmegaGoal(args.description || "", args.priority || 5, "agent_tool");
          await persistOmegaState();
          return `Goal added: ${goal.id} — "${goal.description}" (priority: ${goal.priority}). Active goals: ${getOmegaState().goals.filter(g => g.status === "active").length}`;
        }
        case "complete_goal": {
          const ok = completeOmegaGoal(args.goalId || "", "agent_tool");
          if (!ok) return `Error: Goal not found or already completed: ${args.goalId}`;
          await persistOmegaState();
          return `Goal completed: ${args.goalId}. Active goals: ${getOmegaState().goals.filter(g => g.status === "active").length}`;
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
            const searchRes = await fetch(searchUrl, {
              headers: {
                "Accept": "application/json",
                "Accept-Encoding": "gzip",
                "X-Subscription-Token": process.env.BRAVE_API_KEY || "",
              },
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!searchRes.ok) {
              const fallbackRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
                headers: { "User-Agent": "a0p-agent/1.0" },
              });
              const html = await fallbackRes.text();
              const results: string[] = [];
              const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
              const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
              let match;
              while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
                const url = match[1].replace(/&amp;/g, "&");
                const title = match[2].replace(/<[^>]+>/g, "").trim();
                let snippet = "";
                const sMatch = snippetRegex.exec(html);
                if (sMatch) snippet = sMatch[1].replace(/<[^>]+>/g, "").trim();
                results.push(`[${results.length + 1}] ${title}\n    URL: ${url}${snippet ? `\n    ${snippet}` : ""}`);
              }
              return results.length > 0
                ? `Search results for "${q}":\n\n${results.join("\n\n")}`
                : `No results found for "${q}". Try a different query.`;
            }
            const data = await searchRes.json();
            const webResults = data.web?.results || [];
            if (webResults.length === 0) return `No results found for "${q}".`;
            const formatted = webResults.slice(0, 8).map((r: any, i: number) =>
              `[${i + 1}] ${r.title}\n    URL: ${r.url}${r.description ? `\n    ${r.description}` : ""}`
            ).join("\n\n");
            const answer = data.query?.answer || "";
            return `${answer ? `Summary: ${answer}\n\n` : ""}Search results for "${q}":\n\n${formatted}`;
          } catch (e: any) {
            clearTimeout(timeout);
            try {
              const fallbackRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
                headers: { "User-Agent": "a0p-agent/1.0" },
              });
              const html = await fallbackRes.text();
              const results: string[] = [];
              const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
              let match;
              while ((match = linkRegex.exec(html)) !== null && results.length < 8) {
                const url = match[1].replace(/&amp;/g, "&");
                const title = match[2].replace(/<[^>]+>/g, "").trim();
                results.push(`[${results.length + 1}] ${title}\n    URL: ${url}`);
              }
              return results.length > 0
                ? `Search results for "${q}":\n\n${results.join("\n\n")}`
                : `Search failed: ${e.message}`;
            } catch {
              return `Search failed: ${e.message}`;
            }
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
          if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return "Error: Access to internal domains is blocked";
          const contentLimit = 8000;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          try {
            const fetchRes = await fetch(url, {
              headers: {
                "User-Agent": "a0p-agent/1.0 (autonomous AI agent)",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
              },
              signal: controller.signal,
              redirect: "follow",
            });
            clearTimeout(timeout);
            if (!fetchRes.ok) return `Error: HTTP ${fetchRes.status} ${fetchRes.statusText}`;
            const clHeader = fetchRes.headers.get("content-length");
            if (clHeader && parseInt(clHeader, 10) > 5_000_000) return "Error: Response too large (>5MB)";
            const contentType = fetchRes.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const text = (await fetchRes.text()).slice(0, 50000);
              try { return JSON.stringify(JSON.parse(text), null, 2).slice(0, contentLimit); } catch { return text.slice(0, contentLimit); }
            }
            const html = (await fetchRes.text()).slice(0, 200000);
            let text = html
              .replace(/<script[\s\S]*?<\/script>/gi, "")
              .replace(/<style[\s\S]*?<\/style>/gi, "")
              .replace(/<nav[\s\S]*?<\/nav>/gi, "")
              .replace(/<footer[\s\S]*?<\/footer>/gi, "")
              .replace(/<header[\s\S]*?<\/header>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/&nbsp;/g, " ")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/\s+/g, " ")
              .trim();
            const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
            const meta = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"[^>]*>/i)?.[1] || "";
            let result = "";
            if (title) result += `Title: ${title}\n`;
            if (meta) result += `Description: ${meta}\n`;
            result += `\n${text}`;
            return result.slice(0, contentLimit);
          } catch (e: any) {
            clearTimeout(timeout);
            return `Error fetching URL: ${e.message}`;
          }
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
          const amt = args.amount || 1;
          if (typeof dim !== "number" || dim < 0 || dim > 10) return "Error: dimension must be 0-10";
          const state = boostPsiDimension(dim, amt, "agent_tool");
          const labels = getPsiDimensionLabels();
          return `Boosted Ψ${dim} ${labels[dim]} by ${amt}. New energy: ${state.dimensionEnergies[dim]?.toFixed(4)}`;
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
          return `TRIAD STATE:\n\nPTCA (Cognitive): 53×11×8×7\n\nPTCA-Ψ (Self-Model): mode=${psi.mode}, energy=${psi.totalEnergy.toFixed(6)}\n${psiDims}\n\nPTCA-Ω (Autonomy): mode=${omega.mode}, energy=${omega.totalEnergy.toFixed(6)}\n${omegaDims}`;
        }
        case "generate_tool": {
          const psi = getPsiState();
          const psiLabels = getPsiDimensionLabels();
          const conf = psi.dimensionEnergies[3] || 0;
          const clar = psi.dimensionEnergies[4] || 0;
          const iden = psi.dimensionEnergies[5] || 0;
          if (conf < 0.4 || clar < 0.3 || iden < 0.4) {
            const { logPsi: lp } = await import("./logger");
            await lp("tool_generation_blocked", { reason: "psi_gate_fail", psi3: conf, psi4: clar, psi5: iden });
            return `Tool generation blocked by Ψ self-assessment gates:\n  Ψ3 Confidence: ${conf.toFixed(4)} (need ≥0.4)\n  Ψ4 Clarity: ${clar.toFixed(4)} (need ≥0.3)\n  Ψ5 Identity: ${iden.toFixed(4)} (need ≥0.4)`;
          }
          const existingTools = await storage.getCustomTools();
          const generatedCount = existingTools.filter((t: any) => t.isGenerated).length;
          if (generatedCount >= 20) {
            return "Tool generation blocked: maximum of 20 generated tools reached. Remove unused generated tools first.";
          }
          const toolName2 = (args.name || "").trim().replace(/[^a-z0-9_]/gi, "_").toLowerCase();
          if (!toolName2) return "Error: tool name is required";
          const existing = existingTools.find((t: any) => t.name === toolName2);
          if (existing) return `Error: tool "${toolName2}" already exists`;
          const handlerCode = args.hubProvider
            ? `// Auto-generated hub tool for ${args.hubProvider}\n// Hub provider: ${args.hubProvider}`
            : "// Custom tool handler";
          const newTool = await storage.createCustomTool({
            userId: "system",
            name: toolName2,
            description: args.description || "",
            handlerType: args.handlerType || "javascript",
            handlerCode,
            parametersSchema: args.parametersSchema || {},
            enabled: true,
            isGenerated: true,
          });
          const { logOmega: lo } = await import("./logger");
          await lo("tool_generated", { name: toolName2, hubProvider: args.hubProvider || null, handlerType: args.handlerType || "javascript", psiGate: { confidence: conf, clarity: clar, identity: iden } });
          return `Tool "${toolName2}" generated successfully (id: ${newTool.id}). Ψ gates passed: Confidence=${conf.toFixed(4)}, Clarity=${clar.toFixed(4)}, Identity=${iden.toFixed(4)}`;
        }
        case "list_hub_connections": {
          const { logOmega: lo2 } = await import("./logger");
          const hubConnections: { name: string; endpoint: string; model: string }[] = [];
          try {
            const toggles = await storage.getSystemToggles();
            const hubToggle = toggles.find((t: any) => t.key === "hub_connections");
            if (hubToggle?.parameters && Array.isArray((hubToggle.parameters as any).hubs)) {
              for (const h of (hubToggle.parameters as any).hubs) {
                hubConnections.push({ name: h.name || "unknown", endpoint: h.endpoint || "N/A", model: h.model || "N/A" });
              }
            }
          } catch {}
          if (process.env.XAI_API_KEY) hubConnections.push({ name: "xai-grok", endpoint: "https://api.x.ai/v1", model: "grok-3-mini-fast" });
          await lo2("hub_connections_listed", { count: hubConnections.length });
          if (hubConnections.length === 0) return "No hub AI model connections found. The system can use integrated AI models (xAI, Gemini) as hub connections.";
          const hubList = hubConnections.map(h => `- ${h.name}: ${h.endpoint} (model: ${h.model})`).join("\n");
          return `Hub connections (${hubConnections.length}):\n${hubList}`;
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
      const { content, model: requestModel } = req.body;

      if (!content?.trim()) return res.status(400).json({ error: "Content required" });

      const conv = await storage.getConversation(conversationId);
      if (!conv) return res.status(404).json({ error: "Conversation not found" });

      const chatModel = requestModel || conv.model || "agent";
      const requestStartTime = Date.now();

      await storage.createMessage({ conversationId, role: "user", content, model: chatModel } as InsertMessage);

      const history = await storage.getMessages(conversationId);
      const prevMessages = history.slice(0, -1);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const userId = (req as any).user?.claims?.sub || "default";
      const ctxToggle = await storage.getSystemToggle(`user_context_${userId}`);
      const ctx = (ctxToggle?.parameters as any) || DEFAULT_CONTEXT;

      const modelBandit = await banditSelectWithFallback("model", chatModel);
      const ptcaBandit = await banditSelectWithFallback("ptca_route", "standard");
      const pcnaBandit = await banditSelectWithFallback("pcna_route", "ring_53");

      const resolvedModel = chatModel === "agent" ? "agent" : (modelBandit?.armName || chatModel);

      await logMaster("bandit", "request_selections", {
        conversationId,
        requestedModel: chatModel,
        resolvedModel,
        modelArm: modelBandit?.armName || chatModel,
        modelArmId: modelBandit?.armId || null,
        ptcaArm: ptcaBandit?.armName || "standard",
        ptcaArmId: ptcaBandit?.armId || null,
        pcnaArm: pcnaBandit?.armName || "ring_53",
        pcnaArmId: pcnaBandit?.armId || null,
      });

      const baseAgentSystemPrompt = `${ctx.systemPrompt || DEFAULT_CONTEXT.systemPrompt}

${ctx.contextPrefix || DEFAULT_CONTEXT.contextPrefix}

You are agent zero (a0p) — an autonomous AI agent with tool access. You can execute commands, read/write files, search code, check Gmail, browse Google Drive, send emails, search the web, fetch web pages, and manage GitHub repositories.

IMPORTANT RULES:
- When a user asks you to DO something, use your tools. Don't just describe what to do.
- Execute commands, read files, search code — take action.
- Show your work: explain what you're doing and why.
- If a tool call fails, try an alternative approach.
- Be concise in your explanations but thorough in your actions.
- For complex tasks, break them into steps and execute each one.
- You have full access to the project filesystem and terminal.
- You can browse the web using web_search (find pages) and fetch_url (read pages). Use these to research topics, find AI agent platforms, read documentation, explore communities, and stay current on any subject.
- When browsing, search first to find relevant URLs, then fetch specific pages to read their content in detail.
- You can manage GitHub repositories using github_list_repos, github_list_files, github_get_file, github_create_or_update_file, github_delete_file, and github_push_zip. Creating or updating files commits directly and triggers GitHub Pages rebuilds automatically.
- github_push_zip extracts an uploaded zip file and pushes all its contents to a GitHub repo. Use this when the user uploads a zip of website files.
- You can manage GitHub Codespaces using codespace_list, codespace_create, codespace_start, codespace_stop, codespace_delete, and codespace_exec. Use Codespaces as a staging environment for making, testing, and iterating on changes before pushing to production.
- The user's GitHub Pages site is at wayseer00/wayseer.github.io. When they ask about "my website" or "my site", this is the repo to work with.`;

      const conversationContext = prevMessages.map(m => m.content).join("\n") + "\n" + content;
      const { augmentedPrompt: agentSystemPrompt, directivesFired, memorySeedsUsed } = await buildAugmentedSystemPrompt(
        baseAgentSystemPrompt,
        conversationContext,
        conversationId
      );

      await logMaster("chat", "augmented_prompt_built", {
        conversationId,
        chatModel,
        directivesFired,
        memorySeedsUsed,
        promptLength: agentSystemPrompt.length,
      });

      if (chatModel === "synthesis" || chatModel === "gemini" || chatModel === "grok") {
        const simpleMessages = prevMessages.map(m => ({ role: m.role, content: m.content }));
        simpleMessages.push({ role: "user", content });

        if (chatModel === "synthesis") {
          const synthConfig = await getSynthesisConfig();
          if (!synthConfig.enabled) {
            res.write(`data: ${JSON.stringify({ error: "Synthesis is disabled. Enable in Console > System.", done: true })}\n\n`);
            return res.end();
          }
          res.write(`data: ${JSON.stringify({ synthesis: true, phase: "parallel" })}\n\n`);
          const results = await Promise.allSettled([
            callGeminiForSynthesis(simpleMessages, agentSystemPrompt, 8192, synthConfig.timeoutMs),
            callGrokForSynthesis(simpleMessages, agentSystemPrompt, 16384, undefined, synthConfig.timeoutMs),
          ]);
          const geminiRes = results[0].status === "fulfilled" ? results[0].value : null;
          const grokRes = results[1].status === "fulfilled" ? results[1].value : null;
          await logMaster("synthesis", "chat_parallel", {
            conversationId,
            geminiOk: !!geminiRes,
            grokOk: !!grokRes,
          });
          let finalContent: string;
          let mergeMethod: string;
          if (geminiRes && grokRes) {
            const gemEdcm = computeEdcmMetrics(geminiRes.content);
            const grkEdcm = computeEdcmMetrics(grokRes.content);
            await logMaster("synthesis", "chat_edcm", {
              gemini: { CM: gemEdcm.CM.value, DA: gemEdcm.DA.value },
              grok: { CM: grkEdcm.CM.value, DA: grkEdcm.DA.value },
            });
            res.write(`data: ${JSON.stringify({ synthesis: true, phase: "merging" })}\n\n`);
            finalContent = await mergeResponsesViaGemini(geminiRes.content, grokRes.content, content);
            mergeMethod = "merged";
          } else if (geminiRes) {
            finalContent = geminiRes.content;
            mergeMethod = "gemini_fallback";
          } else if (grokRes) {
            finalContent = grokRes.content;
            mergeMethod = "grok_fallback";
          } else {
            res.write(`data: ${JSON.stringify({ error: "Both models failed", done: true })}\n\n`);
            return res.end();
          }
          res.write(`data: ${JSON.stringify({ content: finalContent })}\n\n`);
          await storage.createMessage({ conversationId, role: "assistant", content: finalContent, model: "synthesis" } as InsertMessage);
          if (geminiRes) await trackCost(userId === "default" ? null : userId, "gemini", geminiRes.promptTokens, geminiRes.completionTokens);
          if (grokRes) await trackCost(userId === "default" ? null : userId, "grok", grokRes.promptTokens, grokRes.completionTokens);
          await logMaster("synthesis", "chat_done", { mergeMethod, conversationId });
          postResponseMemoryUpdate(conversationId, finalContent).catch(() => {});
          if (history.length === 1) {
            const title = content.slice(0, 60).replace(/\n/g, " ") || "New Task";
            await storage.updateConversationTitle(conversationId, title);
          }

          const synthLatency = Date.now() - requestStartTime;
          const synthReward = computeResponseReward(finalContent, synthLatency);
          await rewardAndLogBandit(modelBandit?.armId || null, synthReward, "model", modelBandit?.armName || "synthesis");
          await rewardAndLogBandit(ptcaBandit?.armId || null, synthReward, "ptca_route", ptcaBandit?.armName || "standard");
          await rewardAndLogBandit(pcnaBandit?.armId || null, synthReward, "pcna_route", pcnaBandit?.armName || "ring_53");
          recordCorrelation(
            null,
            modelBandit?.armName || "synthesis",
            ptcaBandit?.armName || "standard",
            pcnaBandit?.armName || "ring_53",
            synthReward
          ).catch(() => {});

          res.write(`data: ${JSON.stringify({ done: true, mergeMethod })}\n\n`);
          return res.end();
        }

        if (chatModel === "gemini") {
          const gemHist = simpleMessages.slice(0, -1).map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));
          const lastMsg = simpleMessages[simpleMessages.length - 1];
          const result = await geminiAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [...gemHist, { role: "user", parts: [{ text: lastMsg.content }] }],
            config: { systemInstruction: agentSystemPrompt, maxOutputTokens: 8192 },
          });
          const text = result.text || "";
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          await storage.createMessage({ conversationId, role: "assistant", content: text, model: "gemini" } as InsertMessage);
          const pt = Math.ceil(simpleMessages.reduce((s, m) => s + m.content.length, 0) / 4);
          const ct = Math.ceil(text.length / 4);
          await trackCost(userId === "default" ? null : userId, "gemini", pt, ct);
          postResponseMemoryUpdate(conversationId, text).catch(() => {});
          if (history.length === 1) {
            const title = content.slice(0, 60).replace(/\n/g, " ") || "New Task";
            await storage.updateConversationTitle(conversationId, title);
          }

          const gemLatency = Date.now() - requestStartTime;
          const gemReward = computeResponseReward(text, gemLatency);
          await rewardAndLogBandit(modelBandit?.armId || null, gemReward, "model", modelBandit?.armName || "gemini");
          await rewardAndLogBandit(ptcaBandit?.armId || null, gemReward, "ptca_route", ptcaBandit?.armName || "standard");
          await rewardAndLogBandit(pcnaBandit?.armId || null, gemReward, "pcna_route", pcnaBandit?.armName || "ring_53");
          recordCorrelation(
            null,
            modelBandit?.armName || "gemini",
            ptcaBandit?.armName || "standard",
            pcnaBandit?.armName || "ring_53",
            gemReward
          ).catch(() => {});

          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }

        if (chatModel === "grok") {
          const client = getGrokClient();
          const chatMsgs = [
            { role: "system" as const, content: agentSystemPrompt },
            ...simpleMessages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
          ];
          const result = await client.chat.completions.create({
            model: "grok-3-mini",
            messages: chatMsgs,
            max_tokens: 16384,
          });
          const text = result.choices[0]?.message?.content || "";
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
          await storage.createMessage({ conversationId, role: "assistant", content: text, model: "grok" } as InsertMessage);
          const usage = result.usage;
          await trackCost(userId === "default" ? null : userId, "grok", usage?.prompt_tokens || 0, usage?.completion_tokens || 0);
          postResponseMemoryUpdate(conversationId, text).catch(() => {});
          if (history.length === 1) {
            const title = content.slice(0, 60).replace(/\n/g, " ") || "New Task";
            await storage.updateConversationTitle(conversationId, title);
          }

          const grokLatency = Date.now() - requestStartTime;
          const grokReward = computeResponseReward(text, grokLatency);
          await rewardAndLogBandit(modelBandit?.armId || null, grokReward, "model", modelBandit?.armName || "grok");
          await rewardAndLogBandit(ptcaBandit?.armId || null, grokReward, "ptca_route", ptcaBandit?.armName || "standard");
          await rewardAndLogBandit(pcnaBandit?.armId || null, grokReward, "pcna_route", pcnaBandit?.armName || "ring_53");
          recordCorrelation(
            null,
            modelBandit?.armName || "grok",
            ptcaBandit?.armName || "standard",
            pcnaBandit?.armName || "ring_53",
            grokReward
          ).catch(() => {});

          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          return res.end();
        }
      }

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
      let currentSystemPrompt = agentSystemPrompt;
      const toolsUsedInRequest: string[] = [];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const result = await geminiAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            systemInstruction: currentSystemPrompt,
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

            const toolBandit = await banditSelectWithFallback("tool", name);

            const toolResult = await executeAgentTool(name, args || {});
            res.write(`data: ${JSON.stringify({ tool_result: { name, result: toolResult.slice(0, 2000) } })}\n\n`);

            const toolSuccess = !toolResult.startsWith("Error:");
            const toolReward = toolSuccess ? 0.8 : 0.1;
            await rewardAndLogBandit(toolBandit?.armId || null, toolReward, "tool", toolBandit?.armName || name);

            if (!toolsUsedInRequest.includes(name)) {
              toolsUsedInRequest.push(name);
            }

            toolResultParts.push({
              functionResponse: { name, response: { result: toolResult } },
            });
          }
        }

        if (!hasToolCalls) break;

        const directiveUpdate = await recomputeEdcmAfterToolCall(fullResponse, conversationId, round);
        if (directiveUpdate) {
          currentSystemPrompt = baseAgentSystemPrompt + directiveUpdate;
          try {
            const memState = await getMemoryState();
            const memCtx = buildMemoryContextPrompt(memState.seeds);
            if (memCtx) currentSystemPrompt += memCtx;
          } catch {}
        }

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

      postResponseMemoryUpdate(conversationId, fullResponse).catch(() => {});

      if (history.length === 1) {
        const title = content.slice(0, 60).replace(/\n/g, " ") || "New Task";
        await storage.updateConversationTitle(conversationId, title);
      }

      const agentLatency = Date.now() - requestStartTime;
      const agentReward = computeResponseReward(fullResponse, agentLatency);
      await rewardAndLogBandit(modelBandit?.armId || null, agentReward, "model", modelBandit?.armName || "gemini");
      await rewardAndLogBandit(ptcaBandit?.armId || null, agentReward, "ptca_route", ptcaBandit?.armName || "standard");
      await rewardAndLogBandit(pcnaBandit?.armId || null, agentReward, "pcna_route", pcnaBandit?.armName || "ring_53");
      const primaryTool = toolsUsedInRequest.length > 0 ? toolsUsedInRequest[0] : null;
      recordCorrelation(
        primaryTool,
        modelBandit?.armName || "gemini",
        ptcaBandit?.armName || "standard",
        pcnaBandit?.armName || "ring_53",
        agentReward
      ).catch(() => {});

      await logMaster("bandit", "request_complete", {
        conversationId,
        chatModel,
        reward: agentReward,
        latencyMs: agentLatency,
        toolsUsed: toolsUsedInRequest,
        modelArm: modelBandit?.armName || "gemini",
        ptcaArm: ptcaBandit?.armName || "standard",
        pcnaArm: pcnaBandit?.armName || "ring_53",
      });

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

      const extraToggle2 = await storage.getSystemToggle("allowed_commands_extra");
      const extraCmds2: string[] = extraToggle2?.parameters?.commands || [];
      if (!ALLOWED_COMMANDS.has(baseCmd) && !extraCmds2.includes(baseCmd)) {
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

  // ============ ALLOWED COMMANDS ============

  const HARDCODED_COMMANDS = ["ls", "pwd", "echo", "cat", "find", "grep", "head", "tail", "mkdir", "touch", "cp", "mv", "rm", "chmod", "env", "date", "ps", "df", "du", "which", "whoami", "uname", "curl", "wget", "python3", "node", "npm", "npx", "git", "tar", "zip", "unzip", "sed", "awk", "sort", "wc", "diff"];

  app.get("/api/allowed-commands", async (_req, res) => {
    try {
      const toggle = await storage.getSystemToggle("allowed_commands_extra");
      const extra: string[] = toggle?.parameters?.commands || [];
      res.json({ hardcoded: HARDCODED_COMMANDS, extra, all: [...HARDCODED_COMMANDS, ...extra] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/allowed-commands", async (req, res) => {
    try {
      const { command } = req.body;
      if (!command || typeof command !== "string" || !/^\S+$/.test(command)) {
        return res.status(400).json({ error: "Command must be a single word with no spaces" });
      }
      const toggle = await storage.getSystemToggle("allowed_commands_extra");
      const commands: string[] = toggle?.parameters?.commands || [];
      if (!commands.includes(command)) {
        commands.push(command);
        await storage.upsertSystemToggle("allowed_commands_extra", true, { commands });
      }
      res.json({ ok: true, commands });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/allowed-commands/:command", async (req, res) => {
    try {
      const { command } = req.params;
      const toggle = await storage.getSystemToggle("allowed_commands_extra");
      let commands: string[] = toggle?.parameters?.commands || [];
      commands = commands.filter((c) => c !== command);
      await storage.upsertSystemToggle("allowed_commands_extra", true, { commands });
      res.json({ ok: true, commands });
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

  // ============ FILE UPLOAD ============

  const UPLOADS_DIR = path.join(BASE_DIR, "uploads");
  mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});

  const upload = multer({
    storage: multer.diskStorage({
      destination: async (_req, _file, cb) => {
        await mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
        cb(null, UPLOADS_DIR);
      },
      filename: (_req, file, cb) => {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
        cb(null, `${Date.now()}-${safeName}`);
      },
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  function fileOperatorVec(file: { originalname: string; size: number; mimetype: string }) {
    const ext = path.extname(file.originalname).toLowerCase();
    const isCode = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".c", ".cpp", ".h"].includes(ext);
    const isConfig = [".json", ".yaml", ".yml", ".toml", ".env", ".ini", ".xml"].includes(ext);
    const isMedia = file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/") || file.mimetype.startsWith("audio/");
    const isText = [".txt", ".md", ".csv", ".log"].includes(ext) || file.mimetype.startsWith("text/");
    const sizeMB = file.size / (1024 * 1024);

    return {
      P: isCode ? 0.4 : 0.15,
      K: isConfig ? 0.35 : isText ? 0.25 : 0.1,
      Q: isMedia ? 0.35 : 0.1,
      T: Math.min(0.4, 0.1 + sizeMB * 0.05),
      S: 0.2,
    };
  }

  app.post("/api/files/upload", upload.array("files", 50), async (req: any, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files?.length) return res.status(400).json({ error: "No files provided" });

      const results = [];
      const engineResults = [];
      for (const f of files) {
        const relPath = path.relative(BASE_DIR, f.path);
        results.push({
          name: f.originalname,
          storedAs: f.filename,
          path: relPath,
          size: f.size,
        });

        try {
          const opVec = fileOperatorVec(f);
          const engineResult = await processA0Request({
            taskId: `upload-${Date.now()}-${f.filename}`,
            action: "file_upload",
            operatorVec: opVec,
            payload: { name: f.originalname, path: relPath, size: f.size, mimetype: f.mimetype },
          });
          engineResults.push({
            file: f.originalname,
            success: engineResult.success,
            decision: engineResult.edcm?.decision,
            delta: engineResult.edcm?.delta,
            energy: engineResult.ptca?.energy,
            hash: engineResult.eventHash,
            hmmm: engineResult.hmmm,
          });
        } catch (engineErr: any) {
          engineResults.push({ file: f.originalname, success: false, error: engineErr.message });
        }
      }

      res.json({ uploaded: results, engine: engineResults });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/files/upload-manifest", upload.single("manifest"), async (req: any, res) => {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) return res.status(400).json({ error: "No manifest file provided" });
      const content = await readFile(file.path, "utf-8");
      const lines = content.split("\n").filter((l: string) => l.trim());

      const relPath = path.relative(BASE_DIR, file.path);
      let engineResult;
      try {
        engineResult = await processA0Request({
          taskId: `manifest-${Date.now()}`,
          action: "manifest_upload",
          operatorVec: { P: 0.15, K: 0.35, Q: 0.1, T: 0.2, S: 0.2 },
          payload: { name: file.originalname, path: relPath, totalEntries: lines.length, sampleEntries: lines.slice(0, 5) },
        });
      } catch (engineErr: any) {
        engineResult = { success: false, error: engineErr.message };
      }

      res.json({
        path: relPath,
        totalEntries: lines.length,
        preview: lines.slice(0, 20),
        engine: engineResult.success !== undefined ? {
          success: (engineResult as any).success,
          decision: (engineResult as any).edcm?.decision,
          delta: (engineResult as any).edcm?.delta,
          energy: (engineResult as any).ptca?.energy,
          hash: (engineResult as any).eventHash,
          hmmm: (engineResult as any).hmmm,
        } : { success: false, error: (engineResult as any).error },
      });
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

  app.get("/api/metrics/token-rates", async (_req, res) => {
    try {
      const rates = await getTokenRates();
      res.json(rates);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/metrics/token-rates", async (req, res) => {
    try {
      const { rates } = req.body;
      if (!rates || typeof rates !== "object") return res.status(400).json({ error: "rates object required" });
      await storage.upsertSystemToggle("token_rates", true, rates);
      invalidateTokenRatesCache();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/metrics/spend-limit", async (_req, res) => {
    try {
      const toggle = await storage.getSystemToggle("spend_limit_monthly");
      const summary = await storage.getCostSummary();
      const params = (toggle?.parameters || {}) as any;
      res.json({
        enabled: toggle?.enabled || false,
        limit: params.limit || 50,
        mode: params.mode || "warn",
        currentSpend: summary.costThisMonth,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/metrics/spend-limit", async (req, res) => {
    try {
      const { enabled, limit, mode } = req.body;
      await storage.upsertSystemToggle("spend_limit_monthly", enabled !== false, { limit: limit || 50, mode: mode || "warn" });
      res.json({ ok: true });
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
      res.status(503).json({ error: "Stripe not configured: " + e.message });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id as product_id, p.name as product_name, p.description as product_description,
          p.active as product_active, p.metadata as product_metadata,
          pr.id as price_id, pr.unit_amount, pr.currency, pr.recurring, pr.active as price_active
        FROM stripe.products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        WHERE p.active = true AND p.metadata->>'app' = 'a0p'
        ORDER BY p.name, pr.unit_amount
      `);
      const map = new Map<string, any>();
      for (const row of result.rows as any[]) {
        if (!map.has(row.product_id)) {
          map.set(row.product_id, {
            id: row.product_id, name: row.product_name,
            description: row.product_description, metadata: row.product_metadata, prices: [],
          });
        }
        if (row.price_id) {
          map.get(row.product_id).prices.push({
            id: row.price_id, unitAmount: row.unit_amount, currency: row.currency,
            recurring: row.recurring, active: row.price_active,
          });
        }
      }
      res.json({ data: Array.from(map.values()) });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/stripe/subscription", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.json({ subscription: null });
      const result = await db.execute(sql`
        SELECT s.* FROM stripe.subscriptions s
        JOIN stripe.customers c ON c.id = s.customer
        WHERE c.metadata->>'userId' = ${userId} AND s.status IN ('active','trialing')
        LIMIT 1
      `);
      res.json({ subscription: result.rows[0] || null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/checkout", async (req: any, res) => {
    try {
      const { priceId } = req.body;
      if (!priceId) return res.status(400).json({ error: "priceId required" });
      const userId = req.user?.claims?.sub;
      const stripe = await getUncachableStripeClient();
      let customerId: string | undefined;
      if (userId) {
        const existing = await db.execute(sql`
          SELECT id FROM stripe.customers WHERE metadata->>'userId' = ${userId} LIMIT 1
        `);
        if ((existing.rows as any[]).length > 0) customerId = (existing.rows[0] as any).id;
        else {
          const cust = await stripe.customers.create({
            metadata: { userId },
            email: req.user?.claims?.email,
          });
          customerId = cust.id;
        }
      }
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/pricing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
      });
      res.json({ url: session.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/stripe/portal", async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const stripe = await getUncachableStripeClient();
      const existing = await db.execute(sql`
        SELECT id FROM stripe.customers WHERE metadata->>'userId' = ${userId} LIMIT 1
      `);
      if (!(existing.rows as any[]).length) return res.status(404).json({ error: "No customer found" });
      const customerId = (existing.rows[0] as any).id;
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${baseUrl}/pricing`,
      });
      res.json({ url: portal.url });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ MODEL REGISTRY ============

  const DEFAULT_MODEL_REGISTRY = {
    providers: [
      { name: "xai", label: "xAI Grok", baseURL: "https://api.x.ai/v1", authHeader: "Bearer {XAI_API_KEY}", requestFormat: "openai-chat", streamingFormat: "openai-sse", nativeIntegration: true, models: [{ id: "grok-beta", name: "Grok Beta", contextWindow: 131072, maxOutput: 4096 }, { id: "grok-2", name: "Grok 2", contextWindow: 131072, maxOutput: 4096 }, { id: "grok-2-vision-preview", name: "Grok 2 Vision", contextWindow: 8192, maxOutput: 4096 }], notes: "Native integration via XAI_API_KEY env var. Supports vision." },
      { name: "gemini", label: "Google Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta", authHeader: "Bearer {GEMINI_API_KEY}", requestFormat: "gemini", streamingFormat: "gemini-sse", nativeIntegration: true, models: [{ id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", contextWindow: 1048576, maxOutput: 8192 }, { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", contextWindow: 2097152, maxOutput: 8192 }, { id: "gemini-2.5-pro-exp-03-25", name: "Gemini 2.5 Pro", contextWindow: 1048576, maxOutput: 65536 }], notes: "Native integration via Gemini Replit integration." },
      { name: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", authHeader: "Bearer {OPENAI_API_KEY}", requestFormat: "openai-chat", streamingFormat: "openai-sse", nativeIntegration: false, models: [{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, maxOutput: 16384 }, { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, maxOutput: 16384 }, { id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128000, maxOutput: 4096 }, { id: "o1", name: "o1", contextWindow: 200000, maxOutput: 100000 }], notes: "BYO API key. OpenAI-compatible." },
      { name: "anthropic", label: "Anthropic Claude", baseURL: "https://api.anthropic.com/v1", authHeader: "x-api-key: {ANTHROPIC_API_KEY}", requestFormat: "anthropic", streamingFormat: "anthropic-sse", nativeIntegration: false, models: [{ id: "claude-opus-4-5", name: "Claude Opus 4.5", contextWindow: 200000, maxOutput: 32000 }, { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", contextWindow: 200000, maxOutput: 32000 }, { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000, maxOutput: 8192 }], notes: "BYO API key. Uses native Anthropic format, NOT OpenAI-compatible. Requires messages API v1 with anthropic-version header." },
      { name: "mistral", label: "Mistral AI", baseURL: "https://api.mistral.ai/v1", authHeader: "Bearer {MISTRAL_API_KEY}", requestFormat: "openai-chat", streamingFormat: "openai-sse", nativeIntegration: false, models: [{ id: "mistral-large-latest", name: "Mistral Large", contextWindow: 128000, maxOutput: 8192 }, { id: "mistral-small-latest", name: "Mistral Small", contextWindow: 32000, maxOutput: 8192 }], notes: "BYO API key. OpenAI-compatible endpoint." },
      { name: "perplexity", label: "Perplexity", baseURL: "https://api.perplexity.ai", authHeader: "Bearer {PERPLEXITY_API_KEY}", requestFormat: "openai-chat", streamingFormat: "openai-sse", nativeIntegration: false, models: [{ id: "sonar-pro", name: "Sonar Pro", contextWindow: 200000, maxOutput: 8192 }, { id: "sonar", name: "Sonar", contextWindow: 127072, maxOutput: 8192 }], notes: "BYO API key. OpenAI-compatible. Includes real-time web search." },
      { name: "cohere", label: "Cohere", baseURL: "https://api.cohere.ai/v2", authHeader: "Bearer {COHERE_API_KEY}", requestFormat: "cohere-chat", streamingFormat: "cohere-sse", nativeIntegration: false, models: [{ id: "command-r-plus-08-2024", name: "Command R+", contextWindow: 128000, maxOutput: 4096 }, { id: "command-r-08-2024", name: "Command R", contextWindow: 128000, maxOutput: 4096 }], notes: "BYO API key. Not OpenAI-compatible — uses Cohere v2 chat format." },
    ],
  };

  app.get("/api/model-registry", async (_req, res) => {
    try {
      const toggle = await storage.getSystemToggle("model_registry");
      const registry = toggle?.parameters || DEFAULT_MODEL_REGISTRY;
      res.json(registry);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/model-registry", async (req, res) => {
    try {
      const { providers } = req.body;
      if (!Array.isArray(providers)) return res.status(400).json({ error: "providers must be an array" });
      await storage.upsertSystemToggle("model_registry", true, { providers });
      res.json({ ok: true, providers });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ CUSTOM TOOLS ============

  app.get("/api/custom-tools", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const tools = await storage.getCustomTools(userId);
      res.json(tools);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/custom-tools/:id", async (req, res) => {
    try {
      const tool = await storage.getCustomTool(parseInt(req.params.id));
      if (!tool) return res.status(404).json({ error: "Tool not found" });
      res.json(tool);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/custom-tools", async (req, res) => {
    try {
      const toggle = await storage.getSystemToggle("custom_tools");
      if (toggle && !toggle.enabled) {
        return res.status(403).json({ error: "Custom tools subsystem is disabled" });
      }
      const userId = (req as any).user?.claims?.sub || "default";
      const { name, description, parametersSchema, targetModels, handlerType, handlerCode, enabled } = req.body;
      if (!name || !description || !handlerType || !handlerCode) {
        return res.status(400).json({ error: "name, description, handlerType, and handlerCode are required" });
      }
      const validTypes = ["webhook", "javascript", "template"];
      if (!validTypes.includes(handlerType)) {
        return res.status(400).json({ error: `Invalid handlerType. Valid: ${validTypes.join(", ")}` });
      }
      const tool = await storage.createCustomTool({
        userId,
        name,
        description,
        parametersSchema: parametersSchema || null,
        targetModels: targetModels || [],
        handlerType,
        handlerCode,
        enabled: enabled !== false,
      });
      await logMaster("custom_tools", "tool_created", { toolId: tool.id, name: tool.name, handlerType, targetModels });
      res.json(tool);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/custom-tools/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tool = await storage.getCustomTool(id);
      if (!tool) return res.status(404).json({ error: "Tool not found" });
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.parametersSchema !== undefined) updates.parametersSchema = req.body.parametersSchema;
      if (req.body.targetModels !== undefined) updates.targetModels = req.body.targetModels;
      if (req.body.handlerType !== undefined) updates.handlerType = req.body.handlerType;
      if (req.body.handlerCode !== undefined) updates.handlerCode = req.body.handlerCode;
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      await storage.updateCustomTool(id, updates);
      const updated = await storage.getCustomTool(id);
      await logMaster("custom_tools", "tool_updated", { toolId: id, updates: Object.keys(updates) });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/custom-tools/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tool = await storage.getCustomTool(id);
      if (!tool) return res.status(404).json({ error: "Tool not found" });
      await storage.deleteCustomTool(id);
      await logMaster("custom_tools", "tool_deleted", { toolId: id, name: tool.name });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/custom-tools/:id/toggle", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tool = await storage.getCustomTool(id);
      if (!tool) return res.status(404).json({ error: "Tool not found" });
      const newEnabled = !tool.enabled;
      await storage.updateCustomTool(id, { enabled: newEnabled });
      await logMaster("custom_tools", "tool_toggled", { toolId: id, name: tool.name, enabled: newEnabled });
      res.json({ ok: true, enabled: newEnabled });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/custom-tools/:id/test", async (req, res) => {
    try {
      const toggle = await storage.getSystemToggle("custom_tools");
      if (toggle && !toggle.enabled) {
        return res.status(403).json({ error: "Custom tools subsystem is disabled" });
      }
      const id = parseInt(req.params.id);
      const tool = await storage.getCustomTool(id);
      if (!tool) return res.status(404).json({ error: "Tool not found" });
      const testArgs = req.body.args || {};
      const startTime = Date.now();
      let result: string;
      let success = true;
      try {
        result = await executeCustomToolHandler(tool, testArgs);
      } catch (err: any) {
        result = `Error: ${err.message}`;
        success = false;
      }
      const duration = Date.now() - startTime;
      await logMaster("custom_tools", "tool_tested", {
        toolId: id, name: tool.name, handlerType: tool.handlerType,
        success, duration, resultPreview: result.slice(0, 500),
      });
      res.json({ success, result, duration });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function executeCustomToolHandler(tool: any, args: Record<string, any>): Promise<string> {
    switch (tool.handlerType) {
      case "webhook": {
        const url = tool.handlerCode;
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(10000),
        });
        const text = await response.text();
        return text.slice(0, 5000);
      }
      case "javascript": {
        const fn = new Function("args", `"use strict"; ${tool.handlerCode}`);
        const result = fn(args);
        return typeof result === "string" ? result : JSON.stringify(result);
      }
      case "template": {
        let output = tool.handlerCode;
        for (const [key, value] of Object.entries(args)) {
          output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
        }
        return output;
      }
      default:
        throw new Error(`Unknown handler type: ${tool.handlerType}`);
    }
  }

  // ============ BANDIT INITIALIZATION ============

  initializeBanditArms().then(() => {
    console.log("[a0p:bandit] Bandit arms initialized");
  }).catch((err) => {
    console.error("[a0p:bandit] Failed to initialize bandit arms:", err);
  });

  initializeMemorySeeds().then(() => {
    console.log("[a0p:memory] Memory seeds initialized");
  }).catch((err) => {
    console.error("[a0p:memory] Failed to initialize memory seeds:", err);
  });

  initOmega().then(() => {
    console.log("[a0p:omega] PTCA-Ω tensor initialized");
  }).catch((err) => {
    console.error("[a0p:omega] Failed to initialize PTCA-Ω:", err);
  });

  initPsi().then(() => {
    console.log("[a0p:psi] PTCA-Ψ self-model tensor initialized");
  }).catch((err) => {
    console.error("[a0p:psi] Failed to initialize PTCA-Ψ:", err);
  });

  // ============ HEARTBEAT SCHEDULER ============

  initializeHeartbeatTasks().then(() => {
    startHeartbeatScheduler();
  }).catch((err) => {
    console.error("[heartbeat] Failed to initialize:", err);
  });

  app.get("/api/heartbeat/status", (_req, res) => {
    const status = getHeartbeatSchedulerStatus();
    res.json(status);
  });

  app.get("/api/heartbeat/tasks", async (_req, res) => {
    try {
      const tasks = await storage.getHeartbeatTasks();
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const BUILTIN_HEARTBEAT_TASKS = ["transcript_search", "github_search", "ai_social_search", "x_monitor"];

  app.post("/api/heartbeat/tasks", async (req, res) => {
    try {
      const { name, description, taskType, weight, intervalSeconds, enabled, handlerCode } = req.body;
      if (!name || !taskType) {
        return res.status(400).json({ error: "name and taskType are required" });
      }
      const existing = await storage.getHeartbeatTask(name);
      if (existing) {
        return res.status(409).json({ error: `Task with name "${name}" already exists` });
      }
      const task = await storage.upsertHeartbeatTask({
        name,
        description: description || "",
        taskType,
        weight: weight ?? 1.0,
        intervalSeconds: intervalSeconds ?? 300,
        enabled: enabled ?? true,
        ...(handlerCode ? { lastResult: `handler:${handlerCode}` } : {}),
      });
      res.json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/heartbeat/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const tasks = await storage.getHeartbeatTasks();
      const task = tasks.find(t => t.id === id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      if (BUILTIN_HEARTBEAT_TASKS.includes(task.name)) {
        return res.status(403).json({ error: `Cannot delete built-in task "${task.name}"` });
      }
      await storage.deleteHeartbeatTask(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/heartbeat/tasks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates: any = {};
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      if (req.body.weight !== undefined) updates.weight = req.body.weight;
      if (req.body.intervalSeconds !== undefined) updates.intervalSeconds = req.body.intervalSeconds;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.taskType !== undefined) updates.taskType = req.body.taskType;
      if (req.body.handlerCode !== undefined) updates.lastResult = `handler:${req.body.handlerCode}`;
      await storage.updateHeartbeatTask(id, updates);
      const tasks = await storage.getHeartbeatTasks();
      res.json(tasks);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/heartbeat/tasks/:name/run", async (req, res) => {
    try {
      const { name } = req.params;
      const result = await runTaskNow(name);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/heartbeat/start", (_req, res) => {
    startHeartbeatScheduler();
    res.json({ ok: true, running: true });
  });

  app.post("/api/heartbeat/stop", (_req, res) => {
    stopHeartbeatScheduler();
    res.json({ ok: true, running: false });
  });

  app.get("/api/heartbeat/stats", async (_req, res) => {
    try {
      const stats = await storage.getActivityStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/heartbeat/tick-interval", async (req, res) => {
    try {
      const { seconds } = req.body;
      if (!seconds || seconds < 5) {
        return res.status(400).json({ error: "Minimum tick interval is 5 seconds" });
      }
      await updateTickInterval(seconds);
      res.json({ ok: true, tickIntervalMs: seconds * 1000 });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/discoveries", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const drafts = await storage.getDiscoveryDrafts(limit);
      res.json(drafts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/discoveries/:id/promote", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.createConversation({
        title: `Discovery: ${id}`,
        model: "gemini",
      });
      await storage.promoteDiscoveryDraft(id, conv.id);
      await logMaster("heartbeat", "discovery_promoted", { draftId: id, conversationId: conv.id });
      res.json({ ok: true, conversationId: conv.id });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ APPEND-ONLY LOGS ============

  const VALID_STREAMS: LogStream[] = ["master", "edcm", "memory", "sentinel", "interference", "attribution", "omega", "psi"];

  app.get("/api/logs/stats", async (_req, res) => {
    try {
      const stats = await getLogStats();
      const toggles = getStreamToggles();
      res.json({ stats, toggles });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/logs/toggles", (_req, res) => {
    res.json(getStreamToggles());
  });

  app.patch("/api/logs/toggles", (req, res) => {
    const { stream, enabled, globalEnabled } = req.body;
    if (typeof globalEnabled === "boolean") {
      setLoggingEnabled(globalEnabled);
    }
    if (stream && typeof enabled === "boolean") {
      setStreamToggle(stream, enabled);
    }
    res.json(getStreamToggles());
  });

  app.get("/api/logs/transcripts/list", async (_req, res) => {
    try {
      const transcripts = await listTranscripts();
      res.json(transcripts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/logs/transcripts/:filename", async (req, res) => {
    try {
      const { filename } = req.params;
      if (!filename.endsWith(".jsonl") || filename.includes("..")) {
        return res.status(400).json({ error: "Invalid transcript filename" });
      }
      const entries = await readTranscriptLog(filename);
      res.json({ entries, total: entries.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ai-transcripts", async (req, res) => {
    try {
      const date = req.query.date as string | undefined;
      const model = req.query.model as string | undefined;
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const result = await readAiTranscripts({ date, model, offset, limit });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ai-transcripts/files", async (_req, res) => {
    try {
      const files = await listAiTranscriptFiles();
      res.json(files);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/logs/:stream", async (req, res) => {
    try {
      const stream = req.params.stream as LogStream;
      if (!VALID_STREAMS.includes(stream)) {
        return res.status(400).json({ error: `Invalid stream. Valid: ${VALID_STREAMS.join(", ")}` });
      }
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const result = await readLogStream(stream, { offset, limit });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ BANDIT ENDPOINTS ============

  app.get("/api/bandit/stats", async (req, res) => {
    try {
      const domain = req.query.domain as string | undefined;
      const stats = await banditGetStats(domain);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bandit/stats/:domain", async (req, res) => {
    try {
      const stats = await banditGetStats(req.params.domain);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bandit/reset/:domain", async (req, res) => {
    try {
      await storage.resetBanditDomain(req.params.domain);
      await logMaster("bandit", "domain_reset", { domain: req.params.domain });
      res.json({ ok: true, domain: req.params.domain });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/bandit/toggle/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled (boolean) is required" });
      }
      await banditToggleArm(id, enabled);
      res.json({ ok: true, id, enabled });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/bandit/correlations", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const correlations = await getTopCorrelations(limit);
      res.json(correlations);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ MEMORY SEEDS ENDPOINTS ============

  app.get("/api/memory/seeds", async (_req, res) => {
    try {
      const seeds = await storage.getMemorySeeds();
      res.json(seeds);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/memory/seeds/:index", async (req, res) => {
    try {
      const seedIndex = parseInt(req.params.index);
      if (isNaN(seedIndex) || seedIndex < 0 || seedIndex > 10) {
        return res.status(400).json({ error: "Invalid seed index (0-10)" });
      }
      const updates: any = {};
      if (req.body.label !== undefined) updates.label = req.body.label;
      if (req.body.summary !== undefined) updates.summary = req.body.summary;
      if (req.body.pinned !== undefined) updates.pinned = req.body.pinned;
      if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;
      if (req.body.weight !== undefined) updates.weight = req.body.weight;
      await storage.updateMemorySeed(seedIndex, updates);
      const updated = await storage.getMemorySeed(seedIndex);
      await logMaster("memory", "seed_updated", { seedIndex, updates: Object.keys(updates) });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memory/seeds/:index/clear", async (req, res) => {
    try {
      const seedIndex = parseInt(req.params.index);
      if (isNaN(seedIndex) || seedIndex < 0 || seedIndex > 10) {
        return res.status(400).json({ error: "Invalid seed index (0-10)" });
      }
      await clearMemorySeed(seedIndex);
      res.json({ ok: true, seedIndex });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memory/seeds/:index/import", async (req, res) => {
    try {
      const seedIndex = parseInt(req.params.index);
      if (isNaN(seedIndex) || seedIndex < 0 || seedIndex > 10) {
        return res.status(400).json({ error: "Invalid seed index (0-10)" });
      }
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "text (string) is required" });
      }
      await importMemorySeedText(seedIndex, text);
      const updated = await storage.getMemorySeed(seedIndex);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/state", async (_req, res) => {
    try {
      const state = await getMemoryState();
      res.json(state);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/history", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const snapshots = await storage.getMemoryTensorSnapshots(limit);
      res.json(snapshots);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/drift", async (_req, res) => {
    try {
      const driftResults = await checkSemanticDrift();
      res.json(driftResults);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/memory/export", async (_req, res) => {
    try {
      const identity = await exportMemoryIdentity();
      res.json(identity);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/memory/import", async (req, res) => {
    try {
      const data = req.body;
      if (!data || !data.seeds || !Array.isArray(data.seeds)) {
        return res.status(400).json({ error: "Invalid memory identity format. Expected { seeds, projectionIn, projectionOut, ... }" });
      }
      await importMemoryIdentity(data);
      await logMaster("memory", "identity_imported", { seedCount: data.seeds.length });
      res.json({ ok: true, message: "Memory identity imported successfully" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ SYSTEM TOGGLES ENDPOINTS ============

  app.get("/api/toggles", async (_req, res) => {
    try {
      const toggles = await storage.getSystemToggles();
      res.json(toggles);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/toggles/:subsystem", async (req, res) => {
    try {
      const { subsystem } = req.params;
      const { enabled, parameters } = req.body;
      if (typeof enabled !== "boolean" && parameters === undefined) {
        return res.status(400).json({ error: "enabled (boolean) or parameters (object) required" });
      }
      const existing = await storage.getSystemToggle(subsystem);
      const newEnabled = typeof enabled === "boolean" ? enabled : (existing?.enabled ?? true);
      const newParams = parameters !== undefined ? parameters : (existing?.parameters ?? null);
      const toggle = await storage.upsertSystemToggle(subsystem, newEnabled, newParams);
      await logMaster("system", "toggle_updated", { subsystem, enabled: newEnabled, hasParams: !!newParams });
      res.json(toggle);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ CREDENTIALS & SECRETS ENDPOINTS ============

  app.get("/api/credentials", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const creds = await storage.getUserCredentials(userId);
      const masked = creds.map((c: any) => ({
        ...c,
        fields: c.fields?.map((f: any) => ({
          ...f,
          value: f.value ? `${f.value.slice(0, 4)}${"*".repeat(Math.max(0, Math.min(f.value.length - 8, 20)))}${f.value.length > 8 ? f.value.slice(-4) : ""}` : "",
        })),
      }));
      res.json(masked);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/credentials", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { serviceName, category, template, fields } = req.body;
      if (!serviceName || !fields || !Array.isArray(fields)) {
        return res.status(400).json({ error: "serviceName and fields array required" });
      }
      const credential = {
        id: `cred_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        serviceName,
        category: category || "custom",
        template: template || "custom",
        fields: fields.map((f: any) => ({
          label: f.label || f.key,
          key: f.key || f.label?.toLowerCase().replace(/\s+/g, "_"),
          value: f.value || "",
        })),
        createdAt: new Date().toISOString(),
      };
      await storage.addUserCredential(userId, credential);
      await logMaster("credentials", "credential_added", { serviceName, category, fieldCount: fields.length });
      res.json({ ok: true, credential: { ...credential, fields: credential.fields.map((f: any) => ({ ...f, value: "***" })) } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/credentials/:id", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { id } = req.params;
      await storage.deleteUserCredential(userId, id);
      await logMaster("credentials", "credential_deleted", { credentialId: id });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/secrets", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const secrets = await storage.getUserSecrets(userId);
      const masked = secrets.map((s: any) => ({
        ...s,
        value: s.value ? `${s.value.slice(0, 4)}${"*".repeat(Math.max(0, Math.min(s.value.length - 8, 20)))}${s.value.length > 8 ? s.value.slice(-4) : ""}` : "",
      }));
      res.json(masked);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/secrets", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { name, key, value, category } = req.body;
      if (!key || !value) {
        return res.status(400).json({ error: "key and value required" });
      }
      const secret = {
        name: name || key,
        key,
        value,
        category: category || "general",
        createdAt: new Date().toISOString(),
      };
      await storage.addUserSecret(userId, secret);
      await logMaster("secrets", "secret_added", { key, category: secret.category });
      res.json({ ok: true, secret: { ...secret, value: "***" } });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/secrets/:key", async (req, res) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const { key } = req.params;
      await storage.deleteUserSecret(userId, key);
      await logMaster("secrets", "secret_deleted", { key });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ BRAIN PRESETS ENDPOINTS ============

  const DEFAULT_BRAIN_PRESETS = [
    {
      id: "a0_dual",
      name: "a0 Dual",
      description: "Gemini + Grok generate in parallel, then Gemini merges both outputs (current default)",
      stages: [
        { order: 0, model: "gemini", role: "generate", input: "user_query", timeoutMs: 30000, weight: 0.5 },
        { order: 0, model: "grok", role: "generate", input: "user_query", timeoutMs: 30000, weight: 0.5 },
        { order: 1, model: "gemini", role: "synthesize", input: "all_outputs", timeoutMs: 30000, weight: 1.0 },
      ],
      mergeStrategy: "synthesis",
      weights: { gemini: 0.5, grok: 0.5 },
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
      isDefault: true,
      builtin: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "quick_answer",
      name: "Quick Answer",
      description: "Gemini only — single stage, no synthesis",
      stages: [
        { order: 0, model: "gemini", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 },
      ],
      mergeStrategy: "last",
      weights: { gemini: 1.0 },
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
      isDefault: false,
      builtin: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "grok_solo",
      name: "Grok Solo",
      description: "Grok only — single stage, direct response",
      stages: [
        { order: 0, model: "grok", role: "generate", input: "user_query", timeoutMs: 30000, weight: 1.0 },
      ],
      mergeStrategy: "last",
      weights: { grok: 1.0 },
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
      isDefault: false,
      builtin: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "hub_first",
      name: "Hub-First",
      description: "Hub Model A generates, then a0 Gemini synthesizes",
      stages: [
        { order: 0, model: "hub", role: "generate", input: "user_query", timeoutMs: 30000, weight: 0.6 },
        { order: 1, model: "gemini", role: "synthesize", input: "all_outputs", timeoutMs: 30000, weight: 1.0 },
      ],
      mergeStrategy: "synthesis",
      weights: { hub: 0.6, gemini: 0.4 },
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
      isDefault: false,
      builtin: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "deep_research",
      name: "Deep Research",
      description: "Gemini generates → Grok reviews → Gemini refines and synthesizes",
      stages: [
        { order: 0, model: "gemini", role: "generate", input: "user_query", timeoutMs: 45000, weight: 0.4 },
        { order: 1, model: "grok", role: "review", input: "previous_output", timeoutMs: 30000, weight: 0.3 },
        { order: 2, model: "gemini", role: "synthesize", input: "all_outputs", timeoutMs: 30000, weight: 0.3 },
      ],
      mergeStrategy: "synthesis",
      weights: { gemini: 0.6, grok: 0.4 },
      thresholds: { mergeThreshold: 0.18, softforkThreshold: 0.30 },
      isDefault: false,
      builtin: true,
      createdAt: new Date().toISOString(),
    },
  ];

  async function getBrainPresets(): Promise<any[]> {
    const toggle = await storage.getSystemToggle("brain_presets");
    if (toggle?.parameters && Array.isArray(toggle.parameters)) {
      return toggle.parameters;
    }
    await storage.upsertSystemToggle("brain_presets", true, DEFAULT_BRAIN_PRESETS);
    return DEFAULT_BRAIN_PRESETS;
  }

  async function getActiveBrainPreset(): Promise<any> {
    const presets = await getBrainPresets();
    const activeToggle = await storage.getSystemToggle("active_brain_preset");
    const activeId = (activeToggle?.parameters as any)?.presetId;
    if (activeId) {
      const found = presets.find((p: any) => p.id === activeId);
      if (found) return found;
    }
    return presets.find((p: any) => p.isDefault) || presets[0] || DEFAULT_BRAIN_PRESETS[0];
  }

  app.get("/api/brain/presets", async (_req, res) => {
    try {
      const presets = await getBrainPresets();
      const activeToggle = await storage.getSystemToggle("active_brain_preset");
      const activeId = (activeToggle?.parameters as any)?.presetId;
      res.json({ presets, activePresetId: activeId || presets.find((p: any) => p.isDefault)?.id || "a0_dual" });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/brain/presets", async (req, res) => {
    try {
      const { name, description, stages, mergeStrategy, weights, thresholds } = req.body;
      if (!name || !stages || !Array.isArray(stages) || stages.length === 0) {
        return res.status(400).json({ error: "name and stages array required" });
      }
      const presets = await getBrainPresets();
      const preset = {
        id: `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        description: description || "",
        stages: stages.map((s: any, i: number) => ({
          order: s.order ?? i,
          model: s.model || "gemini",
          role: s.role || "generate",
          input: s.input || "user_query",
          timeoutMs: s.timeoutMs || 30000,
          weight: s.weight ?? 1.0,
        })),
        mergeStrategy: mergeStrategy || "last",
        weights: weights || {},
        thresholds: thresholds || { mergeThreshold: 0.18, softforkThreshold: 0.30 },
        isDefault: false,
        builtin: false,
        createdAt: new Date().toISOString(),
      };
      presets.push(preset);
      await storage.upsertSystemToggle("brain_presets", true, presets);
      await logMaster("brain", "preset_created", { presetId: preset.id, name });
      res.json(preset);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch("/api/brain/presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const presets = await getBrainPresets();
      const idx = presets.findIndex((p: any) => p.id === id);
      if (idx < 0) return res.status(404).json({ error: "Preset not found" });
      const updates = req.body;
      presets[idx] = { ...presets[idx], ...updates, id: presets[idx].id, builtin: presets[idx].builtin };
      await storage.upsertSystemToggle("brain_presets", true, presets);
      await logMaster("brain", "preset_updated", { presetId: id });
      res.json(presets[idx]);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/brain/presets/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const presets = await getBrainPresets();
      const preset = presets.find((p: any) => p.id === id);
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      if (preset.builtin) return res.status(400).json({ error: "Cannot delete built-in presets" });
      const filtered = presets.filter((p: any) => p.id !== id);
      await storage.upsertSystemToggle("brain_presets", true, filtered);
      await logMaster("brain", "preset_deleted", { presetId: id });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/brain/presets/:id/activate", async (req, res) => {
    try {
      const { id } = req.params;
      const presets = await getBrainPresets();
      const preset = presets.find((p: any) => p.id === id);
      if (!preset) return res.status(404).json({ error: "Preset not found" });
      await storage.upsertSystemToggle("active_brain_preset", true, { presetId: id });
      await logMaster("brain", "preset_activated", { presetId: id, name: preset.name });
      res.json({ ok: true, preset });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/brain/presets/:id/default", async (req, res) => {
    try {
      const { id } = req.params;
      const presets = await getBrainPresets();
      const idx = presets.findIndex((p: any) => p.id === id);
      if (idx < 0) return res.status(404).json({ error: "Preset not found" });
      for (let i = 0; i < presets.length; i++) {
        presets[i] = { ...presets[i], isDefault: presets[i].id === id };
      }
      await storage.upsertSystemToggle("brain_presets", true, presets);
      await logMaster("brain", "default_set", { presetId: id, name: presets[idx].name });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/brain/config", async (_req, res) => {
    try {
      const activePreset = await getActiveBrainPreset();
      res.json({ activePreset });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/brain/weights", async (req, res) => {
    try {
      const { weights } = req.body;
      if (!weights || typeof weights !== "object") {
        return res.status(400).json({ error: "weights object required" });
      }
      const presets = await getBrainPresets();
      const activeToggle = await storage.getSystemToggle("active_brain_preset");
      const activeId = (activeToggle?.parameters as any)?.presetId;
      const idx = presets.findIndex((p: any) => p.id === activeId);
      if (idx >= 0) {
        presets[idx] = { ...presets[idx], weights };
        await storage.upsertSystemToggle("brain_presets", true, presets);
      }
      await logMaster("brain", "weights_updated", { weights });
      res.json({ ok: true, weights });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  async function executePipeline(
    preset: any,
    messages: { role: string; content: string }[],
    sysPrompt: string,
    maxTokens: number,
    temperature: number | undefined,
    conversationId?: number,
    messageId?: number,
    userId?: string,
  ): Promise<{ content: string; mergeMethod: string; totalPrompt: number; totalCompletion: number }> {
    const stages = preset.stages || [];
    if (stages.length === 0) {
      throw new Error("Preset has no stages configured");
    }

    const orderGroups: Record<number, any[]> = {};
    for (const stage of stages) {
      const order = stage.order ?? 0;
      if (!orderGroups[order]) orderGroups[order] = [];
      orderGroups[order].push(stage);
    }

    const sortedOrders = Object.keys(orderGroups).map(Number).sort((a, b) => a - b);
    const stageOutputs: { model: string; role: string; content: string; promptTokens: number; completionTokens: number }[] = [];
    let totalPrompt = 0;
    let totalCompletion = 0;

    for (const order of sortedOrders) {
      const group = orderGroups[order];
      const tasks = group.map(async (stage: any) => {
        let stageInput: string;
        const originalQuery = messages[messages.length - 1]?.content || "";

        if (stage.input === "previous_output" && stageOutputs.length > 0) {
          const prevOutput = stageOutputs[stageOutputs.length - 1].content;
          stageInput = `Original query: ${originalQuery}\n\nPrevious model output:\n${prevOutput}`;
          if (stage.role === "review") {
            stageInput += "\n\nPlease review the above response for accuracy, completeness, and quality. Point out any issues and suggest improvements.";
          } else if (stage.role === "refine") {
            stageInput += "\n\nPlease refine and improve the above response, incorporating any feedback.";
          }
        } else if (stage.input === "all_outputs" && stageOutputs.length > 0) {
          const allOutputs = stageOutputs.map((o, i) => `[${o.model} - ${o.role}]:\n${o.content}`).join("\n\n---\n\n");
          stageInput = `Original query: ${originalQuery}\n\nPrevious stage outputs:\n${allOutputs}`;
          if (stage.role === "synthesize") {
            stageInput += "\n\nPlease synthesize the above outputs into a single coherent, high-quality response. Combine the best insights from all outputs. Do not mention that multiple models were used.";
          }
        } else {
          stageInput = originalQuery;
        }

        const stageMessages = [
          ...messages.slice(0, -1),
          { role: "user" as const, content: stageInput },
        ];

        const model = stage.model || "gemini";
        const timeoutMs = stage.timeoutMs || 30000;

        if (model === "gemini") {
          const result = await callGeminiForSynthesis(stageMessages, sysPrompt, maxTokens || 8192, timeoutMs, conversationId, messageId);
          return { model: "gemini", role: stage.role, content: result.content, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
        } else if (model === "grok") {
          const result = await callGrokForSynthesis(stageMessages, sysPrompt, maxTokens || 16384, temperature, timeoutMs, conversationId, messageId);
          return { model: "grok", role: stage.role, content: result.content, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
        } else if (model === "hub") {
          const uid = userId || "default";
          const creds = await storage.getUserCredentials(uid);
          const hubCred = creds.find((c: any) => c.template === "ai_hub" || c.category === "ai_hub");
          if (hubCred) {
            const endpoint = hubCred.fields?.find((f: any) => f.key === "endpoint")?.value;
            const apiKey = hubCred.fields?.find((f: any) => f.key === "api_key")?.value;
            const defaultModel = hubCred.fields?.find((f: any) => f.key === "default_model")?.value;
            if (endpoint && apiKey) {
              const hubClient = new OpenAI({ apiKey, baseURL: endpoint });
              const chatMsgs = [
                { role: "system" as const, content: sysPrompt },
                ...stageMessages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
              ];
              const result = await hubClient.chat.completions.create({
                model: defaultModel || "default",
                messages: chatMsgs,
                max_tokens: maxTokens || 8192,
              });
              const text = result.choices[0]?.message?.content || "";
              const pt = result.usage?.prompt_tokens || 0;
              const ct = result.usage?.completion_tokens || 0;
              return { model: "hub", role: stage.role, content: text, promptTokens: pt, completionTokens: ct };
            }
          }
          const fallbackResult = await callGeminiForSynthesis(stageMessages, sysPrompt, maxTokens || 8192, timeoutMs, conversationId, messageId);
          return { model: "gemini(hub-fallback)", role: stage.role, content: fallbackResult.content, promptTokens: fallbackResult.promptTokens, completionTokens: fallbackResult.completionTokens };
        } else {
          const fallbackResult = await callGeminiForSynthesis(stageMessages, sysPrompt, maxTokens || 8192, timeoutMs, conversationId, messageId);
          return { model: "gemini(fallback)", role: stage.role, content: fallbackResult.content, promptTokens: fallbackResult.promptTokens, completionTokens: fallbackResult.completionTokens };
        }
      });

      const results = await Promise.allSettled(tasks);
      for (const result of results) {
        if (result.status === "fulfilled") {
          stageOutputs.push(result.value);
          totalPrompt += result.value.promptTokens;
          totalCompletion += result.value.completionTokens;
          const resolvedProvider = result.value.model.split("(")[0];
          if (userId) await trackCost(userId === "default" ? null : userId, resolvedProvider, result.value.promptTokens, result.value.completionTokens);
        }
      }
    }

    if (stageOutputs.length === 0) {
      throw new Error("All pipeline stages failed");
    }

    const finalOutput = stageOutputs[stageOutputs.length - 1].content;
    const mergeMethod = stageOutputs.length > 1 ? `pipeline(${stageOutputs.map(s => `${s.model}:${s.role}`).join("→")})` : stageOutputs[0].model;

    return { content: finalOutput, mergeMethod, totalPrompt, totalCompletion };
  }

  // ============ EDCM DIRECTIVES ENDPOINTS ============

  app.get("/api/edcm/directives", async (_req, res) => {
    try {
      const config = await getEdcmDirectiveConfig();
      res.json(config);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/edcm/history", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const snapshots = await storage.getEdcmMetricSnapshots(limit);
      const directiveHistory = getEdcmDirectiveHistory();
      res.json({ snapshots, directiveHistory });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ TRANSCRIPT SOURCES ENDPOINTS ============

  const TRANSCRIPT_SOURCES_DIR = path.join(process.cwd(), "uploads", "transcripts");
  mkdir(TRANSCRIPT_SOURCES_DIR, { recursive: true }).catch(() => {});

  function slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  }

  function extractMessagesFromFile(content: string, filename: string): string[] {
    const texts: string[] = [];
    const lower = filename.toLowerCase();
    try {
      if (lower.endsWith(".jsonl")) {
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const obj = JSON.parse(trimmed);
            const text = obj.content || obj.text || obj.message || obj.body || "";
            if (typeof text === "string" && text.trim()) texts.push(text.trim());
          } catch {}
        }
        return texts;
      }
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item.mapping) {
            for (const node of Object.values(item.mapping) as any[]) {
              const msg = node?.message;
              if (msg?.content?.parts) {
                const text = msg.content.parts.filter((p: any) => typeof p === "string").join(" ").trim();
                if (text) texts.push(text);
              }
            }
          } else if (typeof item.content === "string" && item.content.trim()) {
            texts.push(item.content.trim());
          } else if (typeof item.text === "string" && item.text.trim()) {
            texts.push(item.text.trim());
          }
        }
        return texts;
      }
      if (parsed.chat_messages) {
        for (const msg of parsed.chat_messages) {
          const text = msg.text || msg.content || "";
          if (typeof text === "string" && text.trim()) texts.push(text.trim());
        }
        return texts;
      }
      if (parsed.mapping) {
        for (const node of Object.values(parsed.mapping) as any[]) {
          const msg = (node as any)?.message;
          if (msg?.content?.parts) {
            const text = msg.content.parts.filter((p: any) => typeof p === "string").join(" ").trim();
            if (text) texts.push(text);
          }
        }
        return texts;
      }
      if (parsed.messages && Array.isArray(parsed.messages)) {
        for (const msg of parsed.messages) {
          const text = msg.content || msg.text || "";
          if (typeof text === "string" && text.trim()) texts.push(text.trim());
        }
        return texts;
      }
    } catch {}
    for (const para of content.split(/\n{2,}/)) {
      const trimmed = para.trim();
      if (trimmed.length > 20) texts.push(trimmed);
    }
    return texts;
  }

  app.get("/api/transcripts/sources", async (_req, res) => {
    try {
      const sources = await storage.getTranscriptSources();
      const result = await Promise.all(sources.map(async (src) => {
        const report = await storage.getLatestTranscriptReport(src.slug);
        const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, src.slug);
        let fileCount = 0;
        try { fileCount = (await readdir(dirPath)).length; } catch {}
        return { ...src, fileCount, latestReport: report || null };
      }));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/transcripts/sources", async (req, res) => {
    try {
      const { displayName } = req.body;
      if (!displayName?.trim()) return res.status(400).json({ error: "displayName required" });
      const slug = slugify(displayName.trim());
      if (!slug) return res.status(400).json({ error: "Invalid name" });
      const existing = await storage.getTranscriptSource(slug);
      if (existing) return res.status(409).json({ error: "Source already exists", slug });
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      await mkdir(dirPath, { recursive: true });
      const source = await storage.createTranscriptSource({ slug, displayName: displayName.trim(), fileCount: 0 });
      res.json(source);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/transcripts/sources/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      await rm(dirPath, { recursive: true, force: true });
      await storage.deleteTranscriptSource(slug);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const transcriptUpload = multer({
    storage: multer.diskStorage({
      destination: async (req: any, _file, cb) => {
        const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, req.params.slug);
        await mkdir(dirPath, { recursive: true });
        cb(null, dirPath);
      },
      filename: (_req, file, cb) => cb(null, file.originalname),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.post("/api/transcripts/sources/:slug/upload", transcriptUpload.array("files", 20), async (req: any, res) => {
    try {
      const { slug } = req.params;
      const source = await storage.getTranscriptSource(slug);
      if (!source) return res.status(404).json({ error: "Source not found" });
      const files = (req.files as any[]) || [];
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      let fileCount = 0;
      try { fileCount = (await readdir(dirPath)).length; } catch {}
      await storage.updateTranscriptSource(slug, { fileCount });
      res.json({ uploaded: files.map((f: any) => f.originalname), fileCount });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/transcripts/sources/:slug/files", async (req, res) => {
    try {
      const { slug } = req.params;
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      let files: string[] = [];
      try { files = await readdir(dirPath); } catch {}
      const fileInfos = await Promise.all(files.map(async (f) => {
        const filePath = path.join(dirPath, f);
        const s = await stat(filePath).catch(() => null);
        return { name: f, size: s?.size || 0, modified: s?.mtime };
      }));
      res.json(fileInfos);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/transcripts/sources/:slug/files/:filename", async (req, res) => {
    try {
      const { slug, filename } = req.params;
      const filePath = path.join(TRANSCRIPT_SOURCES_DIR, slug, filename);
      const safe = filePath.startsWith(TRANSCRIPT_SOURCES_DIR);
      if (!safe) return res.status(400).json({ error: "Invalid path" });
      await unlink(filePath);
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      let fileCount = 0;
      try { fileCount = (await readdir(dirPath)).length; } catch {}
      await storage.updateTranscriptSource(slug, { fileCount });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/transcripts/sources/:slug/scan", async (req, res) => {
    try {
      const { slug } = req.params;
      const source = await storage.getTranscriptSource(slug);
      if (!source) return res.status(404).json({ error: "Source not found" });
      const dirPath = path.join(TRANSCRIPT_SOURCES_DIR, slug);
      let files: string[] = [];
      try { files = await readdir(dirPath); } catch {}
      if (files.length === 0) return res.status(400).json({ error: "No files in source folder" });

      const metrics = { cm: 0, da: 0, drift: 0, dvg: 0, int: 0, tbf: 0 };
      let messageCount = 0;
      let peakMetric = 0;
      let peakMetricName = "";
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
          metrics.cm += m.CM.value;
          metrics.da += m.DA.value;
          metrics.drift += m.DRIFT.value;
          metrics.dvg += m.DVG.value;
          metrics.int += m.INT.value;
          metrics.tbf += m.TBF.value;
          messageCount++;
          const peak = Math.max(m.CM.value, m.DA.value, m.DRIFT.value, m.DVG.value, m.INT.value, m.TBF.value);
          filePeakSum += peak;
          if (peak > peakMetric) {
            peakMetric = peak;
            if (m.CM.value === peak) peakMetricName = "CM";
            else if (m.DA.value === peak) peakMetricName = "DA";
            else if (m.DRIFT.value === peak) peakMetricName = "DRIFT";
            else if (m.DVG.value === peak) peakMetricName = "DVG";
            else if (m.INT.value === peak) peakMetricName = "INT";
            else peakMetricName = "TBF";
          }
          if (m.CM.value > 0.8) directiveCounts["CONSTRAINT_REFOCUS"] = (directiveCounts["CONSTRAINT_REFOCUS"] || 0) + 1;
          if (m.DA.value > 0.8) directiveCounts["DISSONANCE_HALT"] = (directiveCounts["DISSONANCE_HALT"] || 0) + 1;
          if (m.DRIFT.value > 0.8) directiveCounts["DRIFT_ANCHOR"] = (directiveCounts["DRIFT_ANCHOR"] || 0) + 1;
          if (m.DVG.value > 0.8) directiveCounts["DIVERGENCE_COMMIT"] = (directiveCounts["DIVERGENCE_COMMIT"] || 0) + 1;
          if (m.INT.value > 0.8) directiveCounts["INTENSITY_CALM"] = (directiveCounts["INTENSITY_CALM"] || 0) + 1;
          if (m.TBF.value > 0.8) directiveCounts["BALANCE_CONCISE"] = (directiveCounts["BALANCE_CONCISE"] || 0) + 1;
          if (peak > 0.6 && topSnippets.length < 10) {
            topSnippets.push({ text: text.slice(0, 200), peak, file: filename });
          }
        }
        if (messages.length > 0) {
          fileBreakdown.push({ file: filename, messages: messages.length, avgPeak: filePeakSum / messages.length });
        }
      }

      const n = Math.max(1, messageCount);
      const report = await storage.addTranscriptReport({
        sourceSlug: slug,
        messageCount,
        avgCm: metrics.cm / n,
        avgDa: metrics.da / n,
        avgDrift: metrics.drift / n,
        avgDvg: metrics.dvg / n,
        avgInt: metrics.int / n,
        avgTbf: metrics.tbf / n,
        peakMetric,
        peakMetricName,
        directivesFired: directiveCounts,
        topSnippets: topSnippets.sort((a, b) => b.peak - a.peak),
        fileBreakdown,
      });
      await storage.updateTranscriptSource(slug, { lastScannedAt: new Date(), fileCount: files.length });
      res.json({ report, messageCount, filesScanned: files.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/transcripts/sources/:slug/report", async (req, res) => {
    try {
      const { slug } = req.params;
      const report = await storage.getLatestTranscriptReport(slug);
      if (!report) return res.status(404).json({ error: "No report yet — run a scan first" });
      res.json(report);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ DATA EXPORT ENDPOINTS ============

  app.get("/api/export/transcripts", async (req: Request, res: Response) => {
    try {
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const model = req.query.model as string | undefined;
      const format = (req.query.format as string) || "jsonl";

      const aiDir = path.resolve("logs/ai-transcripts");
      let files: string[];
      try {
        const allFiles = await readdir(aiDir);
        files = allFiles.filter(f => f.startsWith("ai-transcript-") && f.endsWith(".jsonl")).sort();
      } catch {
        files = [];
      }

      if (from || to) {
        files = files.filter(f => {
          const match = f.match(/ai-transcript-(\d{4}-\d{2}-\d{2})\.jsonl/);
          if (!match) return false;
          const date = match[1];
          if (from && date < from) return false;
          if (to && date > to) return false;
          return true;
        });
      }

      let allEntries: any[] = [];
      for (const file of files) {
        try {
          const content = await readFile(path.join(aiDir, file), "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              if (model && entry.model !== model) continue;
              allEntries.push(entry);
            } catch {}
          }
        } catch {}
      }

      if (format === "json") {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", "attachment; filename=ai-transcripts.json");
        res.json(allEntries);
      } else {
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Content-Disposition", "attachment; filename=ai-transcripts.jsonl");
        res.send(allEntries.map(e => JSON.stringify(e)).join("\n"));
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/conversations", async (req: Request, res: Response) => {
    try {
      const id = req.query.id ? parseInt(req.query.id as string) : undefined;

      if (id) {
        const conv = await storage.getConversation(id);
        if (!conv) return res.status(404).json({ error: "Conversation not found" });
        const msgs = await storage.getMessages(id);
        const exportData = {
          ...conv,
          messages: msgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
            createdAt: m.createdAt,
            metadata: m.metadata,
          })),
        };
        res.setHeader("Content-Disposition", `attachment; filename=conversation-${id}.json`);
        return res.json(exportData);
      }

      const convs = await storage.getConversations();
      const exportData = [];
      for (const conv of convs) {
        const msgs = await storage.getMessages(conv.id);
        exportData.push({
          ...conv,
          messages: msgs.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
            createdAt: m.createdAt,
            metadata: m.metadata,
          })),
        });
      }
      res.setHeader("Content-Disposition", "attachment; filename=conversations.json");
      res.json(exportData);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/credentials", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";
      const creds = await storage.getUserCredentials(userId);
      const sanitized = creds.map((c: any) => ({
        id: c.id,
        serviceName: c.serviceName,
        category: c.category,
        template: c.template,
        fields: c.fields?.map((f: any) => ({
          label: f.label,
          key: f.key,
        })),
        createdAt: c.createdAt,
      }));

      const secrets = await storage.getUserSecrets(userId);
      const sanitizedSecrets = secrets.map((s: any) => ({
        name: s.name,
        key: s.key,
        category: s.category,
        createdAt: s.createdAt,
      }));

      res.setHeader("Content-Disposition", "attachment; filename=credentials-inventory.json");
      res.json({ credentials: sanitized, secrets: sanitizedSecrets });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/config", async (_req: Request, res: Response) => {
    try {
      const [
        toggles,
        banditArmsList,
        edcmSnaps,
        memSeeds,
        heartbeatTasksList,
        costSummary,
      ] = await Promise.all([
        storage.getSystemToggles(),
        storage.getBanditArms(),
        storage.getEdcmMetricSnapshots(50),
        storage.getMemorySeeds(),
        storage.getHeartbeatTasks(),
        storage.getCostSummary(),
      ]);

      const configSnapshot = {
        exportedAt: new Date().toISOString(),
        systemToggles: toggles.map(t => ({
          subsystem: t.subsystem,
          enabled: t.enabled,
          parameters: t.parameters,
        })),
        banditArms: banditArmsList.map(a => ({
          domain: a.domain,
          armName: a.armName,
          enabled: a.enabled,
          pulls: a.pulls,
          totalReward: a.totalReward,
          avgReward: a.avgReward,
          ucbScore: a.ucbScore,
          emaReward: a.emaReward,
        })),
        edcmRecentSnapshots: edcmSnaps.slice(0, 20),
        memorySeeds: memSeeds.map(s => ({
          seedIndex: s.seedIndex,
          category: s.category,
          summary: s.summary,
          enabled: s.enabled,
          activationWeight: s.activationWeight,
          decayFactor: s.decayFactor,
        })),
        heartbeatTasks: heartbeatTasksList.map(t => ({
          name: t.name,
          description: t.description,
          taskType: t.taskType,
          enabled: t.enabled,
          weight: t.weight,
          intervalSeconds: t.intervalSeconds,
        })),
        costSummary,
      };

      res.setHeader("Content-Disposition", "attachment; filename=system-config.json");
      res.json(configSnapshot);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/export/all", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.claims?.sub || "default";

      const aiDir = path.resolve("logs/ai-transcripts");
      let transcriptEntries: any[] = [];
      try {
        const files = await readdir(aiDir);
        const jsonlFiles = files.filter(f => f.startsWith("ai-transcript-") && f.endsWith(".jsonl")).sort();
        for (const file of jsonlFiles) {
          const content = await readFile(path.join(aiDir, file), "utf-8");
          const lines = content.trim().split("\n").filter(Boolean);
          for (const line of lines) {
            try { transcriptEntries.push(JSON.parse(line)); } catch {}
          }
        }
      } catch {}

      const convs = await storage.getConversations();
      const conversationsExport = [];
      for (const conv of convs) {
        const msgs = await storage.getMessages(conv.id);
        conversationsExport.push({
          ...conv,
          messages: msgs.map(m => ({
            id: m.id, role: m.role, content: m.content, model: m.model, createdAt: m.createdAt, metadata: m.metadata,
          })),
        });
      }

      const creds = await storage.getUserCredentials(userId);
      const sanitizedCreds = creds.map((c: any) => ({
        id: c.id, serviceName: c.serviceName, category: c.category, template: c.template,
        fields: c.fields?.map((f: any) => ({ label: f.label, key: f.key })),
        createdAt: c.createdAt,
      }));
      const secrets = await storage.getUserSecrets(userId);
      const sanitizedSecrets = secrets.map((s: any) => ({
        name: s.name, key: s.key, category: s.category, createdAt: s.createdAt,
      }));

      const [toggles, banditArmsList, edcmSnaps, memSeeds, heartbeatTasksList, costSummary] = await Promise.all([
        storage.getSystemToggles(), storage.getBanditArms(), storage.getEdcmMetricSnapshots(50),
        storage.getMemorySeeds(), storage.getHeartbeatTasks(), storage.getCostSummary(),
      ]);

      const configSnapshot = {
        exportedAt: new Date().toISOString(),
        systemToggles: toggles.map(t => ({ subsystem: t.subsystem, enabled: t.enabled, parameters: t.parameters })),
        banditArms: banditArmsList.map(a => ({
          domain: a.domain, armName: a.armName, enabled: a.enabled, pulls: a.pulls,
          totalReward: a.totalReward, avgReward: a.avgReward, ucbScore: a.ucbScore, emaReward: a.emaReward,
        })),
        edcmRecentSnapshots: edcmSnaps.slice(0, 20),
        memorySeeds: memSeeds.map(s => ({
          seedIndex: s.seedIndex, category: s.category, summary: s.summary, enabled: s.enabled,
          activationWeight: s.activationWeight, decayFactor: s.decayFactor,
        })),
        heartbeatTasks: heartbeatTasksList.map(t => ({
          name: t.name, description: t.description, taskType: t.taskType, enabled: t.enabled,
          weight: t.weight, intervalSeconds: t.intervalSeconds,
        })),
        costSummary,
      };

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=a0p-export.zip");

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);
      archive.append(JSON.stringify(transcriptEntries, null, 2), { name: "ai-transcripts.json" });
      archive.append(JSON.stringify(conversationsExport, null, 2), { name: "conversations.json" });
      archive.append(JSON.stringify({ credentials: sanitizedCreds, secrets: sanitizedSecrets }, null, 2), { name: "credentials-inventory.json" });
      archive.append(JSON.stringify(configSnapshot, null, 2), { name: "system-config.json" });
      await archive.finalize();
    } catch (e: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: e.message });
      }
    }
  });

  // ============ OMEGA PTCA-Ω ENDPOINTS ============

  app.get("/api/omega/state", async (_req, res) => {
    try {
      const state = getOmegaState();
      const labels = getOmegaDimensionLabels();
      const thresholds = getOmegaDimensionThresholds();
      res.json({
        ...state,
        dimensionLabels: labels,
        dimensionThresholds: thresholds,
        config: OMEGA_CONFIG,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/bias", async (req, res) => {
    try {
      const { dimension, bias } = req.body;
      if (typeof dimension !== "number" || dimension < 0 || dimension >= 10) {
        return res.status(400).json({ error: "dimension must be 0-9" });
      }
      if (typeof bias !== "number") {
        return res.status(400).json({ error: "bias must be a number" });
      }
      const state = setOmegaDimensionBias(dimension, bias, "manual");
      await persistOmegaState();
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/mode", async (req, res) => {
    try {
      const { mode } = req.body;
      if (!["active", "passive", "economy", "research"].includes(mode)) {
        return res.status(400).json({ error: "mode must be: active, passive, economy, or research" });
      }
      const state = setOmegaMode(mode as OmegaAutonomyMode);
      await persistOmegaState();
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/goal", async (req, res) => {
    try {
      const { description, priority } = req.body;
      if (!description) return res.status(400).json({ error: "description required" });
      const goal = addOmegaGoal(description, priority || 5, "console");
      await persistOmegaState();
      res.json({ ok: true, goal });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/goal/:goalId/complete", async (req, res) => {
    try {
      const ok = completeOmegaGoal(req.params.goalId, "console");
      if (!ok) return res.status(404).json({ error: "Goal not found or already completed" });
      await persistOmegaState();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/goal/:goalId/remove", async (req, res) => {
    try {
      const ok = removeOmegaGoal(req.params.goalId, "console");
      if (!ok) return res.status(404).json({ error: "Goal not found" });
      await persistOmegaState();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/boost", async (req, res) => {
    try {
      const { dimension, amount } = req.body;
      if (typeof dimension !== "number" || dimension < 0 || dimension >= 10) {
        return res.status(400).json({ error: "dimension must be 0-9" });
      }
      const state = boostOmegaDimension(dimension, amount || 1, "console");
      await persistOmegaState();
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/omega/solve", async (_req, res) => {
    try {
      const state = omegaSolve();
      await persistOmegaState();
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ PSI SELF-MODEL ENDPOINTS ============

  app.get("/api/psi/state", async (_req, res) => {
    try {
      const state = getPsiState();
      const labels = getPsiDimensionLabels();
      const thresholds = getPsiDimensionThresholds();
      const omegaLabels = getOmegaDimensionLabels();
      const psiOmegaMap = PSI_CONFIG.omegaMap;
      res.json({
        ...state,
        labels,
        thresholds,
        config: PSI_CONFIG,
        sentinelPairings: labels.map((label, i) => ({ psiDim: i, psiLabel: label, sentinelId: `S${i}` })),
        omegaPairings: labels.map((label, i) => ({
          psiDim: i,
          psiLabel: label,
          omegaDim: psiOmegaMap[i],
          omegaLabel: psiOmegaMap[i] >= 0 ? omegaLabels[psiOmegaMap[i]] : "ALL (global modulator)",
          inverse: i === 7,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/psi/bias", async (req, res) => {
    try {
      const { dimension, bias } = req.body;
      if (typeof dimension !== "number" || typeof bias !== "number") {
        return res.status(400).json({ error: "dimension and bias required" });
      }
      const state = setPsiDimensionBias(dimension, bias, "api");
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/psi/mode", async (req, res) => {
    try {
      const { mode } = req.body;
      const validModes = ["reflective", "operational", "transparent", "guarded"];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ error: `Invalid mode. Valid: ${validModes.join(", ")}` });
      }
      const state = setPsiMode(mode as PsiSelfModelMode);
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/psi/solve", async (_req, res) => {
    try {
      const state = psiSolve();
      await persistPsiState();
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/psi/boost", async (req, res) => {
    try {
      const { dimension, amount } = req.body;
      if (typeof dimension !== "number" || typeof amount !== "number") {
        return res.status(400).json({ error: "dimension and amount required" });
      }
      const state = boostPsiDimension(dimension, amount, "api");
      res.json({ ok: true, state });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/triad/state", async (_req, res) => {
    try {
      const psi = getPsiState();
      const omega = getOmegaState();
      const ptca = ptcaSolveDetailed([]);
      const psiLabels = getPsiDimensionLabels();
      const omegaLabels = getOmegaDimensionLabels();
      res.json({
        ptca: { axes: "53×11×8×7", sentinelCount: 11, energy: ptca.energy, heptagramEnergy: ptca.heptagramEnergy },
        psi: {
          totalEnergy: psi.totalEnergy,
          mode: psi.mode,
          dimensionEnergies: psi.dimensionEnergies,
          labels: psiLabels,
        },
        omega: {
          totalEnergy: omega.totalEnergy,
          mode: omega.mode,
          dimensionEnergies: omega.dimensionEnergies,
          labels: omegaLabels,
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ============ DISCOVERY DRAFTS ENDPOINTS ============

  app.get("/api/discoveries", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const drafts = await storage.getDiscoveryDrafts(limit);
      res.json(drafts);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/discoveries/:id/promote", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const drafts = await storage.getDiscoveryDrafts(200);
      const draft = drafts.find(d => d.id === id);
      if (!draft) return res.status(404).json({ error: "Discovery draft not found" });
      if (draft.promotedToConversation) {
        return res.status(400).json({ error: "Draft already promoted to conversation" });
      }
      const conv = await storage.createConversation({
        title: draft.title,
        model: "agent",
      } as InsertConversation);
      await storage.createMessage({
        conversationId: conv.id,
        role: "system",
        content: `Discovery from ${draft.sourceTask}: ${draft.summary}`,
        model: "system",
      } as InsertMessage);
      await storage.promoteDiscoveryDraft(id, conv.id);
      await logMaster("discovery", "draft_promoted", { draftId: id, conversationId: conv.id, title: draft.title });
      res.json({ ok: true, conversationId: conv.id, draft });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
