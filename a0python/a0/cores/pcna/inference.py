"""PCNA inference engine.

Wraps a backend model and exposes phi/psi/omega tensor slices.

Path A (adapted — works today):
    PatternMatchBackend  no model, lexical proxy — always available
    LlamaCppBackend      GGUF model via llama-cpp-python (set A0_MODEL_PATH)

Path B (native — ZFAE v2):
    ZFAEBackend  Zeta-structured, Field-partitioned, Alpha-regulated,
                 Echo-state engine v2.  Set A0_MODEL=zfae to activate.
                 Four independent 53-node PTCA reservoirs (phi, psi, omega,
                 synthesis); only the synthesis readout W_out is trained.
                 Per-field alphas are sourced from ModelConfig when provided.
                 See a0/cores/pcna/zfae.py for architecture details.

In Path A the tensor "slices" are proxies:
    phi   — structural features of the input (no model call needed)
    psi   — semantic/lexical features of the input (no model call needed)
    omega — generated text + response-structure features (model call)

This matches the conceptual layer order in a real transformer:
    phi ≈ tokenizer + early attention (syntactic structure)
    psi ≈ middle layers (semantic context)
    omega ≈ late layers + output head (synthesis/generation)
"""
from __future__ import annotations

import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


class _TensorSlices:
    """Raw tensor values before phase-coordinate transform."""

    def __init__(
        self,
        phi_raw: List[float],
        psi_raw: List[float],
        omega_raw: List[float],
        text: str,
        backend_name: str,
    ) -> None:
        self.phi_raw = phi_raw
        self.psi_raw = psi_raw
        self.omega_raw = omega_raw
        self.text = text
        self.backend_name = backend_name


def _pad(values: List[float], length: int = 3) -> List[float]:
    return (values + [0.0] * length)[:length]


def _phi_features(text: str) -> List[float]:
    """Structural analysis of input — phi domain proxy.

    Captures: constraint tension, negation density, conditional branching.
    These are the natural structural signals phi would process.
    """
    t = text.lower()
    words = t.split()
    n = max(len(words), 1)

    negation_density = len(re.findall(r"\bnot\b|\bno\b|\bnever\b|\bcannot\b|\bwon't\b|\bcan't\b", t)) / n
    conditional_density = len(re.findall(r"\bif\b|\bthen\b|\bbut\b|\bhowever\b|\bunless\b", t)) / n
    contradiction_signal = float(
        bool(re.search(r"\bnot\b", t)) and bool(re.search(r"\btrue\b|\bcorrect\b|\byes\b", t))
    )

    return _pad([negation_density, conditional_density, contradiction_signal])


def _psi_features(text: str) -> List[float]:
    """Semantic analysis of input — psi domain proxy.

    Captures: lexical diversity, question orientation, semantic density.
    These are the natural semantic signals psi would process.
    """
    words = text.lower().split()
    n = max(len(words), 1)

    lexical_diversity = len(set(words)) / n
    question_signal = float("?" in text)
    semantic_density = min(n / 50.0, 1.0)  # saturates at 50 words

    return _pad([lexical_diversity, question_signal, semantic_density])


def _omega_features(text: str) -> List[float]:
    """Synthesis features from model output — omega domain proxy.

    Captures: response coherence, length signal, resolution signal.
    """
    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    n_sentences = len(sentences)

    coherence = 1.0 / (1.0 + abs(n_sentences - 3))  # 3-sentence responses are coherent
    length_signal = min(len(text) / 500.0, 1.0)
    resolution_signal = float(
        bool(re.search(r"\btherefore\b|\bthus\b|\bso\b|\bin conclusion\b|\boverall\b", text.lower()))
    )

    return _pad([coherence, length_signal, resolution_signal])


class PatternMatchBackend:
    """Always-available backend. Uses lexical patterns as tensor proxies.

    No model required. phi and psi are computed from input structure;
    omega is empty text (no generation) with synthesis features from input.
    """

    name = "pattern-match"

    def generate(self, prompt: str, context: List[Dict[str, Any]]) -> _TensorSlices:
        return _TensorSlices(
            phi_raw=_phi_features(prompt),
            psi_raw=_psi_features(prompt),
            omega_raw=_omega_features(prompt),
            text="",
            backend_name=self.name,
        )


class LlamaCppBackend:
    """llama-cpp-python backend. Fully embedded — no daemon required.

    phi and psi are computed from input structure (no extra model call).
    omega uses the model completion + response structure features.
    """

    name = "local-llama"

    def __init__(self, model_path: str) -> None:
        from llama_cpp import Llama  # type: ignore[import]

        self._llm = Llama(model_path=model_path, n_ctx=4096, verbose=False)

    def generate(self, prompt: str, context: List[Dict[str, Any]]) -> _TensorSlices:
        messages: List[Dict[str, Any]] = list(context) + [{"role": "user", "content": prompt}]
        result = self._llm.create_chat_completion(messages=messages)
        text: str = result["choices"][0]["message"]["content"]

        return _TensorSlices(
            phi_raw=_phi_features(prompt),
            psi_raw=_psi_features(prompt),
            omega_raw=_omega_features(text),
            text=text,
            backend_name=self.name,
        )


class ZFAEBackend:
    """Path B backend — delegates to ZFAEEngine v2.

    Activate with A0_MODEL=zfae.  If A0_TRAINING_DIR contains a
    zfae_weights.json the saved weights are loaded automatically.

    Args:
        config: Optional ModelConfig.  When provided, per-field alpha values
                (phi_alpha, psi_alpha, omega_alpha, synthesis_alpha) are read
                from the config and passed to ZFAEEngine.  Falls back to
                ZFAE defaults when config is None.
    """

    name = "zfae"

    def __init__(self, config: Optional[Any] = None) -> None:
        from a0.cores.pcna.zfae import ZFAEEngine
        from a0.cores.psi.tensors.env import A0_TRAINING_DIR
        weight_path = Path(A0_TRAINING_DIR) / "zfae_weights.json" if A0_TRAINING_DIR else None
        if weight_path and weight_path.exists():
            self._engine = ZFAEEngine.load_weights(str(weight_path))
        else:
            kwargs: Dict[str, Any] = {}
            if config is not None:
                for key in ("phi_alpha", "psi_alpha", "omega_alpha", "synthesis_alpha"):
                    val = getattr(config, key, None)
                    if val is not None:
                        kwargs[key] = val
            self._engine = ZFAEEngine(**kwargs)

    def generate(self, prompt: str, context: List[Dict[str, Any]]) -> _TensorSlices:
        return self._engine.generate(prompt, context)

    def capture_training_example(self, prompt: str, response_text: str) -> None:
        self._engine.capture_training_example(prompt, response_text)

    def train_readout(self, training_dir: str) -> int:
        return self._engine.train_readout(training_dir)

    def save_weights(self, path: str) -> None:
        self._engine.save_weights(path)


# Module-level singleton — lazy init, never re-initialized mid-session.
_backend: Optional[Any] = None


def get_backend(config: Optional[Any] = None) -> Any:
    """Return the best available PCNA backend (cached when config is None).

    Args:
        config: Optional ModelConfig.  When provided, bypasses the cache and
                constructs a fresh ZFAEBackend with the config's field alphas.
                When None, returns the cached singleton.

    Selection order:
        1. ZFAEBackend   when A0_MODEL=zfae or config.adapter=="zfae"
        2. LlamaCppBackend  when A0_MODEL_PATH is set
        3. PatternMatchBackend  always available (fallback)
    """
    global _backend

    # Config-aware path: construct fresh, do not cache
    if config is not None and getattr(config, "adapter", None) == "zfae":
        try:
            return ZFAEBackend(config=config)
        except Exception:
            pass

    if _backend is not None:
        return _backend

    from a0.cores.psi.tensors.env import A0_MODEL, A0_MODEL_PATH

    if A0_MODEL == "zfae":
        try:
            _backend = ZFAEBackend(config=config)
            return _backend
        except Exception:
            pass

    if A0_MODEL_PATH:
        try:
            _backend = LlamaCppBackend(A0_MODEL_PATH)
            return _backend
        except (ImportError, Exception):
            pass

    _backend = PatternMatchBackend()
    return _backend
