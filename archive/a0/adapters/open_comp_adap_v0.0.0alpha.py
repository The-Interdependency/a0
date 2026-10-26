# 102:53 0:0 2:0
"""Synchronous standalone adapter for registry-defined OpenAI-compatible APIs."""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_adapter_openai_compatible
#   module_name: openai_compatible_adapter
#   module_kind: adapter
#   summary: Executes standalone a0 requests against any registry-defined OpenAI-compatible Responses or Chat Completions endpoint.
#   owner: Erin Spencer
#   public_surface: OpenAICompatibleAdapter
#   internal_surface: _normalize_effort, _response_text
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: external
#   user_data_boundary: write
#   admin_only: false
#   tests: tests/test_aone_open_comp_adap_v0.0.0alpha.py
#   rollout: default_enabled
#   rollback: Remove this module and restore router selection to Claude/local only.
#   requires: a0_provider_registry
#   since: 2026-09-07
#   unresolved: none
# === END MODULE_BUILD ===

# === CONTRACTS ===
# id: a0_openai_compatible_completion
#   given: a compatible provider id/spec, process credential, and ModelAdapter messages
#   then: the registry-derived client executes the configured API family and returns text/usage without credentials; missing keys and unsupported families fail closed
#   class: correctness
#   since: 2026-09-07
#
# id: a0_openai_compatible_error_suppresses_secret_cause
#   given: an upstream compatible-provider exception may echo its credential
#   then: the public RuntimeError omits the original exception cause
#   class: safety
#   since: 2026-09-09
#
# id: a0_openai_compatible_store_defaults_off
#   given: a standalone Responses provider supports upstream response storage
#   then: requests send store=false unless the caller explicitly opts in
#   class: safety
#   since: 2026-09-09
#
# id: a0_openai_compatible_reasoning_floor
#   given: a standalone compatible provider declares a minimum reasoning effort above the request or default
#   then: the adapter raises the effective effort to that configured floor before transport
#   class: correctness
#   since: 2026-09-10
#
# id: a0_openai_compatible_explicit_none_reasoning
#   given: a compatible provider declares that reasoning effort none must be sent explicitly
#   then: standalone Responses calls carry reasoning.effort=none rather than falling back to the provider default
#   class: correctness
#   since: 2026-09-10
# === END CONTRACTS ===

import os
from typing import Any, Dict, List

from openai import OpenAI

Message = Dict[str, str]


def _normalize_effort(spec: dict[str, Any], requested: str | None) -> str | None:
    if not spec.get("supports_reasoning_effort"):
        return None
    value = (requested or spec.get("default_reasoning_effort") or "medium").lower().strip()
    mapped = (spec.get("reasoning_effort_map") or {}).get(value, value)
    allowed = spec.get("reasoning_efforts") or []
    if allowed and mapped not in allowed:
        mapped = spec.get("default_reasoning_effort") or allowed[0]
    floor = spec.get("min_reasoning_effort")
    order = {"minimal": 0, "low": 1, "medium": 2, "high": 3}
    if floor and order.get(mapped, -1) < order.get(floor, -1):
        mapped = floor
    return mapped


def _response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)
    data = response.model_dump()
    for item in data.get("output") or []:
        if item.get("type") != "message":
            continue
        for part in item.get("content") or []:
            if part.get("type") == "output_text" and part.get("text"):
                return str(part["text"])
    return ""


class OpenAICompatibleAdapter:
    """ModelAdapter implementation parameterized entirely by provider data."""

    def __init__(self, provider_id: str, spec: dict[str, Any]) -> None:
        self.provider_id = provider_id
        self.spec = dict(spec)
        self.model = str(self.spec.get("model") or "").strip()
        self.api_key_env = str(self.spec.get("api_key_env") or "").strip()
        self.api_family = str(self.spec.get("api_family") or "responses")
        base_url = str(self.spec.get("base_url") or "").strip() or None

        if not self.model:
            raise ValueError(f"Provider {provider_id!r} has no model")
        if not self.api_key_env:
            raise ValueError(f"Provider {provider_id!r} has no api_key_env")
        api_key = os.environ.get(self.api_key_env, "").strip()
        if not api_key:
            raise ValueError(f"{self.api_key_env} not configured")

        client_kwargs: dict[str, str] = {"api_key": api_key}
        if base_url:
            client_kwargs["base_url"] = base_url.rstrip("/")
        self._client = OpenAI(**client_kwargs)
        self.name = f"{provider_id}:{self.model}"

    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]:
        effort = _normalize_effort(self.spec, kwargs.get("reasoning_effort"))
        max_tokens = int(kwargs.get("max_tokens") or 4096)
        if self.api_family not in {"responses", "chat_completions"}:
            raise ValueError(
                f"Provider {self.provider_id!r} has unsupported api_family={self.api_family!r}"
            )
        try:
            if self.api_family == "responses":
                request: dict[str, Any] = {
                    "model": self.model,
                    "input": messages,
                    "max_output_tokens": max_tokens,
                }
                supports_store = bool(
                    self.spec.get("supports_store", self.spec.get("vendor") == "openai")
                )
                if supports_store:
                    request["store"] = bool(kwargs.get("store", False))
                if effort and (
                    effort != "none" or self.spec.get("explicit_none_reasoning")
                ):
                    request["reasoning"] = {"effort": effort}
                response = self._client.responses.create(**request)
                text = _response_text(response)
                data = response.model_dump()
            elif self.api_family == "chat_completions":
                request = {
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                }
                if effort and effort != "none":
                    request["reasoning_effort"] = effort
                response = self._client.chat.completions.create(**request)
                data = response.model_dump()
                choices = data.get("choices") or []
                message = (choices[0].get("message") if choices else None) or {}
                text = str(message.get("content") or "")
        except Exception as exc:
            raise RuntimeError(
                f"{self.provider_id} request failed: {type(exc).__name__}"
            ) from None

        return {
            "text": text or f"[{self.provider_id}: empty response]",
            "raw": {
                "provider": self.provider_id,
                "model": self.model,
                "usage": data.get("usage") or {},
            },
            "subagents_used": [],
        }
# 102:53 0:0 2:0
