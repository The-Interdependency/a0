"""agent — AgentZero, the single importable entry point for a0.

Usage::

    from a0.agent import AgentZero

    az = AgentZero()
    resp = az.run("what is the hmmm invariant?")
    print(resp.result["text"])

Model selection is driven by the .env tensor (A0_MODEL).
See a0/cores/psi/tensors/env.py for configuration.
"""
from __future__ import annotations

import uuid
from typing import List, Optional

from a0.cores.psi.tensors.contract import A0Request, A0Response, Mode
from a0.cores.psi.tensors.router import handle


class AgentZero:
    """The a0 agent — routes requests through the PTCA pipeline.

    Adapter (model) is selected at call time from the env tensor,
    so changing A0_MODEL in settings takes effect immediately.
    """

    def run(
        self,
        text: str,
        mode: Mode = "analyze",
        tools: Optional[List[str]] = None,
        hmmm: Optional[List[str]] = None,
    ) -> A0Response:
        req = A0Request(
            task_id=str(uuid.uuid4()),
            input={"text": text, "files": []},
            tools_allowed=tools or ["none"],
            mode=mode,
            hmmm=hmmm or [],
        )
        return handle(req)

    async def run_async(
        self,
        text: str,
        mode: Mode = "analyze",
        tools: Optional[List[str]] = None,
        hmmm: Optional[List[str]] = None,
    ) -> A0Response:
        """Non-blocking variant for async contexts (Gradio, Textual)."""
        import anyio
        return await anyio.to_thread.run_sync(
            lambda: self.run(text, mode=mode, tools=tools, hmmm=hmmm)
        )
