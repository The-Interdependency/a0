import { storage } from "../storage";
import OpenAI from "openai";

export const DEFAULT_MODEL_SLOTS: Record<string, any> = {
  a: { label: "A", provider: "xai", model: "grok-3-mini", baseUrl: "https://api.x.ai/v1", apiKey: "" },
  b: { label: "B", provider: "xai", model: "grok-3-mini", baseUrl: "https://api.x.ai/v1", apiKey: "" },
  c: { label: "C", provider: "xai", model: "grok-3-mini", baseUrl: "https://api.x.ai/v1", apiKey: "" },
};

export function isValidSlotKey(key: string) {
  return /^[a-z0-9]{1,8}$/.test(key);
}

export async function getModelSlots(): Promise<Record<string, any>> {
  const toggle = await storage.getSystemToggle("model_slots");
  const saved = (toggle?.parameters as any) || {};
  const merged: Record<string, any> = {};
  for (const key of ["a", "b", "c"]) {
    const d = DEFAULT_MODEL_SLOTS[key];
    const s = saved[key] || {};
    merged[key] = {
      label: s.label ?? d.label,
      provider: s.provider ?? d.provider,
      model: s.model ?? d.model,
      baseUrl: s.baseUrl ?? d.baseUrl,
      apiKey: s.apiKey ?? "",
    };
  }
  for (const key of Object.keys(saved)) {
    if (!["a", "b", "c"].includes(key) && isValidSlotKey(key)) {
      merged[key] = {
        label: saved[key].label ?? key.toUpperCase(),
        provider: saved[key].provider ?? "xai",
        model: saved[key].model ?? "grok-3-mini",
        baseUrl: saved[key].baseUrl ?? "https://api.x.ai/v1",
        apiKey: saved[key].apiKey ?? "",
      };
    }
  }
  return merged;
}

export function buildSlotClient(slot: any): { client: OpenAI; model: string } {
  const apiKey = slot.apiKey || process.env.XAI_API_KEY || "";
  const baseURL = slot.baseUrl || "https://api.x.ai/v1";
  return {
    client: new OpenAI({ apiKey, baseURL }),
    model: slot.model || "grok-3-mini",
  };
}
