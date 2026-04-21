# N:M
"""Cut-mode tool filter — gates which tools the model sees per turn.

Three modes:
  off  — every enabled tool exposed
  soft — write/expensive tools removed (read-only / pcna / observation only)
  hard — only sub_agent_spawn + sub_agent_merge (recursion control only)

The filter operates on the canonical tool list (chat-shape dicts produced by
python.services.tools.tool_schemas_chat) so it can be invoked from either the
inference layer or test harnesses without mounting the full registry.
"""
from typing import Iterable

# Side-effect tags that cause a tool to be hidden in "soft" mode.
_SOFT_BLOCK_EFFECTS = frozenset({
    "filesystem", "mutating_db", "external_account",
    "billing", "irreversible", "security_active",
})

_HARD_ALLOW = frozenset({"sub_agent_spawn", "sub_agent_merge"})


def _tool_name(t: dict) -> str:
    fn = t.get("function") or {}
    return fn.get("name", "")


def _tool_side_effects(t: dict, side_effects_index: dict[str, set[str]]) -> set[str]:
    return side_effects_index.get(_tool_name(t), set())


def tools_for_cut_mode(
    mode: str,
    all_tools: list[dict],
    side_effects_index: dict[str, set[str]] | None = None,
) -> list[dict]:
    """Return the subset of `all_tools` permitted under `mode`.

    `side_effects_index` maps tool_name -> set(side_effects). If not provided
    we pull it from the live registry. Provide it explicitly in tests to
    avoid touching the disk.
    """
    if mode not in ("off", "soft", "hard"):
        raise ValueError(
            f"cut_mode must be one of off/soft/hard, got {mode!r}. "
            "Set settings.default_cut_mode or pass cut_mode on the message."
        )
    if mode == "off":
        return list(all_tools)
    if mode == "hard":
        return [t for t in all_tools if _tool_name(t) in _HARD_ALLOW]
    if side_effects_index is None:
        from .tools import registry as _reg
        side_effects_index = {
            n: set(spec.side_effects) for n, spec in _reg().items()
        }
    out: list[dict] = []
    for t in all_tools:
        eff = _tool_side_effects(t, side_effects_index)
        if eff & _SOFT_BLOCK_EFFECTS:
            continue
        out.append(t)
    return out


async def get_user_default_cut_mode(user_id: str | None) -> str:
    """Look up the user's settings.default_cut_mode. Defaults to 'soft'."""
    if not user_id:
        return "soft"
    try:
        from sqlalchemy import text as _sa_text
        from ..database import get_session
        async with get_session() as s:
            r = await s.execute(
                _sa_text(
                    "SELECT value FROM settings "
                    "WHERE user_id = :uid AND key = 'default_cut_mode' LIMIT 1"
                ),
                {"uid": user_id},
            )
            row = r.first()
            if row and row[0]:
                v = row[0]
                if isinstance(v, dict):
                    v = v.get("value") or v.get("mode")
                if isinstance(v, str) and v in ("off", "soft", "hard"):
                    return v
    except Exception:
        pass
    return "soft"


def names_in(tools: Iterable[dict]) -> list[str]:
    return [_tool_name(t) for t in tools]
# N:M
