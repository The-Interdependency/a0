import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { storage } from "../storage";
import { logAiTranscript } from "../logger";
import { getModelSlots, buildSlotClient } from "./slots";
import { trackCost } from "../a0p-engine";

export const geminiAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

export async function getSynthesisConfig(): Promise<{ enabled: boolean; timeoutMs: number }> {
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

export async function callGeminiForSynthesis(
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

export async function callGrokForSynthesis(
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
    const cfgToggle = await storage.getSystemToggle("agent_model_config");
    const cfg = (cfgToggle?.parameters as any) || {};
    const synthModel = cfg.model || "grok-3-mini";
    const synthClient = cfg.apiKey && cfg.baseUrl
      ? new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl })
      : new OpenAI({ apiKey: cfg.apiKey || process.env.XAI_API_KEY!, baseURL: cfg.baseUrl || "https://api.x.ai/v1" });
    const chatMsgs = [
      { role: "system" as const, content: sysPrompt },
      ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];
    const result = await synthClient.chat.completions.create({
      model: synthModel,
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

export async function callSlotForSynthesis(
  slotKey: string,
  messages: { role: string; content: string }[],
  sysPrompt: string,
  maxTokens: number,
  temperature: number | undefined,
  timeoutMs: number,
  conversationId?: number,
  messageId?: number
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const allSlots = await getModelSlots();
  const slot = allSlots[slotKey] ?? allSlots["a"];
  const { client, model } = buildSlotClient(slot);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  try {
    const chatMsgs = [
      { role: "system" as const, content: sysPrompt },
      ...messages.map((m: any) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];
    const result = await client.chat.completions.create({
      model,
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
      model: `slot_${slotKey}(${model})`,
      request: { systemPrompt: sysPrompt, messages },
      response: text,
      tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      latencyMs,
      status: "success",
    }).catch(() => {});
    return { content: text, promptTokens, completionTokens };
  } catch (e: any) {
    clearTimeout(timeout);
    logAiTranscript({
      timestamp: new Date().toISOString(),
      conversationId,
      messageId,
      model: `slot_${slotKey}(${model})`,
      request: { systemPrompt: sysPrompt, messages },
      response: "",
      tokens: { prompt: 0, completion: 0, total: 0 },
      latencyMs: Date.now() - startTime,
      status: "error",
      error: e.message,
    }).catch(() => {});
    throw e;
  }
}

export async function mergeResponsesViaGemini(
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
