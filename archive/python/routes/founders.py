# 2:5 0:0 1:0
from fastapi import APIRouter

# DOC module: founders
# DOC label: Founders
# DOC description: Legacy founders module — retired with tier simplification.
# DOC tier: admin
# DOC role: route

router = APIRouter(prefix="/api/v1/founders", tags=["founders"])
# 2:5 0:0 1:0
