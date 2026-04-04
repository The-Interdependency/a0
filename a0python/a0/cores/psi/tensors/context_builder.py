"""context_builder — assemble effective system prompt from Memory + ModelConfig.

Bridges the Tier 2 continuity substrate (Memory) to the text context sent to
language model adapters.  Called by router.handle() on every request.

All Tier 2 entries are injected verbatim — the memory store is sparse by design
(only Jury-adjudicated writes land there), so no filtering is required.
The assembled block is prepended to any user-configured system_prompt.

Law 4 (read path is free):
    Reads from Memory require no Jury token.  Only writes are adjudicated.
    Injecting memory into context is a read operation — always permitted.

Law 11:
    Logs are not memory.  Only committed Memory entries are injected here;
    event logs are never surfaced into the prompt.
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from a0.memory import Memory


def _format_value(v: object) -> str:
    """Serialize a memory value for inclusion in a text prompt.

    Strings are returned as-is.  All other types are compact-JSON serialized.
    """
    if isinstance(v, str):
        return v
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def build_memory_context(
    memory: "Memory",
    base_system_prompt: Optional[str] = None,
    include: bool = True,
) -> Optional[str]:
    """Assemble the effective system prompt from memory entries + optional base.

    Args:
        memory:             The instance's Memory object (read-only access).
        base_system_prompt: Any user-configured system prompt from ModelConfig.
                            Appended after the memory block when present.
        include:            When False, skip memory injection entirely and return
                            base_system_prompt as-is (None if absent).

    Returns:
        The effective system prompt string, or None if there is nothing to inject.

        Cases:
            include=False, no base          → None
            include=False, base set         → base_system_prompt
            include=True,  no memory keys   → base_system_prompt or None
            include=True,  memory present   → memory_block (+ "\\n\\n" + base if set)
    """
    if not include:
        return base_system_prompt or None

    keys = memory.all_keys()
    if not keys:
        return base_system_prompt or None

    lines = ["## Memory (Committed Continuity)"]
    for k in keys:
        v = memory.recall(k)
        if v is not None:
            lines.append(f"{k}: {_format_value(v)}")

    if len(lines) == 1:
        # Only the header — all recalled values were None (shouldn't happen, but safe)
        return base_system_prompt or None

    block = "\n".join(lines)

    if base_system_prompt:
        return f"{block}\n\n{base_system_prompt}"
    return block
