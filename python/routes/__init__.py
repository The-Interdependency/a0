# 140:4
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
from .zfae_api import router as zfae_router
from .approval_scopes import router as approval_scopes_router
from .ws_modules import router as ws_modules_router
from .docs import router as docs_router
from .sigma_api import router as sigma_router
from .editable_schema import router as editable_schema_router
from .cli import router as cli_router
from .focus import router as focus_router
from .forge import router as forge_router
from .energy import router as energy_router, pcna_router as energy_pcna_router

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
    zfae_router,
    approval_scopes_router,
    ws_modules_router,
    docs_router,
    sigma_router,
    editable_schema_router,
    cli_router,
    focus_router,
    forge_router,
    energy_router,
    energy_pcna_router,
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
        "python.routes.openai_api",
        "python.routes.zfae_api",
        "python.routes.approval_scopes",
        "python.routes.ws_modules",
        "python.routes.docs",
        "python.routes.sigma_api",
        "python.routes.editable_schema",
        "python.routes.cli",
        "python.routes.forge",
    ]
    tabs = []
    for mod_name in modules:
        mod = importlib.import_module(mod_name)
        meta = getattr(mod, "UI_META", None)
        if meta:
            tabs.append(meta)
    tabs.sort(key=lambda t: t.get("order", 99))
    return tabs


def _parse_doc_block(text: str) -> dict | None:
    """Parse # DOC comment lines from file text into a documentation dict."""
    import re
    doc: dict = {"endpoints": [], "notes": []}
    for line in text.splitlines():
        s = line.strip()
        if not s.startswith("# DOC "):
            continue
        rest = s[6:]
        if ":" not in rest:
            continue
        key, _, value = rest.partition(":")
        key = key.strip()
        value = value.strip()
        if key == "endpoint":
            doc["endpoints"].append(value)
        elif key == "notes":
            doc["notes"].append(value)
        else:
            doc[key] = value

    if "module" not in doc or "label" not in doc:
        return None

    # Parse endpoint strings into structured dicts
    parsed: list[dict] = []
    for ep in doc["endpoints"]:
        if "|" in ep:
            path_part, _, desc = ep.partition("|")
            parts = path_part.strip().split(None, 1)
            parsed.append({
                "method": parts[0] if parts else "",
                "path": parts[1] if len(parts) > 1 else "",
                "description": desc.strip(),
            })
        else:
            parsed.append({"method": "", "path": ep.strip(), "description": ""})
    doc["endpoints"] = parsed

    if not doc["notes"]:
        doc.pop("notes")

    # Pull code:comment ratio from first-line annotation if present
    first = text.splitlines()[0].strip() if text.splitlines() else ""
    m = re.match(r'^#\s*(\d+):(\d+)\s*$', first)
    if m:
        doc["code_lines"] = int(m.group(1))
        doc["comment_lines"] = int(m.group(2))

    return doc


def collect_doc_meta() -> list[dict]:
    """Aggregate # DOC comment blocks from all registered route files."""
    import os
    route_dir = os.path.dirname(os.path.abspath(__file__))
    route_files = [
        "chat.py", "agents.py", "memory.py", "edcm.py", "bandits.py",
        "system.py", "tools.py", "heartbeat_api.py", "pcna_api.py",
        "billing.py", "contexts.py", "openai_api.py",
        "zfae_api.py", "approval_scopes.py", "ws_modules.py", "docs.py",
        "sigma_api.py", "editable_schema.py", "cli.py", "forge.py",
    ]
    results: list[dict] = []
    for fname in route_files:
        path = os.path.join(route_dir, fname)
        try:
            text = open(path, encoding="utf-8").read()
        except FileNotFoundError:
            continue
        meta = _parse_doc_block(text)
        if meta:
            results.append(meta)
    results.sort(key=lambda d: d.get("label", ""))
    return results
# 140:4
