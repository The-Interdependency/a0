# 309:10
"""
SigmaCore — Σ — filesystem substrate companion core.
Variable-size prime-node ring encoding the workspace filesystem as
hyperdimensional vectors. Resolution 1-5 controls scan depth and
which entries become tensor nodes. N is always the nearest prime to
the entry count. Companion to Ψ (Psi): Sigma observes the physical
substrate; Psi observes Sigma alongside Phi.
"""

import asyncio
import hashlib
import json
import math
import os
import time
from pathlib import Path

import numpy as np

WORKSPACE_ROOT = str(Path(__file__).parent.parent.parent)
CHECKPOINT_PATH = os.path.join(WORKSPACE_ROOT, "logs", "sigma_checkpoint.npz")
CHECKPOINT_META_PATH = os.path.join(WORKSPACE_ROOT, "logs", "sigma_checkpoint_meta.json")

SKIP_HEAVY = {"node_modules", ".cache", ".pythonlibs", "dist", ".venv", "__pycache__", ".git"}
SKIP_ALWAYS = {"__pycache__", ".git", ".venv"}
CODE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".toml", ".md", ".sh", ".cfg"}

MAX_EVENTS = 32


def _is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    for i in range(3, int(n ** 0.5) + 1, 2):
        if n % i == 0:
            return False
    return True


def _nearest_prime(n: int) -> int:
    n = max(n, 2)
    while not _is_prime(n):
        n += 1
    return n


def _name_angle(name: str) -> float:
    return (int(hashlib.md5(name.encode()).hexdigest()[:8], 16) % 100000) / 100000.0


def _scan_entries(root: str, resolution: int) -> list[tuple]:
    """Return [(name, size, depth, is_dir)] based on resolution."""
    skip = SKIP_HEAVY if resolution < 5 else SKIP_ALWAYS
    max_depth = {1: 1, 2: 2, 3: 3, 4: 9999, 5: 9999}.get(resolution, 3)
    entries: list[tuple] = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        depth = 0 if rel == "." else len(Path(rel).parts)
        if depth >= max_depth:
            dirnames.clear()
            continue
        dirnames[:] = sorted(d for d in dirnames if d not in skip)
        if depth > 0:
            try:
                dsize = sum(
                    os.path.getsize(os.path.join(dirpath, f))
                    for f in filenames
                    if os.path.isfile(os.path.join(dirpath, f))
                )
            except OSError:
                dsize = 0
            entries.append((os.path.basename(dirpath), dsize, depth, True))
        if resolution == 1:
            continue
        for fn in sorted(filenames):
            if fn.startswith("."):
                continue
            ext = os.path.splitext(fn)[1].lower()
            if resolution in (2, 3) and ext not in CODE_EXTS:
                continue
            fp = os.path.join(dirpath, fn)
            try:
                fsize = os.path.getsize(fp)
            except OSError:
                fsize = 0
            entries.append((fn, fsize, depth + 1, False))
    return entries


def _encode_entries(entries: list[tuple]) -> np.ndarray:
    if not entries:
        return np.zeros((2, 4), dtype=np.float64)
    sizes = [e[1] for e in entries]
    max_size = max(sizes) or 1
    depths = [e[2] for e in entries]
    max_depth = max(depths) or 1
    rows = []
    for name, size, depth, is_dir in entries:
        ang = _name_angle(name)
        log_sz = math.log1p(size) / math.log1p(max_size)
        dep_frac = depth / max_depth
        typ = 1.0 if is_dir else 0.0
        rows.append([ang, log_sz, dep_frac, typ])
    return np.array(rows, dtype=np.float64)


def _file_hash(path: str) -> str:
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
    except OSError:
        return ""
    return h.hexdigest()


class SigmaCore:
    """Σ — filesystem substrate companion tensor core."""

    def __init__(self, resolution: int = 3):
        self.name = "sigma"
        self.symbol = "Σ"
        self.role = "substrate"
        self.resolution = max(1, min(5, resolution))
        self.structural_interval: float = 30.0
        self.content_interval: float = 5.0

        self.tensor: np.ndarray | None = None
        self.node_coherence: np.ndarray = np.zeros(0, dtype=np.float64)
        self.ring_coherence: float = 0.0
        self.n: int = 0
        self._struct_count: int = 0
        self.last_scan_at: float = 0.0
        self.entry_count: int = 0

        self._content_watches: dict[str, dict] = {}
        self._events: list[dict] = []

        self._running = False
        self._struct_task: asyncio.Task | None = None
        self._content_task: asyncio.Task | None = None

        self.load_checkpoint()

    def _recompute_coherence(self):
        if self.tensor is None or self.tensor.shape[0] == 0:
            self.ring_coherence = 0.0
            self.node_coherence = np.zeros(0, dtype=np.float64)
            return
        mean = self.tensor.mean(axis=0)
        diffs = np.abs(self.tensor - mean).mean(axis=1)
        self.node_coherence = np.clip(1.0 - diffs, 0.0, 1.0)
        self.ring_coherence = float(self.node_coherence.mean())

    def rescan(self):
        entries = _scan_entries(WORKSPACE_ROOT, self.resolution)
        struct_tensor = _encode_entries(entries)
        self._struct_count = struct_tensor.shape[0]
        self.entry_count = len(entries)

        watch_rows = []
        for path, info in list(self._content_watches.items()):
            new_hash = _file_hash(path)
            if new_hash and new_hash != info.get("hash", ""):
                info["hash"] = new_hash
                info["last_changed"] = time.time()
                evt = {"type": "content_changed", "path": path, "ts": info["last_changed"]}
                self._events.append(evt)
                if len(self._events) > MAX_EVENTS:
                    self._events = self._events[-MAX_EVENTS:]
            try:
                fsize = os.path.getsize(path)
                depth = len(Path(os.path.relpath(path, WORKSPACE_ROOT)).parts)
            except OSError:
                fsize, depth = 0, 1
            max_depth = max(depth, 1)
            ang = (int(new_hash[:8], 16) % 100000) / 100000.0 if new_hash else 0.5
            log_sz = math.log1p(fsize) / math.log1p(max(fsize, 1))
            watch_rows.append([ang, log_sz, depth / max_depth, 0.0])
            info["tensor_idx"] = self._struct_count + len(watch_rows) - 1

        if watch_rows:
            watch_arr = np.array(watch_rows, dtype=np.float64)
            combined = np.vstack([struct_tensor, watch_arr])
        else:
            combined = struct_tensor

        raw_n = combined.shape[0]
        new_n = _nearest_prime(raw_n)
        if new_n > raw_n:
            pad = np.tile(combined, (new_n // raw_n + 1, 1))[:new_n]
            combined = pad

        if self.tensor is not None and abs(new_n - self.n) <= max(1, self.n * 0.10):
            blend = 0.3
            if new_n == self.n:
                self.tensor = np.clip(self.tensor * blend + combined * (1 - blend), 0.0, 1.0)
            else:
                self.tensor = combined
        else:
            self.tensor = combined

        self.n = new_n
        self.last_scan_at = time.time()
        self._recompute_coherence()
        self.save_checkpoint()

    def set_resolution(self, level: int):
        self.resolution = max(1, min(5, level))
        self.rescan()

    def add_content_watch(self, path: str):
        abs_path = os.path.abspath(path)
        if abs_path in self._content_watches:
            return
        h = _file_hash(abs_path)
        self._content_watches[abs_path] = {
            "hash": h, "last_changed": time.time(), "tensor_idx": -1
        }
        self.save_checkpoint()

    def remove_content_watch(self, path: str):
        abs_path = os.path.abspath(path)
        self._content_watches.pop(abs_path, None)
        self.save_checkpoint()

    def list_content_watches(self) -> list[dict]:
        out = []
        for p, info in self._content_watches.items():
            h = info.get("hash", "")
            out.append({
                "path": p,
                "hash_prefix": h[:12] if h else "",
                "last_changed": info.get("last_changed", 0.0),
                "last_changed_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(info.get("last_changed", 0.0))),
            })
        return out

    def _check_content_watches(self):
        for path, info in list(self._content_watches.items()):
            new_hash = _file_hash(path)
            if new_hash and new_hash != info.get("hash", ""):
                info["hash"] = new_hash
                info["last_changed"] = time.time()
                evt = {"type": "content_changed", "path": path, "ts": info["last_changed"]}
                self._events.append(evt)
                if len(self._events) > MAX_EVENTS:
                    self._events = self._events[-MAX_EVENTS:]
                if self.tensor is not None and 0 <= info.get("tensor_idx", -1) < self.n:
                    idx = info["tensor_idx"]
                    ang = (int(new_hash[:8], 16) % 100000) / 100000.0
                    self.tensor[idx, 0] = ang
                    self._recompute_coherence()

    def nudge(self, reward: float, lr: float = 0.015):
        if self.tensor is not None:
            gradient = reward * (self.tensor - 0.5)
            self.tensor = np.clip(self.tensor + lr * gradient, 0.0, 1.0)
            self._recompute_coherence()

    async def _structural_loop(self):
        while self._running:
            await asyncio.sleep(self.structural_interval)
            if self._running:
                try:
                    self.rescan()
                except Exception as exc:
                    print(f"[sigma] structural scan error: {exc}")

    async def _content_loop(self):
        while self._running:
            await asyncio.sleep(self.content_interval)
            if self._running:
                try:
                    self._check_content_watches()
                except Exception as exc:
                    print(f"[sigma] content watch error: {exc}")

    def start_watch(self):
        self._running = True
        loop = asyncio.get_event_loop()
        self._struct_task = loop.create_task(self._structural_loop())
        self._content_task = loop.create_task(self._content_loop())
        print(f"[sigma] watch loops started (struct={self.structural_interval}s, content={self.content_interval}s)")

    def stop_watch(self):
        self._running = False
        if self._struct_task:
            self._struct_task.cancel()
        if self._content_task:
            self._content_task.cancel()

    def save_checkpoint(self):
        try:
            tensor = self.tensor if self.tensor is not None else np.zeros((2, 4), dtype=np.float64)
            np.savez_compressed(CHECKPOINT_PATH, tensor=tensor)
            meta = {
                "resolution": self.resolution,
                "structural_interval": self.structural_interval,
                "content_interval": self.content_interval,
                "n": self.n,
                "saved_at": time.time(),
                "content_watches": {
                    p: {k: v for k, v in info.items() if k != "tensor_idx"}
                    for p, info in self._content_watches.items()
                },
            }
            with open(CHECKPOINT_META_PATH, "w") as f:
                json.dump(meta, f)
        except Exception as exc:
            print(f"[sigma] checkpoint save error: {exc}")

    def load_checkpoint(self):
        try:
            if not os.path.exists(CHECKPOINT_PATH) or not os.path.exists(CHECKPOINT_META_PATH):
                self.rescan()
                return
            data = np.load(CHECKPOINT_PATH)
            self.tensor = data["tensor"]
            with open(CHECKPOINT_META_PATH) as f:
                meta = json.load(f)
            self.resolution = max(1, min(5, meta.get("resolution", self.resolution)))
            self.structural_interval = float(meta.get("structural_interval", 30.0))
            self.content_interval = float(meta.get("content_interval", 5.0))
            self.n = int(meta.get("n", self.tensor.shape[0]))
            for p, info in meta.get("content_watches", {}).items():
                self._content_watches[p] = dict(info)
                self._content_watches[p]["tensor_idx"] = -1
            self._recompute_coherence()
            print(f"[sigma] checkpoint restored: n={self.n}, resolution={self.resolution}")
            self.rescan()
        except Exception as exc:
            print(f"[sigma] checkpoint load failed, fresh start: {exc}")
            self.rescan()

    def state(self) -> dict:
        return {
            "name": self.name,
            "symbol": self.symbol,
            "role": self.role,
            "resolution": self.resolution,
            "n": self.n,
            "entry_count": self.entry_count,
            "ring_coherence": round(self.ring_coherence, 4),
            "tensor_mean": round(float(self.tensor.mean()), 4) if self.tensor is not None else 0.0,
            "last_scan_at": self.last_scan_at,
            "last_scan_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(self.last_scan_at)) if self.last_scan_at else None,
            "structural_interval": self.structural_interval,
            "content_interval": self.content_interval,
            "content_watches": self.list_content_watches(),
            "recent_events": self._events[-10:],
        }


_sigma_instance: SigmaCore | None = None


def get_sigma() -> SigmaCore:
    global _sigma_instance
    if _sigma_instance is None:
        _sigma_instance = SigmaCore(resolution=3)
    return _sigma_instance
# 309:10
