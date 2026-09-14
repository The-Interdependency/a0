# 40:6 1:1 1:2
# DOC module: guest
# DOC label: Guest Chat
# DOC description: Unauthenticated preview chat endpoint that routes through the currently active provider.
# DOC tier: free
# DOC role: route
# DOC endpoint: POST /api/v1/guest/chat | Send one guest preview message.
import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services.inference import call_provider
from ..services.energy_registry import active_provider
from ..services import public_access_policy

router = APIRouter(prefix="/api/v1/guest", tags=["guest"])

SYSTEM_PROMPT = (
    "You are A0, a focused autonomous AI assistant. "
    "This is a limited guest preview — keep responses concise and helpful. "
    "You can discuss your capabilities and help with general questions."
)


class GuestChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


@router.post("/chat")
async def guest_chat(body: GuestChatBody):
    if not body.message or not body.message.strip():
        raise HTTPException(status_code=400, detail="message is required")

    try:
        provider_id = os.environ.get("PUBLIC_GUEST_PROVIDER") or await active_provider()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    try:
        public_access_policy.enforce_public_provider_policy("free", "single", [provider_id])
    except public_access_policy.PublicAccessDenied as exc:
        raise HTTPException(status_code=503, detail="Guest preview provider is unavailable") from exc

    content, usage = await call_provider(
        provider_id=provider_id,
        messages=[{"role": "user", "content": body.message.strip()}],
        system_prompt=SYSTEM_PROMPT,
        max_tokens=512,
        use_tools=False,
        skip_manifest=True,
    )

    prompt_tokens = usage.get("prompt_tokens") or usage.get("input_tokens", 0)
    completion_tokens = usage.get("completion_tokens") or usage.get("output_tokens", 0)
    tokens_used = (prompt_tokens or 0) + (completion_tokens or 0)
    if tokens_used == 0:
        tokens_used = max(10, len(body.message.split()) + len(content.split()))

    return {"content": content, "tokens_used": tokens_used}
# 40:6 1:1 1:2
