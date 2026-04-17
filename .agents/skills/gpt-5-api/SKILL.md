---
name: gpt-5-api
description: Use OpenAI GPT-5.x models (gpt-5, gpt-5-mini, gpt-5-nano) via the Responses API or Chat Completions. Activate when the user mentions GPT-5, OpenAI, "responses API", reasoning_effort, web_search_preview, structured outputs against an OpenAI model, or when wiring GPT-5 calls into the a0p stack (python/services/tool_executor.py, energy-provider routing). Covers model selection, tool calling, streaming, structured outputs, reasoning controls, pricing/context cheatsheet, and a0p-specific integration patterns.
---

# GPT-5.x API

## When to Use

- The user explicitly mentions GPT-5, gpt-5-mini, gpt-5-nano, OpenAI, the Responses API, or reasoning_effort.
- Wiring or debugging OpenAI calls inside `python/services/inference.py`, `tool_executor.py`, or any a0p energy provider module.
- Choosing between gpt-5 variants for a task (cost vs. quality vs. latency).
- Migrating from Chat Completions to Responses API, or adding native `web_search_preview` / file_search.
- Implementing structured outputs (JSON schema), tool calling, or streaming against GPT-5.

If the user only mentions "AI", "the model", or "the agent" without naming OpenAI/GPT-5, do NOT load this skill — they may be working on the Grok provider instead. See `grok-api` skill.

## Model Selection

| Model | Best for | Context | Notes |
|---|---|---|---|
| `gpt-5` | Hard reasoning, agentic tool loops, code, long-context synthesis | 400K in / 128K out | Highest quality; use when correctness matters more than cost. |
| `gpt-5-mini` | Default chat, summarization, light reasoning, most tool calls | 400K in / 128K out | ~5x cheaper than gpt-5; usually the right default in a0p. |
| `gpt-5-nano` | Classification, routing, extraction, embeddings-adjacent tasks | 400K in / 128K out | Cheapest; use for sub-second decisions and pre-filters. |
| `gpt-5-chat-latest` | Non-reasoning chat (ChatGPT-style) | 400K in / 128K out | Use when you do NOT want reasoning tokens. |

**a0p default policy:** `python/config/openai_policy.json` — keep `gpt-5-mini` as the working model, escalate to `gpt-5` for sub-agent merges and PCNA-critical decisions, drop to `gpt-5-nano` for tool-routing and bandit pulls.

## API: Responses (preferred for GPT-5)

The Responses API is OpenAI's stateful, tool-aware successor to Chat Completions. GPT-5 reasoning tokens, native `web_search_preview`, and `file_search` only work cleanly via Responses.

### Minimal call

```python
from openai import AsyncOpenAI
client = AsyncOpenAI()  # uses OPENAI_API_KEY

resp = await client.responses.create(
    model="gpt-5-mini",
    input="Summarize the PCNA blueprint in two sentences.",
    reasoning={"effort": "medium"},   # "minimal" | "low" | "medium" | "high"
    text={"verbosity": "low"},         # "low" | "medium" | "high"
)
print(resp.output_text)
```

### Tool calling (matches a0p pattern)

```python
resp = await client.responses.create(
    model="gpt-5-mini",
    input=conversation_messages,       # list of {"role","content"} dicts
    tools=TOOL_SCHEMAS_RESPONSES,      # from python/services/tool_executor.py
    tool_choice="auto",
    reasoning={"effort": "low"},
)

for item in resp.output:
    if item.type == "function_call":
        result = await execute_tool(item.name, json.loads(item.arguments))
        # feed result back via input on the next call with previous_response_id
```

`TOOL_SCHEMAS_RESPONSES` already exists in `python/services/tool_executor.py` and includes the native `web_search_preview` plus the 11 ZFAE function tools (web_search excluded — handled natively).

### Continuing a tool loop

Use `previous_response_id` instead of resending the whole history. This is the OpenAI-managed equivalent of conversation state:

```python
resp2 = await client.responses.create(
    model="gpt-5-mini",
    previous_response_id=resp.id,
    input=[{
        "type": "function_call_output",
        "call_id": item.call_id,
        "output": result,
    }],
)
```

### Structured outputs (JSON schema)

```python
resp = await client.responses.create(
    model="gpt-5-mini",
    input=prompt,
    text={
        "format": {
            "type": "json_schema",
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
        }
    },
)
import json
data = json.loads(resp.output_text)
```

### Streaming

```python
async with client.responses.stream(
    model="gpt-5-mini",
    input=prompt,
    reasoning={"effort": "low"},
) as stream:
    async for event in stream:
        if event.type == "response.output_text.delta":
            yield event.delta   # forward to SSE / WebSocket
    final = await stream.get_final_response()
```

In a0p, the streaming endpoint lives in `python/routes/conversations.py::stream_message`. Forward `output_text.delta` events as SSE and emit a final `done` event with token usage from `final.usage`.

## reasoning_effort Guidance

| effort | Use when | Latency | Cost |
|---|---|---|---|
| `minimal` | Tool-routing, classification, sub-second UX | <500ms | lowest |
| `low` | Default chat, simple Q&A, single-step tools | ~1–3s | low |
| `medium` | Multi-step tool loops, code edits, summarization | ~3–10s | medium |
| `high` | Architectural decisions, sub-agent merges, debugging | ~10–60s | highest |

Map effort to a0p's `gate` parameter: `gate < 0.5` → minimal, `0.5–0.8` → low, `0.8–1.1` → medium, `>1.1` → high.

## Pricing Cheatsheet (as of Apr 2026)

Always confirm at https://openai.com/api/pricing — these change.

| Model | Input $/1M | Cached input $/1M | Output $/1M |
|---|---|---|---|
| gpt-5 | $1.25 | $0.125 | $10.00 |
| gpt-5-mini | $0.25 | $0.025 | $2.00 |
| gpt-5-nano | $0.05 | $0.005 | $0.40 |

Reasoning tokens count as output. A `high` effort call on gpt-5 can easily emit 5–20K reasoning tokens — budget accordingly.

## Native Tools

These are OpenAI-hosted (no execute_tool dispatch needed):

- `{"type": "web_search_preview"}` — already enabled in a0p `OPENAI_NATIVE_TOOLS`. Replaces the custom `web_search` function for OpenAI provider.
- `{"type": "file_search", "vector_store_ids": [...]}` — for RAG against uploaded files. Not yet wired in a0p.
- `{"type": "code_interpreter", "container": {"type": "auto"}}` — sandboxed Python execution. Not wired.
- `{"type": "image_generation"}` — gpt-image-1 inline. Not wired.

To add one, append to `OPENAI_NATIVE_TOOLS` in `python/services/tool_executor.py`. No dispatch code needed.

## a0p Integration Notes

- **Provider switching:** GPT-5 calls go through `python/services/providers/openai_provider.py`. The provider returns coherence + token deltas to the PCNA engine — preserve that contract.
- **Tool schemas:** GPT-5 (Responses) uses a flat schema `{"type":"function","name":...,"parameters":...}`. Chat Completions uses nested `{"type":"function","function":{"name":...,"parameters":...}}`. Both forms exist in `tool_executor.py` — pick the matching one.
- **Energy / cost tracking:** parse `resp.usage` and write to `system_costs` via `storage.record_cost()`. GPT-5 reports `input_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens`, and `input_tokens_details.cached_tokens` separately — track all four for accurate billing.
- **Tier gating:** `gpt-5` (full) should require `tier in ("ws","admin")`. `gpt-5-mini` is the supporter default. `gpt-5-nano` can be free-tier safe.
- **Web search for OpenAI:** never dispatch the custom `web_search` function — strip it from the tool list when provider is OpenAI (already handled in `TOOL_SCHEMAS_RESPONSES_ZFAE`).

## Common Pitfalls

- **Sending Chat Completions schemas to Responses API** → 400 error "unknown parameter `function`". Use the flat form.
- **Forgetting `previous_response_id`** in a tool loop → the model loses context and may re-call tools. Always thread it.
- **Mixing `temperature` with reasoning models** → ignored. GPT-5 uses `reasoning.effort`, not temperature.
- **Streaming + tool calls** → tool calls arrive in `response.output_item.added` events, not in text deltas. Buffer them separately.
- **Treating reasoning tokens as free** → they're billed at output rate and can dominate cost on `high` effort.
- **Hardcoding model names** → use `python/config/openai_policy.json` so policy can shift models without redeploys.

## Quick Decision Tree

```
Need tools + multi-step? ──► Responses API + reasoning.effort=low/medium
Need JSON only?          ──► Responses API + text.format=json_schema, effort=minimal
Need web search?         ──► Add web_search_preview, drop custom web_search
Sub-second routing?      ──► gpt-5-nano + effort=minimal, no tools
Sub-agent merge / hard?  ──► gpt-5 + effort=high
Plain chat, no tools?    ──► gpt-5-chat-latest (no reasoning overhead)
```

## References

- OpenAI Responses API: https://platform.openai.com/docs/api-reference/responses
- GPT-5 model card: https://platform.openai.com/docs/models/gpt-5
- a0p OpenAI provider: `python/services/providers/openai_provider.py`
- a0p tool schemas: `python/services/tool_executor.py` (lines 11–262)
- a0p policy: `python/config/openai_policy.json`
