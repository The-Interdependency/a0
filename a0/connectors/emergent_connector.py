# a0/connectors/emergent_connector.py
# Guardian:http seed handles all HTTP UI mediation.
# This file is a thin shim — the UI logic lives in the guardian seed circles.

from __future__ import annotations

from typing import Any, Dict

from ..ptca.cores import build_guardian_core
from ..router import handle, LOG_DIR
from ..logging import log_event


def handle_hub_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    guardian = build_guardian_core()
    http = next(s for s in guardian.seeds if s.id == "guardian:http")

    # Circle 0 — ingress: receive + BAD screen + parse → A0Request
    req = http.circles[0].handler(payload)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:http",
        "circle": 0, "phase": "ingress", "hmm": req.hmm,
    })

    resp = handle(req)

    # Circle 1 — validate: hmmm invariant gate (fail-closed, Core Law 14)
    resp = http.circles[1].handler(resp)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:http",
        "circle": 1, "phase": "validate", "hmm": resp.hmm,
    })

    # Circles 2–6 — UI component circles (5 placeholders)
    for idx, phase in [
        (2, "agent_chat"),
        (3, "energy_display"),
        (4, "tools_display"),
        (5, "api_set"),
        (6, "env_display"),
    ]:
        http.circles[idx].handler(resp)
        log_event(LOG_DIR, req.task_id, {
            "type": "guardian", "seed": "guardian:http",
            "circle": idx, "phase": phase, "hmm": resp.hmm,
        })

    # Circle 7 — api_response: build POST /a0 JSON response body
    body = http.circles[7].handler(resp)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:http",
        "circle": 7, "phase": "api_response", "hmm": resp.hmm,
    })

    # Circle 8 — envelope: HTTP status, Content-Type, CORS
    body = http.circles[8].handler(body)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:http",
        "circle": 8, "phase": "envelope", "hmm": resp.hmm,
    })

    # Circle 9 — egress: return final response dict to FastAPI
    result = http.circles[9].handler(body)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:http",
        "circle": 9, "phase": "egress", "hmm": resp.hmm,
    })

    return result
