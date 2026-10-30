# A0 acceptance record

Source: deployed at https://35.212.252.101.nip.io on VM `a0-prod-1` (GCP project `cs-poc-ab8uzg6ej7vv4vwtyywhbwn`).
Runner: `tests/acceptance/run.js`. Date: 2026-10-30.

## Summary

| Status | Count |
| --- | --- |
| PASS | 19 |
| FAIL | 0 |
| BLOCKED | 2 (A17, A18 — real phone observation) |
| NOT RUN by runner | 3 (A04 live, A13, A24 — executed separately below) |

## A01–A24 matrix

| ID | Result | Evidence / note |
| --- | --- | --- |
| A01 | PASS | Anonymous /api/me, /api/conversations, /api/attachments/* → 401; wrong setup code → 403; first visitor cannot claim ownership. |
| A02 | PASS | Test credential added/replaced/deleted through `/api/providers/openai/key`; provider list never returned the key value. |
| A03 | PASS | New conversation returns `harness_version: a0-harness/1.0.0` with zero messages. |
| A04 | PARTIAL → PASS (DeepSeek, xAI), BLOCKED (Anthropic no key), FAIL (OpenAI legacy key 401) | Live requests: DeepSeek completed with usage `{prompt_tokens:470, completion_tokens:1}`; xAI completed with usage; OpenAI returned 401 for the existing legacy key; Anthropic has no key on this VM. Operator action: rotate OpenAI key; add Anthropic key. |
| A05 | PASS | Continue switching: second participant received full prior history (system,user,assistant,user). |
| A06 | PASS | Compare: two participants received identical semantic snapshots (same message array). |
| A07 | PASS | Default next round included both prior assistant responses with attribution. |
| A08 | PASS | Selected-response policy applied equally; excluded answers remained saved. |
| A09 | PASS | 1→3→1 participants without history loss (5 assistant messages persisted). |
| A10 | PASS | Image-incompatible participant reported `context_incompatible` before dispatch. |
| A11 | PASS | Missing credential produced useful failure without provider substitution. |
| A12 | PASS | Nonsecret canary written through the app survived `systemctl restart openbao` and was read back. |
| A13 | PASS (operator script) | `operations/backup.sh` produced encrypted backup; `operations/restore.sh` restored into isolated `a0app_verify1`/`openbao_verify1` with users=1, conversations=0, media_files=22, bao_kv_rows=53; isolated targets then removed. |
| A14 | PASS | Conversation survived `systemctl restart a0` (2→2 messages). |
| A15 | PASS | Authorized multipart upload + retrieval returned exact bytes; anonymous retrieval → 401. |
| A16 | PASS | Mixed compare: one participant complete, one honest 429 quota failure retained per-participant. |
| A17 | BLOCKED | No physical Android phone available to this runner. Automated HTTPS checks pass (site serves 200 over public URL with Let's Encrypt cert). Operator action: open from Erin's Android browser. |
| A18 | BLOCKED | Voice mode implemented (browser Web Speech API dictation + speechSynthesis spoken answers); real phone microphone observation remains. |
| A19 | PASS | Logout revoked session; stale cookie → 401. |
| A20 | PASS | MCP discovery found 2 tools on a fake Streamable HTTP server; loopback blocked unless `allow_private_network` set; enable/disable persisted. |
| A21 | PASS | Tool proposal executed through shared coordinator after explicit authorization; results returned to history. |
| A22 | PASS | Two duplicate tool proposals surfaced together for coordination (2 proposals shown). |
| A23 | PASS | Cancellation stopped new dispatch; zero tool invocations. |
| A24 | PASS (operator verification) | See docs/release.md: deployed commit, OpenBao binary identity, service readiness/restart, HTTPS public surface, backup/restore, rollback procedure. |

## Rerun history (honest)

1. First production run after vault path fix: 18 PASS, 1 FAIL (A11 vault 404 on missing secret).
2. After treating KV v2 404 as empty credential: **19 PASS, 0 FAIL, 2 BLOCKED, 3 NOT RUN**.

The full runner output is preserved at `/tmp/a0-acceptance-prod.log` on the VM (redacted; contains no secrets).
