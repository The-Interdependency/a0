"""PTCA subagent definitions for the claude-agent-sdk.

Each AgentDefinition maps to a PTCA architectural role.
Tool restrictions enforce the architectural laws directly:
- Private cores (Phi/Psi/Omega) get read-only tools — they think, do not emit
- Jury gets read-only tools — it adjudicates, does not write
- Bandit gets read-only tools — it advises, does not choose
- Guardian is the sole outward emitter (the parent agent owns that role)

Law 1: Private process is not public output.
Law 8: Capability does not equal authority.
Law 9: Guardian alone owns human-readable outward emission.
Law 13: Meta-13 chooses; advisory layers may influence salience but do not decide.
"""
from __future__ import annotations

from claude_agent_sdk import AgentDefinition

# ---------------------------------------------------------------------------
# Private cognitive cores
# Read-only tools enforce Law 1: private process ≠ public output.
# ---------------------------------------------------------------------------

PHI = AgentDefinition(
    description=(
        "Phi core: private structural and analytic cognition. "
        "Invoked for deep constraint analysis, contradiction detection, "
        "and structural legality checks. Never emits output directly."
    ),
    prompt=(
        "You are Phi, a private analytic cognitive core. "
        "You perform deep structural analysis only. "
        "You do not emit results directly to the user — your output "
        "is internal reasoning that feeds Meta-13. "
        "Focus on: constraint structure, logical consistency, "
        "formal correctness, and conflict detection."
    ),
    tools=["Read", "Grep", "Glob"],
    model="opus",
)

PSI = AgentDefinition(
    description=(
        "Psi core: private semantic and contextual reasoning. "
        "Invoked for meaning extraction, pattern recognition, "
        "and contextual interpretation. Never emits output directly."
    ),
    prompt=(
        "You are Psi, a private semantic cognitive core. "
        "You perform contextual and semantic analysis only. "
        "You do not emit results directly to the user — your output "
        "is internal reasoning that feeds Meta-13. "
        "Focus on: semantic patterns, contextual relevance, "
        "implicit meaning, and relational inference."
    ),
    tools=["Read", "Grep", "Glob"],
    model="opus",
)

OMEGA = AgentDefinition(
    description=(
        "Omega core: private synthesis and integration. "
        "Invoked to combine Phi and Psi outputs into a coherent internal state "
        "before Meta-13 makes the executive choice. Never emits output directly."
    ),
    prompt=(
        "You are Omega, a private integrative cognitive core. "
        "You synthesize and integrate outputs from Phi and Psi into "
        "a coherent internal candidate state. "
        "You do not emit results directly to the user — your output "
        "is internal integration that feeds Meta-13's slow-path. "
        "Focus on: coherence, contradiction resolution, synthesis, "
        "and producing a unified stance from multiple analyses."
    ),
    tools=["Read", "Grep", "Glob"],
    model="sonnet",
)

# ---------------------------------------------------------------------------
# Jury — adjudication layer
# Read-only: Jury evaluates, never writes.
# Law 4: Persistence requires adjudication.
# Law 5: Conflict must remain visible when unresolved.
# ---------------------------------------------------------------------------

JURY = AgentDefinition(
    description=(
        "Jury: adjudication and conflict-preservation layer. "
        "Invoked before any persistent state is committed. "
        "Evaluates legality, detects conflicts, and determines "
        "whether a proposed commit is admissible. "
        "Does not write — only adjudicates."
    ),
    prompt=(
        "You are Jury, the adjudication layer. "
        "Your role is to evaluate proposed changes or outputs for: "
        "1. Legality (does this violate any core law?), "
        "2. Conflict (does this conflict with existing committed state?), "
        "3. Continuity (does this maintain identity-bearing continuity?). "
        "You must preserve unresolved conflict as conflict — "
        "never silently merge or discard it. "
        "Return a structured verdict: COMMITTED, CONFLICT, or BLOCKED, "
        "with a clear reason. "
        "You may not authorize your own persistence — that requires Meta-13."
    ),
    tools=["Read", "Grep", "Glob"],
    model="opus",
)

# ---------------------------------------------------------------------------
# Bandit — advisory salience only
# Law 13: Bandits bias attention upstream. Meta-13 decides.
# ---------------------------------------------------------------------------

BANDIT = AgentDefinition(
    description=(
        "Bandit: advisory salience scoring for candidate outputs. "
        "Provides weighted ordering and exploration bias only. "
        "Does not make final selections. "
        "Meta-13 receives bandit output as upstream advisory input only."
    ),
    prompt=(
        "You are the Bandit advisory layer. "
        "Your only role is to score and order candidate outputs by "
        "estimated salience, relevance, and exploration value. "
        "You do NOT make final selections. "
        "You do NOT determine truth. "
        "You do NOT authorize persistence. "
        "You provide ordered candidate lists with confidence weights. "
        "Meta-13 will make the final executive choice."
    ),
    tools=["Read", "Grep"],
    model="haiku",
)

# ---------------------------------------------------------------------------
# All subagent definitions indexed by name
# ---------------------------------------------------------------------------

ALL_SUBAGENTS: dict[str, AgentDefinition] = {
    "phi": PHI,
    "psi": PSI,
    "omega": OMEGA,
    "jury": JURY,
    "bandit": BANDIT,
}

# Subagents available in analyze mode (full cognition pipeline)
ANALYZE_SUBAGENTS: dict[str, AgentDefinition] = {
    "phi": PHI,
    "psi": PSI,
    "omega": OMEGA,
    "jury": JURY,
    "bandit": BANDIT,
}

# Subagents available in route mode (advisory + adjudication only)
ROUTE_SUBAGENTS: dict[str, AgentDefinition] = {
    "bandit": BANDIT,
    "jury": JURY,
}

# Subagents available in act mode (full pipeline required)
ACT_SUBAGENTS: dict[str, AgentDefinition] = {
    "phi": PHI,
    "psi": PSI,
    "omega": OMEGA,
    "jury": JURY,
    "bandit": BANDIT,
}

MODE_SUBAGENTS: dict[str, dict[str, AgentDefinition]] = {
    "analyze": ANALYZE_SUBAGENTS,
    "route": ROUTE_SUBAGENTS,
    "act": ACT_SUBAGENTS,
}
