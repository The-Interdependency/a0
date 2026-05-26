# 8:2 0:0 0:1
# a0/service/app.py
# hmmm: keep off until you want it. Requires: pip install fastapi uvicorn

from __future__ import annotations
from typing import Any, Dict
from fastapi import FastAPI
from ..connectors.emergent_connector import handle_hub_payload

app = FastAPI()

@app.post("/a0")
def a0_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    return handle_hub_payload(payload)
# 8:2 0:0 0:1
