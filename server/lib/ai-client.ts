import OpenAI from "openai";

export const BYO_MODELS: Record<string, {
  models: { id: string; name: string; contextWindow: number; maxOutput: number }[];
  baseURL?: string;
  openaiCompat: boolean;
}> = {
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

export function getOpenAICompatClient(provider: string, apiKey: string): OpenAI {
  const cfg = BYO_MODELS[provider];
  return new OpenAI({
    apiKey,
    ...(cfg?.baseURL ? { baseURL: cfg.baseURL } : {}),
  });
}

export async function validateBYOModel(model: string, loadUserApiKeys: (userId: string) => Promise<Record<string, string>>, userId: string) {
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
