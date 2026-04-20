# 124:17
"""Tool-result distillation runner.

Wraps oversized tool outputs in either a soft (paraphrase) or hard
(verbatim+citation) distillation pass through the active energy provider.
This module is the *consumer* of the distiller skill loader that lives in
`tool_executor.py`; the loader itself stays put per the refactor scope.
"""
import contextvars as _cv
import json

_TOOL_RESULT_PASS_TOKENS = 8000     # ~32 KB — under this, no summarization
_TOOL_RESULT_HARD_CAP_TOKENS = 64000  # over this, pre-truncate before summarizing

_caller_provider: _cv.ContextVar[str | None] = _cv.ContextVar(
    "caller_provider", default=None
)


def set_caller_provider(provider_id: str | None):
    """Pin the tool-result distiller to the same provider currently driving
    the conversation. Returns the Token; pair with reset_caller_provider in
    a finally block so per-call provider context never leaks across composed
    agent invocations within one task."""
    return _caller_provider.set(provider_id)


def reset_caller_provider(token) -> None:
    """Reset the caller_provider contextvar to its prior value."""
    try:
        _caller_provider.reset(token)
    except (LookupError, ValueError, TypeError):
        pass


def flat_truncate(name: str, raw: str) -> str:
    cap_chars = _TOOL_RESULT_PASS_TOKENS * 4
    head = raw[: cap_chars - 256]
    return (
        f"{head}\n\n[output truncated: ~{len(raw) // 4} tokens → "
        f"~{_TOOL_RESULT_PASS_TOKENS}; tool={name}]"
    )


def _try_parse_json_array(text: str) -> list | None:
    """Tolerant JSON-array parser. Strips ```json fences and surrounding prose."""
    if not text:
        return None
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
        s = s.strip()
    lb, rb = s.find("["), s.rfind("]")
    if lb != -1 and rb != -1 and rb > lb:
        s = s[lb:rb + 1]
    try:
        parsed = json.loads(s)
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, list) else None


def _filter_valid_claims(items: list) -> list:
    """Keep only items shaped like {claim, verbatim, source, ...}."""
    out = []
    for it in items:
        if (isinstance(it, dict)
                and isinstance(it.get("claim"), str) and it["claim"].strip()
                and isinstance(it.get("verbatim"), str) and it["verbatim"].strip()
                and isinstance(it.get("source"), str) and it["source"].strip()):
            out.append(it)
    return out


async def maybe_summarize(
    name: str, arguments: dict, raw: str, call_id: str | None,
    pick_distiller, get_distiller_spec,
) -> str:
    """Pass small results through; distill large ones via a domain-specific
    skill. Soft domains paraphrase; hard domains return verbatim+citation tuples.
    `pick_distiller` and `get_distiller_spec` are injected so this module
    doesn't pull in the distiller-loader subsystem directly."""
    if not isinstance(raw, str):
        raw = str(raw)
    if len(raw) <= _TOOL_RESULT_PASS_TOKENS * 4:
        return raw

    provider = _caller_provider.get()
    if not provider:
        try:
            from .energy_registry import energy_registry
            provider = energy_registry.get_active_provider()
        except Exception:
            provider = None
    if not provider:
        return flat_truncate(name, raw)

    domain = pick_distiller(raw)
    spec = get_distiller_spec(domain)
    skill_prompt = spec.get("prompt") or ""
    is_hard = bool(spec.get("hard_domain"))
    if not skill_prompt:
        return flat_truncate(name, raw)

    head = raw[: _TOOL_RESULT_HARD_CAP_TOKENS * 4]
    args_preview = json.dumps(arguments)[:500] if arguments else "{}"
    target_tokens = _TOOL_RESULT_PASS_TOKENS // 2
    user_msg = f"Tool: {name}\nArgs: {args_preview}\n\n---\n\n{head}"

    try:
        from .inference import call_energy_provider
        text, _usage = await call_energy_provider(
            provider,
            messages=[{"role": "user", "content": user_msg}],
            system_prompt=skill_prompt,
            max_tokens=target_tokens,
            use_tools=False,
        )
        if not text or not text.strip():
            return flat_truncate(name, raw)
        if is_hard:
            parsed = _try_parse_json_array(text)
            valid = _filter_valid_claims(parsed) if parsed is not None else []
            if not valid:
                retry_msg = (
                    "Your previous response was not a valid JSON array of claim "
                    "objects. Return ONLY a JSON array. Each item must have "
                    "non-empty 'claim', 'verbatim', and 'source' fields. No "
                    "prose, no markdown fences. Same content rules apply."
                )
                text2, _ = await call_energy_provider(
                    provider,
                    messages=[
                        {"role": "user", "content": user_msg},
                        {"role": "assistant", "content": text},
                        {"role": "user", "content": retry_msg},
                    ],
                    system_prompt=skill_prompt,
                    max_tokens=target_tokens,
                    use_tools=False,
                )
                parsed2 = _try_parse_json_array(text2 or "")
                valid = _filter_valid_claims(parsed2) if parsed2 is not None else []
                if not valid:
                    return flat_truncate(name, raw)
            text = json.dumps(valid, ensure_ascii=False)
            cid_part = f" call_id={call_id}" if call_id else ""
            return (
                f"[distilled via {provider} · {domain} skill (hard, "
                f"{len(valid)} claims): {len(raw) // 1024} KB → "
                f"~{len(text) // 1024} KB{cid_part}]\n\n{text}"
            )
        cid_part = f" call_id={call_id}" if call_id else ""
        return (
            f"[distilled via {provider} · {domain} skill: "
            f"{len(raw) // 1024} KB → ~{len(text) // 1024} KB{cid_part}]\n\n{text}"
        )
    except Exception:
        return flat_truncate(name, raw)
# 124:17
