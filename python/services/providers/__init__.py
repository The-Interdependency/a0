# 2:18
"""providers — one module per upstream LLM API.

Each provider module exposes:

    async def call(
        messages: list[dict],
        *,
        role: str = "conduct",
        model_override: str | None = None,
        max_tokens: int = 4096,
        use_tools: bool = True,
        reasoning_effort: str | None = None,
        **kwargs,
    ) -> tuple[str, dict]

`role` selects the model via env > seed `route_config.model_assignments[role]`
> provider spec primary (see _resolver.resolve_model_for_role). The
`model_override` escape hatch is for legacy callers in inference.py that
already know the model id and just want SDK delivery; new callers should
pass `role` instead and let the resolver pick.
"""
from ._resolver import resolve_model_for_role

__all__ = ["resolve_model_for_role"]
# 2:18
