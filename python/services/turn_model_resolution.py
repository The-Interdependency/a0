from __future__ import annotations

from fastapi import HTTPException

from .energy_registry import energy_registry


async def resolve_turn_model(
    *,
    body_model: str | None,
    agent_model_id: str | None,
    conv_model: str | None,
    resolver=None,
) -> tuple[str, str]:
    """Resolve this turn's model to ``(requested_model_id, provider_id)``.

    Precedence is: body.model > forge-agent model > active_provider >
    conversation.model. Unknown *user-supplied* body models fail loudly (400),
    while server-controlled fallbacks preserve current tolerant behavior.
    """
    model_from_body = bool(body_model)
    model_id = (
        body_model
        or agent_model_id
        or energy_registry.get_active_provider()
        or conv_model
    )
    if not model_id:
        raise HTTPException(
            status_code=503,
            detail=(
                "No model resolvable for this turn: no body.model, no agent "
                "model, no active_provider set, and conversation has no "
                "stored model. Set the global default via "
                "POST /api/agents/active-provider."
            ),
        )

    _resolver = resolver
    if _resolver is None:
        from .model_catalog import resolve_model_id
        _resolver = resolve_model_id
    try:
        provider_id, _ = await _resolver(model_id)
    except ValueError:
        if model_from_body:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown model id {model_id!r}. The model picker may "
                    f"be out of date or this id is not registered in the "
                    f"catalog. Refresh the providers list or pick 'auto'."
                ),
            )
        provider_id = energy_registry.get_active_provider() or model_id

    return model_id, provider_id
