# 328:125
import contextvars
import json
import os
from pathlib import Path
from typing import Optional

from sqlalchemy import text as sa_text

# Provider catalog and per-provider optimizer presets live as JSON data, not
# code literals (doctrine: no executable-data string literals — model slugs,
# provider IDs, and capability flags must be edit-without-deploy values).
# Source of truth: python/config/providers.json. Loaded once on import.
_PROVIDERS_JSON_PATH = Path(__file__).parent.parent / "config" / "providers.json"
with open(_PROVIDERS_JSON_PATH, "r", encoding="utf-8") as _fh:
    _PROVIDERS_DOC = json.load(_fh)

BUILTIN_PROVIDERS: dict = _PROVIDERS_DOC["providers"]
_PROVIDER_PRESETS: dict[str, dict] = _PROVIDERS_DOC["presets"]
_PROVIDER_PRICING_URLS: dict[str, str] = {
    pid: spec.get("pricing_url", "")
    for pid, spec in BUILTIN_PROVIDERS.items()
    if spec.get("pricing_url")
}

# Per-model pricing manifest — boot source-of-truth for input/output/cached
# rates per individual model id (vs. providers.json which only knows the
# provider flagship's rate). Hydrates ws_modules.route_config.available_models
# on first boot and on POST /api/energy/refresh-pricing/{provider_id}.
_PRICING_JSON_PATH = Path(__file__).parent.parent / "config" / "pricing.json"


def _load_pricing_doc() -> dict:
    with open(_PRICING_JSON_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


_PRICING_DOC: dict = _load_pricing_doc()


def get_pricing_models(provider_id: str) -> list[dict]:
    """Return the per-model pricing list for a provider, or [] if unknown.
    Each entry: {id, context_window, input_per_1m, output_per_1m,
    cached_input_per_1m?, cache_write_per_1m?, supports_vision?, ...}.
    """
    return list(
        _PRICING_DOC.get("providers", {}).get(provider_id, {}).get("models", [])
    )


def get_model_pricing(provider_id: str, model_id: str) -> dict | None:
    """Look up the pricing entry for a specific model. Returns None if either
    the provider or the model is not in pricing.json — caller should fall
    back to provider flagship rate from BUILTIN_PROVIDERS."""
    for entry in get_pricing_models(provider_id):
        if entry.get("id") == model_id:
            return entry
    return None


def reload_pricing_doc() -> dict:
    """Re-read pricing.json from disk. Used by the admin refresh endpoint so
    pricing edits propagate without an uvicorn restart. Returns the full doc."""
    global _PRICING_DOC
    _PRICING_DOC = _load_pricing_doc()
    return _PRICING_DOC

# Mutable runtime caches. Auto-discovery (Phase 5) populates available_models;
# capability detection populates capabilities; per-seed enabled_tools list is
# read from ws_modules.route_config in callers, this dict is a lazy mirror.
_PROVIDER_DEFAULT_ASSIGNMENTS: dict[str, dict] = {}
_PROVIDER_AVAILABLE_MODELS: dict[str, list] = {}
_PROVIDER_CAPABILITIES: dict[str, dict] = {}
_PROVIDER_ENABLED_TOOLS: dict[str, list] = {}


def _preset(record, practice, conduct, perform, derive) -> dict:
    """Deprecated builder kept for any in-tree callers; new code reads
    presets directly from BUILTIN_PROVIDERS / _PROVIDER_PRESETS."""
    return {
        "record": record, "practice": practice, "conduct": conduct,
        "perform": perform, "derive": derive,
    }


class EnergyRegistry:

    def __init__(self):
        self._active: str | None = None
        self._providers: dict = dict(BUILTIN_PROVIDERS)
        self._db_loaded = False

    async def load_from_db(self):
        if self._db_loaded:
            return
        try:
            from ..database import get_session
            async with get_session() as session:
                # Settings table holds the persisted active-provider choice.
                # Created on first boot so we never depend on a phantom schema.
                await session.execute(sa_text(
                    "CREATE TABLE IF NOT EXISTS a0p_settings ("
                    "  key text PRIMARY KEY,"
                    "  value text NOT NULL,"
                    "  updated_at timestamptz NOT NULL DEFAULT NOW()"
                    ")"
                ))
                row = (await session.execute(
                    sa_text("SELECT value FROM a0p_settings WHERE key = 'active_provider'")
                )).first()
                if row and row[0] in self._providers:
                    self._active = row[0]
            self._db_loaded = True
        except Exception:
            self._db_loaded = True

    def list_providers(self) -> list[dict]:
        result = []
        for pid, info in self._providers.items():
            available = bool(os.environ.get(info.get("env_key", ""))) or not info.get("env_key")
            result.append({
                "id": pid,
                "label": info["label"],
                "model": info["model"],
                "vendor": info["vendor"],
                "available": available,
                "active": pid == self._active,
                "min_tier": info.get("min_tier"),
                "supports_thinking": bool(info.get("supports_thinking")),
            })
        return result

    def get_provider(self, provider_id: str) -> dict | None:
        return self._providers.get(provider_id)

    def get_active_provider(self) -> str | None:
        if self._active and self._active in self._providers:
            return self._active
        for pid, info in self._providers.items():
            env_key = info.get("env_key", "")
            if env_key and os.environ.get(env_key):
                self._active = pid
                return pid
        return None

    def set_active_provider(self, provider_id: str) -> bool:
        if provider_id not in self._providers:
            return False
        self._active = provider_id
        return True

    def is_auto_selectable(self, provider_id: str) -> bool:
        """True if this provider may be picked by an automated path
        (active-default resolution, future bandit selector, etc.).

        Providers with `requires_human_instantiation: true` in
        providers.json are gated behind explicit caller selection — the
        directive being that any provider more expensive than the
        gpt-5.5 baseline ($5/$30 per 1M tokens) only spends real money
        when a human deliberately reaches for it. Auto-paths must call
        this and skip flagged providers; explicit per-call provider
        selection bypasses the gate (a human IS the instantiator).
        """
        spec = self._providers.get(provider_id)
        if not spec:
            return False
        return not spec.get("requires_human_instantiation", False)

    async def set_active_provider_persistent(self, provider_id: str) -> bool:
        """Set the active provider in memory AND persist it to model_registry so
        the choice survives uvicorn restarts. Falls back to in-memory-only on DB
        error so a transient outage never breaks switching."""
        if not self.set_active_provider(provider_id):
            return False
        try:
            from ..database import get_session
            async with get_session() as session:
                await session.execute(
                    sa_text(
                        "INSERT INTO a0p_settings (key, value) "
                        "VALUES ('active_provider', :pid) "
                        "ON CONFLICT (key) DO UPDATE "
                        "SET value = EXCLUDED.value, updated_at = NOW()"
                    ),
                    {"pid": provider_id},
                )
        except Exception:
            pass
        return True

    def compose_agent_name(self, base_name: str = "a0(zeta fun alpha echo)") -> str:
        active = self.get_active_provider()
        if active:
            label = self._providers[active]["label"]
            return f"{base_name} {{{label}}}"
        return base_name

    def estimate_cost(
        self,
        provider_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        model: str | None = None,
    ) -> float:
        """Cost in USD. Cache-aware: read tokens billed at cached input rate,
        write tokens at cache_write rate, fresh input at full rate.
        prompt_tokens should be the *uncached* fresh input tokens; cache_read
        and cache_write are reported separately by the provider.

        When `model` is supplied AND found in pricing.json, uses that model's
        per-1M rates. Otherwise falls back to the provider flagship's per-1K
        rates from providers.json. This lets callers that know which model
        they're using get exact per-model cost without forcing every existing
        caller to be updated at once."""
        per_model = get_model_pricing(provider_id, model) if model else None
        if per_model:
            in_rate_1m = float(per_model.get("input_per_1m", 0.0))
            out_rate_1m = float(per_model.get("output_per_1m", 0.0))
            cache_read_rate_1m = float(
                per_model.get("cached_input_per_1m", in_rate_1m)
            )
            cache_write_rate_1m = float(
                per_model.get("cache_write_per_1m", in_rate_1m)
            )
            return (
                (prompt_tokens / 1_000_000) * in_rate_1m
                + (cache_read_tokens / 1_000_000) * cache_read_rate_1m
                + (cache_write_tokens / 1_000_000) * cache_write_rate_1m
                + (completion_tokens / 1_000_000) * out_rate_1m
            )
        # Flagship fallback (legacy per-1K shape from providers.json).
        info = self._providers.get(provider_id)
        if not info:
            return 0.0
        in_rate = info["cost_per_1k_input"]
        out_rate = info["cost_per_1k_output"]
        cache_read_rate = info.get("cache_read_per_1k_input", in_rate)
        cache_write_rate = info.get("cache_write_per_1k_input", in_rate)
        return (
            (prompt_tokens / 1000) * in_rate
            + (cache_read_tokens / 1000) * cache_read_rate
            + (cache_write_tokens / 1000) * cache_write_rate
            + (completion_tokens / 1000) * out_rate
        )

    @staticmethod
    def cache_breakdown(usage: dict) -> dict:
        """Normalize cache fields across providers into a single shape.
        Returns: {fresh_input, cache_read, cache_write, output, hit_ratio}."""
        # Anthropic: input_tokens (fresh), cache_read_input_tokens, cache_creation_input_tokens
        # OpenAI Responses: input_tokens + input_tokens_details.cached_tokens
        # OpenAI Chat: prompt_tokens + prompt_tokens_details.cached_tokens
        cache_read = int(usage.get("cache_read_input_tokens") or 0)
        cache_write = int(usage.get("cache_creation_input_tokens") or 0)
        if not cache_read:
            details = usage.get("input_tokens_details") or usage.get("prompt_tokens_details") or {}
            cache_read = int(details.get("cached_tokens") or 0)
        fresh_input = int(usage.get("input_tokens") or usage.get("prompt_tokens") or 0)
        # Anthropic reports input_tokens as fresh-only; OpenAI reports total (fresh+cached).
        # Normalize to fresh-only by subtracting cached when total >= cached.
        if fresh_input >= cache_read and "cache_read_input_tokens" not in usage:
            fresh_input = fresh_input - cache_read
        output = int(usage.get("output_tokens") or usage.get("completion_tokens") or 0)
        total_input = fresh_input + cache_read + cache_write
        hit_ratio = (cache_read / total_input) if total_input > 0 else 0.0
        return {
            "fresh_input": fresh_input,
            "cache_read": cache_read,
            "cache_write": cache_write,
            "output": output,
            "hit_ratio": round(hit_ratio, 3),
        }


energy_registry = EnergyRegistry()


# --- aimmh-lib bridge -------------------------------------------------------
#
# aimmh-lib's MultiModelHub accepts a single CallFn (async (model_id, messages,
# system_context, max_history) -> ModelResult) and orchestrates fan_out /
# council / daisy_chain / room_all / room_synthesized over it.
#
# Our CallFn delegates to call_energy_provider so all providers, doctrine
# prefix, retry, attachments, and approval gating keep working unchanged.
# Each provider id in BUILTIN_PROVIDERS maps 1:1 to a ModelInstance bound by
# build_hub().
import time as _time


# Per-call usage capture for the multi-model path.
#
# aimmh-lib's CallFn contract is `(model_id, messages) -> str`, so the underlying
# provider's usage dict is discarded by the time the hub returns its
# ModelResult list. To surface honest per-voice token counts and cost without
# breaking aimmh's contract, _aimmh_call_fn writes each call's usage into a
# ContextVar-backed dict keyed by `(model_id, call_idx)` where `call_idx` is
# a per-model counter assigned at call START. This is collision-proof for
# every orchestration mode aimmh exposes:
#   - fan_out: each model called once per slot → call_idx 0..N-1 unambiguous
#   - daisy_chain / room_all / room_synthesized / council: per-model calls
#     are strictly sequential across rounds (round R+1 awaits round R) so
#     start-order == completion-order for any given model, even when
#     different models run concurrently within a round
# Matching is therefore (model, per-model occurrence index in the result
# list) — never by content — so two calls returning identical strings still
# attribute usage to the right card.
#
# ContextVar gives per-async-task isolation so concurrent route handlers
# cannot collide on the global capture state.
_per_call_usage_cv: contextvars.ContextVar[Optional[dict]] = contextvars.ContextVar(
    "a0p_aimmh_per_call_usage", default=None,
)


def reset_per_call_usage() -> dict:
    """Initialize the per-call usage capture state for the current async
    context and return it so callers can read it after the hub returns.
    Shape: {"by_key": {(model_id, call_idx): {usage, content}}, "counters":
    {model_id: next_idx}}."""
    state: dict = {"by_key": {}, "counters": {}}
    _per_call_usage_cv.set(state)
    return state


def get_per_call_usage() -> dict:
    return _per_call_usage_cv.get() or {"by_key": {}, "counters": {}}


async def _aimmh_call_fn(model_id, messages, system_context=None, max_history=30):
    """Bridge aimmh-lib's CallFn signature into call_energy_provider.

    Per aimmh-lib's CallFn contract (conversations.py L13/L39):
        async (model_id: str, messages: list[dict]) -> str
    The library wraps the returned string in a ModelResult itself, including
    routing strings starting with ``[ERROR]`` to ModelResult.error. So we
    MUST return a plain string here — returning a ModelResult would cause
    aimmh's downstream `content.startswith("[ERROR]")` check to crash with
    `'ModelResult' object has no attribute 'startswith'`.

    Side effects:
      * When _per_call_usage_cv has been initialized by the caller, records
        this call's usage in state["by_key"][(model_id, call_idx)] where
        call_idx is a per-model counter assigned at call START. usage=None
        on the error path or when the provider returned no usage dict so
        the UI hides badges instead of lying about a failed call.
      * Publishes `call_start`, `call_progress`, `call_complete`, and
        `call_error` events to the orch_progress bus, keyed by
        (model, call_idx). No-op when no subscriber is registered.
    """
    from .inference import call_energy_provider as _cep
    from . import orch_progress as _op
    state = _per_call_usage_cv.get()
    # Reserve the per-model index BEFORE awaiting so concurrent fan_out calls
    # get distinct call_idx values regardless of completion order.
    call_idx = None
    if state is not None:
        call_idx = state["counters"].get(model_id, 0)
        state["counters"][model_id] = call_idx + 1
    started_at = _time.perf_counter()
    _op.publish("call_start", {
        "model": model_id,
        "call_idx": call_idx if call_idx is not None else 0,
    })
    # Always attach the callback — the chat POST and the EventSource
    # subscription race, and gating here would disable live ticking on
    # the very flow this targets. publish() is cheap when no one listens.
    _ckey = (model_id, call_idx if call_idx is not None else 0)
    def _on_progress(cum_chars: int, cum_tokens_est: int) -> None:
        _op.publish("call_progress", {
            "model": _ckey[0],
            "call_idx": _ckey[1],
            "output_chars": cum_chars,
            "output_tokens_est": cum_tokens_est,
        })
    try:
        content, usage = await _cep(
            provider_id=model_id,
            messages=list(messages or []),
            system_prompt=system_context,
            use_tools=False,
            progress_callback=_on_progress,
        )
        out = content or ""
        elapsed_ms = int((_time.perf_counter() - started_at) * 1000)
        if state is not None:
            state["by_key"][(model_id, call_idx)] = {
                "model_id": model_id,
                "call_idx": call_idx,
                "content": out,
                "usage": dict(usage) if usage else None,
            }
        # Settled per-voice values so the card flips from "↑…" to real numbers.
        ev_payload: dict = {
            "model": model_id,
            "call_idx": call_idx if call_idx is not None else 0,
            "elapsed_ms": elapsed_ms,
            "content_len": len(out),
        }
        if usage:
            try:
                cb = energy_registry.cache_breakdown(usage)
                cost = energy_registry.estimate_cost(
                    model_id,
                    cb.get("fresh_input", 0),
                    cb.get("output", 0),
                    cb.get("cache_read", 0),
                    cb.get("cache_write", 0),
                )
                ev_payload["usage"] = {
                    "input_tokens": cb.get("fresh_input", 0),
                    "output_tokens": cb.get("output", 0),
                    "cache_read_input_tokens": cb.get("cache_read", 0),
                    "cache_creation_input_tokens": cb.get("cache_write", 0),
                    "total_tokens": (
                        cb.get("fresh_input", 0)
                        + cb.get("cache_read", 0)
                        + cb.get("cache_write", 0)
                        + cb.get("output", 0)
                    ),
                }
                ev_payload["cost_usd"] = round(float(cost), 6)
            except Exception:
                ev_payload["usage"] = None
                ev_payload["cost_usd"] = None
        else:
            ev_payload["usage"] = None
            ev_payload["cost_usd"] = None
        _op.publish("call_complete", ev_payload)
        return out
    except Exception as exc:
        # aimmh interprets a "[ERROR] ..." prefix as an error result.
        out = f"[ERROR] {exc}"[:500]
        elapsed_ms = int((_time.perf_counter() - started_at) * 1000)
        if state is not None:
            state["by_key"][(model_id, call_idx)] = {
                "model_id": model_id,
                "call_idx": call_idx,
                "content": out,
                "usage": None,
            }
        _op.publish("call_error", {
            "model": model_id,
            "call_idx": call_idx if call_idx is not None else 0,
            "elapsed_ms": elapsed_ms,
            "error": str(exc)[:200],
        })
        return out


_HUB_CACHE: dict = {"hub": None}


def build_hub():
    """Return a MultiModelHub bound to our provider call function.

    Lazy import so test harnesses without aimmh-lib still load this module.
    """
    from aimmh_lib import MultiModelHub
    return MultiModelHub(_aimmh_call_fn)


def get_multi_model_hub():
    """Cached singleton MultiModelHub. Built on first access from BUILTIN_PROVIDERS.

    The hub is intentionally process-global because aimmh's CallFn is stateless
    — every call resolves the active provider list per orchestration_mode.
    Raises RuntimeError naming the missing dependency if aimmh_lib is absent.
    """
    if _HUB_CACHE["hub"] is not None:
        return _HUB_CACHE["hub"]
    try:
        from aimmh_lib import MultiModelHub  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(
            "aimmh_lib is not installed. Run: uv add aimmh-lib. "
            f"underlying ImportError: {exc!s}"
        ) from exc
    _HUB_CACHE["hub"] = build_hub()
    return _HUB_CACHE["hub"]


def build_model_instances() -> dict:
    """Construct one aimmh ModelInstance per BUILTIN_PROVIDERS entry that has
    an active env key. Returns {provider_id: ModelInstance}. Useful for
    callers that want stateful per-provider conversation history."""
    from aimmh_lib import ModelInstance
    out: dict = {}
    for pid, info in BUILTIN_PROVIDERS.items():
        env_key = info.get("env_key", "")
        if env_key and not os.environ.get(env_key):
            continue
        out[pid] = ModelInstance(_aimmh_call_fn, pid)
    return out


def resolve_providers(providers: list[str] | None) -> list[str]:
    """Resolve ['active'] / [] / None into a concrete list of provider ids."""
    if not providers or providers == ["active"]:
        active = energy_registry.get_active_provider()
        return [active] if active else []
    out: list[str] = []
    for p in providers:
        if p == "active":
            a = energy_registry.get_active_provider()
            if a and a not in out:
                out.append(a)
        elif p in BUILTIN_PROVIDERS and p not in out:
            out.append(p)
    return out
# 328:125
