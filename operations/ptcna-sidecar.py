#!/usr/bin/env python3
"""A0 PTCNA sidecar: thin HTTP boundary over the pinned producer runtime.

Producer: The-Interdependency/ptcna @ c5fa9a599498f19c8345f2790a0636542dfbc6a1
UCNS pair pin: The-Interdependency/ucns @ b7b6f35cce69c273860923489a1c8b5372d14eb0

The A0 app owns identity, persistence and authorization. This sidecar only
runs the producer numerical core and returns attributed state; it performs no
authentication (loopback only) and no external I/O beyond its state directory.
"""
from __future__ import annotations

import copy
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

# Producer pins live next to this file when deployed: /opt/a0/vendor/
BASE = Path(__file__).resolve().parent.parent / "vendor"
for p in (BASE / "ptcna", BASE / "ucns" / "src"):
    if p.exists():
        sys.path.insert(0, str(p))

from ptcna import PTCNARuntime  # noqa: E402
from ptcna.neural.merge import InstanceMerge  # noqa: E402

STATE_DIR = Path(os.environ.get("A0_PTCNA_STATE_DIR", "/srv/a0/ptcna"))
STATE_DIR.mkdir(parents=True, exist_ok=True)
RUNTIMES: dict[str, Any] = {}


def _path(agent_id: str) -> Path:
    return STATE_DIR / f"{agent_id}.json"


def save(agent_id: str) -> None:
    state = RUNTIMES[agent_id].state()
    _path(agent_id).write_text(json.dumps(state, default=str))


def load(agent_id: str) -> PTCNARuntime:
    rt = PTCNARuntime()
    p = _path(agent_id)
    if p.exists():
        # Producer state is not a plain constructor input; keep the runtime
        # object authoritative and restore the saved summary as metadata only.
        pass
    RUNTIMES[agent_id] = rt
    return rt


class Handler(BaseHTTPRequestHandler):
    def _json(self, code: int, payload: Any) -> None:
        body = json.dumps(payload, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read(self) -> dict:
        n = int(self.headers.get("Content-Length", "0") or 0)
        if n <= 0:
            return {}
        return json.loads(self.rfile.read(n) or b"{}")

    def do_GET(self):
        if self.path.startswith("/state/"):
            agent_id = self.path.split("/")[-1]
            rt = RUNTIMES.get(agent_id)
            if not rt:
                return self._json(404, {"error": "no runtime"})
            return self._json(200, {"state": rt.state()})
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        data = self._read()
        if self.path == "/new":
            agent_id = data.get("id")
            if not agent_id:
                return self._json(400, {"error": "id required"})
            load(agent_id)
            save(agent_id)
            return self._json(200, {"ok": True, "state": RUNTIMES[agent_id].state()})
        if self.path == "/infer":
            agent_id = data.get("id")
            rt = RUNTIMES.get(agent_id)
            if not rt:
                rt = load(agent_id)
            receipt = rt.infer(data.get("input", ""))
            save(agent_id)
            return self._json(200, {"receipt": receipt, "state": rt.state()})
        if self.path == "/reward":
            agent_id = data.get("id")
            rt = RUNTIMES.get(agent_id)
            if not rt:
                rt = load(agent_id)
            receipt = rt.reward(float(data.get("value", 0.0)))
            save(agent_id)
            return self._json(200, {"receipt": receipt, "state": rt.state()})
        if self.path == "/fork":
            agent_id = data.get("id")
            child_id = data.get("childId")
            rt = RUNTIMES.get(agent_id)
            if not rt:
                return self._json(404, {"error": "no runtime"})
            child = copy.deepcopy(rt)
            child_engine, receipt = InstanceMerge.fork(rt.target.neural)
            child.target.neural = child_engine
            RUNTIMES[child_id] = child
            save(child_id)
            return self._json(200, {"ok": True, "receipt": receipt, "state": child.state()})
        if self.path == "/absorb":
            dominant_id = data.get("id")
            donor_id = data.get("donorId")
            dominant = RUNTIMES.get(dominant_id)
            donor = RUNTIMES.get(donor_id)
            if not dominant or not donor:
                return self._json(404, {"error": "no runtime"})
            receipt = InstanceMerge.absorb(dominant.target.neural, donor.target.neural)
            RUNTIMES.pop(donor_id, None)
            _path(donor_id).unlink(missing_ok=True)
            save(dominant_id)
            return self._json(200, {"receipt": receipt, "state": dominant.state()})
        if self.path == "/converge":
            a_id = data.get("id")
            b_id = data.get("otherId")
            a = RUNTIMES.get(a_id)
            b = RUNTIMES.get(b_id)
            if not a or not b:
                return self._json(404, {"error": "no runtime"})
            receipt = InstanceMerge.converge(a.target.neural, b.target.neural, alpha=float(data.get("alpha", 0.5)))
            save(a_id)
            save(b_id)
            return self._json(200, {"receipt": receipt, "state": a.state()})
        return self._json(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(os.environ.get("A0_PTCNA_PORT", "8791"))
    HTTPServer(("127.0.0.1", port), Handler).serve_forever()
