from .chat import router as chat_router
from .agents import router as agents_router
from .memory import router as memory_router
from .edcm import router as edcm_router
from .bandits import router as bandits_router
from .system import router as system_router
from .tools import router as tools_router
from .heartbeat_api import router as heartbeat_api_router
from .pcna_api import router as pcna_router
from .billing import router as billing_router
from .contexts import router as contexts_router, context_tab_router
from .founders import router as founders_router
from .admin import router as admin_router
from .guest import router as guest_router
from .openai_api import router as openai_router

ALL_ROUTERS = [
    chat_router,
    agents_router,
    memory_router,
    edcm_router,
    bandits_router,
    system_router,
    tools_router,
    heartbeat_api_router,
    pcna_router,
    billing_router,
    contexts_router,
    context_tab_router,
    founders_router,
    admin_router,
    guest_router,
    openai_router,
]


def collect_ui_meta() -> list[dict]:
    import importlib
    modules = [
        "python.routes.chat",
        "python.routes.agents",
        "python.routes.memory",
        "python.routes.edcm",
        "python.routes.bandits",
        "python.routes.system",
        "python.routes.tools",
        "python.routes.heartbeat_api",
        "python.routes.pcna_api",
        "python.routes.billing",
        "python.routes.contexts",
        "python.routes.founders",
        "python.routes.openai_api",
    ]
    tabs = []
    for mod_name in modules:
        mod = importlib.import_module(mod_name)
        meta = getattr(mod, "UI_META", None)
        if meta:
            tabs.append(meta)
    tabs.sort(key=lambda t: t.get("order", 99))
    return tabs
