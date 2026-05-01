# 34:4
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.inference import call_energy_provider
from ..services.energy_registry import energy_registry

router = APIRouter(prefix="/api/v1/guest", tags=["guest"])

SYSTEM_PROMPT = (
    "You are A0, a focused autonomous AI assistant. "
    "This is a limited guest preview — keep responses concise and helpful. "
    "You can discuss your capabilities and help with general questions."
)


class GuestChatBody(BaseModel):
    message: str


@router.post("/chat")
async def guest_chat(body: GuestChatBody):
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    # No silent fallback: guest chat can only run if an admin has
    # explicitly set the global active_provider. Refusing with 503 is
    # honest — silently routing to "gemini" disguised the operator
    # intent and made provider switching feel broken.
    provider_id = energy_registry.get_active_provider()
    if not provider_id:
        raise HTTPException(
            status_code=503,
            detail="Guest chat unavailable: no active_provider configured.",
        )

    content, usage = await call_energy_provider(
        provider_id=provider_id,
        messages=[{"role": "user", "content": body.message.strip()}],
        system_prompt=SYSTEM_PROMPT,
        max_tokens=512,
    )

    prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens", 0)
    completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens", 0)
    tokens_used = (prompt_tokens or 0) + (completion_tokens or 0)
    if tokens_used == 0:
        tokens_used = max(10, len(body.message.split()) + len(content.split()))

    return {"content": content, "tokens_used": tokens_used}
# 34:4
