import { storage } from "../storage";
import { logMaster } from "../logger";
import { trackCost } from "../a0p-engine";
import OpenAI from "openai";
import { getModelSlots, buildSlotClient } from "./slots";
import { callGeminiForSynthesis, callGrokForSynthesis, callSlotForSynthesis } from "./synthesis";

export const DEFAULT_BRAIN_PRESETS = [
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

export async function getBrainPresets(): Promise<any[]> {
  const toggle = await storage.getSystemToggle("brain_presets");
  if (toggle?.parameters && Array.isArray(toggle.parameters)) {
    return toggle.parameters;
  }
  await storage.upsertSystemToggle("brain_presets", true, DEFAULT_BRAIN_PRESETS);
  return DEFAULT_BRAIN_PRESETS;
}

export async function getActiveBrainPreset(): Promise<any> {
  const presets = await getBrainPresets();
  const activeToggle = await storage.getSystemToggle("active_brain_preset");
  const activeId = (activeToggle?.parameters as any)?.presetId;
  if (activeId) {
    const found = presets.find((p: any) => p.id === activeId);
    if (found) return found;
  }
  return presets.find((p: any) => p.isDefault) || presets[0] || DEFAULT_BRAIN_PRESETS[0];
}

export async function executePipeline(
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
  if (stages.length === 0) throw new Error("Preset has no stages configured");

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

      const model = stage.model || "a";
      const timeoutMs = stage.timeoutMs || 30000;

      const allSlotsForStage = await getModelSlots();
      if (allSlotsForStage[model]) {
        const result = await callSlotForSynthesis(model, stageMessages, sysPrompt, maxTokens || 16384, temperature, timeoutMs, conversationId, messageId);
        return { model: `slot_${model}`, role: stage.role, content: result.content, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
      } else if (model === "gemini") {
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
            const result = await hubClient.chat.completions.create({ model: defaultModel || "default", messages: chatMsgs, max_tokens: maxTokens || 8192 });
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

  if (stageOutputs.length === 0) throw new Error("All pipeline stages failed");

  const finalOutput = stageOutputs[stageOutputs.length - 1].content;
  const mergeMethod = stageOutputs.length > 1 ? `pipeline(${stageOutputs.map(s => `${s.model}:${s.role}`).join("→")})` : stageOutputs[0].model;

  return { content: finalOutput, mergeMethod, totalPrompt, totalCompletion };
}
