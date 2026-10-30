// Provider adapters: OpenAI, Anthropic, xAI, DeepSeek.
// Keys are resolved server-side from the vault; they never reach the client.
import { VaultError } from './vault.js';

export const PROVIDER_DEFS = {
  openai: {
    label: 'OpenAI',
    kind: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    secretPath: 'provider/openai',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    defaultCapabilities: { streaming: true, images: true, tools: true, maxContextTokens: 128000 },
  },
  anthropic: {
    label: 'Anthropic',
    kind: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-5',
    secretPath: 'provider/anthropic',
    authHeader: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    defaultCapabilities: { streaming: true, images: true, tools: true, maxContextTokens: 200000 },
  },
  xai: {
    label: 'xAI',
    kind: 'openai-compatible',
    defaultBaseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-fast',
    secretPath: 'provider/xai',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    defaultCapabilities: { streaming: true, images: true, tools: true, maxContextTokens: 131072 },
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    secretPath: 'provider/deepseek',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    defaultCapabilities: { streaming: true, images: false, tools: true, maxContextTokens: 64000 },
    selectedByDefault: true,
  },
};

export function providerInfo(provider) {
  const def = PROVIDER_DEFS[provider];
  if (!def) {
    const err = new Error(`Unknown provider: ${provider}`);
    err.status = 400;
    throw err;
  }
  return def;
}

export function defaultModelFor(provider) {
  return providerInfo(provider).defaultModel;
}

export function defaultCapabilitiesFor(provider) {
  return { ...providerInfo(provider).defaultCapabilities };
}

// Fetch a provider key through the secrets adapter. Throws a visible,
// non-substituting failure when the credential is missing or invalid.
export async function resolveApiKey(vault, provider) {
  const def = providerInfo(provider);
  const secret = await vault.readSecret(def.secretPath);
  const key = secret?.api_key || secret?.key;
  if (!key) {
    const err = new Error(`No ${def.label} API key is configured. Add it in Settings → Providers.`);
    err.status = 400;
    err.code = 'missing_credential';
    throw err;
  }
  return key;
}

export function assertCapability(provider, capabilities, requirement) {
  const cap = capabilities || defaultCapabilitiesFor(provider);
  if (requirement === 'images' && !cap.images) {
    return `${providerInfo(provider).label} does not support image content with the configured model. Remove the image or choose a model with vision support.`;
  }
  if (requirement === 'tools' && !cap.tools) {
    return `${providerInfo(provider).label} does not support tool use with the configured model.`;
  }
  return null;
}

// Build the exact model-facing message list from a frozen semantic snapshot.
// The snapshot is identical for every participant in a comparison round.
export function encodeSnapshotForProvider(provider, model, snapshot) {
  const def = providerInfo(provider);
  if (def.kind === 'anthropic') {
    return encodeAnthropicMessages(provider, model, snapshot);
  }
  return encodeOpenAIMessages(provider, model, snapshot);
}

function encodeOpenAIMessages(provider, model, snapshot) {
  const messages = [];
  if (snapshot.system) messages.push({ role: 'system', content: snapshot.system });
  for (const msg of snapshot.messages) {
    const parts = [];
    if (msg.content) parts.push({ type: 'text', text: msg.content });
    for (const att of msg.attachments || []) {
      if (att.mime?.startsWith('image/')) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${att.mime};base64,${att.data}` },
        });
      }
    }
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'tool' ? 'tool' : 'user',
      content: parts.length > 1 ? parts : (msg.content || ''),
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    });
  }
  return messages;
}

function encodeAnthropicMessages(provider, model, snapshot) {
  const messages = [];
  for (const msg of snapshot.messages) {
    if (msg.role === 'system') continue;
    const content = [];
    if (msg.content) content.push({ type: 'text', text: msg.content });
    for (const att of msg.attachments || []) {
      if (att.mime?.startsWith('image/')) {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: att.mime, data: att.data },
        });
      }
    }
    messages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: content.length ? content : (msg.content || ''),
      ...(msg.tool_use ? { content: [...(Array.isArray(msg.content) ? msg.content : []), msg.tool_use] } : {}),
    });
  }
  return { messages, system: snapshot.system };
}

export async function streamProvider({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl }) {
  const def = providerInfo(provider);
  if (def.kind === 'anthropic') {
    return streamAnthropic({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl });
  }
  return streamOpenAICompatible({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl });
}

async function streamOpenAICompatible({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl }) {
  const def = providerInfo(provider);
  const base = (baseUrl || def.defaultBaseUrl).replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const messages = encodeOpenAIMessages(provider, model, snapshot);
  const body = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
    body: JSON.stringify(body),
    signal,
  }, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${def.label} request failed (${res.status}): ${text.slice(0, 400)}`);
    err.status = res.status;
    err.code = res.status === 401 || res.status === 403 ? 'invalid_credential' : 'provider_error';
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result = { text: '', toolCalls: [], usage: null, finishReason: null };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) {
        result.text += delta.content;
        onChunk({ type: 'text', text: delta.content });
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index || 0;
          if (!result.toolCalls[idx]) result.toolCalls[idx] = { id: '', name: '', arguments: '' };
          if (tc.id) result.toolCalls[idx].id = tc.id;
          if (tc.function?.name) result.toolCalls[idx].name = tc.function.name;
          if (tc.function?.arguments) result.toolCalls[idx].arguments += tc.function.arguments;
        }
      }
      if (json.choices?.[0]?.finish_reason) result.finishReason = json.choices[0].finish_reason;
      if (json.usage) result.usage = json.usage;
    }
  }
  result.toolCalls = result.toolCalls.filter(Boolean).map((tc) => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
    name: tc.name,
    arguments: tc.arguments,
  }));
  return result;
}

async function streamAnthropic({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl }) {
  const def = providerInfo(provider);
  const base = (baseUrl || def.defaultBaseUrl).replace(/\/$/, '');
  const { messages, system } = encodeAnthropicMessages(provider, model, snapshot);
  const body = {
    model,
    messages,
    max_tokens: 8192,
    stream: true,
  };
  if (system) body.system = system;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }
  const res = await fetchWithTimeout(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
    body: JSON.stringify(body),
    signal,
  }, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${def.label} request failed (${res.status}): ${text.slice(0, 400)}`);
    err.status = res.status;
    err.code = res.status === 401 || res.status === 403 ? 'invalid_credential' : 'provider_error';
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result = { text: '', toolCalls: [], usage: null, finishReason: null };
  const toolUseBlocks = {};
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json.type === 'content_block_delta') {
        if (json.delta?.text) {
          result.text += json.delta.text;
          onChunk({ type: 'text', text: json.delta.text });
        }
        if (json.delta?.partial_json && json.index !== undefined) {
          toolUseBlocks[json.index] = (toolUseBlocks[json.index] || '') + json.delta.partial_json;
        }
      } else if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
        toolUseBlocks[json.index] = { id: json.content_block.id, name: json.content_block.name, arguments: '' };
      } else if (json.type === 'message_delta') {
        result.finishReason = json.delta?.stop_reason || null;
        if (json.usage) result.usage = json.usage;
      }
    }
  }
  for (const block of Object.values(toolUseBlocks)) {
    if (typeof block === 'string') continue;
    result.toolCalls.push({ id: block.id, name: block.name, arguments: block.arguments });
  }
  return result;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const signal = options.signal;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('provider_timeout')), timeoutMs || 120000);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function usageFromProvider(usage) {
  if (!usage) return null;
  return {
    prompt_tokens: usage.prompt_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
  };
}

export { VaultError };
