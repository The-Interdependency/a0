"""Local model adapters — run inference without external API calls.

Two options:
    local-ollama   Primary. Requires the ollama daemon (https://ollama.com).
                   Zero new Python deps — httpx is already a core dependency.
                   Setup: install ollama, then `ollama pull llama3.2`

    local-llama    Secondary. Fully embedded via llama-cpp-python.
                   No daemon required, but needs a .gguf model file and
                   the compiled llama-cpp-python package.
                   Setup: pip install llama-cpp-python
                          download a GGUF from HuggingFace

Configure via .env:

    # ollama
    A0_MODEL=local-ollama
    A0_LOCAL_MODEL=llama3.2          # any model you have pulled
    A0_OLLAMA_BASE=http://localhost:11434   # optional override

    # llama-cpp
    A0_MODEL=local-llama
    A0_MODEL_PATH=/path/to/model.gguf
"""
from __future__ import annotations

import os
from typing import Any, Dict, List


class OllamaAdapter:
    """Calls the local ollama daemon via its REST API."""

    name = "local-ollama"

    def complete(
        self,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        import httpx

        base = os.getenv("A0_OLLAMA_BASE", "http://localhost:11434")
        model = os.getenv("A0_LOCAL_MODEL", "llama3.2")

        resp = httpx.post(
            f"{base}/api/chat",
            json={"model": model, "messages": messages, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "text": data["message"]["content"],
            "raw": data,
            "subagents_used": [],
        }


class LlamaCppAdapter:
    """Runs a GGUF model in-process via llama-cpp-python. No daemon required."""

    name = "local-llama"

    def complete(
        self,
        messages: List[Dict[str, Any]],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        from llama_cpp import Llama  # type: ignore[import]

        model_path = os.getenv("A0_MODEL_PATH", "")
        if not model_path:
            raise RuntimeError(
                "A0_MODEL_PATH is not set. "
                "Download a GGUF model and set A0_MODEL_PATH=/path/to/model.gguf"
            )

        llm = Llama(model_path=model_path, n_ctx=4096, verbose=False)
        result = llm.create_chat_completion(messages=messages)
        return {
            "text": result["choices"][0]["message"]["content"],
            "raw": result,
            "subagents_used": [],
        }
