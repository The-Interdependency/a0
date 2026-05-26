# 2:9 0:0 0:1
"""PTCA — PCTA + seed tensor routing lattice.

53 seeds organized as:
    49 compute seeds  — tensor shards + local Markov recursion
     4 sentinel seeds — metadata-only integrity checks
     1 G0 anchor      — canonical clock, invariant enforcement (= meta13)

7 Meta Routers (M₁..M₇), each owning 7 compute seeds.
Within each meta: 7:3 heptagram connectivity.
Sentinel routing: 7:2 schedule.
"""
from .seed_router import SeedRouter, SeedType

__all__ = ["SeedRouter", "SeedType"]
# 2:9 0:0 0:1
