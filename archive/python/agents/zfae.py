# 47:14 0:0 4:0
ZFAE_AGENT_DEF = {
    "name": "a0(zeta fun alpha echo)",
    "symbol": "ZFAE",
    "slot": "zfae",
    "directives": (
        "Observe coherence across phi/psi/omega rings. "
        "Maintain sentinel seeds 10-12 as integrity monitors. "
        "Run inference via the active model. "
        "Sub-agents fork PCNA; merge on completion."
    ),
    "sentinel_seed_indices": [10, 11, 12],
    "tools": [
        "pcna_infer", "pcna_reward", "memory_flush",
        "edcm_score", "web_search",
        "sub_agent_spawn", "sub_agent_merge", "github_api",
    ],
    "is_persistent": True,
}

# Naming convention: a0(model)instance
# - model  = the active model ID (e.g. "gpt-5-mini", "grok-3-fast")
# - instance = the agent's slot/name (e.g. "zfae", "the_captain")
# Old phonetic format "a0(zeta fun alpha echo)" and provider-suffix format
# "a0(zeta fun alpha echo) {openai}" are retired — mark them deprecated so
# the boot-time cleanup removes them from the DB.
DEPRECATED_NAMES = [
    "alfa", "beta", "gamma",
    "a0(alfa)", "a0(beta)", "a0(gamma)",
    "a0(zeta fun alpha echo)",
]

SUB_AGENT_PREFIX = "a0("


def compose_name(
    provider: str | None = None,
    model_id: str | None = None,
) -> str:
    """Return the primary agent label in a0(model)zfae format.

    Priority: model_id > provider > '?'.
    """
    slot = ZFAE_AGENT_DEF["slot"]
    tag = model_id or provider or "?"
    return f"a0({tag}){slot}"


def sub_agent_name(
    index: int,
    provider: str | None = None,
    model_id: str | None = None,
    name: str | None = None,
) -> str:
    """Return a sub-agent label in a0(model)instance format.

    instance = name if provided, else 'zeta{index}'.
    """
    instance = name or f"zeta{index}"
    tag = model_id or provider or "?"
    return f"a0({tag}){instance}"


def is_deprecated(name: str) -> bool:
    lower = name.lower().strip()
    # Exact-match check for clean names
    if lower in {d.lower() for d in DEPRECATED_NAMES}:
        return True
    # Legacy suffix pattern: "a0(zeta fun alpha echo) {provider}"
    if lower.startswith("a0(zeta fun alpha echo)"):
        return True
    return False
# 47:14 0:0 4:0
