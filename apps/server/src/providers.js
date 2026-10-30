// Provider adapters: OpenAI (Responses), Anthropic, xAI, DeepSeek.
// Keys are resolved server-side from the vault; they never reach the client.
import { VaultError } from './vault.js';

// FR0: current OpenAI catalogue (official model docs checked 2026-10-30).
// Model-specific capabilities replace the old provider-wide 128k assumption.
export const OPENAI_MODELS = {
  'gpt-6-luna': {
    label: 'GPT-6 Luna',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    images: true,
    tools: true,
    reasoning: true,
    reasoningEffort: ['none', 'low', 'medium', 'high'],
    notes: 'Inexpensive seed model; Responses transport; reasoning-with-tools requires the Responses API.',
  },
  'gpt-6.1-sol': {
    label: 'GPT-6.1 Sol',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    images: true,
    tools: true,
    reasoning: true,
    reasoningEffort: ['low', 'medium', 'high'], // rejects "none"
    notes: 'Requires Responses for tool calling; reasoning.effort cannot be "none".',
  },
  'gpt-6.1-terra': {
    label: 'GPT-6.1 Terra',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    images: true,
    tools: true,
    reasoning: true,
    reasoningEffort: ['none', 'low', 'medium', 'high'],
    notes: 'Responses transport; supports reasoning.effort "none".',
  },
  'gpt-6-astra': {
    label: 'GPT-6 Astra',
    contextWindow: 400000,
    maxOutputTokens: 128000,
    images: true,
    tools: true,
    reasoning: true,
    reasoningEffort: ['low', 'medium', 'high'], // rejects "none"
    notes: 'Requires Responses for tool calling; reasoning.effort cannot be "none".',
  },
};

export const PROVIDER_DEFS = {
  openai: {
    label: 'OpenAI',
    kind: 'openai-responses',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-6-luna',
    models: OPENAI_MODELS,
    secretPath: 'provider/openai',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    defaultCapabilities: { streaming: true, images: true, tools: true, maxContextTokens: 400000 },
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

export function modelInfo(provider, model) {
  const def = providerInfo(provider);
  if (def.models?.[model]) return def.models[model];
  // Non-OpenAI providers: single default model, capabilities provider-wide.
  return null;
}

export function capabilitiesForModel(provider, model) {
  const info = modelInfo(provider, model);
  const base = defaultCapabilitiesFor(provider);
  if (!info) return base;
  return {
    streaming: true,
    images: info.images,
    tools: info.tools,
    maxContextTokens: info.contextWindow,
    reasoning: info.reasoning,
    reasoningEffort: info.reasoningEffort || [],
  };
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
export function encodeSnapshotForProvider(provider, model, snapshot) {
  const def = providerInfo(provider);
  if (def.kind === 'anthropic') {
    return encodeAnthropicMessages(provider, model, snapshot);
  }
  if (def.kind === 'openai-responses') {
    return encodeResponsesInput(provider, model, snapshot);
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

// FR0: Responses input encoding. System text travels in `instructions`;
// history items keep typed text/image content; prior function calls and their
// outputs are replayed from the stored output items (never from history text).
export function encodeResponsesInput(provider, model, snapshot, continuation = []) {
  const input = [];
  for (const msg of snapshot.messages || []) {
    if (msg.role === 'system') continue;
    const content = [];
    if (msg.content) content.push({ type: 'input_text', text: msg.content });
    for (const att of msg.attachments || []) {
      if (att.mime?.startsWith('image/')) {
        content.push({
          type: 'input_image',
          image_url: `data:${att.mime};base64,${att.data}`,
        });
      }
    }
    input.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: content.length ? content : msg.content || '',
    });
  }
  for (const item of continuation) {
    input.push(item);
  }
  return { instructions: snapshot.system || undefined, input };
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

export async function streamProvider({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl, settings = {} }) {
  const def = providerInfo(provider);
  if (def.kind === 'anthropic') {
    return streamAnthropic({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl });
  }
  if (def.kind === 'openai-responses') {
    return streamOpenAIResponses({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl, settings });
  }
  return streamOpenAICompatible({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl });
}

// FR0: OpenAI Responses streaming with complete output-item accumulation,
// call_id correlation, honest incomplete/failed outcomes, and abort/timeout
// propagation through the whole body stream.
async function streamOpenAIResponses({ provider, model, apiKey, snapshot, tools, signal, onChunk, timeoutMs, baseUrl, settings }) {
  const def = providerInfo(provider);
  const base = (baseUrl || def.defaultBaseUrl).replace(/\/$/, '');
  const { instructions, input } = encodeResponsesInput(provider, model, snapshot, settings.continuation || []);
  const info = modelInfo(provider, model) || {};
  const body = {
    model,
    input,
    store: false,
    stream: true,
    max_output_tokens: settings.maxOutputTokens || Math.min(info.maxOutputTokens || 4096, 4096),
  };
  if (instructions) body.instructions = instructions;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
      strict: true,
    }));
    body.tool_choice = 'auto';
  }
  const effort = settings.reasoningEffort;
  if (effort) {
    if (!info.reasoning) {
      const err = new Error(`Model ${model} does not support reasoning.effort.`);
      err.status = 400;
      err.code = 'invalid_parameter';
      throw err;
    }
    if (!(info.reasoningEffort || []).includes(effort)) {
      const err = new Error(`Model ${model} does not allow reasoning.effort="${effort}". Allowed: ${(info.reasoningEffort || []).join(', ')}.`);
      err.status = 400;
      err.code = 'invalid_parameter';
      throw err;
    }
    body.reasoning = { effort, summary: 'auto' };
  }
  if (settings.promptCacheKey) {
    body.prompt_cache_options = { cache_breakpoint_token: settings.promptCacheKey };
  }

  const res = await fetchWithTimeout(`${base}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...def.authHeader(apiKey) },
    body: JSON.stringify(body),
    signal,
  }, timeoutMs);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`${def.label} Responses request failed (${res.status}): ${text.slice(0, 400)}`);
    err.status = res.status;
    err.code = res.status === 401 || res.status === 403 ? 'invalid_credential'
      : res.status === 429 ? 'rate_limited'
      : res.status === 400 ? 'invalid_parameter'
      : 'provider_error';
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const result = { text: '', toolCalls: [], usage: null, finishReason: null, outputItems: [], incompleteReason: null };
  const functionCalls = new Map(); // item_id -> {id, name, arguments}

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
      if (!data || data === '[DONE]') continue;
      let json;
      try { json = JSON.parse(data); } catch { continue; }
      const type = json.type;

      if (type === 'response.output_text.delta') {
        const text = json.delta || '';
        result.text += text;
        onChunk({ type: 'text', text });
      } else if (type === 'response.output_item.done') {
        const item = json.item || {};
        result.outputItems.push(item);
        if (item.type === 'function_call') {
          functionCalls.set(item.id, { id: item.call_id || item.id, name: item.name, arguments: item.arguments || '' });
        }
      } else if (type === 'response.function_call_arguments.delta') {
        const entry = functionCalls.get(json.item_id);
        if (entry) entry.arguments += json.delta || '';
      } else if (type === 'response.completed') {
        const resp = json.response || {};
        if (resp.usage) result.usage = resp.usage;
        if (resp.status === 'completed') result.finishReason = 'stop';
        else result.finishReason = resp.status || 'stop';
        for (const item of resp.output || []) {
          if (item.type === 'function_call') {
            const existing = functionCalls.get(item.id);
            if (existing) { existing.id = item.call_id || item.id; existing.name = item.name; existing.arguments = item.arguments || existing.arguments; }
            else functionCalls.set(item.id, { id: item.call_id || item.id, name: item.name, arguments: item.arguments || '' });
          }
        }
      } else if (type === 'response.failed') {
        result.finishReason = 'failed';
        result.incompleteReason = json.response?.error?.message || 'provider failure';
      } else if (type === 'response.incomplete') {
        result.finishReason = 'incomplete';
        result.incompleteReason = json.response?.incomplete_details?.reason || 'incomplete';
      } else if (type === 'error') {
        result.finishReason = 'failed';
        result.incompleteReason = json.error?.message || json.message || 'stream error';
      }
    }
  }

  result.toolCalls = [...functionCalls.values()].map((tc) => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
    name: tc.name,
    arguments: tc.arguments,
  }));
  // EOF/HTTP 200 without a terminal response.completed event is NOT success.
  if (!result.finishReason) {
    result.finishReason = 'incomplete';
    result.incompleteReason = 'eof_without_completion';
  }
  return result;
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
      try { json = JSON.parse(data); } catch { continue; }
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
      try { json = JSON.parse(data); } catch { continue; }
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

// Keeps the abort listener and timeout alive until the response body is fully
// consumed (FR0: no success-by-headers; Stop must reach later tool rounds).
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
    const res = await fetch(url, { ...options, signal: controller.signal });
    // Keep the timer/alarm alive for the whole body read.
    const originalBody = res.body;
    const keepAlive = {
      getReader: () => originalBody.getReader(),
      cancel: (reason) => originalBody.cancel(reason),
    };
    Object.defineProperty(res, 'body', { value: keepAlive });
    // Clear timer only when the body stream ends or errors.
    const release = () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); };
    const cleanupReader = (reader) => {
      const origRead = reader.read.bind(reader);
      reader.read = async () => {
        try { return await origRead(); } finally { release(); }
      };
      return reader;
    };
    const origGetReader = keepAlive.getReader.bind(keepAlive);
    keepAlive.getReader = () => cleanupReader(origGetReader());
    return res;
  } catch (err) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    throw err;
  }
}

// FR0: usage normalization for both Chat Completions and Responses shapes.
export function usageFromProvider(usage) {
  if (!usage) return null;
  return {
    prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
    completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    cache_read_tokens: usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? null,
    cache_write_tokens: usage.prompt_cache_miss_tokens ?? usage.input_tokens_details?.cache_creation_tokens ?? null,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? null,
    raw: usage,
  };
}

export { VaultError };
