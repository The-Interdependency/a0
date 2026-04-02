import os
import json
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
