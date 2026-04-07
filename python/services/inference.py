import os
import json
from hashlib import sha256
from typing import Optional
import httpx

PROVIDER_ENDPOINTS = {
    "grok": {
        "url": "https://api.x.ai/v1/chat/completions",
        "env_key": "XAI_API_KEY",
        "model": "grok-3-latest",
    },
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/chat/completions",
        "env_key": "GEMINI_API_KEY",
        "model": "gemini-2.5-pro-preview-05-06",
    },
    "claude": {
        "url": "https://api.anthropic.com/v1/messages",
        "env_key": "ANTHROPIC_API_KEY",
        "model": "claude-3-5-sonnet-20241022",
    },
}

_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


async def call_energy_provider(
    provider_id: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    max_tokens: int = 2048,
) -> tuple[str, dict]:
    """
    Forward messages to the active energy provider with the system prompt prepended.
    Returns (content, usage_dict).
    """
    if provider_id == "openai":
        return await _call_openai_routed(messages, system_prompt)

    spec = PROVIDER_ENDPOINTS.get(provider_id)
    if not spec:
        return _fallback_response(provider_id), {}

    api_key = os.environ.get(spec["env_key"], "")
    if not api_key:
        return _fallback_response(provider_id), {}

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    if provider_id == "claude":
        return await _call_anthropic(api_key, spec["model"], payload_messages, max_tokens)

    return await _call_openai_compat(api_key, spec["url"], spec["model"], payload_messages, max_tokens)


async def _call_openai_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Route to the appropriate role via openai_router, check approval gate,
    then call the Responses API.
    """
    from .openai_router import make_route_decision, make_approval_packet, _check_approval_required
    from ..logger import log_openai_event, seed_openai_hmmm_if_empty
    from ..config.policy_loader import get_hmmm_seed_items

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())

    task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")
    decision = make_route_decision(task_text)

    if decision["requires_approval"]:
        import uuid
        gate_id = f"gate-{uuid.uuid4().hex[:8]}"
        packet = make_approval_packet(task_text, gate_id)
        input_repr = json.dumps({"task": task_text})
        output_repr = json.dumps(packet)
        await log_openai_event(
            role=decision["role"],
            model=decision["model"],
            reasoning_effort=decision["reasoning_effort"],
            input_text=input_repr,
            output_text=output_repr,
            approval_state="pending",
        )
        content = (
            f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
            f"Action: {packet['action'][:120]}\n"
            f"Impact: {packet['impact']}\n"
            f"Rollback: {packet['rollback']}\n"
            f"To approve, reply: APPROVE {gate_id}"
        )
        return content, {"approval_state": "pending", "gate_id": gate_id}

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return _fallback_response("openai"), {}

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    content, usage = await _call_openai_responses(
        api_key=api_key,
        model=decision["model"],
        input_messages=full_input,
        max_output_tokens=decision["max_output_tokens"],
        temperature=decision["temperature"],
        reasoning_effort=decision["reasoning_effort"],
        store=decision["store"],
    )

    input_repr = json.dumps(full_input)
    await log_openai_event(
        role=decision["role"],
        model=decision["model"],
        reasoning_effort=decision["reasoning_effort"],
        input_text=input_repr,
        output_text=content,
        approval_state="not_required",
    )
    return content, usage


async def _call_openai_responses(
    api_key: str,
    model: str,
    input_messages: list[dict],
    max_output_tokens: int = 4000,
    temperature: float = 1.0,
    reasoning_effort: str = "low",
    store: bool = False,
) -> tuple[str, dict]:
    """
    Call the OpenAI Responses API (/v1/responses).
    Request/response format is different from Chat Completions.
    """
    openai_input: list[dict] = []
    for m in input_messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "system":
            openai_input.append({"role": "system", "content": content})
        elif role == "assistant":
            openai_input.append({"role": "assistant", "content": [{"type": "output_text", "text": content}]})
        else:
            openai_input.append({"role": "user", "content": [{"type": "input_text", "text": content}]})

    payload: dict = {
        "model": model,
        "input": openai_input,
        "store": store,
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
        "reasoning": {"effort": reasoning_effort} if reasoning_effort and reasoning_effort != "none" else {},
        "text": {"format": {"type": "text"}},
    }
    if not payload["reasoning"]:
        del payload["reasoning"]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(_OPENAI_RESPONSES_URL, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            output_items = data.get("output", [])
            content = ""
            for item in output_items:
                if item.get("type") == "message":
                    for part in item.get("content", []):
                        if part.get("type") == "output_text":
                            content = part.get("text", "")
                            break
                if content:
                    break
            usage = data.get("usage", {})
            return content or "[openai: empty response]", usage
    except Exception as exc:
        return f"[openai responses error: {exc}]", {}


async def _call_openai_compat(
    api_key: str,
    url: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
) -> tuple[str, dict]:
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            usage = data.get("usage", {})
            return content, usage
    except Exception as exc:
        return f"[energy provider error: {exc}]", {}


async def _call_anthropic(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
) -> tuple[str, dict]:
    system_content = ""
    filtered: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system_content = m["content"]
        else:
            filtered.append(m)

    payload: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": filtered,
    }
    if system_content:
        payload["system"] = system_content

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                json=payload,
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["content"][0]["text"]
            usage = data.get("usage", {})
            return content, usage
    except Exception as exc:
        return f"[energy provider error: {exc}]", {}


def _fallback_response(provider_id: str) -> str:
    return f"[{provider_id} API key not configured — energy provider unavailable]"
