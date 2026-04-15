# 129:0
import os
from sqlalchemy import text as sa_text

BUILTIN_PROVIDERS = {
    "openai": {
        "id": "openai",
        "label": "GPT-5.4 (Responses API)",
        "model": "gpt-5.4",
        "vendor": "openai",
        "env_key": "OPENAI_API_KEY",
        "cost_per_1k_input": 0.008,
        "cost_per_1k_output": 0.032,
        "max_tokens": 16384,
        "supports_streaming": False,
        "api_family": "responses",
        "note": "gpt-5.4 estimated rates; update when OpenAI publishes official pricing",
    },
    "gemini": {
        "id": "gemini",
        "label": "Gemini 2.5 Flash",
        "model": "gemini-2.5-flash",
        "vendor": "google",
        "env_key": "GEMINI_API_KEY",
        "cost_per_1k_input": 0.00015,
        "cost_per_1k_output": 0.00060,
        "max_tokens": 65536,
        "supports_streaming": True,
    },
    "claude": {
        "id": "claude",
        "label": "Claude 3.5 Haiku",
        "model": "claude-3-5-haiku-20241022",
        "vendor": "anthropic",
        "env_key": "ANTHROPIC_API_KEY",
        "cost_per_1k_input": 0.001,
        "cost_per_1k_output": 0.005,
        "max_tokens": 8192,
        "supports_streaming": True,
    },
    "grok": {
        "id": "grok",
        "label": "Grok 4.1 Fast",
        "model": "grok-4-1-fast-non-reasoning",
        "vendor": "xai",
        "env_key": "XAI_API_KEY",
        "cost_per_1k_input": 0.0002,
        "cost_per_1k_output": 0.0005,
        "max_tokens": 131072,
        "supports_streaming": True,
    },
}

# Per-provider env var prefixes for each role
_PROVIDER_ENV_PREFIXES = {
    "openai": "OPENAI",
    "grok": "XAI",
    "gemini": "GEMINI",
    "claude": "ANTHROPIC",
}

# Default role→model assignments per provider (fallback when no env var or seed config)
_PROVIDER_DEFAULT_ASSIGNMENTS: dict[str, dict[str, str]] = {
    "openai": {
        "record": "gpt-5.4-nano",
        "practice": "gpt-5.4-mini",
        "conduct": "gpt-5.4",
        "perform": "gpt-5.4",
        "derive": "gpt-5.4-pro",
    },
    "grok": {
        "record": "grok-4-1-fast-non-reasoning",
        "practice": "grok-4-1-fast-non-reasoning",
        "conduct": "grok-4-1-fast-reasoning",
        "perform": "grok-4-1-fast-reasoning",
        "derive": "grok-4.20-0309-reasoning",
    },
    "gemini": {
        "record": "gemini-2.5-flash-lite",
        "practice": "gemini-2.5-flash",
        "conduct": "gemini-2.5-flash",
        "perform": "gemini-2.5-pro",
        "derive": "gemini-2.5-pro",
    },
    "claude": {
        "record": "claude-3-5-haiku-20241022",
        "practice": "claude-3-5-haiku-20241022",
        "conduct": "claude-3-5-sonnet-20241022",
        "perform": "claude-3-5-sonnet-20241022",
        "derive": "claude-opus-4-5",
    },
}

# Optimizer presets per provider
_PROVIDER_PRESETS: dict[str, dict[str, dict[str, str]]] = {
    "openai": {
        "speed":      {"record": "gpt-5.4-nano",  "practice": "gpt-5.4-mini",         "conduct": "gpt-5.4-mini",  "perform": "gpt-5.4",     "derive": "gpt-5.4"},
        "depth":      {"record": "gpt-5.4-nano",  "practice": "gpt-5.4",              "conduct": "gpt-5.4",       "perform": "gpt-5.4-pro", "derive": "gpt-5.4-pro"},
        "price":      {"record": "gpt-5.4-nano",  "practice": "gpt-5.4-nano",         "conduct": "gpt-5.4-mini",  "perform": "gpt-5.4-mini","derive": "gpt-5.4"},
        "balance":    {"record": "gpt-5.4-nano",  "practice": "gpt-5.4-mini",         "conduct": "gpt-5.4",       "perform": "gpt-5.4",     "derive": "gpt-5.4-pro"},
        "creativity": {"record": "gpt-5.4-nano",  "practice": "gpt-5.4",              "conduct": "gpt-5.4-pro",   "perform": "gpt-5.4-pro", "derive": "gpt-5.4-pro"},
        "coding":     {"record": "gpt-4o-mini",   "practice": "codex-mini-latest",    "conduct": "gpt-4o",        "perform": "gpt-4o",      "derive": "o1"},
    },
    "grok": {
        "speed":      {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-non-reasoning", "conduct": "grok-4-1-fast-non-reasoning", "perform": "grok-4-1-fast-non-reasoning", "derive": "grok-4-1-fast-reasoning"},
        "depth":      {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-non-reasoning", "conduct": "grok-4-1-fast-reasoning",     "perform": "grok-4-1-fast-reasoning",     "derive": "grok-4.20-0309-reasoning"},
        "price":      {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-non-reasoning", "conduct": "grok-4-1-fast-non-reasoning", "perform": "grok-4-1-fast-non-reasoning", "derive": "grok-4-1-fast-reasoning"},
        "balance":    {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-non-reasoning", "conduct": "grok-4-1-fast-reasoning",     "perform": "grok-4-1-fast-reasoning",     "derive": "grok-4.20-0309-reasoning"},
        "creativity": {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-reasoning",     "conduct": "grok-4-1-fast-reasoning",     "perform": "grok-4.20-0309-reasoning",    "derive": "grok-4.20-0309-reasoning"},
        "coding":     {"record": "grok-4-1-fast-non-reasoning", "practice": "grok-4-1-fast-reasoning",     "conduct": "grok-4-1-fast-reasoning",     "perform": "grok-4-1-fast-reasoning",     "derive": "grok-4.20-0309-reasoning"},
    },
    "gemini": {
        "speed":      {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-flash-lite", "conduct": "gemini-2.5-flash", "perform": "gemini-2.5-flash", "derive": "gemini-2.5-flash"},
        "depth":      {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-flash",      "conduct": "gemini-2.5-flash", "perform": "gemini-2.5-pro",   "derive": "gemini-2.5-pro"},
        "price":      {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-flash-lite", "conduct": "gemini-2.5-flash-lite", "perform": "gemini-2.5-flash", "derive": "gemini-2.5-flash"},
        "balance":    {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-flash",      "conduct": "gemini-2.5-flash", "perform": "gemini-2.5-flash", "derive": "gemini-2.5-pro"},
        "creativity": {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-flash",      "conduct": "gemini-2.5-pro",   "perform": "gemini-2.5-pro",   "derive": "gemini-2.5-pro"},
        "coding":     {"record": "gemini-2.5-flash-lite", "practice": "gemini-2.5-pro",        "conduct": "gemini-2.5-flash", "perform": "gemini-2.5-flash", "derive": "gemini-2.5-pro"},
    },
    "claude": {
        "speed":      {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-haiku-20241022",   "conduct": "claude-3-5-haiku-20241022",   "perform": "claude-3-5-sonnet-20241022", "derive": "claude-3-5-sonnet-20241022"},
        "depth":      {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-sonnet-20241022",  "conduct": "claude-3-5-sonnet-20241022",  "perform": "claude-opus-4-5",            "derive": "claude-opus-4-5"},
        "price":      {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-haiku-20241022",   "conduct": "claude-3-5-haiku-20241022",   "perform": "claude-3-5-haiku-20241022",  "derive": "claude-3-5-sonnet-20241022"},
        "balance":    {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-haiku-20241022",   "conduct": "claude-3-5-sonnet-20241022",  "perform": "claude-3-5-sonnet-20241022", "derive": "claude-opus-4-5"},
        "creativity": {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-sonnet-20241022",  "conduct": "claude-3-5-sonnet-20241022",  "perform": "claude-opus-4-5",            "derive": "claude-opus-4-5"},
        "coding":     {"record": "claude-3-5-haiku-20241022", "practice": "claude-3-5-sonnet-20241022",  "conduct": "claude-3-5-sonnet-20241022",  "perform": "claude-3-5-sonnet-20241022", "derive": "claude-opus-4-5"},
    },
}

# Provider seed initial available_models
_PROVIDER_AVAILABLE_MODELS: dict[str, list[dict]] = {
    "openai": [
        {"id": "gpt-5.4-nano", "context_window": 32768, "pricing": {"input_per_1m": 0.15, "output_per_1m": 0.60}, "capabilities": {"reasoning": False, "search": False}},
        {"id": "gpt-5.4-mini", "context_window": 65536, "pricing": {"input_per_1m": 0.40, "output_per_1m": 1.60}, "capabilities": {"reasoning": False, "search": False}},
        {"id": "gpt-5.4", "context_window": 131072, "pricing": {"input_per_1m": 8.00, "output_per_1m": 32.00}, "capabilities": {"reasoning": False, "search": True}},
        {"id": "gpt-5.4-pro", "context_window": 131072, "pricing": {"input_per_1m": 40.00, "output_per_1m": 160.00}, "capabilities": {"reasoning": True, "search": True}},
    ],
    "grok": [
        {"id": "grok-4-1-fast-non-reasoning", "context_window": 131072, "pricing": {"input_per_1m": 0.20, "output_per_1m": 0.50}, "capabilities": {"reasoning": False, "search": True}},
        {"id": "grok-4-1-fast-reasoning", "context_window": 131072, "pricing": {"input_per_1m": 0.20, "output_per_1m": 0.50}, "capabilities": {"reasoning": True, "search": True}},
        {"id": "grok-4.20-0309-reasoning", "context_window": 131072, "pricing": {"input_per_1m": 2.00, "output_per_1m": 6.00}, "capabilities": {"reasoning": True, "search": True}},
        {"id": "grok-4.20-multi-agent-0309", "context_window": 131072, "pricing": {"input_per_1m": 2.00, "output_per_1m": 6.00}, "capabilities": {"reasoning": True, "search": True, "multi_agent": True}, "note": "reserved for sub-agent coordination"},
    ],
    "gemini": [
        {"id": "gemini-2.5-flash-lite", "context_window": 65536, "pricing": {"input_per_1m": 0.10, "output_per_1m": 0.40}, "capabilities": {"reasoning": False, "grounding": False}},
        {"id": "gemini-2.5-flash", "context_window": 1048576, "pricing": {"input_per_1m": 0.15, "output_per_1m": 0.60}, "capabilities": {"reasoning": False, "grounding": True}},
        {"id": "gemini-2.5-pro", "context_window": 2097152, "pricing": {"input_per_1m": 1.25, "output_per_1m": 5.00}, "capabilities": {"reasoning": True, "grounding": True}},
    ],
    "claude": [
        {"id": "claude-3-5-haiku-20241022", "context_window": 200000, "pricing": {"input_per_1m": 1.00, "output_per_1m": 5.00}, "capabilities": {"reasoning": False, "extended_thinking": False}},
        {"id": "claude-3-5-sonnet-20241022", "context_window": 200000, "pricing": {"input_per_1m": 3.00, "output_per_1m": 15.00}, "capabilities": {"reasoning": False, "extended_thinking": True}},
        {"id": "claude-opus-4-5", "context_window": 200000, "pricing": {"input_per_1m": 15.00, "output_per_1m": 75.00}, "capabilities": {"reasoning": True, "extended_thinking": True}},
    ],
}

_PROVIDER_PRICING_URLS = {
    "openai": "https://openai.com/api/pricing",
    "grok": "https://x.ai/api",
    "gemini": "https://ai.google.dev/pricing",
    "claude": "https://www.anthropic.com/pricing",
}

_PROVIDER_CAPABILITIES = {
    "openai": {"responses_api": True, "tool_use": True, "structured_output": True},
    "grok": {"native_search": True, "tool_use": True, "streaming": True},
    "gemini": {"grounding": True, "tool_use": True, "streaming": True, "long_context": True},
    "claude": {"extended_thinking": True, "tool_use": True, "streaming": True},
}

_PROVIDER_ENABLED_TOOLS = {
    "openai": ["search", "fetch", "code_exec", "filesystem", "email_draft", "calendar_read", "github_gated"],
    "grok": ["search", "fetch", "code_exec", "filesystem"],
    "gemini": ["search", "fetch", "code_exec", "filesystem"],
    "claude": ["search", "fetch", "code_exec", "filesystem"],
}

_PROVIDER_API_URLS = {
    "grok": "https://api.x.ai/v1",
    "gemini": None,  # uses google-genai SDK
    "claude": None,  # uses anthropic SDK
    "openai": "https://api.openai.com/v1",
}


class EnergyRegistry:

    def __init__(self):
        self._active: str | None = None
        self._providers: dict = dict(BUILTIN_PROVIDERS)
        self._db_loaded = False
        # Cache of provider seed route_config (populated on demand from DB)
        self._seed_cache: dict[str, dict] = {}

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

    async def _load_seed_config(self, provider_id: str) -> dict:
        """Load the provider seed route_config from DB, return {} if absent."""
        if provider_id in self._seed_cache:
            return self._seed_cache[provider_id]
        try:
            from ..database import get_session
            async with get_session() as session:
                result = await session.execute(
                    sa_text("SELECT route_config FROM ws_modules WHERE slug = :slug AND status = 'system'"),
                    {"slug": f"provider::{provider_id}"}
                )
                row = result.fetchone()
                if row and row[0]:
                    cfg = row[0] if isinstance(row[0], dict) else {}
                    self._seed_cache[provider_id] = cfg
                    return cfg
        except Exception:
            pass
        return {}

    def invalidate_seed_cache(self, provider_id: str | None = None):
        """Invalidate cached seed config for a provider (or all)."""
        if provider_id:
            self._seed_cache.pop(provider_id, None)
        else:
            self._seed_cache.clear()

    def _env_for_role(self, provider_id: str, role: str) -> str:
        """
        Resolve env var for a provider+role.
        Spec: 'perform' unconditionally shares the CONDUCT env var —
        there is no separate *_MODEL_PERFORM variable; use *_MODEL_CONDUCT for both.
        """
        prefix = _PROVIDER_ENV_PREFIXES.get(provider_id, provider_id.upper())
        env_role = "CONDUCT" if role == "perform" else role.upper()
        return os.environ.get(f"{prefix}_MODEL_{env_role}", "")

    def resolve_model_for_role(self, provider_id: str, role: str) -> str:
        """
        Synchronous fallback model resolution (no DB access).
        Priority: env var (with perform→conduct fallback) > default assignment > builtin model
        """
        env_val = self._env_for_role(provider_id, role)
        if env_val:
            return env_val
        defaults = _PROVIDER_DEFAULT_ASSIGNMENTS.get(provider_id, {})
        if role in defaults:
            return defaults[role]
        info = self._providers.get(provider_id, {})
        return info.get("model", "gpt-5.4")

    async def resolve_model_for_role_async(self, provider_id: str, role: str) -> str:
        """
        Full async model resolution with DB seed lookup.
        Priority: env var > seed route_config.model_assignments > default assignment > builtin
        perform role falls back to conduct env var when PERFORM env var is absent.
        """
        env_val = self._env_for_role(provider_id, role)
        if env_val:
            return env_val
        cfg = await self._load_seed_config(provider_id)
        assignments = cfg.get("model_assignments", {})
        if role in assignments:
            return assignments[role]
        defaults = _PROVIDER_DEFAULT_ASSIGNMENTS.get(provider_id, {})
        if role in defaults:
            return defaults[role]
        info = self._providers.get(provider_id, {})
        return info.get("model", "gpt-5.4")

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

    def estimate_cost(self, provider_id: str, prompt_tokens: int, completion_tokens: int) -> float:
        info = self._providers.get(provider_id)
        if not info:
            return 0.0
        return (
            (prompt_tokens / 1000) * info["cost_per_1k_input"]
            + (completion_tokens / 1000) * info["cost_per_1k_output"]
        )


energy_registry = EnergyRegistry()
# 129:0
