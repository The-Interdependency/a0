"""
Adapter factory for a0.

Reads A0_MODEL from config (set in .env or shell) and returns the
appropriate adapter instance. Falls back to LocalEchoAdapter if the
model name is unrecognised or no key is configured.
"""

from __future__ import annotations

from .. import config
from .local_adapter import LocalEchoAdapter


def get_adapter():
    """Return the adapter selected by A0_MODEL env var."""
    model = (config.A0_MODEL or "local").lower().strip()

    if model == "claude":
        from .anthropic_adapter import AnthropicAdapter
        return AnthropicAdapter(api_key=config.ANTHROPIC_API_KEY)

    if model == "openai":
        from .openai_adapter import OpenAIAdapter
        return OpenAIAdapter(api_key=config.OPENAI_API_KEY)

    if model == "gemini":
        from .gemini_adapter import GeminiAdapter
        return GeminiAdapter(api_key=config.GEMINI_API_KEY)

    if model == "grok":
        from .openai_adapter import OpenAIAdapter
        return OpenAIAdapter(
            api_key=config.GROK_API_KEY,
            base_url="https://api.x.ai/v1",
            model="grok-3-mini",
        )

    if model == "deepseek":
        from .openai_adapter import OpenAIAdapter
        return OpenAIAdapter(
            api_key=config.DEEPSEEK_API_KEY,
            base_url="https://api.deepseek.com/v1",
            model="deepseek-chat",
        )

    if model == "github":
        from .github_adapter import GitHubAdapter
        return GitHubAdapter(token=config.GITHUB_TOKEN)

    return LocalEchoAdapter()


__all__ = ["get_adapter", "LocalEchoAdapter"]
