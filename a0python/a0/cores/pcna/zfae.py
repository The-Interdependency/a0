"""ZFAE v2 — Zeta-structured, Field-partitioned, Alpha-regulated, Echo-state engine.

Architecture overview
---------------------

v2 gives each cognitive field its own complete 53-node PTCA reservoir, then uses
a fourth synthesis reservoir to aggregate all field signals.

    ┌─────────────────────────────────────────────────────────┐
    │  phi_field   (alpha=0.7)  — structural features          │  53 nodes
    │  psi_field   (alpha=0.9)  — semantic features            │  53 nodes
    │  omega_field (alpha=0.95) — synthesis-input features     │  53 nodes
    │                                                          │
    │  synthesis   (alpha=0.9)  — receives all field summaries │  53 nodes
    │                             + guardian + memory proxies  │
    └─────────────────────────────────────────────────────────┘

Each ZFAEField has its own W_r (spectral-scaled to its alpha) and W_in.
The synthesis reservoir holds the only trained component: W_out (3×53).

Field inputs
------------
    phi_field   ← phi_features(text)             3-dim
    psi_field   ← psi_features(text)             3-dim
    omega_field ← phi_features + psi_features    6-dim

Synthesis input (19-dim)
------------------------
    phi_summary    [3]  phi_field.summary()
    psi_summary    [3]  psi_field.summary()
    omega_summary  [3]  omega_field.summary()
    guardian_proxy [4]  _proxy_guardian(phi_raw, psi_raw, omega_raw)
    mem_long_proxy [3]  _proxy_memory_long(memory)
    mem_short_proxy[3]  _proxy_memory_short(context)

Field summary (per ZFAEField)
-----------------------------
    [magnitude, phase, field_metric]
    magnitude    — RMS amplitude of reservoir state
    phase        — atan2(state[1], state[0]) / π  (pseudo-phase, normalised)
    field_metric — mean activation

Why differentiated alphas
--------------------------
    phi   alpha=0.7   short structural memory — local syntax is turn-scoped
    psi   alpha=0.9   longer semantic memory — meaning persists across turns
    omega alpha=0.95  longest memory — synthesis input accumulates context
    synth alpha=0.9   synthesis integrates all fields with moderate memory

Path B training
---------------
    External model generates response → capture_training_example() appends
    (synthesis_state, omega_target) to A0_TRAINING_DIR/zfae_training.jsonl.
    train_readout() reads that file and fits W_out by least-squares.

Usage::

    from a0.cores.pcna.zfae import ZFAEEngine, ZFAEField

    eng = ZFAEEngine()                                     # fresh reservoirs
    slices = eng.generate("hello world", [])               # _TensorSlices
    eng.capture_training_example("hello", "hi there")      # training mode
    eng.train_readout("/path/to/training_dir")             # fit W_out
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

    Uses numpy if available; falls back to pure-Python gradient descent.
    """
    try:
        import numpy as np
        Xnp = np.array(X)
        Ynp = np.array(Y)
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

def _build_field_reservoir(
    alpha: float,
    seed: int,
    n_input: int,
) -> Tuple[_Adj, _Mat]:
    """Build W_r (adjacency list) and W_in for one 53-node field reservoir.

    W_r  — 53×53 sparse; PTCA heptagram topology; spectral radius = alpha
    W_in — 53×n_input dense
    """
    N = 53
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

    # --- W_in: N × n_input dense ---
    W_in: _Mat = [[rng.gauss(0, 0.1) for _ in range(n_input)] for _ in range(N)]

    return adj, W_in


# ---------------------------------------------------------------------------
# Synthesis proxy helpers
# ---------------------------------------------------------------------------

def _proxy_guardian(phi_raw: _Vec, psi_raw: _Vec, omega_raw: _Vec) -> _Vec:
    """Four guardian signals derived from field raw values.

    s0: no contradiction   — phi negation_density low (< 0.5)
    s1: semantic coherent  — psi lexical_diversity present (> 0.3)
    s2: synthesis resolved — omega coherence above threshold (> 0.3)
    s3: question handled   — psi question_signal active
    """
    s0 = float(phi_raw[0] < 0.5)   # phi_raw[0] = negation_density
    s1 = float(psi_raw[0] > 0.3)   # psi_raw[0] = lexical_diversity
    s2 = float(omega_raw[0] > 0.3) # omega_raw[0] = coherence
    s3 = float(psi_raw[1] > 0.5)   # psi_raw[1] = question_signal
    return [s0, s1, s2, s3]


def _proxy_memory_long(memory: Optional[Dict[str, Any]]) -> _Vec:
    """Three signals derived from long-term memory dict."""
    if not memory:
        return [0.0, 0.0, 0.0]
    key_count = len(memory)
    h = hash(str(sorted(memory.keys()))) % 1000 / 1000.0
    return [min(key_count / 10.0, 1.0), 1.0, h]


def _proxy_memory_short(context: List[Dict[str, Any]]) -> _Vec:
    """Three signals derived from short-term conversation context."""
    n = len(context)
    recency = min(n / 10.0, 1.0)
    has_history = float(n > 0)
    # Role-alternation structure: ideal is user/assistant/user/...
    if n >= 2:
        roles = [m.get("role", "") for m in context[-4:]]
        alternates = sum(1 for i in range(1, len(roles)) if roles[i] != roles[i - 1])
        structure = alternates / max(len(roles) - 1, 1)
    else:
        structure = 0.0
    return [recency, has_history, structure]


# ---------------------------------------------------------------------------
# ZFAEField
# ---------------------------------------------------------------------------

class ZFAEField:
    """One complete 53-node PTCA reservoir for a single cognitive field.

    Args:
        name:    Field name for identification (phi, psi, omega, synthesis).
        alpha:   Spectral radius.  Controls memory depth; must be in (0, 1).
        seed:    RNG seed for W_r and W_in initialization.
        n_input: Dimensionality of the input vector u.
    """

    def __init__(self, name: str, alpha: float, seed: int, n_input: int) -> None:
        if not (0.0 < alpha < 1.0):
            raise ValueError(f"alpha must be in (0, 1); got {alpha} for field '{name}'")
        self._name = name
        self._alpha = alpha
        self._seed = seed
        self._n_input = n_input
        self._N = 53
        self._state: _Vec = [0.0] * 53
        self._W_r, self._W_in = _build_field_reservoir(alpha, seed, n_input)

    def step(self, u: _Vec) -> None:
        """One reservoir update: state ← tanh(W_r · state + W_in · u)."""
        r_part = _matvec_sparse(self._W_r, self._state)
        i_part = _matvec_dense(self._W_in, u)
        self._state = _tanh_vec(_vec_add(r_part, i_part))

    def summary(self) -> _Vec:
        """Return [magnitude, phase, field_metric] — 3-dim field summary.

        magnitude    — RMS amplitude of the 53-node state
        phase        — atan2(state[1], state[0]) / π  (pseudo-phase, in [-1, 1])
        field_metric — mean activation across all nodes
        """
        s = self._state
        N = len(s)
        magnitude = math.sqrt(sum(x * x for x in s) / N)
        if abs(s[0]) > 1e-10 or abs(s[1]) > 1e-10:
            phase = math.atan2(s[1], s[0]) / math.pi
        else:
            phase = 0.0
        field_metric = sum(s) / N
        return [magnitude, phase, field_metric]

    @property
    def state(self) -> _Vec:
        """Full 53-dim reservoir state (copy)."""
        return list(self._state)


# ---------------------------------------------------------------------------
# ZFAEEngine
# ---------------------------------------------------------------------------

class ZFAEEngine:
    """Zeta-structured, Field-partitioned, Alpha-regulated, Echo-state engine v2.

    Four independent 53-node PTCA reservoirs:

        phi_field    alpha=0.7   structural features (short memory)
        psi_field    alpha=0.9   semantic features (longer memory)
        omega_field  alpha=0.95  synthesis-input features (longest memory)
        synthesis    alpha=0.9   aggregates all fields + proxies

    Only the synthesis readout W_out is trained.

    Args:
        phi_alpha:       Spectral radius for phi field.
        psi_alpha:       Spectral radius for psi field.
        omega_alpha:     Spectral radius for omega field.
        synthesis_alpha: Spectral radius for synthesis reservoir.
        seed:            Base RNG seed; each field adds an offset (0–3).
    """

    _N_SYNTHESIS_INPUT = 19  # 3+3+3+4+3+3

    def __init__(
        self,
        phi_alpha: float = 0.7,
        psi_alpha: float = 0.9,
        omega_alpha: float = 0.95,
        synthesis_alpha: float = 0.9,
        seed: int = 42,
    ) -> None:
        self._seed = seed

        self.phi_field   = ZFAEField("phi",       phi_alpha,       seed,     n_input=3)
        self.psi_field   = ZFAEField("psi",       psi_alpha,       seed + 1, n_input=3)
        self.omega_field = ZFAEField("omega",     omega_alpha,     seed + 2, n_input=6)
        self._synth_field = ZFAEField("synthesis", synthesis_alpha, seed + 3, n_input=19)

        # W_out is the only trained component — lives on the synthesis reservoir
        rng = random.Random(seed + 4)
        self._W_out: _Mat = [
            [rng.gauss(0, 0.01) for _ in range(53)] for _ in range(3)
        ]

    # ------------------------------------------------------------------
    # Accessors (for tests and external inspection)
    # ------------------------------------------------------------------

    @property
    def _synthesis_state(self) -> _Vec:
        return self._synth_field.state

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def generate(
        self,
        prompt: str,
        context: List[Dict[str, Any]],
        memory: Optional[Dict[str, Any]] = None,
    ) -> _TensorSlices:
        """Step all four reservoirs and return tensor slices.

        Args:
            prompt:  Current user input.
            context: Conversation history (list of role/content dicts).
            memory:  Optional long-term memory dict.

        Returns:
            _TensorSlices with phi_raw, psi_raw from field states,
            and omega_raw from the synthesis readout.
        """
        # 1. Compute field inputs
        phi_u   = _phi_features(prompt)           # 3-dim
        psi_u   = _psi_features(prompt)           # 3-dim
        omega_u = phi_u + psi_u                   # 6-dim

        # 2. Step each field reservoir
        self.phi_field.step(phi_u)
        self.psi_field.step(psi_u)
        self.omega_field.step(omega_u)

        # 3. Field summaries
        phi_sum   = self.phi_field.summary()      # 3-dim
        psi_sum   = self.psi_field.summary()      # 3-dim
        omega_sum = self.omega_field.summary()    # 3-dim

        # 4. Proxy signals
        phi_raw_proxy   = self.phi_field.state[:3]
        psi_raw_proxy   = self.psi_field.state[:3]
        omega_raw_proxy = _omega_features(prompt)  # structural proxy from input
        guardian  = _proxy_guardian(phi_raw_proxy, psi_raw_proxy, omega_raw_proxy)
        mem_long  = _proxy_memory_long(memory)
        mem_short = _proxy_memory_short(context)

        # 5. Synthesis input (19-dim) and step
        synth_u = phi_sum + psi_sum + omega_sum + guardian + mem_long + mem_short
        self._synth_field.step(synth_u)

        # 6. Synthesis readout
        y = _matvec_dense(self._W_out, self._synth_field._state)

        return _TensorSlices(
            phi_raw=self.phi_field.state[:3],
            psi_raw=self.psi_field.state[:3],
            omega_raw=y[:3],
            text="",   # populated once W_out is trained
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
        """Append one (synthesis_state, omega_target) pair to the training log.

        Call this after generate() has been called for the current prompt,
        so the synthesis state reflects the current context.

        Args:
            prompt:        User input for this turn.
            response_text: External model's response (the training target).
        """
        from a0.cores.psi.tensors.env import A0_TRAINING_DIR
        if not A0_TRAINING_DIR:
            return

        entry: Dict[str, Any] = {
            "state": list(self._synth_field._state),
            "omega_target": _omega_features(response_text),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        out_path = Path(A0_TRAINING_DIR) / "zfae_training.jsonl"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")

    def train_readout(self, training_dir: str) -> int:
        """Fit W_out from captured training examples.

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
        """Save alpha values, seed, and W_out to JSON.

        W_r and W_in are deterministic from (alpha, seed, n_input) and are
        not saved — they are rebuilt on load_weights().
        """
        data = {
            "version": "2",
            "phi_alpha":       self.phi_field._alpha,
            "psi_alpha":       self.psi_field._alpha,
            "omega_alpha":     self.omega_field._alpha,
            "synthesis_alpha": self._synth_field._alpha,
            "seed":            self._seed,
            "W_out":           self._W_out,
        }
        Path(path).write_text(json.dumps(data), encoding="utf-8")

    @classmethod
    def load_weights(cls, path: str) -> "ZFAEEngine":
        """Restore a ZFAEEngine from a saved weight file.

        Handles both v2 (four-field) and v1 (single-reservoir) weight files.
        """
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        version = data.get("version", "1")

        if version == "2":
            eng = cls(
                phi_alpha=data["phi_alpha"],
                psi_alpha=data["psi_alpha"],
                omega_alpha=data["omega_alpha"],
                synthesis_alpha=data["synthesis_alpha"],
                seed=data["seed"],
            )
        else:
            # v1 weight file: single alpha, apply to all fields
            alpha = data.get("alpha", 0.9)
            eng = cls(
                phi_alpha=alpha,
                psi_alpha=alpha,
                omega_alpha=alpha,
                synthesis_alpha=alpha,
                seed=data.get("seed", 42),
            )

        eng._W_out = data["W_out"]
        return eng


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def compare_training_runs(runs: Dict[str, str]) -> Dict[str, Any]:
    """Load W_out from multiple training directories; return pairwise cosine similarity.

    Args:
        runs: dict mapping a label → training_dir path string.

    Returns:
        dict with "labels" list and "similarity" matrix (label × label → float).

    Example::

        result = compare_training_runs({
            "opus":   "/training/opus",
            "sonnet": "/training/sonnet",
        })
        print(result["similarity"]["opus"]["sonnet"])
    """
    w_outs: Dict[str, _Mat] = {}
    for label, training_dir in runs.items():
        weight_file = Path(training_dir) / "zfae_weights.json"
        if weight_file.exists():
            eng = ZFAEEngine.load_weights(str(weight_file))
            w_outs[label] = eng._W_out

    labels = list(w_outs.keys())

    def _flatten(W: _Mat) -> _Vec:
        return [v for row in W for v in row]

    def _cosine(a: _Vec, b: _Vec) -> float:
        na, nb = _norm(a), _norm(b)
        if na < 1e-14 or nb < 1e-14:
            return 0.0
        return _dot(a, b) / (na * nb)

    sim: Dict[str, Dict[str, float]] = {}
    for la in labels:
        sim[la] = {}
        for lb in labels:
            sim[la][lb] = _cosine(_flatten(w_outs[la]), _flatten(w_outs[lb]))

    return {"labels": labels, "similarity": sim}


def create_training_fleet(
    trainer_model_ids: List[str],
    base_training_dir: str,
    parent_home: Optional[Path] = None,
) -> List[Any]:
    """Spawn one isolated instance per trainer model using diversify().

    Args:
        trainer_model_ids: List of model_id strings from the registry.
        base_training_dir: Base path; each instance gets a subdirectory.
        parent_home:       Home directory of the parent instance.  Defaults
                           to a temporary directory if not provided.

    Returns:
        List of InstanceDescriptor objects, one per trainer model.
    """
    import tempfile
    from a0.lifecycle import spawn, diversify

    if parent_home is None:
        tmp = tempfile.mkdtemp(prefix="a0_fleet_")
        parent_home = Path(tmp)
        from a0.lifecycle import InstanceDescriptor
        parent_desc = spawn(
            InstanceDescriptor(
                instance_id="fleet-root",
                name="fleet-root",
                home=parent_home,
            ),
            name="fleet-root",
        )
    else:
        from a0.lifecycle import InstanceDescriptor
        parent_desc = InstanceDescriptor.load(parent_home)

    configs = [
        {
            "model_id": mid,
            "A0_TRAINING_DIR": str(Path(base_training_dir) / mid),
        }
        for mid in trainer_model_ids
    ]

    return diversify(parent_desc, configs)
