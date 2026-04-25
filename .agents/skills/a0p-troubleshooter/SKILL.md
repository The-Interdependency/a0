---
name: a0p-troubleshooter
description: Root-cause analysis and fix planning for failures in the a0p platform and its surrounding infra. Covers CI/GitHub Actions failures, Python/TypeScript stack traces, DNS/HTTPS/GitHub Pages issues, agent-run errors, PCNA/EDCM anomalies, database problems, and "it stopped working" regressions. Use this skill whenever a user reports an error, a broken workflow, a failing test, an unexpected agent behavior, a cost spike, a 404/SSL/domain issue, or says "what happened" / "why did this break" — even if they don't use the word "troubleshoot". Load this skill before diagnosing any platform issue, CI failure, runtime crash, or infra misconfiguration in a0p.
---

# a0p Troubleshooter (RCA + Fix Plan)

Evidence-first, hypothesis-ranked incident diagnosis for the a0p platform.
Given a symptom, produce: ranked hypotheses → minimum evidence → root cause (with
confidence) → fix plan → verification + prevention.

---

## 1. Trigger conditions

Invoke whenever the user expresses any of:

- "why did this break / what happened / it stopped working"
- Stack traces, exceptions, assertion failures, panics
- GitHub Actions / CI job failures (workflow name, run ID, step log)
- 404 / SSL / DNS failures, "domain stopped working", HTTPS not provisioning
- Agent-run anomalies: phantom "running" status, unattributed cost, empty log tail
- PCNA / EDCM / Sigma pipeline errors or unexpected coherence scores
- Database errors (SQLAlchemy, migration failures, constraint violations)
- Sudden regressions: "it used to work yesterday", "worked on staging, broken on prod"
- Cost spikes or token-budget overruns
- Any "I don't know why" in a technical context

---

## 2. Inputs — what to ask for

Collect as many of these as are available **without blocking on them**. If the
user supplies partial information, start analysis and ask only for the *one*
most discriminating missing detail.

| Input | Examples |
|-------|---------|
| `symptom` (required) | Exact error text, stack trace, failing URL, observed behavior |
| `time_window` | When it started; ISO timestamps if possible |
| `environment` | prod / staging / local; branch; Python or Node version |
| `recent_changes` | Deploy, DNS edit, dependency bump, config change, PR merged |
| `platform_context` | Route module name, agent character sheet id, orchestration mode |
| `logs` | CI step output, `agent_logs` rows, FastAPI startup logs |

---

## 3. Operating rules

1. **One-sentence summary first.** State the problem in plain English before
   any analysis.

2. **Classify the failure type** (pick exactly one):

   | Class | When to use |
   |-------|-------------|
   | `dns_https` | Domain, CNAME, A-record, certificate, HTTPS provisioning |
   | `github_pages` | Pages publish source, CNAME file, branch/folder config |
   | `ci_build` | GitHub Actions step failure, test runner, lint, type check |
   | `runtime_crash` | Unhandled exception, stack trace, process exit |
   | `auth_session` | 401/403, session secret, tier gate, INTERNAL_API_SECRET |
   | `agent_run` | Fleet phantom runs, SSE leaks, frozen status, cost miscount |
   | `pcna_edcm` | Ring errors, coherence lock, drift correction, DVG spike |
   | `data_shape` | Pydantic validation, JSON parse, schema mismatch |
   | `db_migration` | Drizzle push, SQLAlchemy error, constraint violation |
   | `perf_timeout` | Slow query, rate-limit 429, memory OOM, token-budget overrun |
   | `config_drift` | Env var missing/wrong in prod, stale seed, hot-swap mismatch |
   | `unknown` | Insufficient signal; escalate evidence collection first |

3. **Generate 2–3 ranked hypotheses.** Rank by: (a) likelihood given the
   symptoms, (b) speed to disprove. Never present more than 3 until one
   survives evidence collection.

4. **Prefer tool-driven evidence** over speculation: CI logs via
   `get_job_logs`, config files via `get_file_contents`, code via
   `search_code`, DNS records via web lookup. Cite your sources.

5. **Ask at most ONE clarifying question** at a time, and only if it
   materially changes the next step.

6. **Always output** all four fix-plan keys: `mitigation`, `durable_fix`,
   `verification`, `prevention`. Never omit one with "N/A" — write "none
   needed" explicitly if true.

7. **Prefer reversible mitigations.** Rollback > hotfix > restart. Document
   the rollback steps alongside the fix.

8. **Cite a0p-specific file paths** where relevant (see §6 Quick Reference).

---

## 4. Output schema (must follow)

Return JSON only. Do not wrap in markdown fences — emit the raw object.

```jsonc
{
  "summary": "One sentence: what failed in plain English.",

  "classification": "one_of_the_classes_from_§3",

  "hypotheses": [
    {
      "rank": 1,
      "hypothesis": "Concise statement of the suspected cause.",
      "why_plausible": "Why the symptoms are consistent with this cause.",
      "fast_check": "The quickest way to confirm or rule this out."
    },
    {
      "rank": 2,
      "hypothesis": "...",
      "why_plausible": "...",
      "fast_check": "..."
    }
  ],

  "next_evidence_to_collect": [
    {
      "item": "What to look at.",
      "how": "Exact command, URL, or tool call.",
      "expected_signal": "What the evidence will show if this hypothesis is correct."
    }
  ],

  "most_likely_root_cause": {
    "statement": "The violated assumption or misconfiguration.",
    "confidence": "low | medium | high"
  },

  "fix_plan": {
    "mitigation": ["Step to stop the bleeding immediately."],
    "durable_fix": ["Step to make the root cause impossible to recur."],
    "verification": ["How to confirm the fix worked."],
    "prevention": ["Guardrail, test, or monitoring to catch this class of failure early."]
  },

  "one_question_if_blocked": "The single most useful question to unblock analysis, or null."
}
```

If evidence is insufficient for `most_likely_root_cause`, set `confidence` to
`"low"` and populate `next_evidence_to_collect` fully before proposing a fix.

---

## 5. Memory rules (semi-permanent instances)

**Store** (stable facts safe to persist):
- `last_known_good_state`: date, commit SHA, branch, environment
- `eliminated_hypotheses`: each with the evidence that eliminated it
- `fix_attempts`: attempt description + result (succeeded / failed / partial)
- `stable_env_facts`: provider names, DNS provider, hosting platform, Python/Node versions
- `open_incidents`: symptom + classification + current confidence

**Do NOT store** (security boundary):
- Tokens, API keys, session secrets, raw auth headers, full credential blobs
- Private keys, webhook signing secrets, Stripe keys
- Full database connection strings containing passwords
- Any field whose value begins with `sk-`, `ghp_`, `xai-`, `AKIA`, or similar
  credential prefixes

---

## 6. Multi-model hub usage (optional)

When the a0p hub is available, split roles across the tier ladder
(see `a0p-model-selector` skill for tier definitions):

| Slot | Tier | Role |
|------|------|------|
| A — Hypothesizer | T1 | Broad hypothesis generation from raw symptoms |
| B — Skeptic | T2 | Falsification plan: what evidence would kill each hypothesis |
| C — Fix Author | T2 | Minimal patch + rollback-friendly change |
| D — Synthesizer | T2 | Merges slots A/B/C into the JSON output schema |

Emit one `provider_response` event per slot per the `a0p-fleet-runs`
event vocabulary. The synthesizer output becomes the final response.

---

## 7. a0p-specific failure patterns

### 7.1 CI pipeline (`deploy.yml`)
- Console-tab regression guard (`scripts/check-console-tabs.mjs`) runs before
  deploy. A tab in `UI_META` with no custom renderer AND no `sections` blocks
  deploy. Fix: add `sections` to `UI_META` or add a renderer to
  `CUSTOM_TAB_RENDERERS` in `client/src/pages/console.tsx`.
- TypeScript errors block the build (`npm run check`). Run locally first.

### 7.2 Route module not appearing
- Check all four registration points in `python/routes/__init__.py`:
  import, `ALL_ROUTERS`, `collect_doc_meta()` file list, `collect_ui_meta()` module list.
- Missing `# DOC` block → Docs tab shows no entry. Missing `UI_META` → tab
  never appears. Missing `sections` on `UI_META` + no custom renderer → CI blocks.

### 7.3 Agent-run anomalies
- **Phantom "running"**: `finally` block raised before status update. Wrap the
  status UPDATE in its own try.
- **Unattributed cost**: provider adapter returned cost but spawner did not add
  to `agent_runs.total_cost_usd`.
- **Empty log tail**: code emits to `print` instead of `run_logger.emit`.
- **SSE flicker**: component re-render recreating `EventSource`. Memoize runId.

### 7.4 PCNA / EDCM
- Coherence lock (`coherence_lock` corrective action) fires when Omega ring
  diverges from Phi/Psi. Check recent prompt context edits; a malformed
  context block can spike the Omega score.
- DVG spike (divergence): inspect the last N `heartbeat` ticks for a sudden
  change in the `DVG` score channel. Usually caused by a tool result that
  contradicts a memory-L anchor.

### 7.5 Custom domain / GitHub Pages
- Most common cause: deploy pipeline overwrote the `CNAME` file. Confirm a
  file named `CNAME` (content = bare domain, no trailing slash) exists at the
  root of the Pages publish source.
- DNS: apex domain requires `A`/`AAAA` records pointing to GitHub's IPs, or
  ALIAS/ANAME. Subdomain requires `CNAME` → `<owner>.github.io`.
- Pages disabled: **Settings → Pages** must show source + branch + folder.

---

## 8. Quick reference — relevant files

```
python/routes/__init__.py                        # Four-place route registration
python/main.py                                   # agent_runs / agent_logs DDL
python/services/run_logger.py                    # emit / flush
python/services/run_context.py                   # ContextVars + accessors
python/services/spawn_caps.py                    # depth/breadth/cost cap checks
python/services/heartbeat.py                     # 30 s tick: PCNA/EDCM propagation
python/engine/pcna.py                            # Six-ring PCNA inference pipeline
python/services/edcm.py                          # Behavioral directive scoring
python/engine/sigma.py                           # SigmaCore prime-ring tensor
python/routes/runs.py                            # /tree, /{id}, SSE stream, publish_log
client/src/pages/console.tsx                     # CUSTOM_TAB_RENDERERS map
client/src/hooks/use-ui-structure.ts             # Polls /api/v1/ui/structure
scripts/check-console-tabs.mjs                   # Console-tab regression guard (CI)
.github/workflows/deploy.yml                     # CI pipeline
```

---

## 9. Escalation path

| Confidence after evidence collection | Action |
|--------------------------------------|--------|
| high | Deliver fix plan + verification |
| medium | Deliver tentative fix; flag the remaining uncertainty explicitly |
| low | Ask the one most-discriminating question; do not speculate a fix |
| unknown / no signal | Request logs, env info, or a reproduction step; classify as `unknown` |

Never present a fix plan at `low` confidence without a clear "this might be
wrong if …" caveat and an explicit verification step.
