# MODULES.md — ucns_kit module registry

Source of truth for the ucns_kit dependency skeleton.
Modules divide into Category 1 (frame-independent) and Category 2 (frame-dependent protocols).

---

## Category 1 — frame-independent utilities

| Module | Responsibility | Status |
|--------|----------------|--------|
| `coherence_primes.py` | Sequence registry: `nth(k)`, `is_coherence_prime(n)`, `sequence_up_to(limit)`. Recursive definition fully pinned (see below). | ✅ implemented |
| `encoder.py` | Archived lexical encoder skeleton; no current UCNS mapping authority. | ⛔ fail-closed |
| `pool.py` | UCNS object intern table. Encode-once-refer-many. Frame-independent. | ✅ implemented |
| `disk_flip.py` | `disk_flip(obj) → UCNSObject`. Provisional: swap n_dec/n_min. Spec law not yet verified against multiplication rule. | ✅ implemented (provisional) |
| `theta_gate.py` | `gate(obj, capability) → UCNSObject`. Class-only view when capability ungrouped; full object when granted. | ✅ implemented (taxonomy pending) |
| `audit.py` | UCNS-keyed audit records for S9-sentinel-style logging. Append-only, in-memory v0. | ✅ implemented |
| `orchestrator.py` | Six-step pipeline orchestrator. Operates on Category 2 protocols only; no frame-specific code. | ✅ implemented |

---

## Category 2 — frame-dependent protocols

| Module | Responsibility | Status |
|--------|----------------|--------|
| `protocols.py` | `RingState`, `PropagationRule`, `CoherenceMeasure`, `RewardMechanism`, `Serializer`. Protocol interfaces only; no implementations. | ✅ implemented |

---

## Coherence prime definition (fully pinned)

**Canonical source:** `interdependent_lib.coherence_primes`
(The-Interdependency/interdependent-lib) is the single source of truth for this
sequence — its shared test oracle pins the early sequence, the scarcity count
table, and the p=4373 recursive-ancestry regression. `coherence_primes.py` in
this kit is the behaviourally identical in-tree copy; keep the two in lockstep.

Base: C₀ = {3, 5, 7}

A prime p ∈ C iff:
1. `(p - 1) % 4 == 0` — p ≡ 1 mod 4
2. `(p - 1) // 4` is squarefree — no repeated prime factors
3. every prime factor of `(p - 1) // 4` is already in C

Verified sequence: 3, 5, 7, 13, 29, 53, 61, 157, 349, 421, …

Rejection examples:
- **17**: kernel = (17−1)/4 = 4 = 2² — not squarefree
- **19**: (19−1) % 4 = 2 ≠ 0 — fails condition 1

---

## PCNA ring topology note

PCNA ring sizes {53, 29, 19, 17}:
- **Φ=53** and **Ψ=29** are coherence primes ✅
- **Mem-L=19** and **Mem-S=17** are **not** coherence primes: 17 fails squarefree (kernel 4 = 2²); 19 fails divisibility ((19−1)/4 = 4.5)

These two rings predate the coherence-prime constraint. Ring-size slice selection (hmmm 2) will need to address this discrepancy.

---

## Frame × Reward compatibility matrix

| | R1 (bandit over UCNS arms) | R2 (discrete anchor promotion) | R3 (separate numerical control plane) |
|---|---|---|---|
| **Frame A** (tensor of UCNS objects) | ✅ valid | ✅ valid | ✅ valid |
| **Frame B** (ring as one UCNS object) | ✅ valid | ✅ valid | ✅ valid |
| **Frame C** (parallel tensor + UCNS audit) | ✅ valid | ❌ **INVALID** | ✅ valid |

Frame C × R2 is invalid: Frame C's primary state has no anchor structure to promote.
Enforced nominally in `orchestrator.py::_check_compatibility` — becomes executable once Frame/Reward implementations are identifiable by type (see hmmm below).

---

## Open hmmms (do not resolve without Erin)

1. **Frame**: A (tensor of UCNS objects), B (ring as one UCNS object), C (parallel tensor + UCNS audit).
2. **Ring-size slice**: which subset of coherence primes maps to which ring.
3. **Anchor payload depth**: depth-2 vs arbitrary recursive.
4. **Reward mechanism**: R1/R2/R3 selection.
5. **Disk-flip verification**: spec law not verified against `ucns_v04.multiply`.
6. **Coresidence**: in-place rename of `pcna.py` etc, or parallel `pcna_ucns.py` files.
7. **Canonical UCNSObject key**: `pool._key` breaks at recursive anchor payload depth > 0.
8. **Capability taxonomy**: `theta_gate` allowlist not yet defined.
9. **Entry-to-UCNSObject mapping**: `encoder._entry_to_ucns` provisional.
10. **Lexical mapping**: a lawful mapping into the current producer-owned UCNS API remains unresolved.
