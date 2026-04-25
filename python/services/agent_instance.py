# 112:47
"""AgentInstance — runtime handle for "the thing that calls a model".

Unifies three concepts that previously each had bespoke plumbing:

  1. Forge agents      — rows in `agent_instances` (model_id + system_prompt
                         + enabled_tools + persona)
  2. Spawned subagents — children forked from PCNA via /api/v1/agents/spawn
  3. Pinned/ad-hoc     — chat single-mode, focus, cli — no DB row, just
                         "use this model with this system prompt for this
                          user"

All three converge on the same operation: send a message history, get back
(content, usage). AgentInstance is that operation. Internally it builds a
CallFn via make_call_fn_full and threads tier/kill-switch enforcement
through the canonical adapter.

Honest semantics:
  - Construction never calls a model. .run() is the only side-effect.
  - .run() raises ValueError / PermissionError / RuntimeError exactly as
    call_model does — no swallowing.
  - .provider_id is the resolved provider AFTER first .run(). It's
    populated lazily; use .ensure_resolved() if you need it before calling.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .call_fn import call_model, make_call_fn_full
from .model_catalog import resolve_model_id


@dataclass
class AgentInstance:
    """A bound (model_id + system_prompt + tools + user_id) ready to .run().

    Construct via the from_* classmethods unless you really want raw control.
    The fields are public so callers can inspect what's about to be sent —
    we don't hide the model behind opaque IDs.
    """
    model_id: str
    system_prompt: Optional[str] = None
    use_tools: bool = True
    user_id: Optional[str] = None
    # Free-form metadata that travels with the instance for traceability —
    # forge agent id, persona name, archetype, etc. Never sent to the model.
    meta: dict[str, Any] = field(default_factory=dict)
    # Set by ensure_resolved() / first run(). The resolved provider id is
    # what callers should persist as message.model and pass to the approval
    # / billing pipelines.
    provider_id: Optional[str] = None
    # Gating overrides — default True (fail closed). Pass enforce_tier=False
    # for internal callers that already gated upstream (e.g. chat.py runs
    # its own multi-provider gate before delegating to single-mode).
    enforce_tier: bool = True
    enforce_enabled: bool = True

    async def ensure_resolved(self) -> str:
        """Resolve model_id → provider_id without calling the model.

        Useful when the caller needs provider_id before run() (e.g. to
        persist on a user message before the assistant turn lands).
        """
        if self.provider_id is None:
            self.provider_id, _spec = await resolve_model_id(self.model_id)
        return self.provider_id

    async def run(
        self,
        messages: list[dict],
        *,
        system_prompt_override: Optional[str] = None,
        max_tokens: int = 8000,
        skip_approval: bool = False,
        reasoning_effort: Optional[str] = None,
    ) -> tuple[str, dict]:
        """Send history, return (content, usage). Single seam to the model.

        system_prompt_override is for one-off augmentation (e.g. focus
        directive prepended for one turn) without mutating the instance.
        """
        prompt = (
            system_prompt_override
            if system_prompt_override is not None
            else self.system_prompt
        )
        content, usage = await call_model(
            self.model_id,
            messages,
            user_id=self.user_id,
            system_prompt=prompt,
            max_tokens=max_tokens,
            use_tools=self.use_tools,
            skip_approval=skip_approval,
            reasoning_effort=reasoning_effort,
            enforce_tier=self.enforce_tier,
            enforce_enabled=self.enforce_enabled,
        )
        # Cache the resolved provider for downstream persistence/logging.
        if self.provider_id is None:
            self.provider_id, _spec = await resolve_model_id(self.model_id)
        return content, usage

    # ---- Constructors --------------------------------------------------

    @classmethod
    def from_model(
        cls,
        model_id: str,
        *,
        user_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        use_tools: bool = True,
        enforce_tier: bool = True,
        enforce_enabled: bool = True,
    ) -> "AgentInstance":
        """Bare-bones — what chat single-mode / focus / cli need."""
        return cls(
            model_id=model_id,
            system_prompt=system_prompt,
            use_tools=use_tools,
            user_id=user_id,
            enforce_tier=enforce_tier,
            enforce_enabled=enforce_enabled,
        )

    @classmethod
    async def from_agent_id(
        cls,
        agent_id: int,
        user_id: str,
        *,
        enforce_tier: bool = True,
        enforce_enabled: bool = True,
    ) -> "AgentInstance":
        """Load a forge agent row and bind it. Owner-scoped — raises if
        the agent doesn't exist OR isn't owned by user_id (no info leak).
        """
        from sqlalchemy import text as sa_text
        from ..database import get_session
        async with get_session() as session:
            row = (await session.execute(sa_text(
                "SELECT id, model_id, system_prompt, enabled_tools, "
                "name, archetype, personality "
                "FROM agent_instances "
                "WHERE id = :id AND owner_id = :uid AND is_template = false"
            ), {"id": agent_id, "uid": user_id})).mappings().first()
        if not row:
            raise PermissionError(
                f"Agent {agent_id} not found or not owned by caller"
            )
        # enabled_tools is jsonb — empty list / null both mean "no tools".
        tools = row["enabled_tools"] or []
        return cls(
            model_id=row["model_id"],
            system_prompt=row["system_prompt"],
            use_tools=bool(tools),
            user_id=user_id,
            enforce_tier=enforce_tier,
            enforce_enabled=enforce_enabled,
            meta={
                "agent_id": row["id"],
                "agent_name": row["name"],
                "archetype": row["archetype"],
                "personality": row["personality"],
                "enabled_tools": list(tools) if isinstance(tools, list) else [],
            },
        )

    def __repr__(self) -> str:
        return (
            f"AgentInstance(model_id={self.model_id!r}, "
            f"user_id={self.user_id!r}, "
            f"tools={self.use_tools}, "
            f"resolved={self.provider_id!r})"
        )
# 112:47
