# 141:62 0:0 4:4
"""
PrimeSeedLayer — 7 producer RingCore instances seeded from sigma tensor slices.

PRIME_SEEDS = [3, 5, 7, 11, 13, 17, 19]

Each core is parameterized by its prime N, initialized from a sigma tensor
slice at boot, and propagates on every heartbeat tick (task_type="prime_seeds_tick").

  N=17  → seed_s (short-term) — merged into pcna.memory_s on every tick
  N=19  → seed_l (long-term)  — promoted into pcna.memory_l when LT coherence exceeds ST coherence

Injection context (for zeta prompt composition):
  LT (N=19) → prompt cache prefix  (stable, promoted on coherence edge)
  ST (N=17) → after cache          (volatile, merged every tick)
  sub-agent seeds → volatile       (not persisted, not injected into cache)
"""

# === MODULE_BUILD ===
# id: a0_engine_prime_seeds
#   module_name: prime_seeds
#   module_kind: engine
#   summary: PrimeSeedLayer — seven canonical PTCNA RingCore instances seeded from sigma tensor slices, propagated each heartbeat tick and merged/promoted into PTCNA memory rings.
#   owner: Erin Spencer
#   public_surface: PrimeSeedLayer, get_prime_seeds
#   internal_surface: _t2b64, _b64t
#   auth_boundary: none
#   storage_boundary: write
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; long-term seed is restored from checkpoint, short-term reseeds on next tick.
#   requires: pcna_ring_core, a0_platonic_ptcna_state
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import base64
import io
import time
import numpy as np
from ptcna.neural.ring_core import RingCore

_LT_CHECKPOINT_KEY = "prime_seed_lt_v1"


def _t2b64(arr: np.ndarray) -> str:
    buf = io.BytesIO()
    np.save(buf, arr)
    return base64.b64encode(buf.getvalue()).decode()


def _b64t(s: str) -> np.ndarray:
    return np.load(io.BytesIO(base64.b64decode(s)))

PRIME_SEEDS: list[int] = [3, 5, 7, 11, 13, 17, 19]
_SEED_N_ST = 17
_SEED_N_LT = 19


class PrimeSeedLayer:
    """Seven independent prime-seed PTCA cores, tick-driven by the heartbeat."""

    def __init__(self) -> None:
        self.cores: dict[int, RingCore] = {
            n: RingCore(
                name=f"seed_{n}",
                symbol=f"S{n}",
                role="prime_seed",
                n=n,
                seed=n,
            )
            for n in PRIME_SEEDS
        }
        self.tick_count: int = 0
        self.last_lt_promotion: float | None = None
        self.created_at: float = time.time()

    # ------------------------------------------------------------------
    # Boot
    # ------------------------------------------------------------------

    def boot(self) -> None:
        """Inject sigma tensor slices into each core at startup.

        Sigma tensor is shape [n_sigma, 4] (angle, log_size, depth, type).
        For each prime seed N: take the first min(N, n_sigma) rows, average
        across the 4 feature dims to get a [rows] hub signal, pad to [N],
        then inject into the core's phase-0 dim-0 layer.
        """
        try:
            from .sigma import get_sigma
            sig = get_sigma()
            if sig.tensor is None or sig.n == 0:
                print("[prime_seeds] boot: sigma not ready, using fresh tensors")
                return
            for n, core in self.cores.items():
                rows = min(n, sig.tensor.shape[0])
                slice_means = sig.tensor[:rows, :].mean(axis=1)
                signal = np.zeros(n, dtype=np.float64)
                signal[:rows] = np.clip(slice_means, 0.0, 1.0)
                core.inject(signal)
            print(
                f"[prime_seeds] booted {len(self.cores)} cores from sigma"
                f" (sigma_n={sig.n})"
            )
        except Exception as exc:
            print(f"[prime_seeds] boot error — fresh tensors retained: {exc}")

    # ------------------------------------------------------------------
    # Tick
    # ------------------------------------------------------------------

    def tick(self) -> dict:
        """Propagate all 7 seeds; merge ST→memory_s; promote LT→memory_l on coherence edge."""
        from ..main import get_pcna

        pcna = get_pcna()

        for core in self.cores.values():
            core.propagate(steps=5)

        st = self.cores[_SEED_N_ST]
        lt = self.cores[_SEED_N_LT]

        pcna.memory_s.absorb(st.tensor)

        promoted = False
        if lt.ring_coherence > st.ring_coherence:
            pcna.memory_l.absorb(lt.tensor)
            self.last_lt_promotion = time.time()
            promoted = True

        self.tick_count += 1
        return {
            "tick": self.tick_count,
            "lt_promoted": promoted,
            "st_coherence": round(st.ring_coherence, 4),
            "lt_coherence": round(lt.ring_coherence, 4),
            "avg_coherence": round(
                float(np.mean([c.ring_coherence for c in self.cores.values()])), 4
            ),
        }

    # ------------------------------------------------------------------
    # Zeta injection context
    # ------------------------------------------------------------------

    def memory_context(self) -> dict:
        """Return ST and LT tensor summaries for zeta prompt composition.

        Callers:
          LT dict → inject into prompt cache prefix (stable, high-reward).
          ST dict → inject after cache (volatile, recent).
        """
        st = self.cores[_SEED_N_ST]
        lt = self.cores[_SEED_N_LT]
        return {
            "lt": {
                "n": lt.n,
                "ring_coherence": round(lt.ring_coherence, 4),
                "hub_mean": round(float(lt.tensor[:, :, :, 6].mean()), 4),
                "tensor_mean": round(float(lt.tensor.mean()), 4),
            },
            "st": {
                "n": st.n,
                "ring_coherence": round(st.ring_coherence, 4),
                "hub_mean": round(float(st.tensor[:, :, :, 6].mean()), 4),
                "tensor_mean": round(float(st.tensor.mean()), 4),
            },
        }

    # ------------------------------------------------------------------
    # LT checkpoint persistence
    # ------------------------------------------------------------------

    async def save_lt_checkpoint(self) -> None:
        """Persist the N=19 LT tensor to DB so it survives restarts."""
        try:
            from ..storage import storage
            lt = self.cores[_SEED_N_LT]
            data = {
                "saved_at": time.time(),
                "tensor": _t2b64(lt.tensor),
                "ring_coherence": lt.ring_coherence,
                "tick_count": self.tick_count,
            }
            await storage.upsert_system_toggle(_LT_CHECKPOINT_KEY, True, data)
            print(f"[prime_seeds] LT checkpoint saved (coherence={lt.ring_coherence:.4f})")
        except Exception as exc:
            print(f"[prime_seeds] LT checkpoint save failed: {exc}")

    async def load_lt_checkpoint(self) -> None:
        """Restore the N=19 LT tensor from DB if a valid checkpoint exists."""
        try:
            from ..storage import storage
            toggle = await storage.get_system_toggle(_LT_CHECKPOINT_KEY)
            if not toggle or not toggle.get("parameters"):
                print("[prime_seeds] no LT checkpoint found — fresh start")
                return
            data = toggle["parameters"]
            if "tensor" not in data:
                return
            tensor = _b64t(data["tensor"])
            lt = self.cores[_SEED_N_LT]
            if tensor.shape != lt.tensor.shape:
                print(
                    f"[prime_seeds] LT checkpoint shape mismatch "
                    f"{tensor.shape} vs {lt.tensor.shape} — discarded"
                )
                return
            lt.tensor = tensor
            if hasattr(lt, "_recompute_coherence"):
                lt._recompute_coherence()
            saved_at = data.get("saved_at", 0)
            print(
                f"[prime_seeds] LT checkpoint restored "
                f"(coherence={lt.ring_coherence:.4f}, saved_at={saved_at:.0f})"
            )
        except Exception as exc:
            print(f"[prime_seeds] LT checkpoint load failed (fresh start): {exc}")

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    def state(self) -> dict:
        return {
            "cores": {str(n): c.state() for n, c in self.cores.items()},
            "tick_count": self.tick_count,
            "last_lt_promotion": self.last_lt_promotion,
            "uptime_s": round(time.time() - self.created_at, 1),
        }


_prime_seeds = PrimeSeedLayer()


def get_prime_seeds() -> PrimeSeedLayer:
    return _prime_seeds
# 141:62 0:0 4:4
