# PCEA + UCNS Integration Spec (Draft)

## Goal

Define a PCEA-native UCNS envelope layer that adds authenticated transport,
replay resistance, and deterministic canonical framing while preserving existing
PCEA cipher primitives for backward compatibility.

## Scope

Target repository: `The-Interdependency/PCEA`.

This spec is implementation-ready and intended to be copied into PCEA with
minimal adaptation.

## Proposed Files

### `pcea/ucns_adapter.py`

Responsibilities:

- Deterministic, invertible int ↔ UCNS canonical encoding.
- Canonical field framing function for authenticated bytes.
- Centralized validation for `word_bits`, integer ranges, and field types.

Proposed API:

- `int_to_ucns(v: int, word_bits: int) -> bytes`
- `ucns_to_int(buf: bytes, word_bits: int) -> int`
- `canonical_frame(fields: dict[str, bytes | int | str]) -> bytes`

Rules:

- Explicit endianness (big-endian).
- Explicit two's-complement interpretation aligned to `word_bits`.
- Length-prefixed fields for deterministic replay and exact MAC inputs.

### `pcea/ucns_envelope.py`

Responsibilities:

- Build and verify an authenticated envelope around PCEA ciphertext.
- Enforce verify-before-decrypt.
- Enforce monotonic counter checks for replay protection.

Proposed API:

- `seal_state(state, last_state, *, context: str, counter: int, word_bits=64, version="ucns-v1") -> bytes`
- `open_state(blob: bytes, last_state, *, context: str, min_counter: int | None = None) -> tuple[list, int]`

Envelope binary layout (proposed):

1. `magic` (`b"UCNSPCEA"`)
2. `version` (1 byte)
3. `word_bits` (1 byte)
4. `counter` (8 bytes)
5. `context_hash` (32 bytes)
6. `ciphertext_len` (4 bytes)
7. `ciphertext` (N bytes)
8. `tag` (32 bytes, HMAC-SHA256)

Authentication input:

- `canonical_frame(header_fields_without_tag + ciphertext)`

Key separation:

- `K_enc = SHA256("PCEA-ENC-v1" || key_material)`
- `K_auth = SHA256("PCEA-AUTH-v1" || key_material)`

Notes:

- Existing PCEA transform remains the confidentiality primitive.
- UCNS envelope adds authenticity + anti-replay semantics.

## Existing PCEA API Compatibility

Keep these intact as low-level primitives:

- `encrypt_seed`
- `decrypt_seed`
- `encrypt_state`
- `decrypt_state`

Add new high-level API:

- `seal_state`
- `open_state`

Consumer guidance:

- New writes should use `seal_state`.
- Legacy reads may continue during migration window.

## `pcea/__init__.py` Export Changes

Add exports:

- `seal_state`
- `open_state`

No removals in initial migration.

## Optional `PCEAInstance` Extension

Mode-aware behavior:

- `mode="legacy"` (default for compatibility)
- `mode="ucns_v1"` (recommended for new systems)

Optional methods:

- `seal(...)`
- `open(...)`

## Test Plan (PCEA repo)

Add `tests/test_ucns_envelope.py` with:

1. Round-trip `seal_state`/`open_state` exact equality.
2. Ciphertext bit-flip rejection.
3. Header/context tamper rejection.
4. Replay rejection via `min_counter`.
5. Wrong-context rejection.
6. Version mismatch behavior.
7. Regression check that legacy tests remain green.

## Migration Plan

Phase 1:

- Introduce UCNS envelope API in PCEA.
- Keep legacy API operational.

Phase 2:

- Consumer systems switch writes to UCNS envelope.
- Legacy decode remains temporarily enabled.

Phase 3:

- Disable legacy writes by policy.
- Optionally remove legacy paths in a major release.

## Open Decisions

1. Whether UCNS canon mandates HMAC-SHA256 specifically or an alternate
   authenticator/signature primitive.
2. Exact canonical framing grammar if UCNS has a required standard beyond
   length-prefix framing.
3. Counter source and persistence semantics across process restarts.

## Security Baseline

Minimum guarantees after integration:

- Integrity/authenticity checks on every envelope.
- Context binding (prevent cross-channel ciphertext reuse).
- Replay protection with monotonic counters.
- Separation of encryption and authentication derivations.

