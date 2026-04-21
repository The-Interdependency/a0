# N:M
"""run_inference_with_mode — orchestration entry point that fans aimmh-lib's
multi-model primitives over the existing energy provider call path.

Mode contract:
  single             — single provider, full tool loop (existing path)
  fan_out            — parallel call to N providers; no tool loop
  council            — N providers respond, then each synthesizes
  daisy_chain        — sequential A → B → C, each builds on the last
  room_all           — shared room, all models see each other across rounds
  room_synthesized   — N respond, synthesizer combines, drives next round

Tool filtering happens via cut_modes.tools_for_cut_mode at the edges; the
multi-model patterns themselves do not invoke tools (they're text-only).

NO silent fallback: an unknown mode raises ValueError naming the bad mode;
a missing provider id raises RuntimeError naming the provider.
"""
import time
from typing import Any, Optional

from .run_logger import get_run_logger
from .cut_modes import tools_for_cut_mode
from .energy_registry import (
    energy_registry, resolve_providers, get_multi_model_hub,
)


_VALID_MODES = (
    "single", "fan_out", "council", "daisy_chain",
    "room_all", "room_synthesized",
)


def _flatten_user_text(messages: list[dict]) -> str:
    """Concatenate the trailing user-role content blocks into a single prompt."""
    chunks: list[str] = []
    for m in reversed(messages):
        if m.get("role") != "user":
            if chunks:
                break
            continue
        c = m.get("content")
        if isinstance(c, str):
            chunks.append(c)
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and part.get("type") in ("text", "input_text"):
                    chunks.append(part.get("text") or "")
    return "\n\n".join(reversed([c for c in chunks if c]))


def _emit_provider_response(provider: str, content: str, elapsed_ms: int) -> None:
    """Cheap usage estimation when the multi-model path didn't capture provider usage."""
    logger = get_run_logger()
    out_tokens = max(1, len(content) // 4)
    cost = energy_registry.estimate_cost(provider, 0, out_tokens)
    try:
        logger.emit("provider_response", {
            "provider": provider,
            "prompt_tokens": 0,
            "completion_tokens": out_tokens,
            "cache_hit_tokens": 0,
            "cost_usd_estimate": round(float(cost), 6),
            "elapsed_ms": elapsed_ms,
        })
    except Exception:
        pass


def _serialize_results(results: list[Any]) -> list[dict]:
    """Convert aimmh ModelResult objects into JSON-safe dicts for transport."""
    out: list[dict] = []
    for r in results:
        out.append({
            "model": getattr(r, "model", ""),
            "content": getattr(r, "content", ""),
            "elapsed_ms": getattr(r, "response_time_ms", 0),
            "round_num": getattr(r, "round_num", 0),
            "step_num": getattr(r, "step_num", 0),
            "role": getattr(r, "role", "player"),
            "slot_idx": getattr(r, "slot_idx", 0),
            "error": getattr(r, "error", None),
        })
    return out


def _summarize_results(results: list[Any]) -> str:
    """Render a single readable transcript so the UI's existing markdown
    bubble path still has a sensible string when no special renderer fires."""
    lines: list[str] = []
    for r in results:
        prov = getattr(r, "model", "?")
        step = getattr(r, "step_num", 0)
        role = getattr(r, "role", "player")
        head = f"### {prov}"
        if step == -1 or role == "synthesizer":
            head += " (synthesis)"
        elif step == 1 and role == "council":
            head += " (council synthesis)"
        body = getattr(r, "content", "") or ""
        lines.append(f"{head}\n\n{body.strip()}")
    return "\n\n---\n\n".join(lines)


async def run_inference_with_mode(
    messages: list[dict],
    orchestration_mode: str = "single",
    providers: Optional[list[str]] = None,
    cut_mode: str = "soft",
    user_id: Optional[str] = None,
    system_prompt: Optional[str] = None,
    rounds: int = 1,
) -> tuple[str, dict]:
    """Top-level orchestration dispatch.

    Returns (content, usage). For multi-model modes `usage` carries a
    `responses` list of per-provider dicts so the UI can render side-by-side
    cards without re-running the orchestration.
    """
    if orchestration_mode not in _VALID_MODES:
        raise ValueError(
            f"orchestration_mode must be one of {_VALID_MODES}, "
            f"got {orchestration_mode!r}"
        )

    resolved = resolve_providers(providers)
    if not resolved:
        raise RuntimeError(
            f"run_inference_with_mode: no providers resolved from {providers!r}. "
            "Set the active provider via energy_registry or pass an explicit list."
        )

    # Tool filtering: the chat path that takes the single branch already
    # consults the registry; we only need to surface the filtered list to
    # callers that pass it through.
    try:
        from .tool_executor import TOOL_SCHEMAS_CHAT as _ALL_TOOLS
        _filtered = tools_for_cut_mode(cut_mode, list(_ALL_TOOLS))
    except Exception:
        _filtered = None

    if orchestration_mode == "single":
        from .inference import call_energy_provider
        provider = resolved[0]
        t0 = time.perf_counter()
        content, usage = await call_energy_provider(
            provider_id=provider,
            messages=messages,
            system_prompt=system_prompt,
            user_id=user_id,
            use_tools=bool(_filtered) if _filtered is not None else True,
        )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        try:
            cb = energy_registry.cache_breakdown(usage)
            logger = get_run_logger()
            logger.emit("provider_response", {
                "provider": provider,
                "prompt_tokens": cb.get("fresh_input", 0),
                "completion_tokens": cb.get("output", 0),
                "cache_hit_tokens": cb.get("cache_read", 0),
                "cost_usd_estimate": round(float(energy_registry.estimate_cost(
                    provider, cb.get("fresh_input", 0), cb.get("output", 0),
                    cb.get("cache_read", 0), cb.get("cache_write", 0),
                )), 6),
                "elapsed_ms": elapsed_ms,
            })
        except Exception:
            pass
        usage = dict(usage or {})
        usage["orchestration_mode"] = "single"
        usage["providers"] = [provider]
        return content, usage

    hub = get_multi_model_hub()
    prompt = _flatten_user_text(messages) or "(no prompt)"

    if orchestration_mode == "fan_out":
        results = await hub.fan_out(resolved, messages)
    elif orchestration_mode == "daisy_chain":
        results = await hub.daisy_chain(resolved, prompt, rounds=rounds)
    elif orchestration_mode == "room_all":
        results = await hub.room_all(resolved, prompt, rounds=rounds)
    elif orchestration_mode == "room_synthesized":
        synth = resolved[0]
        players = resolved[1:] if len(resolved) > 1 else resolved
        results = await hub.room_synthesized(players, prompt, synth, rounds=rounds)
    elif orchestration_mode == "council":
        results = await hub.council(resolved, prompt, rounds=rounds)
    else:
        raise ValueError(f"unhandled mode {orchestration_mode!r}")

    for r in results:
        _emit_provider_response(
            getattr(r, "model", "?"),
            getattr(r, "content", "") or "",
            int(getattr(r, "response_time_ms", 0) or 0),
        )

    serialized = _serialize_results(results)
    usage = {
        "orchestration_mode": orchestration_mode,
        "providers": resolved,
        "responses": serialized,
        "rounds": rounds,
    }
    return _summarize_results(results), usage
# N:M
