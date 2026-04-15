# 338:22
import os
import json
from typing import Optional
import httpx

from .tool_executor import (
    TOOL_SCHEMAS_CHAT,
    TOOL_SCHEMAS_RESPONSES,
    execute_tool,
)

_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
_GROK_BASE_URL = "https://api.x.ai/v1"
_MAX_TOOL_ROUNDS = 10


async def _load_provider_seed_config(provider_id: str) -> dict:
    """Return seed route_config for a provider (cached by EnergyRegistry)."""
    try:
        from .energy_registry import energy_registry
        return await energy_registry._load_seed_config(provider_id)
    except Exception:
        return {}


def _filter_tools_by_seed(seed_cfg: dict) -> list[dict]:
    """Filter TOOL_SCHEMAS_CHAT to the seed's enabled_tools list (if set)."""
    enabled = seed_cfg.get("enabled_tools")
    if not enabled:
        return list(TOOL_SCHEMAS_CHAT)
    names = set(enabled)
    return [t for t in TOOL_SCHEMAS_CHAT if t.get("function", {}).get("name", "") in names]


def _to_responses_format(tools: list[dict]) -> list[dict]:
    """Convert TOOL_SCHEMAS_CHAT format to OpenAI Responses API flat format.

    Chat Completions format: {"type":"function","function":{"name":...,"description":...,"parameters":...}}
    Responses API format:    {"type":"function","name":...,"description":...,"parameters":...}
    Native tools (web_search_preview, etc.) are already in Responses format — passed through as-is.
    """
    out: list[dict] = []
    for t in tools:
        if "function" in t:
            fn = t["function"]
            out.append({
                "type": "function",
                "name": fn["name"],
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {}),
            })
        else:
            out.append(t)
    return out


async def call_energy_provider(
    provider_id: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    max_tokens: int = 2048,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
    role: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Route messages to the active energy provider.
    Returns (content, usage_dict).
    role: optional task role (record/practice/conduct/perform/derive).
    If not provided, auto-classified via openai_router for all providers.
    Seed context_addendum is appended to system_prompt; enabled_tools filters the tool set.
    """
    # Load seed config for this provider (context_addendum, enabled_tools, capabilities)
    seed_cfg = await _load_provider_seed_config(provider_id)
    context_addendum = (seed_cfg.get("context_addendum") or "").strip()
    if context_addendum:
        system_prompt = (system_prompt or "") + "\n\n## Provider Context\n" + context_addendum
    tool_schemas = _filter_tools_by_seed(seed_cfg) if use_tools else []

    # Wire the provider's PCNA core to receive the inference signal
    pcna_core = None
    try:
        from ..main import get_or_create_provider_pcna
        pcna_core = await get_or_create_provider_pcna(provider_id)
        task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")
        pcna_core.infer(task_text[:500])
    except Exception:
        pass

    if provider_id == "openai":
        result = await _call_openai_routed(
            messages, system_prompt, tool_schemas=tool_schemas,
            user_id=user_id, skip_approval=skip_approval, role=role
        )
    elif provider_id == "grok":
        result = await _call_grok_routed(messages, system_prompt, tool_schemas=tool_schemas, role=role)
    elif provider_id == "gemini":
        capabilities = seed_cfg.get("capabilities", {})
        result = await _call_gemini_routed(
            messages, system_prompt, tool_schemas=tool_schemas, role=role, capabilities=capabilities
        )
    elif provider_id == "claude":
        capabilities = seed_cfg.get("capabilities", {})
        result = await _call_claude_routed(
            messages, system_prompt, tool_schemas=tool_schemas, role=role, capabilities=capabilities
        )
    else:
        return _fallback_response(provider_id), {}

    # Propagate reward signal to provider PCNA core and persist
    content_out, usage_out = result
    _is_error = content_out.startswith("[") and "error" in content_out.lower()
    try:
        if pcna_core is not None:
            pcna_core.phi.propagate(steps=1)
            if not _is_error:
                pcna_core.phi.inject(0.1)
            await pcna_core.save_checkpoint()
    except Exception:
        pass

    return content_out, usage_out


def _classify_role(messages: list[dict]) -> str:
    """Use openai_router to classify task text and return a role name."""
    try:
        from .openai_router import make_route_decision
        task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")
        decision = make_route_decision(task_text[:1000])
        return decision.get("role", "conduct")
    except Exception:
        return "conduct"


async def _resolve_provider_model(provider_id: str, role: Optional[str], messages: list[dict]) -> str:
    """Resolve model for provider+role (env→seed→default). Auto-classifies role if None."""
    resolved_role = role or _classify_role(messages)
    from .energy_registry import energy_registry
    try:
        return await energy_registry.resolve_model_for_role_async(provider_id, resolved_role)
    except Exception:
        return energy_registry.resolve_model_for_role(provider_id, resolved_role)


async def _call_openai_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    tool_schemas: Optional[list] = None,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
    role: Optional[str] = None,
) -> tuple[str, dict]:
    """Route via openai_router (role classification + approval gate), then call Responses API."""
    from .openai_router import make_route_decision, make_call_config, make_approval_packet, get_triggered_actions
    from ..logger import log_openai_event, seed_openai_hmmm_if_empty
    from ..config.policy_loader import get_hmmm_seed_items, get_action_scope, get_scope_categories
    from ..storage import storage

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())

    task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")

    pre_approved_scopes: set[str] = set()
    if user_id:
        try:
            pre_approved_scopes = await storage.get_approval_scope_names(user_id)
        except Exception as _scope_err:
            print(f"[approval_scopes] failed to load scopes for {user_id}: {_scope_err}")

    route_decision = make_route_decision(task_text, pre_approved_scopes=pre_approved_scopes)
    resolved_role = role or route_decision["role"]
    call_cfg = make_call_config(resolved_role, "openai")

    if route_decision["requires_approval"] and not skip_approval:
        import uuid
        gate_id = f"gate-{uuid.uuid4().hex[:8]}"
        packet = make_approval_packet(task_text, gate_id)
        await log_openai_event(
            role=resolved_role, model=call_cfg["model"],
            reasoning_effort=call_cfg["reasoning_effort"],
            input_text=json.dumps({"task": task_text}),
            output_text=json.dumps(packet), approval_state="pending",
        )
        usage = {
            "approval_state": "pending", "gate_id": gate_id,
            "approval_packet": packet, "route_decision": route_decision,
        }
        triggered = get_triggered_actions(task_text)
        scope_hints: list[str] = []
        scope_categories = get_scope_categories()
        seen_scopes: set[str] = set()
        for action in triggered:
            sc = get_action_scope(action)
            if sc and sc not in seen_scopes and sc in scope_categories:
                meta = scope_categories[sc]
                scope_hints.append(f"  Pre-approve all {meta['label']}: APPROVE SCOPE {sc}")
                seen_scopes.add(sc)
        scope_section = "\n" + "\n".join(scope_hints) if scope_hints else ""
        return (
            f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
            f"Action: {packet['action'][:120]}\nImpact: {packet['impact']}\n"
            f"Rollback: {packet['rollback']}\nTo approve: APPROVE {gate_id}{scope_section}",
            usage,
        )

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return _fallback_response("openai"), {}

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    if tool_schemas is not None:
        effective_tools = _to_responses_format(tool_schemas)
    else:
        effective_tools = list(TOOL_SCHEMAS_RESPONSES)
    content, usage = await _call_openai_responses(
        api_key=api_key, model=call_cfg["model"], input_messages=full_input,
        max_output_tokens=call_cfg["max_output_tokens"], temperature=call_cfg["temperature"],
        reasoning_effort=call_cfg["reasoning_effort"], store=call_cfg["store"],
        use_tools=bool(effective_tools), tool_schemas_override=effective_tools,
    )
    await log_openai_event(
        role=resolved_role, model=call_cfg["model"],
        reasoning_effort=call_cfg["reasoning_effort"],
        input_text=json.dumps(full_input), output_text=content,
        approval_state="not_required",
    )
    usage["route_decision"] = route_decision
    return content, usage


async def _call_grok_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    tool_schemas: Optional[list] = None,
    role: Optional[str] = None,
) -> tuple[str, dict]:
    """Route to Grok via openai SDK pointed at api.x.ai/v1."""
    api_key = os.environ.get("XAI_API_KEY", "")
    if not api_key:
        return _fallback_response("grok"), {}

    model = await _resolve_provider_model("grok", role, messages)
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key, base_url="https://api.x.ai/v1")

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    effective = tool_schemas if tool_schemas is not None else list(TOOL_SCHEMAS_CHAT)
    return await _call_chat_completions_sdk(
        client=client, model=model, messages=payload_messages,
        max_tokens=4000, tool_schemas=effective,
        extra_body={"search_parameters": {"mode": "auto"}},
    )


async def _call_gemini_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    tool_schemas: Optional[list] = None,
    role: Optional[str] = None,
    capabilities: Optional[dict] = None,
) -> tuple[str, dict]:
    """Route to Gemini via google-genai SDK."""
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        return _fallback_response("gemini"), {}

    model = await _resolve_provider_model("gemini", role, messages)
    effective = tool_schemas if tool_schemas is not None else list(TOOL_SCHEMAS_CHAT)

    try:
        from google import genai as google_genai
        from google.genai import types as genai_types
    except ImportError:
        return "[gemini error: google-genai not installed]", {}

    client = google_genai.Client(api_key=api_key)

    # Convert OpenAI tool schema → google-genai FunctionDeclaration
    fn_decls = [
        genai_types.FunctionDeclaration(
            name=t["function"]["name"],
            description=t["function"].get("description", ""),
            parameters=t["function"].get("parameters"),
        )
        for t in effective
    ]
    tools_cfg = [genai_types.Tool(function_declarations=fn_decls)] if fn_decls else []

    # Convert messages to google-genai Contents format
    def _to_contents(msgs: list[dict]) -> list[genai_types.Content]:
        contents = []
        for m in msgs:
            r = m.get("role", "user")
            c = m.get("content", "")
            genai_role = "model" if r == "assistant" else "user"
            contents.append(genai_types.Content(role=genai_role, parts=[genai_types.Part(text=c)]))
        return contents

    contents = _to_contents(messages)
    config_kwargs: dict = {"tools": tools_cfg} if tools_cfg else {}
    if system_prompt:
        config_kwargs["system_instruction"] = system_prompt
    # Enable grounding if seed capabilities include it
    if (capabilities or {}).get("grounding"):
        config_kwargs["tools"] = (config_kwargs.get("tools") or []) + [
            genai_types.Tool(google_search=genai_types.GoogleSearch())
        ]

    accumulated_usage: dict = {}
    for _round in range(_MAX_TOOL_ROUNDS + 1):
        try:
            resp = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=genai_types.GenerateContentConfig(**config_kwargs),
            )
        except Exception as exc:
            return f"[gemini error: {exc}]", accumulated_usage

        if resp.usage_metadata:
            accumulated_usage["prompt_tokens"] = resp.usage_metadata.prompt_token_count or 0
            accumulated_usage["completion_tokens"] = resp.usage_metadata.candidates_token_count or 0

        candidate = resp.candidates[0] if resp.candidates else None
        if not candidate:
            return "[gemini: no candidates]", accumulated_usage

        parts = candidate.content.parts if candidate.content else []
        fn_parts = [p for p in parts if hasattr(p, "function_call") and p.function_call]

        if not fn_parts or not effective or _round >= _MAX_TOOL_ROUNDS:
            for part in parts:
                if hasattr(part, "text") and part.text:
                    return part.text, accumulated_usage
            return "[gemini: no text]", accumulated_usage

        # Append model response with function_calls
        contents.append(candidate.content)
        fn_responses = []
        for p in fn_parts:
            fc = p.function_call
            args = dict(fc.args) if fc.args else {}
            result = await execute_tool(fc.name, args)
            fn_responses.append(genai_types.Part(
                function_response=genai_types.FunctionResponse(
                    name=fc.name, response={"result": result}
                )
            ))
        contents.append(genai_types.Content(role="user", parts=fn_responses))

    return "[gemini: tool loop exhausted]", accumulated_usage


async def _call_claude_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    tool_schemas: Optional[list] = None,
    role: Optional[str] = None,
    capabilities: Optional[dict] = None,
) -> tuple[str, dict]:
    """Route to Claude via anthropic SDK."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return _fallback_response("claude"), {}

    model = await _resolve_provider_model("claude", role, messages)
    effective = tool_schemas if tool_schemas is not None else list(TOOL_SCHEMAS_CHAT)

    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)

    system_content = system_prompt or ""
    filtered: list[dict] = [m for m in messages if m.get("role") != "system"]

    claude_tools = [
        {
            "name": s["function"]["name"],
            "description": s["function"]["description"],
            "input_schema": s["function"]["parameters"],
        }
        for s in effective
    ]

    # Extended thinking for derive/perform if seed enables it
    thinking_enabled = bool((capabilities or {}).get("extended_thinking")) and role in ("derive", "perform")

    current_messages = list(filtered)
    accumulated_usage: dict = {}

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        kwargs: dict = {"model": model, "max_tokens": 4000, "messages": current_messages}
        if system_content:
            kwargs["system"] = system_content
        if claude_tools:
            kwargs["tools"] = claude_tools
        if thinking_enabled:
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": 2048}

        try:
            resp = await client.messages.create(**kwargs)
        except Exception as exc:
            return f"[claude error: {exc}]", accumulated_usage

        for k, v in (vars(resp.usage) if resp.usage else {}).items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        content_blocks = resp.content
        tool_use_blocks = [b for b in content_blocks if b.type == "tool_use"]

        if not tool_use_blocks or not claude_tools or _round >= _MAX_TOOL_ROUNDS:
            for block in content_blocks:
                if block.type == "text":
                    return block.text, accumulated_usage
            return "[claude: no text in response]", accumulated_usage

        current_messages.append({"role": "assistant", "content": [b.model_dump() for b in content_blocks]})
        tool_results = []
        for block in tool_use_blocks:
            result = await execute_tool(block.name, block.input or {})
            tool_results.append({"type": "tool_result", "tool_use_id": block.id, "content": result})
        current_messages.append({"role": "user", "content": tool_results})

    return "[claude: tool loop exhausted]", accumulated_usage


async def _call_chat_completions_sdk(
    client,
    model: str,
    messages: list[dict],
    max_tokens: int,
    tool_schemas: Optional[list] = None,
    extra_body: Optional[dict] = None,
) -> tuple[str, dict]:
    """Generic Chat Completions loop using the openai SDK client (Grok)."""
    current_messages = list(messages)
    accumulated_usage: dict = {}
    effective_tools = tool_schemas or []

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        kwargs: dict = {"model": model, "messages": current_messages, "max_tokens": max_tokens}
        if effective_tools:
            kwargs["tools"] = effective_tools
            kwargs["tool_choice"] = "auto"
        if extra_body:
            kwargs["extra_body"] = extra_body

        try:
            resp = await client.chat.completions.create(**kwargs)
        except Exception as exc:
            return f"[provider error: {exc}]", accumulated_usage

        if resp.usage:
            accumulated_usage["prompt_tokens"] = accumulated_usage.get("prompt_tokens", 0) + (resp.usage.prompt_tokens or 0)
            accumulated_usage["completion_tokens"] = accumulated_usage.get("completion_tokens", 0) + (resp.usage.completion_tokens or 0)

        choice = resp.choices[0] if resp.choices else None
        if not choice:
            return "[no choices in response]", accumulated_usage

        message = choice.message
        tool_calls = message.tool_calls or []

        if not tool_calls or not effective_tools or _round >= _MAX_TOOL_ROUNDS:
            return message.content or "[no content]", accumulated_usage

        current_messages.append(message.model_dump())
        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except Exception:
                args = {}
            result = await execute_tool(name, args)
            current_messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    return "[tool loop exhausted]", accumulated_usage


async def _call_openai_responses(
    api_key: str,
    model: str,
    input_messages: list[dict],
    max_output_tokens: int = 4000,
    temperature: float = 1.0,
    reasoning_effort: str = "low",
    store: bool = False,
    use_tools: bool = True,
    tool_schemas_override: Optional[list] = None,
) -> tuple[str, dict]:
    """Call the OpenAI Responses API with optional tool calling."""

    def _fmt(msgs: list[dict]) -> list[dict]:
        out: list[dict] = []
        for m in msgs:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                out.append({"role": "system", "content": content})
            elif role == "assistant":
                out.append({"role": "assistant", "content": [{"type": "output_text", "text": content}]})
            else:
                out.append({"role": "user", "content": [{"type": "input_text", "text": content}]})
        return out

    openai_input = _fmt(input_messages)
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    effective_tools = tool_schemas_override if tool_schemas_override is not None else list(TOOL_SCHEMAS_RESPONSES)
    accumulated_usage: dict = {}

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        payload: dict = {
            "model": model, "input": openai_input, "store": store,
            "temperature": temperature, "max_output_tokens": max_output_tokens,
            "text": {"format": {"type": "text"}},
        }
        if reasoning_effort and reasoning_effort != "none":
            payload["reasoning"] = {"effort": reasoning_effort}
        if use_tools and effective_tools:
            payload["tools"] = effective_tools

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                resp = await client.post(_OPENAI_RESPONSES_URL, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            return f"[openai responses error: {exc}]", accumulated_usage

        for k, v in data.get("usage", {}).items():
            accumulated_usage[k] = accumulated_usage.get(k, 0) + (v if isinstance(v, (int, float)) else 0)

        output_items = data.get("output", [])
        tool_calls = [item for item in output_items if item.get("type") == "function_call"]

        if not tool_calls or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            content = ""
            for item in output_items:
                if item.get("type") == "message":
                    for part in item.get("content", []):
                        if part.get("type") == "output_text":
                            content = part.get("text", "")
                            break
                if content:
                    break
            return content or "[openai: empty response]", accumulated_usage

        for item in output_items:
            if item.get("type") == "function_call":
                openai_input.append(item)

        for tc in tool_calls:
            call_id = tc.get("call_id", "")
            name = tc.get("name", "")
            try:
                args = json.loads(tc.get("arguments", "{}"))
            except Exception:
                args = {}
            result = await execute_tool(name, args)
            openai_input.append({"type": "function_call_output", "call_id": call_id, "output": result})

    return "[openai: tool loop exhausted]", accumulated_usage


def _fallback_response(provider_id: str) -> str:
    return f"[{provider_id} API key not configured — energy provider unavailable]"
# 338:22
