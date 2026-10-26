---
name: gemini-api
description: Use Google Gemini models (gemini-3-pro, gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite) via the native google-genai SDK or the OpenAI-compatible Chat Completions endpoint. Activate when the user mentions Gemini, Google AI, GEMINI_API_KEY, gemini-3, gemini-2.5, generativelanguage, grounding, google-genai, or when wiring Gemini calls into the a0p stack (python/services/inference.py, energy_registry.py, tool_executor.py). Covers model selection, native vs. OpenAI-compat trade-offs, tool calling, structured outputs, streaming, thinking_config, Google Search grounding, multimodal inputs, pricing/context cheatsheet, and a0p-specific integration.
---

# Google Gemini API

## When to Use

- The user explicitly mentions Gemini, Google AI, `GEMINI_API_KEY`, gemini-3, gemini-2.5, or grounding.
- Wiring or debugging Google calls inside `python/services/inference.py` (gemini branch) or any a0p energy provider routing.
- Choosing between Gemini variants (top reasoning vs. fast vs. cheap vs. multimodal).
- Adding Google Search grounding, code execution, or multimodal inputs (image/audio/video/PDF).
- Switching from the OpenAI-compatible compat endpoint to the native `google-genai` SDK to unlock features.

If the user mentions GPT-5, OpenAI, Responses API, Grok, xAI, Claude, or Anthropic, load the matching skill instead (`gpt-5-api`, `grok-api`, `anthropic-api`).

## Model Selection

| Model | Best for | Context | Notes |
|---|---|---|---|
| `gemini-3-pro` | Hard reasoning, agentic loops, long-context synthesis, multimodal analysis | 1M in / 64K out | Top quality; supports `thinking_config`. Use when correctness > cost. |
| `gemini-2.5-pro` | Strong reasoning, code, RAG over large corpora | 2M in / 64K out | The "previous gen" pro; still excellent for long-context tasks. |
| `gemini-2.5-flash` | Default chat, tool-heavy agents, summarization, multimodal | 1M in / 64K out | Usually the right default in a0p — fast, cheap, capable. |
| `gemini-2.5-flash-lite` | Classification, routing, extraction, sub-second decisions | 1M in / 64K out | Cheapest tier; use for tool-routing and bandit pulls. |
| `gemini-2.5-flash-image` | Native image generation + understanding | — | Use when the response itself should be an image (Imagen-class). |

**a0p default policy:** keep `gemini-2.5-flash` as the working model, escalate to `gemini-3-pro` for sub-agent merges and PCNA-critical decisions, drop to `gemini-2.5-flash-lite` for tool-routing and pre-filters.

## Two API Surfaces — Pick Carefully

Gemini exposes two endpoints. Both work with `GEMINI_API_KEY`. They are NOT feature-equivalent.

### A. Native `google-genai` SDK (preferred for Gemini-specific features)

Use when you need: Google Search grounding, code execution, multimodal (image/audio/video/PDF), `thinking_config`, native JSON-schema mode with full Pydantic models, batch API, file uploads.

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Summarize PCNA in two sentences.",
    config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=512),
        temperature=0.7,
        max_output_tokens=2048,
    ),
)
print(resp.text)
```

### B. OpenAI-compatible Chat Completions (current a0p path)

Use when you want a single code path across vendors and don't need Gemini-specific features. `https://generativelanguage.googleapis.com/v1beta/chat/completions`. This is what `inference.py` does today.

**What it loses:** grounding, code execution, native multimodal helpers, thinking_config, batch API. Tools and JSON mode work but are clunkier.

**Recommendation for a0p:** keep the compat endpoint as the default fast path, and add a native-SDK branch for tasks that explicitly request grounding, multimodal, or thinking — gated on a `gemini_native: true` flag in the call config.

## Tool Calling

### Native SDK form

```python
from google.genai import types

tools = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="edcm_score",
            description="Score coherence and drift",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "coherence": types.Schema(type=types.Type.NUMBER),
                    "drift": types.Schema(type=types.Type.NUMBER),
                },
                required=["coherence", "drift"],
            ),
        ),
    ]),
]

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=conversation_messages,
    config=types.GenerateContentConfig(
        tools=tools,
        tool_config=types.ToolConfig(
            function_calling_config=types.FunctionCallingConfig(mode="AUTO"),
        ),
    ),
)

for call in resp.function_calls:
    result = await execute_tool(call.name, dict(call.args))
    # feed back as types.Part.from_function_response(...)
```

### Compat endpoint form (matches a0p pattern)

Reuse `TOOL_SCHEMAS_CHAT` directly — Gemini accepts the OpenAI nested `function` form on the compat endpoint:

```python
resp = await client.post(
    "https://generativelanguage.googleapis.com/v1beta/chat/completions",
    json={
        "model": "gemini-2.5-flash",
        "messages": conversation_messages,
        "tools": TOOL_SCHEMAS_CHAT,
        "tool_choice": "auto",
    },
    headers={"Authorization": f"Bearer {os.environ['GEMINI_API_KEY']}"},
)
# parse choices[0].message.tool_calls — same shape as Grok/OpenAI Chat Completions
```

Gemini handles parallel tool calls — multiple `tool_calls` may come back. Process them all before re-calling.

## Structured Outputs (JSON Schema)

### Native SDK — Pydantic-friendly

```python
from pydantic import BaseModel

class EdcmScore(BaseModel):
    coherence: float
    drift: float
    notes: str

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=prompt,
    config=types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=EdcmScore,
    ),
)
parsed: EdcmScore = resp.parsed   # already typed
```

### Compat endpoint

```python
"response_format": {
    "type": "json_schema",
    "json_schema": {
        "name": "edcm_score",
        "schema": { ... },
    },
}
```

The compat endpoint accepts `json_schema` but does NOT enforce `strict` like OpenAI does — validate the result yourself.

## Streaming

```python
# Native SDK
for chunk in client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents=prompt,
):
    yield chunk.text

# Compat endpoint
payload["stream"] = True
async with client.stream("POST", url, json=payload, headers=headers) as resp:
    async for line in resp.aiter_lines():
        if line.startswith("data: "):
            chunk = json.loads(line[6:])
            delta = chunk["choices"][0]["delta"].get("content")
            if delta: yield delta
```

The compat endpoint streams in OpenAI SSE format. Final usage arrives in the last chunk only if you set `stream_options.include_usage: true`.

## Thinking Controls (gemini-3-pro, gemini-2.5-pro/flash)

Gemini's reasoning is controlled via `thinking_config.thinking_budget` (an integer token budget), not an effort enum. `0` disables thinking; `-1` lets the model decide.

```python
config=types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(
        thinking_budget=2048,        # token cap on thinking
        include_thoughts=False,       # set True to expose reasoning
    ),
)
```

Map a0p's `gate` to budget the same way as effort:
- `gate < 0.5` → `thinking_budget=0` (no thinking)
- `0.5–0.8` → `thinking_budget=512`
- `0.8–1.1` → `thinking_budget=2048`
- `>1.1` → `thinking_budget=8192`

Thinking tokens count as output and bill at the output rate.

## Google Search Grounding (native SDK only)

Gemini's hosted retrieval. Replaces the custom `web_search` tool when the provider is Google.

```python
from google.genai.types import Tool, GoogleSearch

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="What are the latest a0p commits on GitHub?",
    config=types.GenerateContentConfig(
        tools=[Tool(google_search=GoogleSearch())],
    ),
)
print(resp.text)
print(resp.candidates[0].grounding_metadata)   # citations + search queries used
```

When grounding is on, strip `web_search` from the tool list to avoid double-fetch.

## Multimodal Inputs (native SDK)

Gemini natively accepts images, audio, video, PDFs in the same `contents` list:

```python
from google.genai import types

resp = client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        "Describe this chart and extract the data.",
        types.Part.from_bytes(data=open("chart.png","rb").read(), mime_type="image/png"),
    ],
)
```

For files >20MB, upload first via `client.files.upload(...)` and reference the returned URI.

## Pricing Cheatsheet (as of Apr 2026)

Confirm at https://ai.google.dev/pricing — these change.

| Model | Input $/1M | Cached input $/1M | Output $/1M |
|---|---|---|---|
| gemini-3-pro | $1.25 (≤200K) / $2.50 (>200K) | $0.31 | $10.00 / $15.00 |
| gemini-2.5-pro | $1.25 (≤200K) / $2.50 (>200K) | $0.31 | $10.00 / $15.00 |
| gemini-2.5-flash | $0.30 | $0.075 | $2.50 |
| gemini-2.5-flash-lite | $0.10 | $0.025 | $0.40 |

Google Search grounding adds **$35 per 1K grounded queries** after the free tier (1.5K/day).

## a0p Integration Notes

- **Current path:** `python/services/inference.py` routes Gemini through the OpenAI compat endpoint. This works for chat + tools, but loses grounding, multimodal, and `thinking_config`.
- **Tool schemas:** Gemini compat takes `TOOL_SCHEMAS_CHAT` (nested form). Native SDK takes `types.FunctionDeclaration` — convert from `TOOL_SCHEMAS_CHAT` at call time.
- **Energy / cost tracking:** native SDK returns `resp.usage_metadata` with `prompt_token_count`, `candidates_token_count`, `thoughts_token_count`, `cached_content_token_count`. Compat returns OpenAI shape (`prompt_tokens`, `completion_tokens`). Track thinking tokens separately — they bill as output.
- **Tier gating:** `gemini-3-pro` should require `tier in ("ws","admin")`. `gemini-2.5-flash` is the supporter default. `gemini-2.5-flash-lite` is free-tier safe.
- **Model registry:** `python/services/energy_registry.py` lists `gemini-2.5-pro-preview-05-06` — that's stale. Update to `gemini-2.5-pro` (stable) or `gemini-3-pro` for top tier.
- **Web search for Gemini:** when provider is Google AND task needs web facts, switch to native SDK + `GoogleSearch()` tool. Strip the custom `web_search` from the tool list. The compat endpoint cannot use grounding.
- **Multimodal on a0p:** the chat endpoint currently expects text `content` only. To accept user-uploaded images for Gemini, switch the gemini branch to native SDK and convert attachments to `types.Part.from_bytes(...)`.
- **Rate limits:** Gemini free tier is generous but rate-limited per minute. Paid tier scales smoothly. The native SDK auto-retries 429.

## Common Pitfalls

- **Sending Anthropic or Responses-API schemas to Gemini compat** → 400. Use Chat Completions form (or native SDK).
- **Setting `thinking_budget` on the compat endpoint** → silently ignored. Use the native SDK if you want thinking control.
- **Forgetting Gemini's two-tier pricing** above 200K tokens — long-context calls cost 2x. Watch for surprise bills.
- **Treating thoughts tokens as free** — they bill at output rate. A `thinking_budget=8192` call can dominate cost.
- **Hardcoded preview model** like `gemini-2.5-pro-preview-05-06` — preview suffixes deprecate fast. Use stable aliases.
- **Mixing `tools` with `response_schema`** — on the native SDK, you can use one or the other per call, not both.
- **Compat endpoint + grounding** — does not work. Grounding requires the native SDK.
- **Over-trusting `strict` on JSON schema** — Gemini compat accepts `json_schema` but doesn't strictly enforce it. Validate output.
- **Hardcoding `GEMINI_API_KEY`** — always read from `os.environ`.

## Quick Decision Tree

```
Need top reasoning?       ──► gemini-3-pro + thinking_budget=2048+
Need long context (>1M)?  ──► gemini-2.5-pro
Need fast tool loops?     ──► gemini-2.5-flash + thinking_budget=512
Need cheap routing?       ──► gemini-2.5-flash-lite, no thinking
Need web facts?           ──► native SDK + GoogleSearch() tool
Need multimodal?          ──► native SDK + types.Part.from_bytes(...)
Need image generation?    ──► gemini-2.5-flash-image
Just match other vendors? ──► compat endpoint, gemini-2.5-flash, TOOL_SCHEMAS_CHAT
```

## References

- Gemini API docs: https://ai.google.dev/gemini-api/docs
- Models: https://ai.google.dev/gemini-api/docs/models
- google-genai SDK: https://googleapis.github.io/python-genai/
- OpenAI compat: https://ai.google.dev/gemini-api/docs/openai
- Grounding: https://ai.google.dev/gemini-api/docs/grounding
- Thinking: https://ai.google.dev/gemini-api/docs/thinking
- a0p inference: `python/services/inference.py` (gemini branch, lines 19-23, 286-350)
- a0p registry: `python/services/energy_registry.py` (gemini entry, lines 19-29)
