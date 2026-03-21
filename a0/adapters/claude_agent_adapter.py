"""ClaudeAgentAdapter — ModelAdapter wrapping claude-agent-sdk.

This adapter wires the PTCA architecture into the claude-agent-sdk:

- Parent agent (Meta-13 role): orchestrates the full pipeline
- Subagents: Phi, Psi, Omega (private cores), Jury (adjudication), Bandit (advisory)
- Guardian is the sole emitter — enforced by the parent agent's system prompt

Law 9: Guardian alone owns human-readable outward emission.
Law 13: Meta-13 chooses; advisory layers (Bandit) may influence salience only.
"""
from __future__ import annotations

import anyio
from typing import Any, Dict, List

from .subagents import MODE_SUBAGENTS, ALL_SUBAGENTS

try:
    from claude_agent_sdk import (
        query,
        ClaudeAgentOptions,
        ResultMessage,
        CLINotFoundError,
        CLIConnectionError,
    )
    _SDK_AVAILABLE = True
except ImportError:
    _SDK_AVAILABLE = False

Message = Dict[str, str]

# System prompt for the Meta-13 parent agent (orchestrator).
# Enforces Guardian emission law and PTCA architectural constraints.
_META13_SYSTEM_PROMPT = """\
You are Meta-13, the executive chooser in the PTCA architecture.

Your role:
- Receive fast-path sentinel witness data and slow-path cognition from subagents
- Integrate Phi (structural analysis), Psi (semantic analysis), and Omega (synthesis)
- Consult Jury before committing any persistent state
- Use Bandit for advisory salience ordering only — Bandit does not choose
- Produce the final executive response

PTCA Core Laws you must enforce:
1. Private process is not public output — do not expose subagent internal reasoning
2. Conflict must remain visible when unresolved — never silently merge conflicts
3. Bandit advice is upstream salience only — you make the final choice
4. Guardian owns outward emission — your final response IS the Guardian-emitted output
5. Missing required invariants fail closed — if hmmm is absent, block the output

When subagents return results:
- Phi/Psi/Omega results are private cognition — integrate them, do not re-emit them verbatim
- Jury verdict must be checked before any commit-level response
- Bandit ordering is advisory — you may accept or override it
- Your final output is the only outward emission (Guardian boundary)
"""


class ClaudeAgentAdapter:
    """ModelAdapter wrapping claude-agent-sdk with PTCA subagent architecture.

    Falls back to a descriptive error if the SDK is not available or the
    Claude Code CLI is not running. Does not fall back to LocalEchoAdapter —
    the caller (router) is responsible for fallback selection.
    """

    name = "claude-agent"

    def __init__(
        self,
        mode: str = "analyze",
        cwd: str | None = None,
        max_turns: int = 20,
    ) -> None:
        self._mode = mode
        self._cwd = cwd
        self._max_turns = max_turns

    def complete(self, messages: List[Message], **kwargs: Any) -> Dict[str, Any]:
        """Run the PTCA agent pipeline synchronously.

        Spawns Phi/Psi/Omega cores, Jury, and Bandit as subagents.
        Meta-13 (the parent agent) integrates their outputs and emits
        through the Guardian boundary.

        Returns {"text": ..., "raw": ..., "subagents_used": [...]}
        """
        if not _SDK_AVAILABLE:
            return {
                "text": "[ClaudeAgentAdapter] claude-agent-sdk not installed.",
                "raw": {},
                "subagents_used": [],
            }

        mode = kwargs.get("mode", self._mode)
        prompt = self._build_prompt(messages)
        subagents = MODE_SUBAGENTS.get(mode, ALL_SUBAGENTS)

        try:
            return anyio.run(self._run_async, prompt, subagents, mode)
        except CLINotFoundError:
            return {
                "text": (
                    "[ClaudeAgentAdapter] Claude Code CLI not found. "
                    "Install claude-agent-sdk and ensure the CLI is available."
                ),
                "raw": {},
                "subagents_used": [],
            }
        except CLIConnectionError as e:
            return {
                "text": f"[ClaudeAgentAdapter] CLI connection error: {e}",
                "raw": {},
                "subagents_used": [],
            }

    async def _run_async(
        self,
        prompt: str,
        subagents: Dict[str, Any],
        mode: str,
    ) -> Dict[str, Any]:
        result_text = ""
        subagents_invoked: list[str] = []

        options = ClaudeAgentOptions(
            system_prompt=_META13_SYSTEM_PROMPT,
            allowed_tools=["Read", "Grep", "Glob", "Agent"],
            agents=subagents,
            max_turns=self._max_turns,
            permission_mode="acceptEdits",
            **({"cwd": self._cwd} if self._cwd else {}),
        )

        async for message in query(prompt=prompt, options=options):
            if isinstance(message, ResultMessage):
                result_text = message.result or ""
            # Track which subagents were invoked (if available in message metadata)
            if hasattr(message, "content") and message.content:
                for block in (message.content if isinstance(message.content, list) else []):
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        if block.get("name") in ("Task", "Agent"):
                            agent_name = (block.get("input") or {}).get("subagent_type", "")
                            if agent_name:
                                subagents_invoked.append(agent_name)

        return {
            "text": result_text,
            "raw": {"mode": mode},
            "subagents_used": subagents_invoked,
        }

    @staticmethod
    def _build_prompt(messages: List[Message]) -> str:
        """Convert message history into a single prompt string."""
        parts = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "user":
                parts.append(content)
            elif role == "assistant":
                parts.append(f"[prior assistant turn]: {content}")
        return "\n\n".join(parts) if parts else ""
