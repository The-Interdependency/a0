import { CohereClient } from "cohere-ai";
import type { Cohere } from "cohere-ai";

export interface SlotCallParams {
  messages: { role: string; content: string }[];
  systemPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  apiKey: string;
}

export interface SlotCallResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * Translate an OpenAI-style messages array + system prompt into Cohere's
 * chat call and map the response back to a common shape.
 *
 * Mapping rules:
 *   - systemPrompt → preamble (Cohere's dedicated system-prompt field)
 *   - messages with role "user"      → chatHistory entry with role "USER"
 *   - messages with role "assistant" → chatHistory entry with role "CHATBOT"
 *   - The final user message becomes the `message` parameter
 */
export async function callCohere(params: SlotCallParams): Promise<SlotCallResult> {
  const { messages, systemPrompt, model, maxTokens, temperature, apiKey } = params;

  const client = new CohereClient({ token: apiKey });

  const userMessages = messages.filter((m) => m.role === "user" || m.role === "assistant");

  const lastUserIdx = [...userMessages].map((m) => m.role).lastIndexOf("user");
  const lastUserMessage = lastUserIdx >= 0 ? userMessages[lastUserIdx].content : "(no message)";

  const chatHistory: Cohere.Message[] = userMessages
    .slice(0, lastUserIdx)
    .map((m): Cohere.Message => {
      if (m.role === "user") {
        return { role: "USER", message: m.content };
      }
      return { role: "CHATBOT", message: m.content };
    });

  const requestParams: Cohere.ChatRequest = {
    model,
    message: lastUserMessage,
    chatHistory,
    ...(systemPrompt ? { preamble: systemPrompt } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    ...(temperature != null ? { temperature } : {}),
  };

  const response = await client.chat(requestParams);

  const content = response.text || "";
  const promptTokens = response.meta?.tokens?.inputTokens ?? 0;
  const completionTokens = response.meta?.tokens?.outputTokens ?? 0;

  return { content, promptTokens, completionTokens };
}
