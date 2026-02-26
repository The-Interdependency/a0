// Grok/xAI integration via Replit AI Integrations
import OpenAI from "openai";

// XAI_API_KEY is available via environment variable or Replit AI Integrations
export function getGrokClient() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY not set");
  return new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
}
