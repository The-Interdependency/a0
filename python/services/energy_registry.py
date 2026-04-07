import os
from sqlalchemy import text as sa_text

BUILTIN_PROVIDERS = {
    "openai": {
        "id": "openai",
        "label": "GPT-5.4 (Responses API)",
        "model": "gpt-5.4",
        "vendor": "openai",
        "env_key": "OPENAI_API_KEY",
        "cost_per_1k_input": 0.0025,
        "cost_per_1k_output": 0.01,
        "max_tokens": 16384,
        "supports_streaming": False,
        "api_family": "responses",
        "note": "gpt-5.4 pricing TBD; using gpt-4o placeholder rates",
    },
    "gemini": {
        "id": "gemini",
        "label": "Gemini 2.5 Pro",
        "model": "gemini-2.5-pro-preview-05-06",
        "vendor": "google",
        "env_key": "GEMINI_API_KEY",
        "cost_per_1k_input": 0.00125,
        "cost_per_1k_output": 0.005,
        "max_tokens": 65536,
        "supports_streaming": True,
    },
    "claude": {
        "id": "claude",
        "label": "Claude 3.5 Sonnet",
        "model": "claude-3-5-sonnet-20241022",
        "vendor": "anthropic",
        "env_key": "ANTHROPIC_API_KEY",
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "max_tokens": 8192,
        "supports_streaming": True,
    },
    "grok": {
        "id": "grok",
        "label": "Grok 3",
        "model": "grok-3-latest",
        "vendor": "xai",
        "env_key": "XAI_API_KEY",
        "cost_per_1k_input": 0.003,
        "cost_per_1k_output": 0.015,
        "max_tokens": 131072,
        "supports_streaming": True,
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
