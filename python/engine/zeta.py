# 165:47
"""
ZetaEngine — Zeta Function Alpha Echo

ZFAE passively learns from every energy provider response.
Every assistant reply is evaluated by EDCM (no LLM), producing a coherence
score that drives PCNA phi/psi/omega reward backprop.

Naming: a0(zeta fun alpha echo) {provider}
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

            pcna = get_pcna()

            gate_open = pcna.guardian.gate_open
            gates_open_ratio = float(gate_open.sum()) / float(len(gate_open))
            gate_factor = round(0.7 + gates_open_ratio * 0.6, 6)

            change_boost = 1.0
            substrate_factor = 1.0
            try:
                from . import sigma as _sigma_mod
                _sigma_inst = _sigma_mod._sigma_instance
                if _sigma_inst is not None:
                    if hasattr(_sigma_inst, "change_boost"):
                        change_boost = float(_sigma_inst.change_boost)
                    if hasattr(_sigma_inst, "substrate_factor"):
                        substrate_factor = float(_sigma_inst.substrate_factor)
            except Exception:
                pass

            base_lr = 0.025
            effective_lr = base_lr * gate_factor * change_boost * substrate_factor

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
                "gates_open_ratio": round(gates_open_ratio, 6),
                "gate_factor": gate_factor,
                "ts": time.time(),
            }
            self.echo_buffer.append(event)
            suffix = f" path={path}" if path else ""
            print(
                f"[zfae:echo] provider={provider} coherence={coherence}"
                f" gate_factor={gate_factor} gates_open_ratio={round(gates_open_ratio, 4)}"
                f" effective_lr={round(effective_lr, 6)} resolution={resolution}{suffix}"
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

    def state(self) -> dict:
        return {
            "agent": self.AGENT_NAME,
            "eval_count": self.eval_count,
            "echo_buffer_len": len(self.echo_buffer),
            "uptime_s": round(time.time() - self.created_at, 1),
            "resolution": self.resolution_config,
        }


_zeta_engine = ZetaEngine()
# 165:47
