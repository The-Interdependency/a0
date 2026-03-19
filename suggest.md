# Improvement Suggestions

Prioritized improvement backlog for the a0 + edcm-org codebase. Each item references the specific file and the exact behavior that needs to change.

Priority levels: **P0** = correctness/spec conformance, **P1** = robustness, **P2** = completeness, **P3** = quality/observability.

---

## P0 — Correctness

### P0-1: Marker counting should use frequency, not binary presence

**File:** `edcm-org/src/edcm_org/metrics/extraction_helpers.py:59–65`

**Problem:** `count_markers()` returns 1 if a marker appears anywhere in the text, regardless of how many times. A transcript where "cannot" appears 20 times counts the same as one where it appears once. This collapses the signal for high-load situations.

**Fix:** Change the return to count total occurrences, not distinct marker presence:

```python
# current
return sum(1 for m in markers if m.lower() in lower)

# proposed
return sum(lower.count(m.lower()) for m in markers)
```

Downstream, all callers of `count_markers` (metric_C, metric_R, metric_O, etc.) will benefit automatically. Verify metric ranges are still satisfied after the change — clamping in `clamp01`/`clamp11` absorbs overflow.

---

### P0-2: Remove hardcoded `alpha = 0.5` from CLI

**File:** `edcm-org/src/edcm_org/cli.py:80`

**Problem:** `estimate_alpha()` in `params/alpha.py` is a well-designed function that fits an exponential decay to a C-series. But the CLI bypasses it entirely with `alpha = 0.5`. The parameter in every output is therefore always 0.5, making it meaningless.

**Fix:** Pass the single-window C value through `estimate_alpha([C])` for now (returns 0.5 at n<2, as intended), but wire in the real C-series once multi-window runs are supported. The function already handles n<2 correctly.

```python
# current
alpha = 0.5

# proposed
alpha = estimate_alpha([C])  # returns 0.5 for single window — correct behavior per spec
```

This makes the code's intent match the parameter definition.

---

### P0-3: `c_reduction` hardcoded to 0.0 in basin detection

**File:** `edcm-org/src/edcm_org/cli.py:93`

**Problem:** `c_reduction = 0.0` is always passed to `detect_basin()`. This means COMPLIANCE_STASIS and SCAPEGOAT_DISCHARGE thresholds that depend on `c_reduction` are never correctly evaluated. COMPLIANCE_STASIS requires `c_reduction < 0.2` — satisfied trivially. SCAPEGOAT_DISCHARGE doesn't use c_reduction directly but the structural intent of cross-window comparison is absent.

**Fix (short-term):** For single-window runs, document in the warning that basin results depending on `c_reduction` are not reliable. For multi-window runs, pass `1 - (C_current / C_previous)` as `c_reduction`.

---

## P1 — Robustness

### P1-1: Add error handling for malformed JSON input in a0 entry point

**File:** `a0/a0/a0.py`

**Problem:** The entry point reads JSON from a file or stdin without any error handling. A malformed JSON payload or missing required field (`input`, `task_id`) causes an unhandled exception with a Python traceback instead of a structured error response.

**Fix:** Wrap the JSON parse and `A0Request` construction in a try/except. On failure, write a structured error `A0Response` to stdout:

```python
try:
    data = json.loads(raw)
    req = A0Request(...)
    resp = handle(req)
except json.JSONDecodeError as e:
    resp = A0Response(task_id="unknown", result={"error": f"Invalid JSON: {e}"})
```

---

### P1-2: Add log rotation to prevent unbounded log growth

**File:** `a0/a0/logging.py`

**Problem:** `log_event()` appends indefinitely to `{task_id}.jsonl` files with no rotation, size limit, or cleanup policy. Production runs will accumulate gigabytes of logs.

**Fix:** Use `logging.handlers.RotatingFileHandler` or implement a simple size-check before write. At minimum, document a retention policy (e.g. "logs older than 30 days should be archived").

---

### P1-3: Add file locking to state persistence

**File:** `a0/a0/state.py`

**Problem:** `load_state()` and `save_state()` do a read-then-write with no locking. Concurrent a0 invocations can corrupt `a0_state.json` via a race condition.

**Fix:** Use `fcntl.flock` (Unix) or a `.lock` sentinel file around the read-modify-write cycle. For a single-process CLI this is low priority, but important before enabling the FastAPI service.

---

### P1-4: Sentence-boundary-aware windowing

**File:** `edcm-org/src/edcm_org/io/loaders.py` — `window_meeting_text()`

**Problem:** `window_meeting_text()` splits on word count. A 500-word window ends mid-sentence. This corrupts the final sentence of every window, reducing coherence of metric computation (especially L and I which count sentences).

**Fix:** After computing the word-count boundary, advance the split point forward to the next sentence boundary (`.`, `!`, `?`, or `\n`). This keeps windows slightly variable in size but semantically cleaner.

---

### P1-5: Return structured dicts from gaming alerts, not raw strings

**File:** `edcm-org/src/edcm_org/governance/gaming.py`

**Problem:** `detect_gaming_alerts()` returns `List[str]`. Downstream consumers (dashboards, automated pipelines) must parse the string to understand alert type and triggering values.

**Fix:** Return `List[Dict]` with a stable schema:

```python
{
  "alert": "ARTIFACT_INFLATION",
  "message": "Artifacts produced without constraint reduction — possible compliance theater.",
  "triggered_by": {"P_artifacts": 0.82, "c_reduction": 0.03}
}
```

Update `OutputEnvelope.gaming_alerts` type and the JSON schema in `io/schemas.py` accordingly. Add a spec amendment note since this changes the output envelope.

---

### P1-6: Validate required fields in `load_tickets_csv()`

**File:** `edcm-org/src/edcm_org/io/loaders.py`

**Problem:** `load_tickets_csv()` reads CSV columns by name without checking if they exist. A missing `text_column` or `status_column` raises a bare `KeyError` with no actionable message.

**Fix:** After loading, verify required columns exist and raise a `ValueError` with the column name and available columns listed.

---

## P2 — Completeness

### P2-1: Implement OpenAI and Gemini adapters

**Files:** `a0/a0/adapters/openai_adapter.py`, `a0/a0/adapters/gemini_adapter.py`

**Problem:** Both files are empty. The adapter `Protocol` in `model_adapter.py` defines the interface. Until real adapters are implemented, a0 is limited to echoing input.

**Minimum viable implementation for OpenAI adapter:**
```python
from openai import OpenAI

class OpenAIAdapter:
    name = "openai"
    def __init__(self, model="gpt-4o-mini"):
        self.client = OpenAI()
        self.model = model
    def complete(self, messages):
        r = self.client.chat.completions.create(model=self.model, messages=messages)
        return {"text": r.choices[0].message.content}
```

Update `a0/router.py` to select adapters from an environment variable or config rather than always using `LocalEchoAdapter()`.

---

### P2-2: Implement real tool backends

**Files:** `a0/a0/tools/pdf_tool.py`, `a0/a0/tools/whisper_tool.py`, `a0/a0/tools/edcm_tool.py`

**Problem:** All three tools return stub dicts. The `edcm_tool.py` stub is particularly notable — it is the bridge between a0 routing and the edcm-org package, but does not call it.

**Fix for `edcm_tool.py`:** Import and call the `edcm_org.cli.analyze()` function:

```python
from edcm_org.cli import analyze

def run_edcm(text: str) -> Dict[str, Any]:
    return analyze(org="a0", meeting_text=text, tickets_data=None)
```

**Fix for `pdf_tool.py`:** Use `pdfplumber` or `pypdf` to extract text from PDF files.

**Fix for `whisper_tool.py`:** Call the OpenAI Whisper API or local `whisper` library.

---

### P2-3: Multi-window support in CLI for F/E/I accuracy

**File:** `edcm-org/src/edcm_org/cli.py`

**Problem:** The CLI processes one meeting transcript per invocation. F, E, and I require ≥2 windows across separate time periods (not just word-count splits of one document). There is no mechanism to accumulate window history across invocations.

**Fix:** Add a `--history` argument that accepts a directory of prior window JSON outputs. Load the prior C-series from them to compute `estimate_alpha()` and the window list for F/E/I.

---

### P2-4: Enforce retention validation, not just validate it

**File:** `edcm-org/src/edcm_org/governance/privacy.py`

**Problem:** `validate_retention(data_age_months)` exists but nothing calls it automatically. Callers must opt in, which means it is easily skipped.

**Fix:** Add a `data_timestamp` field to `OutputEnvelope` (ISO 8601). The eval protocol should check retention on load. The privacy guard should optionally reject payloads older than `retain_months`.

---

## P3 — Quality / Observability

### P3-1: Expose C metric weights as a configurable parameter

**File:** `edcm-org/src/edcm_org/metrics/primary.py:45–50`

**Problem:** `DEFAULT_C_WEIGHTS` is accessible but the `Params` dataclass does not include it, so weights are not captured in the output envelope. Reproducibility requires knowing what weights were used.

**Fix:** Add `c_weights: Dict[str, float]` to `Params`. The CLI should log the active weights in the output JSON.

---

### P3-2: Propagate secondary modifier confidence caps to basin confidence

**File:** `edcm-org/src/edcm_org/basins/detect.py`

**Problem:** Basin confidence scores are hardcoded constants (e.g. REFUSAL_FIXATION always returns 0.90). The spec defines secondary modifiers that cap metric confidence. This information is never used to adjust the basin confidence.

**Fix:** After basin detection, apply the relevant modifier caps to basin confidence. For example, if `urgency` modifier is high (capping Escalation confidence to 0.15), and the detected basin is CONFIDENCE_RUNAWAY (which depends on E), reduce basin confidence accordingly.

---

### P3-3: Replace `print()` calls in CLI with structured logging

**File:** `edcm-org/src/edcm_org/cli.py:167–173`

**Problem:** The CLI uses bare `print()` for status output. This cannot be redirected, filtered, or integrated with observability tooling.

**Fix:** Use Python's `logging` module with a configurable log level. Reserve stdout for the JSON output only; send status messages to stderr or a log file.

---

### P3-4: Add auth and rate limiting to FastAPI service before enabling

**File:** `a0/a0/service/app.py`

**Problem:** The FastAPI app has a `POST /a0` endpoint with no authentication, no rate limiting, and no input size validation. The comment says "keep off until you want it" — but the requirements for safe enablement are not documented.

**Fix (checklist before enabling):**
- Add API key authentication via `fastapi.security.APIKeyHeader`
- Add request body size limit (reject payloads > N MB)
- Add rate limiting (e.g. `slowapi`)
- Add structured error responses (not Python tracebacks)
- Document the deployment model (behind reverse proxy? internal only?)

---

### P3-5: Clarify the `hmm` field in contract

**File:** `a0/a0/contract.py:13`

**Problem:** The `hmm: List[str]` field in both `A0Request` and `A0Response` has no docstring and the router passes it through without using it. Its purpose is unclear ("hints"? "metadata"?).

**Fix:** Add a docstring, rename to `hints` or `meta` for clarity, and document the intended usage pattern (e.g. "caller-defined key=value strings for context passthrough").

---

### P3-6: Remove Termux-specific shebang from run.sh

**File:** `run.sh:1`

**Problem:** `#!/data/data/com.termux/files/usr/bin/bash` is a Termux (Android) path. This will silently fail on any standard Linux/macOS system.

**Fix:** Change to `#!/usr/bin/env bash` for portability.
