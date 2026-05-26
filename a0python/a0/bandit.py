# 52:7 0:0 0:0
"""Bandit — bounded advisory salience machinery.

Bandits do not choose. Meta-13 chooses.

Law 13: Meta-13 chooses; advisory layers may influence salience but do not decide.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class SalienceScore:
    """Advisory salience weight for a candidate. Not a final selection."""
    candidate_index: int
    weight: float
    reason: Optional[str] = None


@dataclass
class BanditAdvice:
    """The output of bandit logic — advisory only."""
    scores: List[SalienceScore]
    reordered_candidates: List[Any]
    exploration_bias: float = 0.0


class BanditAdvisor:
    """Bounded advisory salience machinery."""

    def __init__(self, exploration_rate: float = 0.1) -> None:
        if not 0.0 <= exploration_rate <= 1.0:
            raise ValueError("exploration_rate must be in [0.0, 1.0]")
        self._exploration_rate = exploration_rate
        self._probe_counts: Dict[int, int] = {}
        self._reward_sums: Dict[int, float] = {}

    def advise(
        self,
        candidates: List[Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> BanditAdvice:
        if not candidates:
            return BanditAdvice(scores=[], reordered_candidates=[])

        scores = []
        for i, _ in enumerate(candidates):
            weight = self._ucb_weight(i, len(candidates))
            scores.append(SalienceScore(candidate_index=i, weight=weight))

        sorted_scores = sorted(scores, key=lambda s: s.weight, reverse=True)
        reordered = [candidates[s.candidate_index] for s in sorted_scores]

        return BanditAdvice(
            scores=sorted_scores,
            reordered_candidates=reordered,
            exploration_bias=self._exploration_rate,
        )

    def record_outcome(self, candidate_index: int, reward: float) -> None:
        self._probe_counts[candidate_index] = self._probe_counts.get(candidate_index, 0) + 1
        self._reward_sums[candidate_index] = (
            self._reward_sums.get(candidate_index, 0.0) + reward
        )

    def _ucb_weight(self, index: int, total_candidates: int) -> float:
        import math
        count = self._probe_counts.get(index, 0)
        if count == 0:
            return float("inf")
        mean_reward = self._reward_sums.get(index, 0.0) / count
        total_probes = sum(self._probe_counts.values()) or 1
        exploration = math.sqrt(2 * math.log(total_probes) / count)
        return mean_reward + self._exploration_rate * exploration
# 52:7 0:0 0:0
