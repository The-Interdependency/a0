---
name: anthropic-api
description: Use Anthropic Claude models (claude-sonnet-4.5, claude-opus-4.1, claude-haiku-4.5) via the native Messages API. Activate when the user mentions Claude, Anthropic, ANTHROPIC_API_KEY, claude-sonnet, claude-opus, claude-haiku, extended thinking, prompt caching, computer use, or when wiring Claude calls into the a0p stack (python/services/inference.py _call_anthropic, energy_registry.py, tool_executor.py). Covers model selection, Messages API shape, tool use, structured outputs, streaming, extended thinking, prompt caching, web search tool, computer use, pricing/context cheatsheet, and a0p-specific integration.
---

# Anthropic Claude API

## When to Use

- The user explicitly mentions Claude, Anthropic, `ANTHROPIC_API_KEY`, claude-sonnet, claude-opus, claude-haiku, extended thinking, or prompt caching.
- Wiring or debugging Anthropic calls inside `python/services/inference.py::_call_anthropic` or any a0p energy provider routing.
- Choosing between Claude variants (top reasoning vs. balanced vs. fast).
- Enabling extended thinking, prompt caching, web search, or computer use.
- Switching from OpenAI/Grok/Gemini to Claude as the provider for a ZFAE agent.

If the user mentions GPT-5, OpenAI, Responses API, Grok, xAI, Gemini, or Google AI, load the matching skill instead (`gpt-5-api`, `grok-api`, `gemini-api`).

## Model Selection

| Model | Best for | Context | Notes |
|---|---|---|---|
| `claude-opus-4.1` | Hard reasoning, agentic loops, complex code, sub-agent merges | 200K in / 64K out | Top quality; expensive. Use when correctness >> cost. |
| `claude-sonnet-4.5` | Default chat, tool-heavy agents, code, summarization | 200K in (1M beta) / 64K out | The right default in a0p. Best price/quality balance. |
| `claude-haiku-4.5` | Classification, routing, extraction, sub-second tools | 200K in / 64K out | Cheap and fast; use for tool-routing and pre-filters. |

**a0p default policy:** keep `claude-sonnet-4.5` as the working model, escalate to `claude-opus-4.1` for sub-agent merges and PCNA-critical decisions, drop to `claude-haiku-4.5` for tool-routing and bandit pulls.

## API: Messages (only API for Claude)

Claude has one API: `https://api.anthropic.com/v1/messages`. There is no Responses-API equivalent and no OpenAI-compat endpoint. Use the official `anthropic` Python SDK.

### Required headers

```
x-api-key: <ANTHROPIC_API_KEY>
anthropic-version: 2023-06-01           # the only stable version string
anthropic-beta: <feature-flag>          # only when using a beta feature
```

**Important:** `2023-06-01` is the *current* stable version — Anthropic versions API changes via betas, not by bumping the version string. Don't try to "upgrade" it.

### Minimal call (SDK)

```python
from anthropic import AsyncAnthropic
import os

client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=2048,
    system="You are a0, a coherence-first agent.",
    messages=[{"role": "user", "content": "Summarize PCNA in two sentences."}],
)
print(resp.content[0].text)
```

### Tool use (matches a0p pattern)

Claude has its own tool schema — NOT the OpenAI nested-function form. Convert from `TOOL_SCHEMAS_CHAT`:

```python
claude_tools = [
    {
        "name": s["function"]["name"],
        "description": s["function"]["description"],
        "input_schema": s["function"]["parameters"],
    }
    for s in TOOL_SCHEMAS_CHAT
]

resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=2048,
    system=system_prompt,
    messages=conversation_messages,
    tools=claude_tools,
    tool_choice={"type": "auto"},
)

# Multi-turn loop:
while resp.stop_reason == "tool_use":
    tool_results = []
    for block in resp.content:
        if block.type == "tool_use":
            result = await execute_tool(block.name, block.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": result,
            })
    conversation_messages.append({"role": "assistant", "content": resp.content})
    conversation_messages.append({"role": "user", "content": tool_results})
    resp = await client.messages.create(
        model="claude-sonnet-4.5",
        max_tokens=2048,
        messages=conversation_messages,
        tools=claude_tools,
    )

# Final text:
final = next(b.text for b in resp.content if b.type == "text")
```

Claude returns content as a list of typed blocks (`text`, `tool_use`, `thinking`). Always iterate — there may be multiple blocks per response.

### Structured Outputs (no native JSON mode)

Claude does NOT have a `response_format=json_schema` parameter. Two options:

**Option A — single-tool trick (recommended):** define one tool with the desired schema and force its use.

```python
schema_tool = {
    "name": "emit_edcm_score",
    "description": "Emit the EDCM score.",
    "input_schema": {
        "type": "object",
        "properties": {
            "coherence": {"type": "number"},
            "drift": {"type": "number"},
            "notes": {"type": "string"},
        },
        "required": ["coherence", "drift", "notes"],
    },
}

resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=1024,
    messages=[{"role": "user", "content": prompt}],
    tools=[schema_tool],
    tool_choice={"type": "tool", "name": "emit_edcm_score"},
)
data = next(b.input for b in resp.content if b.type == "tool_use")
```

**Option B — prompt-engineered JSON.** Less reliable; only use when tool_choice is unavailable. Always validate.

### Streaming

```python
async with client.messages.stream(
    model="claude-sonnet-4.5",
    max_tokens=2048,
    messages=conversation_messages,
) as stream:
    async for text in stream.text_stream:
        yield text
    final = await stream.get_final_message()
    record_cost(final.usage)
```

`text_stream` yields strings only. For tool-call streaming or thinking blocks, iterate `stream` directly and switch on event type.

## Extended Thinking (Claude's reasoning mode)

Claude Sonnet 4.5 and Opus 4.1 support extended thinking — exposed reasoning blocks before the final answer. Token-budgeted, not effort-tiered.

```python
resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=8192,
    thinking={
        "type": "enabled",
        "budget_tokens": 4096,    # must be < max_tokens
    },
    messages=conversation_messages,
)

for block in resp.content:
    if block.type == "thinking":
        print("REASONING:", block.thinking)
    elif block.type == "text":
        print("ANSWER:", block.text)
```

Notes:
- `budget_tokens` MUST be less than `max_tokens` and at least 1024.
- Thinking tokens count as output and bill at the output rate.
- When `thinking` is enabled, `temperature` is forced to 1 — don't set it.
- Thinking + tool use is supported; thinking blocks must be preserved in subsequent turns or you'll get a 400.

Map a0p's `gate` to budget:
- `gate < 0.5` → no thinking (`type: "disabled"` or omit)
- `0.5–0.8` → `budget_tokens=1024`
- `0.8–1.1` → `budget_tokens=4096`
- `>1.1` → `budget_tokens=16384`

## Prompt Caching (huge cost win)

Claude caches expensive prompt prefixes for 5 minutes (or 1 hour with beta). Cached input is 10% the cost of fresh input.

```python
resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=2048,
    system=[
        {"type": "text", "text": "You are a0, a coherence-first agent."},
        {
            "type": "text",
            "text": LARGE_POLICY_DOCUMENT,    # >1024 tokens to be cacheable
            "cache_control": {"type": "ephemeral"},
        },
    ],
    messages=conversation_messages,
)
print(resp.usage)
# {"input_tokens": ..., "cache_creation_input_tokens": ..., "cache_read_input_tokens": ...}
```

For the 1-hour cache, add header `anthropic-beta: extended-cache-ttl-2025-04-11` and use `"cache_control": {"type": "ephemeral", "ttl": "1h"}`.

**a0p win:** the system prompt + tool schemas are big and reused — caching them drops per-call cost ~80%. Apply `cache_control` to the last system block and to the tools list.

## Web Search Tool (Claude-native)

Anthropic ships a hosted web search tool. Replaces the custom `web_search` function when provider is Anthropic.

```python
resp = await client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=2048,
    messages=[{"role": "user", "content": "What are the latest a0p commits?"}],
    tools=[{
        "type": "web_search_20250305",
        "name": "web_search",
        "max_uses": 5,
    }],
)
```

When the native web search is on, strip the custom `web_search` from your tool list to avoid double-fetch. Pricing: $10 per 1K searches.

## Computer Use (beta)

Claude can drive a virtual computer via screenshot + click/type tools. Requires `anthropic-beta: computer-use-2025-01-24`. Not currently wired in a0p — flag if the user asks for browser automation; this could replace several custom tools.

## Pricing Cheatsheet (as of Apr 2026)

Confirm at https://www.anthropic.com/pricing — these change.

| Model | Input $/1M | Cache write $/1M | Cache read $/1M | Output $/1M |
|---|---|---|---|---|
| claude-opus-4.1 | $15.00 | $18.75 | $1.50 | $75.00 |
| claude-sonnet-4.5 | $3.00 (≤200K) / $6.00 (>200K) | $3.75 / $7.50 | $0.30 / $0.60 | $15.00 / $22.50 |
| claude-haiku-4.5 | $1.00 | $1.25 | $0.10 | $5.00 |

Web search adds **$10 per 1K searches** (separate from tokens).

## a0p Integration Notes

- **Current path:** `python/services/inference.py::_call_anthropic` (lines 353–442) uses raw httpx with `anthropic-version: 2023-06-01`. This is correct version-wise but should switch to the official SDK for cleaner streaming, retries, and error parsing.
- **Stale model in registry:** `python/services/energy_registry.py` lists `claude-3-5-sonnet-20241022` — bump to `claude-sonnet-4.5`. Update pricing too: current entry uses 3.5 Sonnet rates ($3/$15) which happens to match Sonnet 4.5 base, but cache and tier-2 pricing must be added.
- **Tool schemas:** Claude needs its own form (`name`, `description`, `input_schema`). The conversion in `_call_anthropic` (lines 377–384) is correct — keep it.
- **System prompt:** Claude takes `system` as a top-level parameter, NOT a message in the messages array. The current code correctly extracts the system message and assigns it (lines 363–369). Good.
- **Energy / cost tracking:** parse `resp.usage` — `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`. With thinking enabled, also account for thinking tokens in the output count. Write to `system_costs` via `storage.record_cost()`.
- **Tier gating:** `claude-opus-4.1` should require `tier in ("ws","admin")`. `claude-sonnet-4.5` is the supporter default. `claude-haiku-4.5` can be free-tier safe.
- **Web search for Anthropic:** when provider is Claude AND task needs web facts, add the `web_search_20250305` tool and strip the custom `web_search` from the list.
- **Prompt caching:** the biggest free win available. Apply `cache_control` to the system prompt and tools list — drops cost ~80% on tool-heavy a0p turns.
- **URL hardcoded twice:** `_call_anthropic` defines the URL in `PROVIDER_ENDPOINTS` (line 26) but hardcodes it again at line 403. Use the spec.
- **Rate limits:** Anthropic enforces tokens-per-minute caps that bite hard on Opus. The SDK auto-retries 429 with backoff — don't add a second retry layer.

## Common Pitfalls

- **Sending OpenAI nested-function tool schemas to Claude** → 400 "input_schema is required". Use Claude's flat form.
- **Putting `system` in `messages`** → Claude ignores it. Pass as the top-level `system` parameter.
- **Setting `temperature` with `thinking` enabled** → 400. Thinking forces temperature=1.
- **Forgetting to preserve thinking blocks across turns** → 400 "thinking block missing". When continuing a thinking conversation, echo previous thinking blocks back in the assistant message.
- **`budget_tokens` >= `max_tokens`** → 400. Budget must be strictly less.
- **Treating `cache_creation_input_tokens` as free** — first cache write costs 25% MORE than fresh input. Caching pays off on the second use, not the first.
- **Cache prefix changes invisibly** — any change to system/tools above a `cache_control` boundary invalidates the cache. Pin tool definitions.
- **Mixing native web_search tool with custom web_search function** → double-fetch, double cost.
- **Hardcoding `ANTHROPIC_API_KEY`** → always read from `os.environ`.
- **Treating `2023-06-01` as old** — it's the current stable. Features arrive via `anthropic-beta` headers, not version bumps.

## Quick Decision Tree

```
Need top reasoning?         ──► claude-opus-4.1 + thinking budget=8192
Need balanced quality?      ──► claude-sonnet-4.5
Need cheap routing?         ──► claude-haiku-4.5
Need exposed reasoning?     ──► thinking={"type":"enabled","budget_tokens":...}
Need JSON output?           ──► single-tool trick + tool_choice={"type":"tool",...}
Need web facts?             ──► tools+=[{"type":"web_search_20250305",...}]
Need to drop cost ~80%?     ──► cache_control on system + tools
Need 1M context?            ──► claude-sonnet-4.5 + beta header context-1m-2025-08-07
Need browser automation?    ──► computer-use beta (not yet in a0p)
```

## References

- Anthropic API docs: https://docs.anthropic.com/en/api/messages
- Models overview: https://docs.anthropic.com/en/docs/about-claude/models
- Tool use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
- Extended thinking: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
- Prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Web search tool: https://docs.anthropic.com/en/docs/build-with-claude/tool-use/web-search-tool
- a0p Anthropic call: `python/services/inference.py::_call_anthropic` (lines 353–442)
- a0p registry: `python/services/energy_registry.py` (claude entry, lines 30–40)
