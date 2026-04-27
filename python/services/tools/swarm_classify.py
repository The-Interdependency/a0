# 212:29
# N:M
"""swarm_classify — schema-validated parallel fan-out tool.

Wraps `python.services.swarm.swarm` (the aimmh-CallFn-shape sidecar) into a
self-declaring tool. Use for sort/tag/extract/route workflows over many
items where one big call would be slow, blow the context window, or
collapse distinct judgements into mush.

Doctrine: `.agents/skills/a0p-model-selector/SKILL.md` — pick a T0/T1
producer (cheap-tier slug from the energy registry), optional T2 critic.
Cheap models in parallel beat one flagship for sort/tag/extract.

NO silent fallback: a batch that cannot be coerced to schema after retries
is marked `error=...` on each row. The critic (if configured) gets first
crack at error rows; whatever it can't fix stays errored. The caller sees
the truth.
"""
import json
from typing import Any

from ..swarm import SchemaCallError, swarm
# call_energy_provider is imported lazily inside _make_call_fn — top-level
# import causes a circular: inference.py loads tool_executor at import
# time, which triggers tool registry discovery, which imports this file.

SCHEMA = {
    "type": "function",
    "function": {
        "name": "swarm_classify",
        "description": (
            "Fan out N items to a cheap-tier LLM in parallel batches. Each "
            "row is schema-validated; low-confidence rows can be escalated "
            "to a critic model. Returns rows aligned 1:1 with `items`. Use "
            "for sort, tag, extract, route, or score workloads over many "
            "items where one big call would be slow or context-thrashing. "
            "Producer should be a T0/T1 model (default: gemini); critic a "
            "T2 (e.g. claude). Confidence < threshold triggers escalation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": (
                        "Input items (strings or small objects). Order is "
                        "preserved in the output rows."
                    ),
                    "items": {},
                },
                "instruction": {
                    "type": "string",
                    "description": (
                        "What the model should do with each item. Be "
                        "specific about the output keys you want."
                    ),
                },
                "row_keys": {
                    "type": "array",
                    "description": (
                        "Required keys on each output row, e.g. "
                        '["category","confidence"]. A "confidence" key in '
                        "[0,1] is always required and added if absent."
                    ),
                    "items": {"type": "string"},
                },
                "producer_provider": {
                    "type": "string",
                    "description": "Provider id for the producer (cheap tier).",
                    "default": "gemini",
                },
                "critic_provider": {
                    "type": "string",
                    "description": (
                        "Provider id for the critic. Empty string disables "
                        "escalation. Defaults to no critic."
                    ),
                    "default": "",
                },
                "batch_size": {
                    "type": "integer",
                    "description": "Items per producer call. Default 10.",
                    "default": 10,
                },
                "concurrency": {
                    "type": "integer",
                    "description": "Max parallel batches. Default 6.",
                    "default": 6,
                },
                "confidence_threshold": {
                    "type": "number",
                    "description": (
                        "Rows below this confidence go to the critic. "
                        "Ignored if critic_provider is empty."
                    ),
                    "default": 0.6,
                },
            },
            "required": ["items", "instruction", "row_keys"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "orchestration",
    "cost_hint": "medium",
    "side_effects": ["network"],
    "version": 1,
    "recommended_skills": ("a0p-model-selector",),
}


def _make_call_fn(provider_id: str):
    """Adapt call_energy_provider to the aimmh CallFn shape:
    async (model_id, messages) -> str. We discard usage; the producer
    side does its own per-batch timing via swarm()'s elapsed_ms."""
    from ..inference import call_energy_provider  # lazy: see top-of-file note

    async def _call(_model_unused: str, messages: list[dict]) -> str:
        # call_energy_provider expects messages WITHOUT a leading system
        # turn (it threads system_prompt separately). Split if present.
        sys_prompt = None
        body = messages
        if messages and messages[0].get("role") == "system":
            sys_prompt = messages[0].get("content") or ""
            body = messages[1:]
        content, _usage = await call_energy_provider(
            provider_id=provider_id,
            messages=body,
            system_prompt=sys_prompt,
            max_tokens=2048,
            use_tools=False,  # swarm wants pure text/JSON, no tool loops
        )
        return content
    return _call


def _build_render(instruction: str, required_keys: list[str]):
    """Returns an ItemRenderer that builds one CallFn payload per batch.

    Same instruction string in every call → benefits from prefix caching
    on providers that support it (Anthropic ephemeral, OpenAI auto, etc.).
    """
    keys_doc = ", ".join(f'"{k}"' for k in required_keys)
    sys = (
        f"{instruction}\n\n"
        f"For EACH input item, return one row object with these keys: "
        f"{keys_doc}. Always include a numeric `confidence` in [0,1] "
        f"reflecting how sure you are.\n\n"
        f"Respond with ONLY a JSON object of shape "
        f'{{"rows": [ {{...}}, {{...}} ]}} — one row per input, in the '
        f"same order. No prose, no code fences, no commentary."
    )

    def _render(batch: list[Any]) -> list[dict]:
        numbered = "\n".join(
            f"{i + 1}. {json.dumps(item, ensure_ascii=False)}"
            for i, item in enumerate(batch)
        )
        return [
            {"role": "system", "content": sys},
            {
                "role": "user",
                "content": f"Items ({len(batch)}):\n{numbered}",
            },
        ]
    return _render


def _make_row_validator(required_keys: list[str]):
    """Per-row validator. Raises ValueError on a structural miss."""
    def _validate(row: dict) -> None:
        for k in required_keys:
            if k not in row:
                raise ValueError(f"row missing required key {k!r}")
        try:
            c = float(row.get("confidence", 0.0))
        except (TypeError, ValueError) as e:
            raise ValueError(f"confidence not coercible to float: {e}")
        if not (0.0 <= c <= 1.0):
            raise ValueError(f"confidence {c} outside [0,1]")
    return _validate


async def handle(
    items: list[Any],
    instruction: str,
    row_keys: list[str],
    producer_provider: str = "gemini",
    critic_provider: str = "",
    batch_size: int = 10,
    concurrency: int = 6,
    confidence_threshold: float = 0.6,
    _agent_run_id: str | None = None,
    **_,
) -> str:
    if not isinstance(items, list) or not items:
        return json.dumps({"ok": False, "error": "items must be a non-empty array"})
    if not isinstance(row_keys, list) or not row_keys:
        return json.dumps({"ok": False, "error": "row_keys must be a non-empty array"})

    required = list(row_keys)
    if "confidence" not in required:
        required.append("confidence")

    producer_call = _make_call_fn(producer_provider)
    critic_arg = None
    if critic_provider:
        critic_arg = (_make_call_fn(critic_provider), critic_provider)

    # Wire progress to run_logger when one is on the ContextVar.
    try:
        from ..run_logger import get_run_logger as _get_run_logger
        _logger = _get_run_logger()
    except Exception:
        _logger = None

    def _progress(kind: str, payload: dict) -> None:
        if _logger is None:
            return
        try:
            _logger.emit(f"swarm_{kind}", payload)
        except Exception:
            pass

    try:
        rows = await swarm(
            producer_call,
            producer_provider,
            items,
            _build_render(instruction, required),
            _make_row_validator(required),
            batch_size=batch_size,
            concurrency=concurrency,
            critic=critic_arg,
            confidence_threshold=confidence_threshold,
            progress_cb=_progress,
        )
    except (SchemaCallError, ValueError, RuntimeError) as e:
        return json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"})

    n_err = sum(1 for r in rows if r.error)
    n_esc = sum(1 for r in rows if r.escalated)
    return json.dumps({
        "ok": True,
        "producer": producer_provider,
        "critic": critic_provider or None,
        "n_items": len(items),
        "n_errors": n_err,
        "n_escalated": n_esc,
        "rows": [
            {
                "index": r.index,
                "data": r.data,
                "confidence": round(r.confidence, 4),
                "escalated": r.escalated,
                "critic_model": r.critic_model,
                "error": r.error,
                "elapsed_ms": r.elapsed_ms,
            }
            for r in rows
        ],
    })
# N:M
# 212:29
