# 349:367
import os
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .database import engine
from .engine import PCNAEngine
from .routes import ALL_ROUTERS, collect_ui_meta
from .services.heartbeat import heartbeat_service
from .engine.module_registry import initialize_registry, get_registry
from .agents.zfae import compose_name, ZFAE_AGENT_DEF
from .services.energy_registry import energy_registry

_pcna: PCNAEngine | None = None
_pcna_8: PCNAEngine | None = None
_instances: dict[str, PCNAEngine] = {}


def get_pcna() -> PCNAEngine:
    global _pcna
    if _pcna is None:
        _pcna = PCNAEngine(phases=7)
        _instances[_pcna.theta.instance_id] = _pcna
    return _pcna


def get_pcna_8() -> PCNAEngine:
    global _pcna_8
    if _pcna_8 is None:
        _pcna_8 = PCNAEngine(phases=8)
    return _pcna_8


# Per-provider PCNA cores — lazy-forked from the primary p7 engine on the first
# chat turn routed through that provider. Each core receives infer signals from
# its provider's chat turns; rewards stay explicit (pcna_reward tool routes via
# caller_provider). Converge back to primary is admin-triggered via
# /api/v1/pcna/converge/{provider_id} (already wired in routes/energy.py).
_provider_pcna_cores: dict[str, PCNAEngine] = {}


def get_provider_pcna_cores() -> dict[str, PCNAEngine]:
    """Return the live registry of forked provider cores. Empty until first call."""
    return _provider_pcna_cores


async def get_or_fork_provider_pcna(provider_id: str) -> PCNAEngine:
    """Lazy-fork primary into a provider-scoped core on first call.

    Sets _checkpoint_key so save_checkpoint persists under
    `pcna_provider_<id>`; tries to load the prior checkpoint so per-provider
    learning persists across restarts (silent return if none exists, which is
    the normal case on first-ever fork).
    """
    existing = _provider_pcna_cores.get(provider_id)
    if existing is not None:
        return existing
    from .engine import InstanceMerge
    parent = get_pcna()
    child, fork_meta = InstanceMerge.fork(parent)
    child._checkpoint_key = f"pcna_provider_{provider_id}"
    await child.load_checkpoint()
    _provider_pcna_cores[provider_id] = child
    _instances[child.theta.instance_id] = child
    print(
        f"[pcna] forked provider core '{provider_id}' "
        f"(parent={fork_meta.get('parent_id', '')[:12]}, "
        f"child={fork_meta.get('child_id', '')[:12]})"
    )
    return child


_ZFAE_TOOL_SPECS = {
    "pcna_infer": {
        "description": "Run PCNA tensor inference — propagates a signal through phi/psi/omega rings and returns coherence output",
        "handler_type": "internal",
    },
    "pcna_reward": {
        "description": "Apply a reward signal to the PCNA engine — adjusts ring weights based on outcome quality",
        "handler_type": "internal",
    },
    "memory_flush": {
        "description": "Flush active memory seeds to checkpoint — persists summarized context for long-term retrieval",
        "handler_type": "internal",
    },
    "bandit_pull": {
        "description": "Pull a bandit arm from the EDCM reward router — selects energy provider based on expected coherence yield",
        "handler_type": "internal",
    },
    "edcm_score": {
        "description": "Compute EDCM (Energy Directional Coherence Metric) score for the current ring state",
        "handler_type": "internal",
    },
    "web_search": {
        "description": "Search the web for current information — results are injected into the agent's context window",
        "handler_type": "internal",
    },
    "sub_agent_spawn": {
        "description": "Spawn a ZFAE sub-agent with a forked PCNA instance — used for parallel or delegated task execution",
        "handler_type": "internal",
    },
    "sub_agent_merge": {
        "description": "Merge a completed sub-agent back into the primary PCNA — consolidates learned ring state",
        "handler_type": "internal",
    },
    "github_api": {
        "description": "Make an authenticated GitHub REST API call — read/write repos, issues, PRs, commits, branches, releases. Auth is automatic.",
        "handler_type": "internal",
    },
    "github_write_file": {
        "description": "Create or update a single file in a GitHub repo in one call — handles base64 encoding and SHA lookup automatically. Defaults to The-Interdependency/a0.",
        "handler_type": "internal",
    },
    "manage_approval_scope": {
        "description": "Grant or revoke a pre-approved action scope for the current user — eliminates per-gate APPROVE prompts for that category.",
        "handler_type": "internal",
    },
    "set_user_tier": {
        "description": "Set a user's subscription tier (admin-only). Params: user_id (string), tier (string — one of: free, ws, pro, admin, seeker, operator, patron, founder). Requires the calling session to have is_admin: true. Changes take effect immediately without a subscription change.",
        "handler_type": "internal",
    },
    "post_tweet": {
        "description": "Post a tweet to X (Twitter) using OAuth 1.0a credentials. Params: text (≤280 chars), reply_to (optional tweet id). Requires X_API_KEY/SECRET and X_ACCESS_TOKEN/SECRET env vars.",
        "handler_type": "internal",
    },
}


async def _ensure_default_tools() -> None:
    """Upsert ZFAE tool definitions into custom_tools so the Tools tab is always populated."""
    from .storage import storage
    from .database import get_session
    from sqlalchemy import text as sa_text

    existing_names: set[str] = set()
    async with get_session() as session:
        result = await session.execute(sa_text("SELECT name FROM custom_tools"))
        existing_names = {row[0] for row in result.fetchall()}

    added = 0
    for name, spec in _ZFAE_TOOL_SPECS.items():
        if name not in existing_names:
            await storage.create_custom_tool({
                "name": name,
                "description": spec["description"],
                "handler_type": spec["handler_type"],
                "handler_code": f"# Built-in ZFAE tool: {name}",
                "is_generated": True,
                "user_id": "system",
                "enabled": True,
            })
            added += 1

    if added:
        print(f"[tools] Seeded {added} ZFAE tool(s)")
    else:
        print(f"[tools] {len(_ZFAE_TOOL_SPECS)} ZFAE tools already present")


async def _seed_system_shadow_modules() -> None:
    """Upsert shadow DB records for every hardcoded route module.

    These records are visible in the WS editor but completely immutable via the
    API (status='system', owner_id='system'). The backing code is never touched;
    this is purely informational / safe-mode reference.
    """
    from .storage import storage as _storage
    metas = collect_ui_meta()
    for meta in metas:
        tab_id = meta.get("tab_id", "")
        slug = f"system::{tab_id}"
        label = meta.get("label", tab_id)
        await _storage.upsert_system_shadow(
            slug=slug,
            name=label,
            description=f"System module — hardcoded route ({tab_id})",
            ui_meta=meta,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[python] FastAPI starting — DB engine initialized")
    pcna = get_pcna()
    await pcna.load_checkpoint()
    print(f"[python] PCNA p7 online — blueprint {pcna.blueprint_hash[:12]}...")
    pcna_8 = get_pcna_8()
    await pcna_8.load_checkpoint()
    print(f"[python] PCNA p8 online — blueprint {pcna_8.blueprint_hash[:12]}...")
    await energy_registry.load_from_db()
    provider = energy_registry.get_active_provider()
    agent_name = compose_name(provider)
    print(f"[python] Agent: {agent_name}")
    from .routes.agents import ensure_primary_agent
    await ensure_primary_agent(pcna)
    print("[python] Primary agent verified, deprecated names cleaned")
    from .routes.contexts import _ensure_defaults as ensure_contexts
    await ensure_contexts()
    print("[python] Default prompt contexts ensured")
    from .routes.billing import ensure_admin_emails
    await ensure_admin_emails()
    from .services.stripe_service import ensure_stripe_products
    await ensure_stripe_products()
    await _ensure_default_tools()
    from .logger import seed_openai_hmmm_if_empty
    from .config.policy_loader import get_hmmm_seed_items, get_version as policy_version
    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())
    print(f"[openai] policy loaded — {policy_version()}")
    from .database import get_session
    from sqlalchemy import text as _sa_text
    async with get_session() as _sess:
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS approval_scopes (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR NOT NULL,
                scope VARCHAR(100) NOT NULL,
                granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_approval_scope_user_scope UNIQUE (user_id, scope)
            )
        """))
    print("[approval_scopes] table ensured")
    async with get_session() as _sess:
        await _sess.execute(_sa_text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS transcripts_unlocked BOOLEAN NOT NULL DEFAULT false"
        ))
    print("[users] transcripts_unlocked column ensured")
    # Drop the old `server_default='gemini'` on conversations.model. Every
    # call site (chat.py, forge.py, focus.py, cli.py) already passes a model
    # explicitly; the default was a silent fallback that could hide a bug
    # where future code paths forgot to set it. Idempotent — Postgres turns
    # ALTER COLUMN ... DROP DEFAULT into a no-op when no default exists.
    async with get_session() as _sess:
        await _sess.execute(_sa_text(
            "ALTER TABLE conversations ALTER COLUMN model DROP DEFAULT"
        ))
    print("[conversations] silent 'gemini' default dropped from model column")
    async with get_session() as _sess:
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS ws_modules (
                id SERIAL PRIMARY KEY,
                slug VARCHAR(120) UNIQUE NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                owner_id VARCHAR NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'inactive',
                handler_code TEXT,
                ui_meta JSONB NOT NULL DEFAULT '{}',
                route_config JSONB NOT NULL DEFAULT '{}',
                error_log TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                content_hash VARCHAR(64),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
    async with get_session() as _sess:
        await _sess.execute(_sa_text(
            "ALTER TABLE ws_modules ADD COLUMN IF NOT EXISTS last_swapped_at TIMESTAMP"
        ))
    print("[ws_modules] table ensured")
    async with get_session() as _sess:
        # agent_runs / agent_logs / settings — backbone for per-recursion-level
        # structured logging, cut-mode + cap enforcement, fleet view.
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS agent_runs (
                id VARCHAR PRIMARY KEY,
                parent_run_id VARCHAR,
                root_run_id VARCHAR,
                depth INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                orchestration_mode VARCHAR(40) NOT NULL DEFAULT 'single',
                cut_mode VARCHAR(10) NOT NULL DEFAULT 'soft',
                providers JSONB NOT NULL DEFAULT '[]'::jsonb,
                bandit_pull JSONB,
                spawned_by_tool VARCHAR(80),
                task_summary TEXT,
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                total_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0
            )
        """))
        # Task #112 — bandit_pull captures {domain, arm_id, ucb_score,
        # pulls_before, pcna_id} so post-crash reward attribution is
        # explicit, not inferred from the providers list.
        await _sess.execute(_sa_text(
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS bandit_pull JSONB"
        ))
        # Task #122 — sub-agent supervision hardening. Worker liveness,
        # crash reaping, and explicit retry policy. last_heartbeat_at is
        # advanced by the per-run heartbeat task; the stale-sweep loop
        # uses (status, last_heartbeat_at) to find dead claims. worker_id
        # records *which* process owns the claim so the no-orphan
        # contract can match registry entries to DB rows. retry_policy
        # is per-row and defaults to 'none' (current behavior).
        for _alter in (
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMP",
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_policy VARCHAR(40) NOT NULL DEFAULT 'none'",
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(120)",
            "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS worker_id VARCHAR(120)",
        ):
            await _sess.execute(_sa_text(_alter))
        # Backfill heartbeat for existing rows so the sweep doesn't reap
        # them on first boot. NULL stays NULL where started_at is NULL.
        await _sess.execute(_sa_text(
            "UPDATE agent_runs SET last_heartbeat_at = started_at "
            "WHERE last_heartbeat_at IS NULL AND started_at IS NOT NULL"
        ))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS agent_logs (
                id VARCHAR PRIMARY KEY,
                run_id VARCHAR NOT NULL,
                depth INTEGER NOT NULL DEFAULT 0,
                parent_run_id VARCHAR,
                level VARCHAR(8) NOT NULL DEFAULT 'INFO',
                event VARCHAR(40) NOT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR NOT NULL DEFAULT '',
                key VARCHAR(120) NOT NULL,
                value JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_settings_user_key UNIQUE (user_id, key)
            )
        """))
        for _idx in (
            "CREATE INDEX IF NOT EXISTS idx_agent_runs_parent ON agent_runs(parent_run_id)",
            "CREATE INDEX IF NOT EXISTS idx_agent_runs_root_started ON agent_runs(root_run_id, started_at)",
            "CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started ON agent_runs(status, started_at DESC)",
            # Task #122 — feeds the stale-claim sweep without scanning.
            "CREATE INDEX IF NOT EXISTS idx_agent_runs_status_heartbeat ON agent_runs(status, last_heartbeat_at)",
            "CREATE INDEX IF NOT EXISTS idx_agent_logs_run_ts ON agent_logs(run_id, ts)",
            "CREATE INDEX IF NOT EXISTS idx_agent_logs_parent_depth_ts ON agent_logs(parent_run_id, depth, ts)",
            "CREATE INDEX IF NOT EXISTS idx_agent_logs_event_ts ON agent_logs(event, ts DESC)",
        ):
            await _sess.execute(_sa_text(_idx))
    async with get_session() as _sess:
        # Fleet benchmarking: persistent contestants + runs.
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS fleet_benchmarks (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR NOT NULL,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL DEFAULT '',
                mode VARCHAR(20) NOT NULL DEFAULT 'one_shot',
                judge_enabled BOOLEAN NOT NULL DEFAULT false,
                judge_model VARCHAR(80),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS fleet_contestants (
                id SERIAL PRIMARY KEY,
                benchmark_id INTEGER NOT NULL REFERENCES fleet_benchmarks(id) ON DELETE CASCADE,
                slot INTEGER NOT NULL,
                label TEXT NOT NULL DEFAULT '',
                provider_id VARCHAR(80) NOT NULL,
                model_id VARCHAR(120) NOT NULL DEFAULT '',
                agent_id INTEGER,
                orchestration_mode VARCHAR(40) NOT NULL DEFAULT 'single',
                providers JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_fleet_contestants_slot UNIQUE (benchmark_id, slot)
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS fleet_benchmark_runs (
                id VARCHAR PRIMARY KEY,
                benchmark_id INTEGER NOT NULL REFERENCES fleet_benchmarks(id) ON DELETE CASCADE,
                user_id VARCHAR NOT NULL,
                prompt_snapshot TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS fleet_contestant_runs (
                id VARCHAR PRIMARY KEY,
                run_id VARCHAR NOT NULL REFERENCES fleet_benchmark_runs(id) ON DELETE CASCADE,
                contestant_id INTEGER NOT NULL,
                slot INTEGER NOT NULL,
                conversation_id INTEGER,
                status VARCHAR(20) NOT NULL DEFAULT 'running',
                content TEXT NOT NULL DEFAULT '',
                error TEXT,
                latency_ms INTEGER NOT NULL DEFAULT 0,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
                started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS fleet_judgments (
                id SERIAL PRIMARY KEY,
                run_id VARCHAR NOT NULL REFERENCES fleet_benchmark_runs(id) ON DELETE CASCADE,
                judge_model VARCHAR(120) NOT NULL,
                scores JSONB NOT NULL DEFAULT '{}'::jsonb,
                winner_contestant_id INTEGER,
                rationale TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        for _idx in (
            "CREATE INDEX IF NOT EXISTS idx_fleet_benchmarks_user ON fleet_benchmarks(user_id, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_fleet_contestants_bench ON fleet_contestants(benchmark_id, slot)",
            "CREATE INDEX IF NOT EXISTS idx_fleet_runs_bench ON fleet_benchmark_runs(benchmark_id, started_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_fleet_contestant_runs_run ON fleet_contestant_runs(run_id, slot)",
        ):
            await _sess.execute(_sa_text(_idx))
    print("[fleet_benchmarks] tables ensured")
    async with get_session() as _sess:
        for _ddl in (
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS orchestration_mode VARCHAR(32) DEFAULT 'single'",
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS cut_mode VARCHAR(8) DEFAULT 'soft'",
            "ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_run_id VARCHAR",
        ):
            await _sess.execute(_sa_text(_ddl))
    print("[messages] orchestration columns ensured")
    async with get_session() as _sess:
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS transcript_uploads (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(120),
                filename TEXT NOT NULL,
                mime VARCHAR(120),
                byte_size INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(24) NOT NULL DEFAULT 'queued',
                error TEXT,
                source_slug VARCHAR(100),
                report_id INTEGER,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS transcript_messages (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL,
                idx INTEGER NOT NULL DEFAULT 0,
                speaker VARCHAR(120),
                content TEXT,
                cm REAL DEFAULT 0,
                da REAL DEFAULT 0,
                drift REAL DEFAULT 0,
                dvg REAL DEFAULT 0,
                int_val REAL DEFAULT 0,
                tbf REAL DEFAULT 0,
                directives_fired JSONB
            )
        """))
        for _ddl in (
            "ALTER TABLE transcript_reports ADD COLUMN IF NOT EXISTS risk_loop REAL DEFAULT 0",
            "ALTER TABLE transcript_reports ADD COLUMN IF NOT EXISTS risk_fixation REAL DEFAULT 0",
            "ALTER TABLE transcript_reports ADD COLUMN IF NOT EXISTS correction_fidelity REAL DEFAULT 0",
            "ALTER TABLE transcript_reports ADD COLUMN IF NOT EXISTS edcmbone_version VARCHAR(40)",
            "CREATE INDEX IF NOT EXISTS idx_transcript_uploads_user ON transcript_uploads(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_transcript_uploads_report ON transcript_uploads(report_id)",
            "CREATE INDEX IF NOT EXISTS idx_transcript_messages_report ON transcript_messages(report_id, idx)",
        ):
            await _sess.execute(_sa_text(_ddl))
        # FK hardening — wrapped per-statement so an existing constraint name doesn't abort the lot.
        for _fk in (
            ("fk_transcript_uploads_report",
             "ALTER TABLE transcript_uploads ADD CONSTRAINT fk_transcript_uploads_report "
             "FOREIGN KEY (report_id) REFERENCES transcript_reports(id) ON DELETE SET NULL"),
            ("fk_transcript_messages_report",
             "ALTER TABLE transcript_messages ADD CONSTRAINT fk_transcript_messages_report "
             "FOREIGN KEY (report_id) REFERENCES transcript_reports(id) ON DELETE CASCADE"),
        ):
            try:
                exists = await _sess.execute(_sa_text(
                    "SELECT 1 FROM pg_constraint WHERE conname = :n"
                ), {"n": _fk[0]})
                if exists.scalar_one_or_none() is None:
                    await _sess.execute(_sa_text(_fk[1]))
            except Exception as _e:
                print(f"[transcript_*] FK skipped ({_fk[0]}): {_e}")
    print("[transcript_*] tables/columns ensured")
    # --- EDCMbone explainer tables ---
    async with get_session() as _sess:
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS transcript_explanations (
                id SERIAL PRIMARY KEY,
                report_id INTEGER NOT NULL UNIQUE,
                user_id VARCHAR(120) NOT NULL,
                model_id VARCHAR(80) NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                cost_cents INTEGER NOT NULL DEFAULT 0,
                body TEXT NOT NULL,
                citations JSONB NOT NULL DEFAULT '[]'::jsonb,
                paid_with VARCHAR(8) NOT NULL DEFAULT 'free',
                paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # Idempotent column add for existing deploys created before paid_at
        # was part of the schema. Safe to run on a fresh deploy too.
        await _sess.execute(_sa_text(
            "ALTER TABLE transcript_explanations "
            "ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
        ))
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS explanation_credits (
                user_id VARCHAR(120) PRIMARY KEY,
                free_remaining INTEGER NOT NULL DEFAULT 3,
                paid_remaining INTEGER NOT NULL DEFAULT 0,
                lifetime_purchased INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        await _sess.execute(_sa_text(
            "CREATE INDEX IF NOT EXISTS idx_transcript_explanations_user "
            "ON transcript_explanations(user_id, created_at DESC)"
        ))
        # FK to transcript_reports — cascade so a report deletion (rare,
        # operator-initiated) cleans up its paid explanation row too.
        try:
            exists = await _sess.execute(_sa_text(
                "SELECT 1 FROM pg_constraint WHERE conname = 'fk_explanations_report'"
            ))
            if exists.scalar_one_or_none() is None:
                await _sess.execute(_sa_text(
                    "ALTER TABLE transcript_explanations ADD CONSTRAINT fk_explanations_report "
                    "FOREIGN KEY (report_id) REFERENCES transcript_reports(id) ON DELETE CASCADE"
                ))
        except Exception as _e:
            print(f"[transcript_explanations] FK skipped: {_e}")
    print("[transcript_explanations/explanation_credits] tables ensured")
    print("[agent_runs/agent_logs/settings] tables ensured")
    # Task #112 — bandit_pulls is the append-only audit log for each
    # bandit-driven spawn. Live state lives on the PCNA core
    # (PCNAEngine.bandit_state); this table is for time-series
    # analysis only — never required to make the next decision.
    async with get_session() as _sess:
        await _sess.execute(_sa_text("""
            CREATE TABLE IF NOT EXISTS bandit_pulls (
                id SERIAL PRIMARY KEY,
                spawn_id VARCHAR NOT NULL,
                parent_pcna_id VARCHAR NOT NULL,
                domain VARCHAR(40) NOT NULL,
                arm_id TEXT NOT NULL,
                reward REAL NOT NULL,
                reward_shape VARCHAR(40) NOT NULL DEFAULT 'coherence_per_dollar',
                cost_usd REAL NOT NULL DEFAULT 0,
                ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """))
        # cost_usd added after initial deploy — backfill column on existing tables.
        await _sess.execute(_sa_text(
            "ALTER TABLE bandit_pulls ADD COLUMN IF NOT EXISTS "
            "cost_usd REAL NOT NULL DEFAULT 0"
        ))
        for _idx in (
            "CREATE INDEX IF NOT EXISTS idx_bandit_pulls_domain_ts "
            "ON bandit_pulls(domain, ts DESC)",
            "CREATE INDEX IF NOT EXISTS idx_bandit_pulls_arm_ts "
            "ON bandit_pulls(domain, arm_id, ts DESC)",
            "CREATE INDEX IF NOT EXISTS idx_bandit_pulls_spawn "
            "ON bandit_pulls(spawn_id)",
        ):
            await _sess.execute(_sa_text(_idx))
    print("[bandit_pulls] audit-log table ensured")
    # Task #112 — bandit_arms is fully retired. Live arm state lives
    # on PCNAEngine.bandit_state (see GET /api/v1/bandits/state); the
    # append-only audit log lives in bandit_pulls. We snapshot row
    # count to the log on the way out so operators are not surprised
    # by data loss on first boot after the migration.
    #
    # The probe and the drop MUST run in separate sessions: if
    # bandit_arms doesn't exist, the probe SELECT raises UndefinedTable
    # which poisons the transaction (asyncpg) — a subsequent DROP in
    # the same session then fails with "current transaction is aborted"
    # and crashes the entire FastAPI lifespan. Two sessions = two
    # independent transactions.
    try:
        async with get_session() as _sess:
            n = (await _sess.execute(_sa_text(
                "SELECT COUNT(*) AS n FROM bandit_arms"
            ))).scalar() or 0
            if n:
                print(f"[bandit_arms] dropping legacy table ({n} rows); "
                      "live state moved to PCNAEngine.bandit_state.")
    except Exception:
        # Table may already be gone on a re-boot after first migration.
        pass
    async with get_session() as _sess:
        await _sess.execute(_sa_text("DROP TABLE IF EXISTS bandit_arms"))
    print("[bandit_arms] legacy table dropped (Task #112)")
    await _seed_system_shadow_modules()
    print("[ws_modules] system shadows seeded")
    from .services.provider_seeds_bootstrap import seed_provider_modules
    from .services.energy_registry import BUILTIN_PROVIDERS as _BP
    _prov_changed = await seed_provider_modules()
    print(f"[providers] {_prov_changed} provider seed(s) upserted ({len(_BP)} total in catalog)")
    _hot_count = await get_registry().load_all_active()
    if _hot_count:
        print(f"[module_registry] {_hot_count} hot-swap module(s) mounted")
    from .storage import storage as _storage
    _res_toggle = await _storage.get_system_toggle("zfae:resolution")
    if _res_toggle and _res_toggle.get("parameters"):
        from .engine.zeta import _zeta_engine
        _zeta_engine.load_resolution_config(_res_toggle["parameters"])
        print(f"[zfae] resolution config loaded — global={_zeta_engine.resolution_config.get('global')}")
    from .engine.sigma import get_sigma
    _sigma = get_sigma()
    _sigma.start_watch()
    print(f"[sigma] Σ online — n={_sigma.n}, resolution={_sigma.resolution}")
    await heartbeat_service.start()
    # Periodic sweep so expired chat-approval gates don't accumulate on a quiet system.
    from .routes.chat import pending_gate_sweep_loop
    from .services.bg_tasks import spawn as _spawn_bg
    _spawn_bg(pending_gate_sweep_loop(), name="pending_gate_sweep")
    print("[chat] pending-gate sweep loop started")
    from .services.spawn_executor import (
        _poll_loop as _spawn_exec_loop,
        _stale_sweep_loop as _spawn_sweep_loop,
        HEARTBEAT_INTERVAL_S as _hb_s,
        STALE_SWEEP_INTERVAL_S as _sweep_s,
        WORKER_ID as _worker_id,
    )
    _spawn_bg(_spawn_exec_loop(), name="spawn_executor_poll")
    print("[spawn_executor] poll loop started — pending agent_runs will be executed")
    # Task #122 — supervision sweep. Reaps 'executing' rows whose
    # heartbeat is stale past 2× the interval. Owned by the same
    # bg_tasks lifespan as the poller so cancel_all takes both down.
    _spawn_bg(_spawn_sweep_loop(), name="spawn_executor_sweep")
    print(
        f"[spawn_executor] stale-sweep started (heartbeat={_hb_s:.0f}s, "
        f"sweep={_sweep_s:.0f}s, worker_id={_worker_id})"
    )
    yield
    await heartbeat_service.stop()
    try:
        from .services.bg_tasks import cancel_all as _bg_cancel_all
        await _bg_cancel_all()
    except Exception as exc:
        print(f"[python] bg-task cancel_all failed: {exc}")
    await engine.dispose()
    print("[python] FastAPI shutdown")


app = FastAPI(title="A0P Python Backend", lifespan=lifespan)
initialize_registry(app)

_IS_PROD = os.environ.get("NODE_ENV") == "production" or os.environ.get("ENV") == "production"
_INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET")
if not _INTERNAL_SECRET:
    if _IS_PROD:
        raise RuntimeError(
            "[python] INTERNAL_API_SECRET env var is required in production. "
            "Set it before starting the server."
        )
    print(
        "[python] WARNING: INTERNAL_API_SECRET is unset — generating an ephemeral "
        "per-process secret. Cross-process calls from the Express front will fail "
        "until you set INTERNAL_API_SECRET (scripts/start-dev.sh sets it for dev)."
    )
    # No hardcoded default. scripts/start-dev.sh exports a shared random value
    # before forking both processes; if it's still unset here we mint a per-process
    # random so the secret is never a known constant.
    import secrets as _secrets_mod
    _INTERNAL_SECRET = "dev-" + _secrets_mod.token_hex(24)

_OPEN_PATHS = {"/api/health", "/api/v1/guest/chat"}


class InternalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in _OPEN_PATHS):
            return await call_next(request)
        token = request.headers.get("x-a0p-internal")
        if not token:
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized: internal token missing"},
            )
        if token != _INTERNAL_SECRET:
            return JSONResponse(
                status_code=403,
                content={"error": "Forbidden: invalid internal token"},
            )
        return await call_next(request)


_allowed_origins = []
_domains = os.environ.get("REPLIT_DOMAINS", "")
if _domains:
    _allowed_origins = [f"https://{d}" for d in _domains.split(",")]
_allowed_origins.append("http://localhost:5000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(InternalAuthMiddleware)

for r in ALL_ROUTERS:
    app.include_router(r)


@app.get("/api/health")
async def health():
    pcna = get_pcna()
    provider = energy_registry.get_active_provider()
    return {
        "status": "ok",
        "service": "python-backend",
        "pcna": "online",
        "instance_id": pcna.theta.instance_id,
        "agent": compose_name(provider),
        "energy_provider": provider,
        "uptime_s": round(time.time() - pcna.created_at, 1),
        "heartbeat": heartbeat_service.status(),
    }


@app.get("/api/v1/ui/structure")
async def ui_structure():
    from .storage import storage as _storage
    base_tabs = collect_ui_meta()
    ws_tabs = await _storage.get_active_ws_module_ui_metas()
    all_tabs = base_tabs + ws_tabs
    all_tabs.sort(key=lambda t: t.get("order", 99))
    return {
        "tabs": all_tabs,
        "agent": compose_name(energy_registry.get_active_provider()),
        "version": "2.0.0",
    }


IS_PROD = os.environ.get("NODE_ENV") == "production"
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if IS_PROD and os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
# 349:367
