from __future__ import annotations

import sys

from .ptca.cores import build_guardian_core
from .router import handle, LOG_DIR
from .logging import log_event


def main() -> None:
    raw = (
        open(sys.argv[1], "r", encoding="utf-8").read()
        if len(sys.argv) > 1
        else sys.stdin.read()
    )
    guardian = build_guardian_core()
    cli = next(s for s in guardian.seeds if s.id == "guardian:cli")

    # Circle 0 — ingress: receive + BAD screen + parse → A0Request
    req = cli.circles[0].handler(raw)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:cli",
        "circle": 0, "phase": "ingress", "hmm": req.hmm,
    })

    resp = handle(req)

    # Circle 1 — validate: hmmm invariant gate (fail-closed, Core Law 14)
    resp = cli.circles[1].handler(resp)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:cli",
        "circle": 1, "phase": "validate", "hmm": resp.hmm,
    })

    # Circles 2–5 — artifact circles (response_text, artifacts, logs, hmm_display)
    for idx, phase in [
        (2, "response_text"),
        (3, "artifacts"),
        (4, "logs"),
        (5, "hmm_display"),
    ]:
        cli.circles[idx].handler(resp)
        log_event(LOG_DIR, req.task_id, {
            "type": "guardian", "seed": "guardian:cli",
            "circle": idx, "phase": phase, "hmm": resp.hmm,
        })

    # Circle 6 — egress: assemble + write to stdout
    cli.circles[6].handler(resp)
    log_event(LOG_DIR, req.task_id, {
        "type": "guardian", "seed": "guardian:cli",
        "circle": 6, "phase": "egress", "hmm": resp.hmm,
    })


if __name__ == "__main__":
    main()
