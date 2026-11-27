---
name: skill-usage
description: Record and report evidence-bearing usage maturity for skills installed from The Interdependency skill-lib. Load this when any other skill-lib skill is invoked, and when asked for skill counts, usage history, maturity, reliability, experimental status, field-test status, operational status, or daily-use status.
---


Record local usage in the plugin's writable data directory; derive maturity from exposure and observed outcomes.

## Workflow

1. Identify each `skill-lib` skill actually loaded for the task. Do not count a
   skill merely because its metadata appeared in context.
2. After the skill has materially shaped the work, record one use:

   ```bash
   python "$PLUGIN_ROOT/tools/skill_usage.py" record <skill-name> \
     --state "$PLUGIN_DATA/usage.json" \
     --outcome <success|corrected|failed|abandoned|hmmm>
   ```

3. Use `hmmm` when the task outcome is not yet observable. Never translate
   silence, continuation, or lack of complaint into success.
4. Add `--critical` only when the use produced or failed to prevent a
   load-bearing error. A critical failure caps effective maturity at
   `field-test` until explicitly resolved.
5. To resolve a previously recorded critical failure:

   ```bash
   python "$PLUGIN_ROOT/tools/skill_usage.py" resolve-critical <skill-name> \
     --state "$PLUGIN_DATA/usage.json"
   ```

6. Report the spectrum with:

   ```bash
   python "$PLUGIN_ROOT/tools/skill_usage.py" status \
     --state "$PLUGIN_DATA/usage.json"
   ```

Outside an installed plugin, omit `--state`; the runner writes
`.skill-lib/usage.json` under the current working directory.

## Designations

| Designation | Exposure threshold |
|---|---:|
| `experimental` | 0–9 uses |
| `field-test` | 10–24 uses |
| `operational` | 25–49 uses |
| `reliable` | 50–99 uses |
| `daily-use` | 100+ uses |

The exposure threshold is the nominal designation. The effective designation
may be lower:

- fewer than five assessed outcomes caps maturity at `field-test`;
- assessed success below 80% caps maturity at `field-test`;
- assessed success below 90% caps maturity at `operational`;
- assessed success below 95% caps maturity at `reliable`;
- an unresolved critical failure caps maturity at `field-test`.

`success` contributes to assessed success. `corrected`, `failed`, and
`abandoned` are assessed non-success outcomes. `hmmm` is counted exposure but
does not enter the success-rate denominator.

## Output

Return the skill name, use count, outcome counts, nominal designation,
effective designation, unresolved critical failures, last-used time, and state
path. Keep nominal exposure separate from evidence-qualified maturity.

## Validation

Run:

```bash
python -m unittest tests.test_skill_usage
python tools/skill_usage.py status --state /tmp/skill-lib-usage-test.json
```

## Anti-patterns

- Counting metadata visibility as use.
- Incrementing more than once for one skill's contribution to one task.
- Recording success before the result is observable.
- Treating popularity as reliability.
- Committing personal usage state to the canonical repository.

hmmm

- Codex does not currently provide a documented, authoritative
  `SkillActivated` lifecycle-hook event. Recording therefore depends on the
  loaded skill following this protocol.
- Cross-device aggregation requires a future consent-bearing writable service;
  the current counter is local to each plugin installation.
