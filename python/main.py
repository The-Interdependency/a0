# 169:97
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
        _instances[_pcna.guardian.instance_id] = _pcna
    return _pcna


def get_pcna_8() -> PCNAEngine:
    global _pcna_8
    if _pcna_8 is None:
        _pcna_8 = PCNAEngine(phases=8)
    return _pcna_8


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
    "manage_approval_scope": {
        "description": "Grant or revoke a pre-approved action scope for the current user — eliminates per-gate APPROVE prompts for that category.",
        "handler_type": "internal",
    },
    "set_user_tier": {
        "description": "Set a user's subscription tier (admin-only). Params: user_id (string), tier (string — one of: free, ws, pro, admin, seeker, operator, patron, founder). Requires the calling session to have is_admin: true. Changes take effect immediately without a subscription change.",
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
    await _seed_system_shadow_modules()
    print("[ws_modules] system shadows seeded")
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
    from .routes.chat import _ensure_chat_schema
    await _ensure_chat_schema()
    await heartbeat_service.start()
    yield
    await heartbeat_service.stop()
    await engine.dispose()
    print("[python] FastAPI shutdown")


app = FastAPI(title="A0P Python Backend", lifespan=lifespan)
initialize_registry(app)

_INTERNAL_SECRET = os.environ.get("INTERNAL_API_SECRET", "a0p-dev-internal-secret")

_OPEN_PATHS = {"/api/health", "/api/v1/guest/chat", "/api/v1/cli/chat"}


class InternalAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        if any(path.startswith(p) for p in _OPEN_PATHS):
            return await call_next(request)
        token = request.headers.get("x-a0p-internal", "")
        if token != _INTERNAL_SECRET:
            return JSONResponse(status_code=403, content={"error": "Forbidden"})
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
        "instance_id": pcna.guardian.instance_id,
        "agent": compose_name(provider),
        "energy_provider": provider,
        "uptime_s": round(time.time() - pcna.created_at, 1),
        "heartbeat": heartbeat_service.status(),
    }


@app.get("/api/v1/ui/structure")
async def ui_structure():
    from .storage import storage as _storage
    base_tabs = collect_ui_meta()

    # Merge admin-customised ui_meta from system module DB records over the
    # hardcoded base tabs.  Only non-empty overrides are applied, keyed by
    # tab_id so mismatches are silently skipped.
    sys_mods = await _storage.list_ws_modules()
    sys_overrides: dict[str, dict] = {}
    for mod in sys_mods:
        if mod.get("status") != "system":
            continue
        db_meta = mod.get("ui_meta") or {}
        if db_meta:
            tid = db_meta.get("tab_id")
            if tid:
                sys_overrides[tid] = db_meta

    merged_tabs = []
    for tab in base_tabs:
        tid = tab.get("tab_id")
        override = sys_overrides.get(tid, {}) if tid else {}
        merged_tabs.append({**tab, **override})

    ws_tabs = await _storage.get_active_ws_module_ui_metas()
    all_tabs = merged_tabs + ws_tabs
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
# 169:97
