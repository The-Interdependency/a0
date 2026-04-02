import os

PROVIDERS = {
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

    def list_providers(self) -> list[dict]:
        result = []
        for pid, info in PROVIDERS.items():
            available = bool(os.environ.get(info["env_key"]))
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
        return PROVIDERS.get(provider_id)

    def get_active_provider(self) -> str | None:
        if self._active and self._active in PROVIDERS:
            return self._active
        for pid, info in PROVIDERS.items():
            if os.environ.get(info["env_key"]):
                self._active = pid
                return pid
        return None

    def set_active_provider(self, provider_id: str) -> bool:
        if provider_id not in PROVIDERS:
            return False
        self._active = provider_id
        return True

    def compose_agent_name(self, base_name: str = "a0(zeta fun alpha echo)") -> str:
        active = self.get_active_provider()
        if active:
            label = PROVIDERS[active]["label"]
            return f"{base_name} {{{label}}}"
        return base_name

    def estimate_cost(self, provider_id: str, prompt_tokens: int, completion_tokens: int) -> float:
        info = PROVIDERS.get(provider_id)
        if not info:
            return 0.0
        return (
            (prompt_tokens / 1000) * info["cost_per_1k_input"]
            + (completion_tokens / 1000) * info["cost_per_1k_output"]
        )


energy_registry = EnergyRegistry()
