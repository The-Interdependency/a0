# 129:0
import os
from sqlalchemy import text as sa_text

BUILTIN_PROVIDERS = {
    "openai": {
        "id": "openai",
        "label": "GPT-5 mini (Responses API)",
        "model": "gpt-5-mini",
        "vendor": "openai",
        "env_key": "OPENAI_API_KEY",
        "cost_per_1k_input": 0.00025,
        "cost_per_1k_output": 0.002,
        "cache_read_per_1k_input": 0.000025,
        "max_tokens": 128000,
        "supports_streaming": False,
        "supports_prompt_caching": True,
        "api_family": "responses",
        "note": "gpt-5-mini default; cached input 90% off (automatic on >=1024 token prefixes)",
    },
    "gemini": {
        "id": "gemini",
        "label": "Gemini 2.5 Flash",
        "model": "gemini-2.5-flash",
        "vendor": "google",
        "env_key": "GEMINI_API_KEY",
        "cost_per_1k_input": 0.0003,
        "cost_per_1k_output": 0.0025,
        "cache_read_per_1k_input": 0.000075,
        "max_tokens": 65536,
        "supports_streaming": True,
        "note": "Implicit cache hits returned via usage.cached_content_token_count when prefix is reused",
    },
    "gemini3": {
        "id": "gemini3",
        "label": "Gemini 3 Pro",
        "model": "gemini-3-pro-preview",
        "vendor": "google",
        "env_key": "GEMINI_API_KEY",
        "cost_per_1k_input": 0.00125,
        "cost_per_1k_output": 0.010,
        "cache_read_per_1k_input": 0.00031,
        "max_tokens": 65536,
        "supports_streaming": True,
        "supports_thinking": True,
        "min_tier": "ws",
        "note": "Top-tier reasoning; ws/admin only. Pricing doubles above 200K input tokens.",
    },
    "claude": {
        "id": "claude",
        "label": "Claude Sonnet 4.5",
        "model": "claude-sonnet-4-5",
        "vendor": "anthropic",
        "env_key": "ANTHROPIC_API_KEY",
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "cache_read_per_1k_input": 0.0003,
        "cache_write_per_1k_input": 0.00375,
        "max_tokens": 64000,
        "supports_streaming": True,
        "supports_prompt_caching": True,
    },
    "grok": {
        "id": "grok",
        "label": "Grok 4 Fast (reasoning)",
        "model": "grok-4-fast-reasoning",
        "vendor": "xai",
        "env_key": "XAI_API_KEY",
        "cost_per_1k_input": 0.0002,
        "cost_per_1k_output": 0.0005,
        "cache_read_per_1k_input": 0.00005,
        "max_tokens": 2000000,
        "supports_streaming": True,
        "supports_reasoning_effort": True,
        "supports_prompt_caching": True,
        "note": "Auto-cache on >=1024 token prefix; cached_tokens reported in prompt_tokens_details",
    },
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
                result = await session.execute(
                    sa_text("SELECT key, model_id, api_identifier, vendor, is_default "
                            "FROM model_registry WHERE enabled = true")
                )
                rows = result.fetchall()
                for row in rows:
                    pid = row[0]
                    if pid not in self._providers:
                        self._providers[pid] = {
                            "id": pid,
                            "label": row[1],
                            "model": row[2],
                            "vendor": row[3],
                            "env_key": "",
                            "cost_per_1k_input": 0.0,
                            "cost_per_1k_output": 0.0,
                            "max_tokens": 8192,
                            "supports_streaming": True,
                        }
                    if row[4]:
                        self._active = pid
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
    ) -> float:
        """Cost in USD. Cache-aware: read tokens billed at cache_read_per_1k_input,
        write tokens at cache_write_per_1k_input, fresh input at full rate.
        prompt_tokens should be the *uncached* fresh input tokens; cache_read
        and cache_write are reported separately by the provider."""
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
# 129:0
