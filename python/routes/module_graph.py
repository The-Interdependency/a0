# 76:7 0:2 1:1
# DOC module: module_graph
# DOC label: ⬡ Module Graph
# DOC description: Live MODULE_BUILD coverage of the workspace. Walks the source tree, parses MODULE_BUILD manifests, and surfaces typed modules plus unstamped files as visible coverage gaps. Read-only; the data layer for the filesystem module visualizer.
# DOC tier: ws
# DOC role: api
# DOC endpoint: GET /api/v1/module-graph/state | Coverage summary, kind breakdown, gaps by area, and manifest issues
# DOC endpoint: GET /api/v1/module-graph/nodes | Full module-graph node list (path, kind, stamped, issues)

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["module_graph"])

UI_META = {
    "tab_id": "module_graph",
    "label": "⬡ Modules",
    "icon": "Network",
    "order": 13,
    "sections": [
        {
            "id": "coverage",
            "label": "MODULE_BUILD Coverage",
            "endpoint": "/api/v1/module-graph/state",
            "fields": [
                {"key": "coverage_label", "type": "text", "label": "Coverage"},
                {"key": "coverage_fraction", "type": "gauge", "label": "Coverage"},
                {"key": "modules", "type": "text", "label": "Modules"},
                {"key": "stamped", "type": "text", "label": "Stamped"},
                {"key": "gaps", "type": "text", "label": "Gaps"},
            ],
        },
        {
            "id": "kinds",
            "label": "Covered by Kind & Source",
            "endpoint": "/api/v1/module-graph/state",
            "fields": [
                {"key": "sources_summary", "type": "list", "label": "By Declaration Source"},
                {"key": "kinds_summary", "type": "list", "label": "By Module Kind"},
            ],
        },
        {
            "id": "gaps",
            "label": "Coverage Gaps by Area",
            "endpoint": "/api/v1/module-graph/state",
            "fields": [
                {"key": "gap_dirs", "type": "list", "label": "Unstamped by Top Dir"},
            ],
        },
        {
            "id": "issues",
            "label": "Manifest Issues",
            "endpoint": "/api/v1/module-graph/state",
            "fields": [
                {"key": "issues_list", "type": "list", "label": "Field-Validation Issues"},
            ],
        },
    ],
}


def _state() -> dict:
    from ..engine.module_graph import scan
    g = scan()
    kinds = sorted(g["kinds"].items(), key=lambda kv: (-kv[1], kv[0]))
    sources = sorted(g["sources"].items(), key=lambda kv: (-kv[1], kv[0]))
    gap_dirs = sorted(g["gap_dirs"].items(), key=lambda kv: (-kv[1], kv[0]))
    _src_label = {"module_build": "MODULE_BUILD manifest", "doc": "a0 DOC block"}
    issues = [
        f"{n['path']}: {'; '.join(n['issues'])}"
        for n in g["nodes"] if n["stamped"] and n["issues"]
    ]
    return {
        "coverage_label": f"{g['coverage_pct']}%",
        "coverage_fraction": round(g["coverage_pct"] / 100.0, 4),
        "modules": g["modules"],
        "stamped": g["stamped"],
        "gaps": g["gaps"],
        "sources_summary": [f"{_src_label.get(s, s)}: {c}" for s, c in sources],
        "kinds_summary": [f"{k}: {c}" for k, c in kinds],
        "gap_dirs": [f"{d}: {c}" for d, c in gap_dirs],
        "issues_list": issues or ["none — all stamped manifests valid"],
    }


@router.get("/module-graph/state")
async def module_graph_state():
    return _state()


@router.get("/module-graph/nodes")
async def module_graph_nodes():
    from ..engine.module_graph import scan
    return {"nodes": scan()["nodes"]}
# 76:7 0:2 1:1
