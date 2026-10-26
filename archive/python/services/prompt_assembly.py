# 147:81 0:0 4:5
"""prompt_assembly — canonical prompt construction for all chat turns.

Extracted from inference.py (doctrine/prime-seed functions) and chat.py
(_build_system_prompt). Single responsibility: compose the system prompt
from its stable (cached) and volatile (editable) parts.

Stable prefix  — doctrine + skill manifest + LT prime-seed tag.
                 Byte-identical across all calls until doctrine or a
                 SKILL.md file changes. Sits inside all provider cache
                 prefixes. MUST NOT change mid-conversation.
Volatile suffix — memory seeds + ST prime-seed tag + context boost.
                  Changes on every seed-weight edit or context-boost save.
                  Safe to modify mid-conversation (only invalidates the
                  second Anthropic cache breakpoint, not the prefix).

Cache split: the literal string "\\n\\n## Memory\\n" separates the two
halves. Claude places a cache_control breakpoint here; other providers
use auto-caching keyed on the same boundary.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_prompt_assembly
#   module_name: prompt_assembly
#   module_kind: service
#   summary: Canonical system-prompt construction for all chat turns — composes the cacheable stable prefix (doctrine + skill manifest + LT prime-seed) and the volatile suffix (memory seeds + ST prime-seed + context boost).
#   owner: Erin Spencer
#   public_surface: build_system_prompt, build_prompt_sections
#   internal_surface: _load_doctrine, _prime_seed_context_lines, _prepend_doctrine, _get_context_value
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; prompt assembly reverts to prior prefix/suffix composition.
#   requires: a0_engine_prime_seeds
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import os
import logging
from typing import Optional

_log = logging.getLogger("a0p.prompt_assembly")

# ── Doctrine loader ──────────────────────────────────────────────────────────

_DOCTRINE_CACHE: dict[str, str | float] = {"text": "", "mtime": 0.0}
_DOCTRINE_PATHS = ("interdependent_way.md",)


def _load_doctrine() -> str:
    """Read the canonical doctrine file (memoized; reloads on mtime change)."""
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for rel in _DOCTRINE_PATHS:
        path = os.path.join(base, rel)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        if _DOCTRINE_CACHE["mtime"] == mtime and _DOCTRINE_CACHE["text"]:
            return _DOCTRINE_CACHE["text"]  # type: ignore[return-value]
        try:
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        _DOCTRINE_CACHE["text"] = text
        _DOCTRINE_CACHE["mtime"] = mtime
        return text
    return ""


# ── Prime-seed context lines ─────────────────────────────────────────────────

def _prime_seed_context_lines() -> tuple[str, str]:
    """Return (lt_line, st_line) compact memory tags from prime seeds.

    LT (N=19) → stable prefix block. Only changes on LT promotion.
    ST (N=17) → volatile section after ## Memory. Refreshed every 60s tick.
    Returns ("", "") on any error — never blocks inference.
    """
    try:
        from ..engine.prime_seeds import get_prime_seeds
        ctx = get_prime_seeds().memory_context()
        lt = ctx.get("lt") or {}
        st = ctx.get("st") or {}
        lt_line = (
            f"[memory:LT N={lt.get('n', '?')} "
            f"coherence={lt.get('ring_coherence', '?')} "
            f"hub={lt.get('hub_mean', '?')} "
            f"mean={lt.get('tensor_mean', '?')}]"
        ) if lt else ""
        st_line = (
            f"[memory:ST N={st.get('n', '?')} "
            f"coherence={st.get('ring_coherence', '?')} "
            f"hub={st.get('hub_mean', '?')} "
            f"mean={st.get('tensor_mean', '?')}]"
        ) if st else ""
        return lt_line, st_line
    except Exception:
        return "", ""


# ── Doctrine prepend ─────────────────────────────────────────────────────────

_MEMORY_MARKER = "\n\n## Memory\n"


def _prepend_doctrine(
    system_prompt: Optional[str],
    skip_manifest: bool = False,
) -> Optional[str]:
    """Prepend doctrine + skill manifest as the first cacheable blocks.

    Both blocks are byte-stable across calls (manifest is sorted) so
    provider caches latch onto the same prefix until doctrine or a
    SKILL.md file changes.

    skip_manifest=True omits the skill manifest. Use for automated callers
    (heartbeat, review tasks) that never invoke skill_load.

    Prime-seed injection:
      LT tag → inserted into the stable prefix, after skill manifest.
      ST tag → spliced into system_prompt after the ## Memory marker so
               it lives in the volatile block and refreshes every 60s.
    """
    from ..services.tool_executor import get_a0_skill_manifest
    doctrine = _load_doctrine()
    manifest = ""
    if not skip_manifest:
        try:
            manifest = get_a0_skill_manifest()
        except Exception:
            manifest = ""
    lt_line, st_line = _prime_seed_context_lines()
    if st_line and system_prompt and _MEMORY_MARKER in system_prompt:
        system_prompt = system_prompt.replace(
            _MEMORY_MARKER,
            f"{_MEMORY_MARKER}{st_line}\n",
            1,
        )
    parts = [p for p in (doctrine, manifest, lt_line, system_prompt) if p]
    if not parts:
        return system_prompt
    if len(parts) == 1:
        return parts[0]
    return "\n\n---\n\n".join(parts)


# ── Context value helper (avoids routes → services circular import) ──────────

async def _get_context_value(name: str) -> str:
    """Fetch a named prompt context value directly from the DB."""
    try:
        from ..database import engine
        from sqlalchemy import text as _t
        async with engine.connect() as conn:
            row = (await conn.execute(
                _t("SELECT value FROM prompt_contexts WHERE name = :n"),
                {"n": name},
            )).first()
        return row[0] if row else ""
    except Exception:
        return ""


# ── System prompt builder ────────────────────────────────────────────────────

async def build_system_prompt(
    tier: str,
    agent_persona: Optional[str] = None,
) -> str:
    """Compose the system prompt with stable→volatile ordering for cache reuse.

    Order (most stable first):
      1. a0_identity        — global, immutable
      2. system_base        — global, rarely edited
      3. anti_hallucination — global grounding rules
      4. tier_context       — stable per tier
      5. agent_persona      — stable per Forge agent (optional)
      6. memory seeds       — volatile (weight/text edits frequent)

    The ## Memory break between (5) and (6) is where Anthropic places its
    second cache_control breakpoint. Seed edits only invalidate the seed
    segment, preserving the long-lived prefix cache.
    """
    from ..services.stripe_service import get_tier_context_name
    from ..storage import storage

    context_name = get_tier_context_name(tier)
    a0_identity = await _get_context_value("a0_identity")
    system_base = await _get_context_value("system_base")
    anti_hallucination = await _get_context_value("anti_hallucination")
    tier_context = await _get_context_value(context_name)

    parts: list[str] = []
    if a0_identity:
        parts.append(a0_identity)
    if system_base:
        parts.append(system_base)
    if anti_hallucination:
        parts.append(anti_hallucination)
    if tier_context:
        parts.append(tier_context)
    if agent_persona:
        parts.append(f"## Persona\n{agent_persona}")

    seeds = await storage.get_memory_seeds()
    active_seeds = [
        s for s in seeds
        if s.get("enabled") and (s.get("summary") or "").strip()
    ]
    active_seeds.sort(key=lambda s: float(s.get("weight", 1.0)), reverse=True)
    if active_seeds:
        seed_lines = []
        for s in active_seeds:
            label = s.get("label", f"Seed {s.get('seed_index', '?')}")
            summary = s.get("summary", "").strip()
            seed_lines.append(f"- [{label}]: {summary}")
        parts.append("## Memory\n" + "\n".join(seed_lines))

    return "\n\n".join(parts)


# ── Prompt section splitter (for the inspector UI) ───────────────────────────

async def build_prompt_sections(
    tier: str,
    agent_persona: Optional[str] = None,
    context_boost: Optional[str] = None,
) -> dict:
    """Return the system prompt split into stable and volatile halves.

    Used by the pre-send inspector's Prompt tab and the
    /conversations/{id}/prompt-sections endpoint.

    Returns:
      stable      — doctrine through agent_persona (cache-safe prefix)
      volatile    — ## Memory block + context boost (safe to edit mid-convo)
      full        — the assembled string before doctrine prepend
      char_counts — {stable, volatile, total}
    """
    full = await build_system_prompt(tier, agent_persona=agent_persona)
    if context_boost and context_boost.strip():
        full = full + f"\n\n## Context Boost\n{context_boost.strip()}"

    split_marker = "\n\n## Memory\n"
    idx = full.find(split_marker)
    if idx >= 0:
        stable = full[:idx]
        volatile = full[idx + 2:]   # keep "## Memory\n..." in volatile
    else:
        stable = full
        volatile = ""

    return {
        "stable": stable,
        "volatile": volatile,
        "full": full,
        "char_counts": {
            "stable": len(stable),
            "volatile": len(volatile),
            "total": len(full),
        },
    }
# 147:81 0:0 4:5
