# 99:53
"""call_fn — canonical CallFn adapter.

aimmh_lib.adapters.make_call_fn pattern, ported to a0p. The CallFn is the
single seam every higher-level construct (Forge agents, spawned subagents,
chat single-mode, future ModelInstance / orchestration patterns) crosses
when actually invoking a model. Provider routing is internal.

Two flavors:

  call = make_call_fn(user_id)
  text = await call("<model_id>", messages, system_prompt="...")
    → returns just the assistant text, mirrors aimmh_lib's CallFn signature.

  call = make_call_fn_full(user_id)
  text, usage = await call("<model_id>", messages, system_prompt="...")
    → returns (content, usage) so callers tracking cost/tokens don't lose
      that data. This is the preferred a0p variant since approval gates
      and billing live in usage.

Honest semantics:
  - Unknown model_id → ValueError (no silent fallback to a default).
  - Tier-blocked model + user_id supplied → PermissionError with reason.
  - Provider key missing → underlying call_energy_provider raises; we let
    that propagate rather than masking it.
  - user_id is threaded through to the OpenAI approval-scope plumbing.

What this REPLACES (eventually): scattered `call_energy_provider(
provider_id=..., ...)` invocations in chat / focus / cli / spawn / forge
that each do their own provider routing. Once everything routes through
make_call_fn the only place that knows about provider_id is this module
plus the inference layer beneath it.
"""
from __future__ import annotations

from typing import Awaitable, Callable, Optional

from .inference import call_energy_provider
from .model_catalog import (
    _TIER_ORDER,
    _user_tier,
    is_provider_enabled,
    resolve_model_id,
)


# Type aliases — the "just text" CallFn matches aimmh_lib.conversations.CallFn,
# the "_full" variant returns (content, usage) for a0p's billing/approval needs.
CallFn = Callable[..., Awaitable[str]]
CallFnFull = Callable[..., Awaitable[tuple[str, dict]]]


def _check_tier(spec: dict, user_tier: str) -> None:
    min_tier = spec.get("min_tier")
    if not min_tier:
        return
    user_rank = _TIER_ORDER.get(user_tier, 0)
    need_rank = _TIER_ORDER.get(min_tier, 0)
    if user_rank < need_rank:
        raise PermissionError(
            f"Model requires tier {min_tier!r} or higher; "
            f"caller tier is {user_tier!r}"
        )


async def call_model(
    model_id: str,
    messages: list[dict],
    *,
    user_id: Optional[str] = None,
    system_prompt: Optional[str] = None,
    max_tokens: int = 8000,
    use_tools: bool = True,
    skip_approval: bool = False,
    reasoning_effort: Optional[str] = None,
    enforce_tier: bool = True,
    enforce_enabled: bool = True,
) -> tuple[str, dict]:
    """Module-level full-shape call. Resolves model_id → provider_id, gates
    on tier + provider-enabled flag, and delegates to call_energy_provider.

    Default tier is "free" when user_id is None — gating is enforced for
    anonymous callers too, matching chat.py semantics. Pass
    enforce_tier=False / enforce_enabled=False for internal callers (e.g.
    swarm classify) that legitimately bypass user-facing gates.

    Raises:
      ValueError       — unknown model_id
      PermissionError  — tier blocked OR provider disabled by user
      RuntimeError     — provider API key missing (no silent fallback)
    """
    provider_id, spec = await resolve_model_id(model_id)
    if enforce_tier:
        user_tier = await _user_tier(user_id)
        _check_tier(spec, user_tier)
    if enforce_enabled:
        if not await is_provider_enabled(provider_id):
            raise PermissionError(
                f"Provider {provider_id!r} is disabled in route_config"
            )
    # call_energy_provider raises RuntimeError on missing api_key or unknown
    # provider — we let it propagate (no silent-fallback doctrine). Earlier
    # versions returned a fake "[provider API key not configured…]" string;
    # that sentinel detection is gone now that the upstream raises directly.
    content, usage = await call_energy_provider(
        provider_id=provider_id,
        messages=messages,
        system_prompt=system_prompt,
        max_tokens=max_tokens,
        use_tools=use_tools,
        user_id=user_id,
        skip_approval=skip_approval,
        reasoning_effort=reasoning_effort,
    )
    return content, usage


def make_call_fn_full(
    user_id: Optional[str] = None,
    *,
    enforce_tier: bool = True,
    enforce_enabled: bool = True,
) -> CallFnFull:
    """Bind user_id once; return a CallFn that yields (content, usage).

    Preferred variant for a0p code paths since usage carries cost,
    approval state, and per-provider provenance.
    """
    async def _call(
        model_id: str,
        messages: list[dict],
        *,
        system_prompt: Optional[str] = None,
        max_tokens: int = 8000,
        use_tools: bool = True,
        skip_approval: bool = False,
        reasoning_effort: Optional[str] = None,
    ) -> tuple[str, dict]:
        return await call_model(
            model_id,
            messages,
            user_id=user_id,
            system_prompt=system_prompt,
            max_tokens=max_tokens,
            use_tools=use_tools,
            skip_approval=skip_approval,
            reasoning_effort=reasoning_effort,
            enforce_tier=enforce_tier,
            enforce_enabled=enforce_enabled,
        )
    return _call


def make_call_fn(
    user_id: Optional[str] = None,
    *,
    enforce_tier: bool = True,
    enforce_enabled: bool = True,
) -> CallFn:
    """aimmh-compatible CallFn — returns just the assistant text.

    Use this when handing off to aimmh_lib orchestration (fan_out /
    daisy_chain / council / roleplay) which expects `async (model_id,
    messages) -> str`. For a0p-native paths that need usage / approval
    state, use make_call_fn_full instead.
    """
    full = make_call_fn_full(
        user_id,
        enforce_tier=enforce_tier,
        enforce_enabled=enforce_enabled,
    )

    async def _call(model_id: str, messages: list[dict], **kwargs) -> str:
        content, _usage = await full(model_id, messages, **kwargs)
        return content
    return _call
# 99:53
