#!/usr/bin/env python3
"""A0 AHBG sidecar: per-turn observe/resolve boundary over the pinned Stack
runtime engine. A0 owns sessions, agents, authorization and persistence; this
sidecar only runs the producer game engine and returns attributed board state.

Producer: The-Interdependency/stack @ 9de81c67b271df09c1d9ba5422660c96fe8af7ac
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "vendor"
STACK = BASE / "stack"
if STACK.exists():
    sys.path.insert(0, str(STACK))

from ahbg.runtime.runtime import (  # noqa: E402
    RuntimeConfig,
    _default_units,
    _map_tile,
)
from ahbg.runtime import runtime as rt  # noqa: E402
from ahbg.runtime.provenance import integration_provenance  # noqa: E402
from ahbg.runtime.protocol import (  # noqa: E402
    CAPABILITIES,
    LegalAction,
    Observation,
    ProtocolError,
    build_legal_actions,
    parse_plan_payload,
)

STATE_DIR = Path(os.environ.get("A0_AHBG_STATE_DIR", "/srv/a0/ahbg"))
STATE_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS: dict[str, dict] = {}


def _new_session(session_id: str, seed: int, turns: int, unit_label: str) -> dict:
    tiles = rt.tile_from_ucns()
    units = _default_units()
    units[0]["label"] = unit_label or "A0"
    units[0]["unit_id"] = "A0"
    opened = rt.Field.open(seed=seed, tiles=tiles, units=units)
    chain = rt.Chain()
    chain.append(rt.KIND_PLANE_INIT, 0, {"field": opened.snapshot()})
    cycle = rt.Cycle(opened, chain)
    out_dir = STATE_DIR / session_id
    out_dir.mkdir(parents=True, exist_ok=True)
    ledger = rt.ConstructionLedger.open(opened)
    session = {
        "session_id": session_id,
        "seed": seed,
        "turns": turns,
        "turn": 0,
        "opened": opened,
        "chain": chain,
        "cycle": cycle,
        "ledger": ledger,
        "out_dir": out_dir,
        "records": [],
        "capabilities": ("observe", "plan", "relocate", "construct"),
        "turn_open": False,
        "observation": None,
    }
    SESSIONS[session_id] = session
    return session


def _observation(session: dict) -> Observation:
    opened = session["opened"]
    legal = list(build_legal_actions(opened))
    for unit in opened.occupants.values():
        for tile_id in session["ledger"].legal_build_tiles(opened):
            legal.append(LegalAction(unit_id=unit.unit_id, action="construct", from_tile_id=unit.tile_id, to_tile_id=tile_id))
    return Observation(
        session_id=session["session_id"],
        turn=opened.turn,
        field=opened.snapshot(),
        capabilities=tuple(session["capabilities"]),
        legal=tuple(legal),
        feed=tuple(record.payload() for record in session["chain"].records),
        inbox=(),
        entitlements=("basic",),
        deadline_ms=5000,
        language_evidence=(),
    )


def _resolve(session: dict, plan_payload: dict) -> dict:
    opened = session["opened"]
    chain = session["chain"]
    cycle = session["cycle"]
    ledger = session["ledger"]
    observation = session.get("observation") or _observation(session)
    # Validate before any mutation; a rejected plan never advances the turn.
    plan = parse_plan_payload(plan_payload, observation)
    moves = [intent.as_move() for intent in plan.intents if intent.action == "relocate"]
    builds = [intent for intent in plan.intents if intent.action == "construct"]
    if len({b.to_tile_id for b in builds}) != len(builds):
        raise ProtocolError("one construct intent per target tile per turn")
    before = len(chain.records)
    cycle.resolve(moves)
    digest = cycle.close_turn()
    new_records = chain.records[before:]
    build_events = []
    for build in builds:
        ledger, event = ledger.apply_build(opened, unit_id=build.unit_id, from_tile_id=build.from_tile_id, to_tile_id=build.to_tile_id)
        build_events.append(event)
    ledger.dump(session["out_dir"])
    effect = {"session_id": session["session_id"], "turn": opened.turn, "events": [r.payload() for r in new_records] + build_events}
    record = {
        "turn": opened.turn,
        "submitted_plan": plan.as_dict(),
        "plan": plan.as_dict(),
        "effect": effect,
        "construction": ledger.as_dict(),
        "state_digest": digest,
    }
    session["records"].append(record)
    rt.dump_field(opened, chain, session["out_dir"] / "state")
    session["turn"] = opened.turn
    session["turn_open"] = False
    session["observation"] = None
    return record


def _summary(session: dict) -> dict:
    return {
        "session_id": session["session_id"],
        "seed": session["seed"],
        "turns": session["turns"],
        "turn": session["turn"],
        "board": _observation(session).as_dict(),
        "records": session["records"],
        "provenance": {**integration_provenance({"capabilities": list(session["capabilities"]), "session_id": session["session_id"], "a0_source_commit": os.environ.get("A0_SOURCE_COMMIT", "unrecorded")})},
    }


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, payload):
        body = json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        return json.loads(self.rfile.read(n) or b"{}") if n > 0 else {}

    def do_GET(self):
        if self.path == "/health":
            return self._json(200, {"ok": True})
        if self.path.startswith("/state/"):
            sid = self.path.split("/")[-1]
            session = SESSIONS.get(sid)
            if not session:
                return self._json(404, {"error": "no session"})
            return self._json(200, _summary(session))
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        data = self._read()
        if self.path == "/new":
            sid = data.get("id") or hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
            session = _new_session(sid, int(data.get("seed", 1)), int(data.get("turns", 8)), str(data.get("label", "A0")))
            return self._json(200, _summary(session))
        if self.path == "/observe":
            session = SESSIONS.get(data.get("id"))
            if not session:
                return self._json(404, {"error": "no session"})
            if not session["turn_open"]:
                session["cycle"].open_turn()
                session["turn_open"] = True
            obs = _observation(session)
            session["observation"] = obs
            return self._json(200, {"observation": obs.as_dict()})
        if self.path == "/replay":
            session = SESSIONS.get(data.get("id"))
            if not session:
                return self._json(404, {"error": "no session"})
            try:
                loaded, loaded_chain = rt.load_field(session["out_dir"] / "state")
                replayed = rt.replay(loaded_chain)
                match = (replayed.snapshot() == session["opened"].snapshot() and loaded.snapshot() == session["opened"].snapshot())
                return self._json(200, {"match": match, "state_digest": session["records"][-1]["state_digest"] if session["records"] else None})
            except Exception as exc:
                return self._json(500, {"error": f"{type(exc).__name__}: {exc}"})
        if self.path == "/resolve":
            session = SESSIONS.get(data.get("id"))
            if not session:
                return self._json(404, {"error": "no session"})
            try:
                record = _resolve(session, data.get("plan") or {})
                return self._json(200, {"record": record, "summary": _summary(session)})
            except Exception as exc:  # ProtocolError or engine failure
                return self._json(400, {"error": f"{type(exc).__name__}: {exc}"})
        return self._json(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(os.environ.get("A0_AHBG_PORT", "8792"))
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
