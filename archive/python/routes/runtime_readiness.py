# 18:43 1:2 1:1
from fastapi import APIRouter, HTTPException

from ..services.runtime_readiness import build_readiness_report

# === MODULE_BUILD ===
# id: a0_runtime_readiness_route
#   module_name: runtime_readiness_route
#   module_kind: route
#   summary: Exposes liveness and dependency-aware readiness for the complete a0 deployment unit.
#   owner: Erin Spencer
#   public_surface: GET /api/v1/runtime/live, GET /api/v1/runtime/ready
#   internal_surface: live, ready
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   tests: python.tests.test_runtime_readiness
#   rollout: registered in python.routes.ALL_ROUTERS
#   rollback: unregister the router
#   requires: a0_runtime_readiness
#   since: 2026-08-04
#   unresolved: Replit health-check path configuration
# === END MODULE_BUILD ===

# === BOUNDARIES ===
# id: runtime_readiness_route_boundary
#   summary: Returns process and dependency health without exposing secrets, provider details, or user data.
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: internal
#   user_data_boundary: none
#   admin_only: false
#   pii: none
#   secrets: none
#   side_effects: none
#   review_required: platform-runtime
#   owner: platform-runtime
#   since: 2026-08-04
# === END BOUNDARIES ===

# DOC module: runtime_readiness
# DOC label: Runtime Readiness
# DOC description: Liveness and dependency-aware readiness endpoints for deployment supervision and Replit health checks.
# DOC tier: free
# DOC role: route
# DOC endpoint: GET /api/v1/runtime/live | Confirm that the FastAPI process is accepting requests
# DOC endpoint: GET /api/v1/runtime/ready | Confirm required configuration, PostgreSQL, and heartbeat readiness
# DOC notes: Readiness reports dependency classes only; it never returns secret values or user data.

DATA_SCHEMA = {
    "endpoints": [
        {"method": "GET", "path": "/api/v1/runtime/live"},
        {"method": "GET", "path": "/api/v1/runtime/ready"},
    ]
}

router = APIRouter(prefix="/api/v1/runtime", tags=["runtime"])


@router.get("/live")
async def live() -> dict[str, str]:
    return {"status": "live", "service": "a0-python"}


@router.get("/ready")
async def ready() -> dict:
    report = await build_readiness_report()
    if not report["ready"]:
        raise HTTPException(status_code=503, detail=report)
    return report
# 18:43 1:2 1:1
