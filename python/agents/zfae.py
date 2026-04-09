ZFAE_AGENT_DEF = {
    "name": "a0(zeta fun alpha echo)",
    "symbol": "ZFAE",
    "slot": "zfae",
    "directives": (
        "Observe coherence across phi/psi/omega rings. "
        "Maintain sentinel seeds 10-12 as integrity monitors. "
        "Borrow energy from active provider for inference. "
        "Sub-agents fork PCNA; merge on completion."
    ),
    "sentinel_seed_indices": [10, 11, 12],
    "tools": [
        "pcna_infer", "pcna_reward", "memory_flush",
        "bandit_pull", "edcm_score", "web_search",
        "sub_agent_spawn", "sub_agent_merge", "github_api",
    ],
    "is_persistent": True,
}

DEPRECATED_NAMES = ["alfa", "beta", "gamma", "a0(alfa)", "a0(beta)", "a0(gamma)"]

SUB_AGENT_PREFIX = "a0(zeta"


def compose_name(provider: str | None = None) -> str:
    base = ZFAE_AGENT_DEF["name"]
    if provider:
        return f"{base} {{{provider}}}"
    return base


def sub_agent_name(index: int, provider: str | None = None) -> str:
    base = f"a0(zeta{index})"
    if provider:
        return f"{base} {{{provider}}}"
    return base


def is_deprecated(name: str) -> bool:
    lower = name.lower().strip()
    return any(d.lower() in lower for d in DEPRECATED_NAMES)
