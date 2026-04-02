"""ZFAE — Zeta-structured, Field-partitioned, Alpha-regulated, Echo-state engine.

Architecture overview
---------------------

    Reservoir (fixed, not trained) — 53 nodes mirroring the PTCA lattice
        49 compute nodes  — 7 meta-groups (M0..M6) × 7 nodes each
        4 sentinel nodes  — co-located with the global anchor

    Connection topology
        Within each meta-group: {7:3} heptagram
            node i  →  node (i+3) mod 7  and  node (i−3) mod 7
        Sentinel s  →  meta m at node m*7 + (s*2) mod 7  (7:2 schedule)

    Spectral radius α (default 0.9) is the *only* scalar tuning knob.
    Power iteration scales W_r so ‖W_r‖_λ == α, enforcing the echo-state
    property: current state x(t) is entirely determined by past inputs.
    No hidden "intent" — observable only.  (EDCM principle at architecture level.)

    Reservoir update (per token / turn):
        x(t+1) = tanh( W_r · x(t) + W_in · u(t) )

    Readout (only trained component):
        y(t) = W_out · x(t)

    Input u(t):  phi_features(text) ++ psi_features(text)  →  6-dim
    State x(t):  53-dim reservoir, partitioned into field groups
    Output y(t): 3-dim omega synthesis features

Field partitions
----------------
    phi      nodes  0–16   (M0, M1, lower M2)
    psi      nodes 17–33   (upper M2, M3, M4)
    omega    nodes 34–48   (M5, M6)
    sentinel nodes 49–52

Why "echo"
----------
    In reservoir computing, the "echo state property" means the reservoir
    forgets its initial condition and its state becomes an echo of the input
    history.  This engine is also named for the fact that external models
    (Claude, Anthropic, etc.) exist first; ZFAE is trained to echo their
    outputs — so the echo is architectural *and* biographical.

Path B training
---------------
    External model generates a response  →  capture_training_example() appends
    (reservoir_state, omega_target) to A0_TRAINING_DIR/zfae_training.jsonl.
    train_readout() reads that file and fits W_out by least-squares.
    Weights are saved/loaded via save_weights() / load_weights().

Usage::

    from a0.cores.pcna.zfae import ZFAEEngine

    eng = ZFAEEngine()                               # fresh reservoir
    slices = eng.generate("hello world", [])         # _TensorSlices
    eng.capture_training_example("hello", "hi there")  # training mode
    eng.train_readout("/path/to/training_dir")       # fit W_out
    eng.save_weights("/path/to/weights.json")
"""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from a0.cores.pcna.inference import _TensorSlices, _phi_features, _psi_features, _omega_features


# ---------------------------------------------------------------------------
# Pure-Python linear algebra helpers (no numpy required at runtime)
# ---------------------------------------------------------------------------

_Adj = List[List[Tuple[int, float]]]   # adjacency list: adj[i] = [(j, w), ...]
_Mat = List[List[float]]               # dense matrix: M[i][j]
_Vec = List[float]


def _matvec_sparse(adj: _Adj, x: _Vec) -> _Vec:
    return [sum(w * x[j] for j, w in row) for row in adj]


def _matvec_dense(M: _Mat, x: _Vec) -> _Vec:
    return [sum(M[i][j] * x[j] for j in range(len(x))) for i in range(len(M))]


def _vec_add(a: _Vec, b: _Vec) -> _Vec:
    return [a[i] + b[i] for i in range(len(a))]


def _tanh_vec(v: _Vec) -> _Vec:
    return [math.tanh(x) for x in v]


def _dot(a: _Vec, b: _Vec) -> float:
    return sum(a[i] * b[i] for i in range(len(a)))


def _norm(v: _Vec) -> float:
    return math.sqrt(_dot(v, v))


def _spectral_radius(adj: _Adj, N: int, n_iter: int = 120, seed: int = 0) -> float:
    """Estimate dominant eigenvalue magnitude via power iteration."""
    rng = random.Random(seed)
    v: _Vec = [rng.gauss(0, 1) for _ in range(N)]
    nrm = _norm(v) or 1.0
    v = [x / nrm for x in v]
    for _ in range(n_iter):
        v2 = _matvec_sparse(adj, v)
        nrm = _norm(v2)
        if nrm < 1e-14:
            return 0.0
        v = [x / nrm for x in v2]
    Av = _matvec_sparse(adj, v)
    return abs(_dot(v, Av))


def _lstsq_pure(X: List[_Vec], Y: List[_Vec]) -> _Mat:
    """Least-squares regression W_out such that X @ W_out.T ≈ Y.

    X: n × d_state   Y: n × d_out
    Returns W_out: d_out × d_state

    Pure-Python gradient descent fallback.  numpy (if importable) is used
    instead for accuracy and speed.
    """
    try:
        import numpy as np
        Xnp = np.array(X)  # (n, d)
        Ynp = np.array(Y)  # (n, d_out)
        W_T, *_ = np.linalg.lstsq(Xnp, Ynp, rcond=None)
        return W_T.T.tolist()
    except ImportError:
        pass

    n = len(X)
    d = len(X[0])
    d_out = len(Y[0])
    lr = 0.001
    W = [[0.0] * d for _ in range(d_out)]
    for _ in range(2000):
        for k in range(d_out):
            grad = [0.0] * d
            for row in range(n):
                pred = _dot(W[k], X[row])
                err = pred - Y[row][k]
                for j in range(d):
                    grad[j] += 2 * err * X[row][j]
            W[k] = [W[k][j] - lr * grad[j] / n for j in range(d)]
    return W


# ---------------------------------------------------------------------------
# Reservoir construction
# ---------------------------------------------------------------------------

def _build_reservoir(
    alpha: float,
    seed: int,
) -> Tuple[_Adj, _Mat, _Mat]:
    """Build W_r (adjacency list), W_in, W_out.

    W_r  — 53×53 sparse; spectral radius scaled to alpha
    W_in — 53×6  dense; connects input features to reservoir nodes
    W_out — 3×53 dense; readout (random init, trained later)
    """
    N = 53
    n_input = 6  # phi(3) + psi(3)
    n_output = 3  # omega features
    rng = random.Random(seed)

    # --- W_r: heptagram topology ---
    adj: _Adj = [[] for _ in range(N)]

    # Compute nodes: 7 meta-groups × 7 nodes — {7:3} star
    for meta in range(7):
        base = meta * 7
        for i in range(7):
            src = base + i
            dst_fwd = base + (i + 3) % 7
            dst_bwd = base + (i - 3) % 7
            w_fwd = rng.gauss(0, 1)
            w_bwd = rng.gauss(0, 1)
            adj[src].append((dst_fwd, w_fwd))
            if dst_bwd != dst_fwd:
                adj[src].append((dst_bwd, w_bwd))

    # Sentinel nodes 49-52: {7:2} schedule → each meta-group
    for s in range(4):
        s_node = 49 + s
        for meta in range(7):
            target = meta * 7 + (s * 2) % 7
            w = rng.gauss(0, 0.5)
            adj[s_node].append((target, w))

    # Scale spectral radius to alpha
    rho = _spectral_radius(adj, N)
    if rho > 1e-10:
        scale = alpha / rho
        adj = [[(j, w * scale) for j, w in row] for row in adj]

    # --- W_in: 53×6 dense ---
    W_in: _Mat = [[rng.gauss(0, 0.1) for _ in range(n_input)] for _ in range(N)]

    # --- W_out: 3×53 dense (random init) ---
    W_out: _Mat = [[rng.gauss(0, 0.01) for _ in range(N)] for _ in range(n_output)]

    return adj, W_in, W_out


# ---------------------------------------------------------------------------
# ZFAEEngine
# ---------------------------------------------------------------------------

class ZFAEEngine:
    """Zeta-structured, Field-partitioned, Alpha-regulated, Echo-state engine.

    Args:
        alpha: Spectral radius of W_r.  Controls memory depth.
               alpha → 0: reservoir forgets quickly (short memory)
               alpha → 1: reservoir retains input history longer
               Must be < 1 for the echo-state property.
        seed:  Random seed for W_r, W_in, W_out initialization.
    """

    # Field slice boundaries in the 53-node reservoir
    _PHI_SLICE   = slice(0, 17)   # M0, M1, lower M2
    _PSI_SLICE   = slice(17, 34)  # upper M2, M3, M4
    _OMEGA_SLICE = slice(34, 49)  # M5, M6
    _SENT_SLICE  = slice(49, 53)  # sentinels

    def __init__(self, alpha: float = 0.9, seed: int = 42) -> None:
        if not (0.0 < alpha < 1.0):
            raise ValueError(f"alpha must be in (0, 1); got {alpha}")
        self._alpha = alpha
        self._seed = seed
        self._N = 53
        self._state: _Vec = [0.0] * self._N
        self._W_r, self._W_in, self._W_out = _build_reservoir(alpha, seed)

    # ------------------------------------------------------------------
    # Core dynamics
    # ------------------------------------------------------------------

    def _step(self, u: _Vec) -> None:
        """One reservoir update step: x ← tanh(W_r·x + W_in·u)."""
        r_part = _matvec_sparse(self._W_r, self._state)
        i_part = _matvec_dense(self._W_in, u)
        self._state = _tanh_vec(_vec_add(r_part, i_part))

    def _readout(self) -> _Vec:
        return _matvec_dense(self._W_out, self._state)

    def _input_features(self, text: str) -> _Vec:
        return _phi_features(text) + _psi_features(text)

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def generate(self, prompt: str, context: List[Dict[str, Any]]) -> _TensorSlices:
        """Step the reservoir and return tensor slices.

        phi, psi, omega slices are read from their field partitions.
        text is empty until W_out is trained (Path B).
        """
        u = self._input_features(prompt)
        self._step(u)
        y = self._readout()

        return _TensorSlices(
            phi_raw=self._state[self._PHI_SLICE.start:self._PHI_SLICE.stop][:3],
            psi_raw=self._state[self._PSI_SLICE.start:self._PSI_SLICE.stop][:3],
            omega_raw=y[:3],
            text="",          # populated once W_out is trained
            backend_name="zfae",
        )

    # ------------------------------------------------------------------
    # Path B training
    # ------------------------------------------------------------------

    def capture_training_example(
        self,
        prompt: str,
        response_text: str,
    ) -> None:
        """Append one (reservoir_state, omega_target) pair to the training log.

        Call this after an external model returns a response while
        A0_RUNTIME=training.  The reservoir must already have been stepped
        via generate() for the current prompt so self._state reflects the
        current context.

        Args:
            prompt:        User input for this turn.
            response_text: External model's response (the training target).
        """
        from a0.cores.psi.tensors.env import A0_TRAINING_DIR
        if not A0_TRAINING_DIR:
            return

        entry: Dict[str, Any] = {
            "state": list(self._state),
            "omega_target": _omega_features(response_text),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        out_path = Path(A0_TRAINING_DIR) / "zfae_training.jsonl"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")

    def train_readout(self, training_dir: str) -> int:
        """Fit W_out from captured training examples.

        Uses numpy.linalg.lstsq if numpy is installed, otherwise falls back
        to pure-Python gradient descent.

        Args:
            training_dir: Directory containing zfae_training.jsonl.

        Returns:
            Number of training examples used.
        """
        path = Path(training_dir) / "zfae_training.jsonl"
        if not path.exists():
            raise FileNotFoundError(f"No training data at {path}")

        states: List[_Vec] = []
        targets: List[_Vec] = []
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                entry = json.loads(line)
                states.append(entry["state"])
                targets.append(entry["omega_target"])

        if not states:
            raise ValueError("Training file is empty.")

        self._W_out = _lstsq_pure(states, targets)
        return len(states)

    # ------------------------------------------------------------------
    # Weight persistence
    # ------------------------------------------------------------------

    def save_weights(self, path: str) -> None:
        """Save W_r (as edge list), W_in, W_out, alpha, seed to JSON."""
        data = {
            "alpha": self._alpha,
            "seed": self._seed,
            "W_r": [[(j, w) for j, w in row] for row in self._W_r],
            "W_in": self._W_in,
            "W_out": self._W_out,
        }
        Path(path).write_text(json.dumps(data), encoding="utf-8")

    @classmethod
    def load_weights(cls, path: str) -> "ZFAEEngine":
        """Restore a ZFAEEngine from a saved weight file."""
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        eng = cls(alpha=data["alpha"], seed=data["seed"])
        eng._W_r = [[tuple(e) for e in row] for row in data["W_r"]]
        eng._W_in = data["W_in"]
        eng._W_out = data["W_out"]
        return eng
