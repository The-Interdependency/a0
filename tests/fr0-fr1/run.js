#!/usr/bin/env node
// FR0 offline fixture tests (RO02) against the real OpenAI Responses adapter.
// Runs a local fake Responses SSE server; no live provider request is made.
import http from 'node:http';
import {
  encodeResponsesInput,
  usageFromProvider,
  capabilitiesForModel,
  streamProvider,
} from '../../apps/server/src/providers.js';

const PORT = 9321;
let failures = 0;
function check(name, ok, detail = '') {
  console.log(ok ? `[PASS] ${name}` : `[FAIL] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const model = parsed.model || '';
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    if (model === 'incomplete') {
      send({ type: 'response.output_text.delta', delta: 'partial' });
      send({ type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (model === 'fail') {
      send({ type: 'response.failed', response: { status: 'failed', error: { message: 'model rejected request' } } });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (model === 'eof') {
      send({ type: 'response.output_text.delta', delta: 'truncated' });
      // No completion event: EOF with HTTP 200 must not be treated as success.
      res.end();
      return;
    }
    if (Array.isArray(parsed.tools) && parsed.tools.length) {
      send({ type: 'response.output_text.delta', delta: 'thinking' });
      send({
        type: 'response.output_item.done',
        item: { type: 'function_call', id: 'fc_1', call_id: 'call_abc', name: parsed.tools[0].name, arguments: '{"x":' },
      });
      send({ type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '1}' });
      send({
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_abc', name: parsed.tools[0].name, arguments: '{"x":1}' }],
          usage: {
            input_tokens: 100,
            output_tokens: 10,
            total_tokens: 110,
            input_tokens_details: { cached_tokens: 40 },
            output_tokens_details: { reasoning_tokens: 2 },
          },
        },
      });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    if (model === 'stall') {
      send({ type: 'response.output_text.delta', delta: 'partial-then-stall' });
      // Hold the connection open: Stop must interrupt the body read.
      return;
    }
    if (model === 'image') {
      send({ type: 'response.output_text.delta', delta: 'ok' });
      send({
        type: 'response.completed',
        response: { status: 'completed', output: [], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } },
      });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    send({ type: 'response.output_text.delta', delta: 'ok' });
    send({ type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } });
    res.write('data: [DONE]\n\n');
    res.end();
  });
});

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

// -- input encoding -----------------------------------------------------
{
  const snapshot = {
    system: 'A0 harness instructions',
    messages: [
      { role: 'user', content: 'look', attachments: [{ mime: 'image/png', data: 'QUJD' }] },
      { role: 'assistant', content: 'seen', attachments: [] },
    ],
  };
  const { instructions, input } = encodeResponsesInput('openai', 'gpt-6-luna', snapshot);
  check('RO02 text+image input preserved as typed content', Array.isArray(input) && input.length === 2 && input[0].content.some((c) => c.type === 'input_image' && c.image_url === 'data:image/png;base64,QUJD') && input[0].content.some((c) => c.type === 'input_text' && c.text === 'look'));
  check('RO02 system travels in instructions', instructions === 'A0 harness instructions');
}

// -- tool stream: complete call_id correlation ---------------------------
{
  let text = '';
  const result = await streamProvider({
    provider: 'openai', model: 'gpt-6-luna', apiKey: 'test-key',
    snapshot: { system: 'sys', messages: [{ role: 'user', content: 'go', attachments: [] }] },
    tools: [{ type: 'function', function: { name: 'echo__tool', description: 't', parameters: { type: 'object', properties: { x: { type: 'string' } } } } }],
    signal: new AbortController().signal,
    onChunk: ({ text: t }) => { text += t; },
    timeoutMs: 5000,
    baseUrl: BASE,
  });
  check('RO02 fragmented function arguments accumulated', result.toolCalls[0]?.arguments === '{"x":1}', JSON.stringify(result.toolCalls));
  check('RO02 call_id correlated', result.toolCalls[0]?.id === 'call_abc');
  check('RO02 all output parts accumulated', result.text === 'thinking');
  check('RO02 usage normalized from Responses shape', (() => {
    const u = usageFromProvider(result.usage);
    return u.total_tokens === 110 && u.cache_read_tokens === 40 && u.reasoning_tokens === 2;
  })(), JSON.stringify(result.usage));
  check('RO02 output items kept for replay', Array.isArray(result.outputItems) && result.outputItems.some((i) => i.type === 'function_call'));
}

// -- incomplete / failed / EOF outcomes ----------------------------------
{
  const incomplete = await streamProvider({
    provider: 'openai', model: 'incomplete', apiKey: 'k',
    snapshot: { system: '', messages: [{ role: 'user', content: 'x', attachments: [] }] },
    tools: [], signal: new AbortController().signal, onChunk: () => {}, timeoutMs: 5000, baseUrl: BASE,
  });
  check('RO02 incomplete response is not success', incomplete.finishReason === 'incomplete' && incomplete.incompleteReason === 'max_output_tokens');

  const failed = await streamProvider({
    provider: 'openai', model: 'fail', apiKey: 'k',
    snapshot: { system: '', messages: [{ role: 'user', content: 'x', attachments: [] }] },
    tools: [], signal: new AbortController().signal, onChunk: () => {}, timeoutMs: 5000, baseUrl: BASE,
  });
  check('RO02 failed response distinguished', failed.finishReason === 'failed');

  const eof = await streamProvider({
    provider: 'openai', model: 'eof', apiKey: 'k',
    snapshot: { system: '', messages: [{ role: 'user', content: 'x', attachments: [] }] },
    tools: [], signal: new AbortController().signal, onChunk: () => {}, timeoutMs: 5000, baseUrl: BASE,
  });
  check('RO02 EOF with HTTP 200 is not success', eof.finishReason !== 'stop', JSON.stringify(eof.finishReason));
}

// -- stop propagation through body stream --------------------------------
{
  const controller = new AbortController();
  const p = streamProvider({
    provider: 'openai', model: 'stall', apiKey: 'k',
    snapshot: { system: '', messages: [{ role: 'user', content: 'x', attachments: [] }] },
    tools: [], signal: controller.signal, onChunk: () => {}, timeoutMs: 5000, baseUrl: BASE,
  });
  setTimeout(() => controller.abort(), 50);
  let aborted = false;
  try { await p; } catch (err) { aborted = err !== null; } // Node surfaces AbortError as TypeError: fetch failed with AbortError cause
  check('RO02 Stop during stream aborts the read', aborted === true);
}

// -- parameter validation ------------------------------------------------
{
  check('RO02 reasoning.effort none rejected for Sol', (() => {
    const caps = capabilitiesForModel('openai', 'gpt-6.1-sol');
    return caps.reasoningEffort.includes('none') === false;
  })());
  let rejected = false;
  try {
    await streamProvider({
      provider: 'openai', model: 'gpt-6.1-sol', apiKey: 'k',
      snapshot: { system: '', messages: [{ role: 'user', content: 'x', attachments: [] }] },
      tools: [], signal: new AbortController().signal, onChunk: () => {}, timeoutMs: 5000, baseUrl: BASE,
      settings: { reasoningEffort: 'none' },
    });
  } catch (err) { rejected = err.code === 'invalid_parameter'; }
  check('RO02 incompatible choices rejected visibly', rejected === true);
}

// -- usage normalization for both shapes ---------------------------------
{
  const chat = usageFromProvider({ prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 });
  check('RO03 chat usage normalized', chat.prompt_tokens === 5 && chat.cache_read_tokens === null);
  const resp = usageFromProvider({ input_tokens: 7, output_tokens: 8, total_tokens: 15, input_tokens_details: { cached_tokens: 2 }, output_tokens_details: { reasoning_tokens: 3 } });
  check('RO03 Responses usage normalized incl. cache/reasoning', resp.prompt_tokens === 7 && resp.completion_tokens === 8 && resp.cache_read_tokens === 2 && resp.reasoning_tokens === 3);
}

server.close();
if (failures) {
  console.log(`FR0 fixture suite: ${failures} failures`);
  process.exit(1);
}
console.log('FR0 fixture suite: all checks passed (no live provider request made).');
