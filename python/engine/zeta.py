# 205:86 0:0 4:4
"""
ZetaEngine — Zeta Function Alpha Echo

ZFAE passively learns from every model response.
Every assistant reply is evaluated by EDCM (no LLM), producing a coherence
score that drives PCNA phi/psi/omega reward backprop.

Naming: a0(model)zfae
  - zeta   = the observer function
  - fun    = the phi ring coherence transform
  - alpha  = the learning rate parameter
  - echo   = the feedback signal returned to the ring

No external API calls. Runs non-blocking after every chat response.

Resolution:
  Each directory path can carry its own resolution level (1–5). The most
  specific matching prefix wins; the global level applies when nothing matches.
  Level 1 = minimal/lightweight observation. Level 5 = maximum depth.
  Example: global=3, /system=5 means system-root paths are observed at full depth.
"""

# === MODULE_BUILD ===
# id: a0_engine_zeta
#   module_name: zeta
#   module_kind: engine
#   summary: ZetaEngine (ZFAE) — passively scores every assistant response via EDCM (no LLM) and drives PCNA phi/psi/omega reward backprop, with per-directory observation resolution.
#   owner: Erin Spencer
#   public_surface: ZetaEngine
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; Zeta runs non-blocking after responses and can be disabled without affecting inference.
#   requires: a0_engine_pcna, a0_service_edcm
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import time
from collections import deque
from typing import Optional

_DEFAULT_RESOLUTION = 3
_MIN_RES = 1
_MAX_RES = 5


class ZetaEngine:
    """
    Non-LLM real-time learning engine with per-directory resolution control.
    Evaluates each assistant response via EDCM and drives PCNA backprop.
    """

    AGENT_NAME = "a0(zeta fun alpha echo)"

    def __init__(self, buffer_size: int = 50):
        self.echo_buffer: deque = deque(maxlen=buffer_size)
        self.eval_count = 0
        self.created_at = time.time()
        self.resolution_config: dict = {
            "global": _DEFAULT_RESOLUTION,
            "directories": {},
        }

    # ------------------------------------------------------------------
    # Resolution API
    # ------------------------------------------------------------------

    def get_resolution(self, path: str = "") -> int:
        """Return the resolution level for the given path.

        Finds the most specific directory in the config whose path is a
        prefix of the given path. Falls back to the global default.
        """
        config = self.resolution_config
        dirs = config.get("directories", {})
        if not path or not dirs:
            return config.get("global", _DEFAULT_RESOLUTION)
        normalized = path.rstrip("/")
        best_level: Optional[int] = None
        best_len = -1
        for dir_path, level in dirs.items():
            dp = dir_path.rstrip("/")
            if normalized == dp or normalized.startswith(dp + "/"):
                if len(dp) > best_len:
                    best_level = level
                    best_len = len(dp)
        return best_level if best_level is not None else config.get("global", _DEFAULT_RESOLUTION)

    def set_global_resolution(self, level: int) -> dict:
        """Set the global fallback resolution level (1–5). Returns new config."""
        self.resolution_config["global"] = max(_MIN_RES, min(_MAX_RES, level))
        return dict(self.resolution_config)

    def set_directory_resolution(self, path: str, level: int) -> dict:
        """Set resolution for a specific directory path (1–5). Returns new config."""
        self.resolution_config.setdefault("directories", {})[path] = max(_MIN_RES, min(_MAX_RES, level))
        return dict(self.resolution_config)

    def remove_directory_resolution(self, path: str) -> dict:
        """Remove a per-directory override. Returns new config."""
        self.resolution_config.get("directories", {}).pop(path, None)
        return dict(self.resolution_config)

    def load_resolution_config(self, config: dict) -> None:
        """Restore resolution config from persisted storage on startup."""
        if not isinstance(config, dict):
            return
        self.resolution_config = {
            "global": max(_MIN_RES, min(_MAX_RES, int(config.get("global", _DEFAULT_RESOLUTION)))),
            "directories": {
                k: max(_MIN_RES, min(_MAX_RES, int(v)))
                for k, v in config.get("directories", {}).items()
                if isinstance(k, str) and isinstance(v, (int, float))
            },
        }

    # ------------------------------------------------------------------
    # Core evaluation
    # ------------------------------------------------------------------

    def _coherence_from_metrics(self, metrics: dict) -> float:
        cm = metrics.get("cm", 0.0)
        da = metrics.get("da", 0.0)
        int_val = metrics.get("int_val", 0.0)
        drift = metrics.get("drift", 0.0)
        coherence = (cm * 0.35 + da * 0.25 + int_val * 0.25 + (1.0 - drift) * 0.15)
        return round(max(0.0, min(1.0, coherence)), 4)

    def _sigma_nudge_factors(self) -> tuple[float, float]:
        """
        Drain Sigma content_changed buffer → change_boost (1.2 if any, else 1.0).
        Read ring_coherence → substrate_factor (linear map 0.0→0.8, 1.0→1.2).
        Returns (change_boost, substrate_factor).
        """
        change_boost = 1.0
        substrate_factor = 1.0
        try:
            from .sigma import get_sigma
            sig = get_sigma()
            drained = sig.drain_content_changed_events()
            if drained:
                change_boost = 1.2
            substrate_factor = round(0.8 + sig.ring_coherence * 0.4, 4)
        except Exception as exc:
            print(f"[zfae:sigma_factors] error reading Sigma factors: {exc}")
        return change_boost, substrate_factor

    def _theta_gate_factor(self) -> float:
        """
        Read Theta guardian's gate_open fraction → gate_factor (linear map 0.0→0.8, 1.0→1.2).
        Returns the fraction of gates open (0.0–1.0), mapped linearly to 0.8–1.2.
        Falls back to 1.0 with logged error if Theta is unavailable (e.g., before Task #72 wiring).
        """
        try:
            from ..main import get_pcna
            theta = get_pcna().theta
            open_frac = float(theta.gate_open.mean())
            return round(0.8 + open_frac * 0.4, 4)
        except Exception as exc:
            print(f"[zfae:gate_factor] error reading Theta gate factor: {exc}")
            return 1.0

    async def evaluate(
        self,
        assistant_text: str,
        provider: str,
        user_text: str = "",
        path: str = "",
    ) -> dict:
        """
        Evaluate assistant reply via EDCM, drive PCNA reward backprop.
        path: optional filesystem path used to select the resolution level.
        Effective lr = base_lr × gate_factor × change_boost × substrate_factor.
        gate_factor: derived from Θ guardian gate open fraction (0.8–1.2).
        change_boost: 1.2 if Sigma content_changed events pending, else 1.0.
        substrate_factor: linear map of Sigma ring_coherence → 0.8–1.2.
        """
        resolution = self.get_resolution(path)
        try:
            from ..services.edcm import compute_metrics
            from ..main import get_pcna, get_pcna_8

            metrics = compute_metrics(
                responses=[{"content": assistant_text}],
                context=user_text,
            )
            coherence = self._coherence_from_metrics(metrics)

            base_lr = 0.025
            gate_factor = self._theta_gate_factor()
            change_boost, substrate_factor = self._sigma_nudge_factors()
            effective_lr = base_lr * gate_factor * change_boost * substrate_factor

            pcna = get_pcna()
            pcna.phi.nudge(coherence, lr=effective_lr)
            pcna_8 = get_pcna_8()
            pcna_8.phi.nudge(coherence, lr=effective_lr)

            self.eval_count += 1
            event = {
                "agent": self.AGENT_NAME,
                "provider": provider,
                "coherence": coherence,
                "cm": metrics.get("cm"),
                "da": metrics.get("da"),
                "drift": metrics.get("drift"),
                "int_val": metrics.get("int_val"),
                "resolution": resolution,
                "path": path or None,
                "base_lr": base_lr,
                "gate_factor": gate_factor,
                "change_boost": change_boost,
                "substrate_factor": substrate_factor,
                "effective_lr": round(effective_lr, 6),
                "ts": time.time(),
            }
            self.echo_buffer.append(event)
            suffix = f" path={path}" if path else ""
            print(
                f"[zfae:echo] provider={provider} coherence={coherence}"
                f" lr={effective_lr:.4f}"
                f" gate={gate_factor} boost={change_boost} sub={substrate_factor}"
                f" resolution={resolution}{suffix}"
            )
            return event

        except Exception as e:
            print(f"[zfae:echo] error: {e}")
            return {}

    # ------------------------------------------------------------------
    # Σ Sigma integration helpers (Task #71)
    # ------------------------------------------------------------------

    def set_sigma_resolution(self, level: int) -> dict:
        """Set Sigma scan resolution (1-5) and trigger a rescan."""
        try:
            from .sigma import get_sigma
            get_sigma().set_resolution(level)
            event = {"type": "sigma_resolution", "level": level, "ts": time.time()}
            self.echo_buffer.append(event)
            print(f"[zfae:sigma] resolution set to {level}")
            return event
        except Exception as exc:
            print(f"[zfae:sigma] set_resolution error: {exc}")
            return {}

    def sigma_watch_file(self, path: str) -> dict:
        """Add a file to Sigma's content-watch list."""
        try:
            from .sigma import get_sigma
            get_sigma().add_content_watch(path)
            event = {"type": "sigma_watch_add", "path": path, "ts": time.time()}
            self.echo_buffer.append(event)
            print(f"[zfae:sigma] watching {path}")
            return event
        except Exception as exc:
            print(f"[zfae:sigma] watch_file error: {exc}")
            return {}

    def sigma_unwatch_file(self, path: str) -> dict:
        """Remove a file from Sigma's content-watch list."""
        try:
            from .sigma import get_sigma
            get_sigma().remove_content_watch(path)
            event = {"type": "sigma_watch_remove", "path": path, "ts": time.time()}
            self.echo_buffer.append(event)
            print(f"[zfae:sigma] unwatched {path}")
            return event
        except Exception as exc:
            print(f"[zfae:sigma] unwatch_file error: {exc}")
            return {}

    def set_sigma_structural_interval(self, seconds: float) -> dict:
        """Set the structural scan interval (seconds)."""
        try:
            from .sigma import get_sigma
            get_sigma().structural_interval = max(1.0, seconds)
            event = {"type": "sigma_structural_interval", "seconds": seconds, "ts": time.time()}
            self.echo_buffer.append(event)
            print(f"[zfae:sigma] structural interval → {seconds}s")
            return event
        except Exception as exc:
            print(f"[zfae:sigma] set_structural_interval error: {exc}")
            return {}

    def set_sigma_content_interval(self, seconds: float) -> dict:
        """Set the content-watch poll interval (seconds)."""
        try:
            from .sigma import get_sigma
            get_sigma().content_interval = max(1.0, seconds)
            event = {"type": "sigma_content_interval", "seconds": seconds, "ts": time.time()}
            self.echo_buffer.append(event)
            print(f"[zfae:sigma] content interval → {seconds}s")
            return event
        except Exception as exc:
            print(f"[zfae:sigma] set_content_interval error: {exc}")
            return {}

    def memory_context_for_prompt(self) -> dict:
        """Return prime-seed memory context for prompt composition.

        LT (N=19) → inject into prompt cache prefix (stable, high-reward).
        ST (N=17) → inject after cache (volatile, recent).
        Sub-agent seeds are volatile and not returned here.
        """
        try:
            from .prime_seeds import get_prime_seeds
            return get_prime_seeds().memory_context()
        except Exception as exc:
            print(f"[zfae:memory_context] error: {exc}")
            return {"lt": {}, "st": {}}

    def state(self) -> dict:
        return {
            "agent": self.AGENT_NAME,
            "eval_count": self.eval_count,
            "echo_buffer_len": len(self.echo_buffer),
            "uptime_s": round(time.time() - self.created_at, 1),
            "resolution": self.resolution_config,
        }


_zeta_engine = ZetaEngine()
# 205:86 0:0 4:4
