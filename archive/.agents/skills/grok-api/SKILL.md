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

## API: Native xai-sdk (gRPC)

a0p uses the **official `xai-sdk` Python library** (v1.12+, gRPC-based) via `AsyncClient`.
This gives built-in OpenTelemetry tracing, streaming, tool calling, and live search — all in one surface.

### Minimal call

```python
from xai_sdk import AsyncClient
from xai_sdk.chat import system, user
import os

client = AsyncClient(api_key=os.environ["XAI_API_KEY"])
chat = client.chat.create(
    model="grok-4-fast-reasoning",
    messages=[system("You are a helpful assistant."), user("Summarize PCNA in two sentences.")],
)
response = await chat.sample()
print(response.content)
```

xAI also exposes an OpenAI-compatible endpoint (`https://api.x.ai/v1`) for quick migration, but
the native SDK is preferred inside a0p for metrics and agentic features.

### Tool calling (matches a0p pattern)

Use `xai_sdk.chat.tool()` to declare tools and `tool_result()` to send results back. Wrap
schemas from `TOOL_SCHEMAS_CHAT` (nested `function` form) via the helper `_to_xai_tools()` in
`xai_provider.py`, or build them directly:

```python
from xai_sdk import AsyncClient
from xai_sdk.chat import system, user, tool as xai_tool, tool_result
import json

client = AsyncClient()
tools = [xai_tool("get_weather", "Return current weather.", {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]})]
chat = client.chat.create(model="grok-4-fast-reasoning", messages=[user("Weather in Paris?")], tools=tools)

response = await chat.sample()
if response.tool_calls:
    for tc in response.tool_calls:
        args = json.loads(tc.function.arguments)
        result = get_weather(args["city"])          # your function
        chat.append(response)                        # append assistant turn first
        chat.append(tool_result(result, tool_call_id=tc.id))
    final = await chat.sample()
    print(final.content)
```

Grok handles parallel tool calls — multiple `tool_calls` may arrive in one response. Process all before re-sampling.

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
from xai_sdk import AsyncClient
from xai_sdk.chat import user

client = AsyncClient()
chat = client.chat.create(model="grok-4-fast-reasoning", messages=[user("Explain PCNA.")])

async for response, chunk in chat.stream():
    if chunk.content:
        print(chunk.content, end="", flush=True)

# `response` after the loop holds the final accumulated response with full usage
print(f"\nTokens: {response.usage.prompt_tokens} in / {response.usage.completion_tokens} out")
```

## Reasoning Controls

`grok-4` and `grok-4-fast-reasoning` accept `reasoning_effort` via xai-sdk's `ReasoningEffort`:

```python
from xai_sdk import AsyncClient
from xai_sdk.chat import user
from xai_sdk.proto.v6 import chat_pb2

client = AsyncClient()
chat = client.chat.create(
    model="grok-4-fast-reasoning",
    messages=[user("Solve this step by step...")],
    reasoning_effort=chat_pb2.ReasoningEffort.EFFORT_LOW,   # EFFORT_LOW | EFFORT_MEDIUM | EFFORT_HIGH
)
response = await chat.sample()
```

Notes:
- Reasoning effort enum values: `chat_pb2.ReasoningEffort.EFFORT_LOW / EFFORT_MEDIUM / EFFORT_HIGH`.
- `grok-4` does NOT accept minimal effort (unlike GPT-5).
- `grok-4-fast-non-reasoning` ignores `reasoning_effort` entirely — use it when you don't want reasoning.
- Reasoning tokens are in `response.usage.reasoning_tokens`.

Map a0p `gate` to effort: `<0.6` → EFFORT_LOW, `0.6–1.0` → EFFORT_MEDIUM, `>1.0` → EFFORT_HIGH.

## Live Search (xAI's hosted web search)

Grok ships a hosted retrieval feature called Live Search. Enable via `SearchParameters`:

```python
from xai_sdk import AsyncClient
from xai_sdk.chat import user, SearchParameters

client = AsyncClient()
chat = client.chat.create(
    model="grok-4-fast-reasoning",
    messages=[user("What's happening with PCNA today?")],
    search_parameters=SearchParameters(
        mode="auto",               # "off" | "auto" | "on"
        return_citations=True,
        max_search_results=10,
    ),
)
response = await chat.sample()
print(response.content)
print("Citations:", list(response.citations))   # list of URLs
```

Use `sources=[web_source(), x_source(), news_source()]` from `xai_sdk.chat` to restrict which
sources are queried. Default: web + X.

Use Live Search when the provider is xAI — it replaces the custom `web_search` function and is
faster than the Tavily-backed fallback. Strip `web_search` from the tool list when Live Search is
enabled to avoid redundant calls.

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

- **Provider module:** `python/services/providers/xai_provider.py` — uses native `xai-sdk` `AsyncClient`. Do NOT revert to httpx or the OpenAI-compat endpoint; the SDK gives gRPC retries, OpenTelemetry tracing, and first-class tool support.
- **Tool schemas:** Build tools with `xai_tool(name, description, parameters)` from TOOL_SCHEMAS_CHAT. The `_to_xai_tools()` helper in `xai_provider.py` does this conversion. Never pass `TOOL_SCHEMAS_RESPONSES` (OpenAI flat form) to xai-sdk — it expects the `tool()` proto.
- **Web search:** when provider is xAI, use `SearchParameters(mode="auto")` in `client.chat.create()`. Cannot mix with function tools in the same call — xai_provider.py routes to the search path when `supports_live_search=True`.
- **Energy / cost tracking:** parse `response.usage` — fields are `prompt_tokens`, `completion_tokens`, `reasoning_tokens`, `total_tokens`. Write to `system_costs` via `storage.record_cost()`.
- **Tier gating:** `grok-4` should require `tier in ("ws","admin")`. `grok-4-fast-reasoning` is the supporter default. `grok-4-fast-non-reasoning` can be free-tier safe.
- **Image inputs (grok-2-vision):** pass via `xai_sdk.chat.image("https://...")` inside the `user()` message.
- **Rate limits / retries:** xai-sdk auto-retries on `UNAVAILABLE` gRPC status with exponential backoff (5 attempts). Do not add a second retry layer.

## Common Pitfalls

- **Passing raw dicts to `tools=`** → xai-sdk expects `chat_pb2.Tool` proto objects; use `xai_tool(name, description, params)`. Raw dicts will fail at the gRPC layer.
- **Appending `tool_result` before `chat.append(response)`** → the assistant's tool-call turn must be in history before its results; the order matters.
- **Setting `reasoning_effort` on `grok-4-fast-non-reasoning`** → silently ignored. Use the `-reasoning` variant when effort control is needed.
- **Leaving `web_search` function tool active alongside `SearchParameters`** → model may double-fetch and burn budget. Strip `web_search` from the tool list when search parameters are set.
- **Hardcoding `XAI_API_KEY`** → always read from `os.environ`. Replit secret is already set.
- **Creating `AsyncClient` inside a sync function** → xai-sdk gRPC transport is async; always `await` in an `async def`. Use `Client` (blocking) only for scripts or sync test code.
- **Expecting OpenAI `response_format=json_object`** → use `response_format=chat_pb2.ResponseFormat(format_type=chat_pb2.FORMAT_TYPE_JSON_OBJECT)` for raw JSON mode; for schema-constrained JSON use `format_type=chat_pb2.FORMAT_TYPE_JSON_SCHEMA`. `ResponseFormat` has no `.type` field and no `JSON_OBJECT` class attribute — those do not exist on the proto message.

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
