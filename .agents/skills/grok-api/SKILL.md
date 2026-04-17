---
name: grok-api
description: Use xAI Grok models (grok-4, grok-4-fast, grok-code-fast-1, grok-2-vision) via the OpenAI-compatible Chat Completions endpoint at api.x.ai. Activate when the user mentions Grok, xAI, XAI_API_KEY, grok-4, grok-code-fast, or when wiring Grok calls into the a0p stack (python/services/providers/xai_provider.py, energy-provider routing, tool_executor.py). Covers model selection, OpenAI-SDK compatibility, tool calling, streaming, structured outputs, reasoning, live search, pricing/context cheatsheet, and a0p-specific integration.
---

# Grok (xAI) API

## When to Use

- The user explicitly mentions Grok, xAI, x.ai, `XAI_API_KEY`, grok-4, grok-code-fast, or grok-2-vision.
- Wiring or debugging xAI calls inside `python/services/providers/xai_provider.py` or any a0p energy provider routing.
- Choosing between Grok variants (reasoning vs. speed vs. coding vs. vision).
- Switching from OpenAI to xAI as the provider for a ZFAE agent.
- Enabling Grok's Live Search (xAI-hosted web/X.com retrieval).

If the user mentions GPT-5, OpenAI, or Responses API, load `gpt-5-api` skill instead.

## Model Selection

| Model | Best for | Context | Notes |
|---|---|---|---|
| `grok-4` | Hard reasoning, agentic loops, math, science | 256K | Top quality; use when correctness > cost. |
| `grok-4-fast` | Default chat, tool-heavy agents, summarization | 2M | Long context; usually the right default. Reasoning + non-reasoning variants. |
| `grok-4-fast-reasoning` | Multi-step tool use with explicit reasoning | 2M | Faster than grok-4, surfaces reasoning tokens. |
| `grok-4-fast-non-reasoning` | High-throughput chat, no reasoning needed | 2M | Cheapest fast variant. |
| `grok-code-fast-1` | Code generation, refactors, code review | 256K | Specialized; cheaper than grok-4 for code. |
| `grok-2-vision-1212` | Image understanding, OCR, chart reading | 32K | Only vision-capable Grok currently. |

**a0p default policy:** keep `grok-4-fast-reasoning` as the working model, escalate to `grok-4` for sub-agent merges and PCNA-critical decisions, route to `grok-code-fast-1` when the prompt is clearly code (heuristic: contains a fenced block or filename).

## API: OpenAI-Compatible Chat Completions

xAI exposes an OpenAI-compatible endpoint at `https://api.x.ai/v1`. You can use the official `openai` Python SDK by overriding `base_url`. This is what a0p does in `xai_provider.py`.

### Minimal call

```python
from openai import AsyncOpenAI
import os

client = AsyncOpenAI(
    api_key=os.environ["XAI_API_KEY"],
    base_url="https://api.x.ai/v1",
)

resp = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=[{"role": "user", "content": "Summarize PCNA in two sentences."}],
)
print(resp.choices[0].message.content)
```

### Tool calling (matches a0p pattern)

Grok uses the **Chat Completions** tool schema (nested `function`), NOT the Responses flat form. Use `TOOL_SCHEMAS_CHAT` from `python/services/tool_executor.py` directly.

```python
resp = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=conversation_messages,
    tools=TOOL_SCHEMAS_CHAT,           # nested {"type":"function","function":{...}}
    tool_choice="auto",
)

msg = resp.choices[0].message
if msg.tool_calls:
    for call in msg.tool_calls:
        args = json.loads(call.function.arguments)
        result = await execute_tool(call.function.name, args)
        conversation_messages.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result,
        })
    # then re-send for the model's final answer
```

Grok handles parallel tool calls — multiple `tool_calls` may come back in one response. Process them all before re-calling the model.

### Structured outputs (JSON schema)

xAI supports OpenAI-style `response_format` on grok-4 and grok-4-fast:

```python
resp = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=[{"role": "user", "content": prompt}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "edcm_score",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "coherence": {"type": "number"},
                    "drift": {"type": "number"},
                    "notes": {"type": "string"},
                },
                "required": ["coherence", "drift", "notes"],
                "additionalProperties": False,
            },
        },
    },
)
data = json.loads(resp.choices[0].message.content)
```

### Streaming

```python
stream = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=conversation_messages,
    stream=True,
    stream_options={"include_usage": True},
)
async for chunk in stream:
    if chunk.choices and chunk.choices[0].delta.content:
        yield chunk.choices[0].delta.content
    if chunk.usage:
        # final chunk carries usage when include_usage=True
        record_cost(chunk.usage)
```

## Reasoning Controls

`grok-4` and `grok-4-fast-reasoning` accept `reasoning_effort`:

```python
resp = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=...,
    reasoning_effort="low",   # "low" | "medium" | "high"
)
```

Notes:
- `grok-4` does NOT accept `reasoning_effort=minimal` (unlike GPT-5).
- `grok-4-fast-non-reasoning` ignores `reasoning_effort` entirely — use it when you don't want reasoning at all.
- Reasoning tokens are exposed in `resp.usage.completion_tokens_details.reasoning_tokens`.

Map a0p `gate` to effort the same as GPT-5: `<0.6` → low, `0.6–1.0` → medium, `>1.0` → high.

## Live Search (xAI's hosted web search)

Grok ships a hosted retrieval feature called Live Search. Enable per-request:

```python
resp = await client.chat.completions.create(
    model="grok-4-fast-reasoning",
    messages=...,
    extra_body={
        "search_parameters": {
            "mode": "auto",           # "off" | "auto" | "on"
            "sources": [
                {"type": "web"},
                {"type": "x"},        # X.com/Twitter
                {"type": "news"},
            ],
            "max_search_results": 10,
            "return_citations": True,
        }
    },
)
citations = resp.citations  # list of URLs
```

Use Live Search when the provider is xAI — it replaces the custom `web_search` function and is faster than the Tavily-backed fallback. Strip `web_search` from the tool list when Live Search is enabled to avoid redundant calls.

## Pricing Cheatsheet (as of Apr 2026)

Confirm at https://docs.x.ai/docs/models — these change.

| Model | Input $/1M | Cached input $/1M | Output $/1M |
|---|---|---|---|
| grok-4 | $3.00 | $0.75 | $15.00 |
| grok-4-fast (reasoning) | $0.20 | $0.05 | $0.50 |
| grok-4-fast (non-reasoning) | $0.20 | $0.05 | $0.50 |
| grok-code-fast-1 | $0.20 | $0.02 | $1.50 |
| grok-2-vision-1212 | $2.00 | — | $10.00 |

Live Search adds **$0.025 per source returned** (billed separately from tokens).

## a0p Integration Notes

- **Provider module:** `python/services/providers/xai_provider.py` — uses `AsyncOpenAI(base_url="https://api.x.ai/v1")`. Do NOT swap to a custom HTTP client; the SDK handles retries, streaming, and tool-call parsing.
- **Tool schemas:** Grok uses `TOOL_SCHEMAS_CHAT` (nested form). Never pass `TOOL_SCHEMAS_RESPONSES` to xAI — it'll 400.
- **Web search:** when provider is xAI, prefer Live Search via `extra_body.search_parameters` over the custom `web_search` function. The custom function still works as a fallback.
- **Energy / cost tracking:** parse `resp.usage` (Chat Completions shape) — `prompt_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens`, `prompt_tokens_details.cached_tokens`. Write to `system_costs` via `storage.record_cost()`.
- **Tier gating:** `grok-4` should require `tier in ("ws","admin")`. `grok-4-fast-reasoning` is the supporter default. `grok-4-fast-non-reasoning` can be free-tier safe.
- **Image inputs (grok-2-vision):** pass as `{"type":"image_url","image_url":{"url": "data:image/png;base64,..."}}` inside the user message content array.
- **Rate limits:** xAI is stricter than OpenAI on burst. The SDK auto-retries on 429 with backoff — don't add a second retry layer.

## Common Pitfalls

- **Sending Responses-API schemas to xAI** → 400 "unknown parameter". Use Chat Completions form.
- **Setting `reasoning_effort` on `grok-4-fast-non-reasoning`** → silently ignored, no error. If you want reasoning, pick the `-reasoning` variant.
- **Leaving `web_search` tool active alongside Live Search** → model may double-fetch and burn budget. Strip one.
- **Forgetting `stream_options={"include_usage": True}`** when streaming → no usage data, can't bill accurately.
- **Hardcoding `XAI_API_KEY`** → always read from `os.environ`. Replit secret is already set.
- **Treating xAI as fully OpenAI-compatible** → it's ~95%. Notable gaps: no `response_format=json_object` (must use `json_schema`), no `logprobs`, no native `web_search_preview` (use Live Search instead), no `previous_response_id`.

## Quick Decision Tree

```
Need code edits?         ──► grok-code-fast-1
Need vision?             ──► grok-2-vision-1212
Need 1M+ token context?  ──► grok-4-fast (either variant)
Need top reasoning?      ──► grok-4 + reasoning_effort=high
Need fast tool loops?    ──► grok-4-fast-reasoning + effort=low
Need cheap chat?         ──► grok-4-fast-non-reasoning
Need web facts?          ──► add search_parameters.mode=auto
```

## References

- xAI API docs: https://docs.x.ai/docs/api-reference
- Grok models: https://docs.x.ai/docs/models
- Live Search: https://docs.x.ai/docs/guides/live-search
- a0p xAI provider: `python/services/providers/xai_provider.py`
- a0p tool schemas: `python/services/tool_executor.py` (TOOL_SCHEMAS_CHAT, lines 11–242)
