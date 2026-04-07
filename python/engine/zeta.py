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
"""

import time
from collections import deque
from typing import Optional


class ZetaEngine:
    """
    Non-LLM real-time learning engine.
    Evaluates each assistant response via EDCM and drives PCNA backprop.
    """

    AGENT_NAME = "a0(zeta fun alpha echo)"

    def __init__(self, buffer_size: int = 50):
        self.echo_buffer: deque = deque(maxlen=buffer_size)
        self.eval_count = 0
        self.created_at = time.time()

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
    ) -> dict:
        """
        Evaluate assistant reply via EDCM, drive PCNA reward backprop.
        Called non-blocking from chat pipeline.
        Returns echo event dict (for logging).
        """
        try:
            from ..services.edcm import compute_metrics
            from ..main import get_pcna

            metrics = compute_metrics(
                responses=[{"content": assistant_text}],
                context=user_text,
            )
            coherence = self._coherence_from_metrics(metrics)

            pcna = get_pcna()
            pcna.phi.nudge(coherence, lr=0.025)

            self.eval_count += 1
            event = {
                "agent": self.AGENT_NAME,
                "provider": provider,
                "coherence": coherence,
                "cm": metrics.get("cm"),
                "da": metrics.get("da"),
                "drift": metrics.get("drift"),
                "int_val": metrics.get("int_val"),
                "ts": time.time(),
            }
            self.echo_buffer.append(event)
            print(
                f"[zfae:echo] agent={self.AGENT_NAME} provider={provider} "
                f"coherence={coherence} cm={metrics['cm']} da={metrics['da']} drift={metrics['drift']}"
            )
            return event

        except Exception as e:
            print(f"[zfae:echo] error: {e}")
            return {}

    def state(self) -> dict:
        return {
            "agent": self.AGENT_NAME,
            "eval_count": self.eval_count,
            "echo_buffer_len": len(self.echo_buffer),
            "uptime_s": round(time.time() - self.created_at, 1),
        }


_zeta_engine = ZetaEngine()
