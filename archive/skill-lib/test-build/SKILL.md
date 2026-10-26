---
name: test-build
description: Self-declaring contract tests built on msdmd. Each module owns the tests that protect its contracts via a `# === CONTRACTS ===` block; a runner discovers and executes them and reports per-contract status plus visible coverage gaps. Load this when adding tests that ride the msdmd convention, when refactoring a module that has CONTRACTS declarations, or when authoring a new contract test executor.
---

# test-build — Contract tests on msdmd

`test-build` is an application of [msdmd](../msdmd/SKILL.md). The
foundational skill defines the comment-block convention, the universal
parser, and the gap-reporting requirement; this skill applies the
convention to test contracts and ships an executor.

Read `msdmd/SKILL.md` first if you haven't — the block syntax,
parser contract, and visibility rules below are inherited from there
and not redefined.

## The block

Every module that promises a contract declares it in a `CONTRACTS`
block:

```python
# === CONTRACTS ===
# id: chat_create_owner_isolation
#   given: POST /api/v1/conversations with x-user-id=A and body.user_id=B
#   then:  stored row has user_id=A; smuggled value is dropped
#   class: security
#   call:  tests.contracts.chat.test_create_owner_isolation
#
# id: chat_get_other_owner_404
#   given: GET /api/v1/conversations/{id} where conv.user_id != caller
#   then:  returns 404 (existence non-disclosure, not 403)
#   class: security
#   call:  tests.contracts.chat.test_get_other_owner_404
# === END CONTRACTS ===
```

## Field schema

Required:

| Field | Meaning |
|---|---|
| `id` | Unique snake_case identifier, stable across refactors. Becomes the test handle in reports. |
| `given` | Plain-English precondition / request shape. State the input, not the implementation. |
| `then` | The asserted post-condition — the actual contract, not the steps to verify it. |
| `call` | Fully-qualified path to the test function. The executor imports and invokes this. Sync or async; `None` return on pass; raise (typically `AssertionError`) on fail. |

Optional:

| Field | Meaning |
|---|---|
| `class` | Free-text tag (`security`, `correctness`, `idempotency`, `auth`, `regression`). The runner counts entries per class in the summary. |
| `requires` | Comma-separated list of other contract ids this one depends on (informational; the runner does not currently enforce ordering). |
| `since` | Version or date the contract was added. |
| `deprecated` | If present, the runner skips and reports the entry as deprecated. |

## The contract for test functions

A test function:

- Is importable at the path declared in `call:`.
- Is a plain function, sync or async. The executor awaits it if it's a
  coroutine.
- Takes no required arguments. The executor does not inject fixtures
  or context; the test is self-contained or pulls from the language's
  standard environment (env vars, a known service URL, etc.).
- Returns `None` on pass.
- Raises `AssertionError` on fail with a message that names the
  violated invariant. Other exceptions are treated as `ERROR`
  (test infra failure) rather than `FAIL` (contract violation).
- Cleans up any persistent state it creates. Tests run against the
  same database / service as the executor; isolation is the test's
  responsibility (uuid-prefixed identities, deletion in `finally`,
  etc.).

## Authoring a runner

The reference Python runner uses `msdmd/parsers/universal.py`:

```python
from pathlib import Path
import asyncio, importlib, sys
from collections import Counter
from skill_lib.msdmd.parsers.universal import walk_tree

async def run_one(entry: dict) -> dict:
    call = entry.get("call")
    if not call:
        return {**entry, "status": "ERROR", "error": "missing 'call' field"}
    mod_path, _, fn_name = call.rpartition(".")
    try:
        fn = getattr(importlib.import_module(mod_path), fn_name)
    except Exception as e:
        return {**entry, "status": "ERROR", "error": f"import: {e}"}
    try:
        if asyncio.iscoroutinefunction(fn):
            await fn()
        else:
            fn()
    except AssertionError as e:
        return {**entry, "status": "FAIL", "error": str(e)}
    except Exception as e:
        return {**entry, "status": "ERROR", "error": f"{type(e).__name__}: {e}"}
    return {**entry, "status": "PASS", "error": None}

async def main(root: Path) -> int:
    annotated, untested = walk_tree(root, "CONTRACTS")
    results = [await run_one(e) for _, entries in annotated for e in entries]
    counts = Counter(r["status"] for r in results)
    for r in results:
        sym = {"PASS": "✓", "FAIL": "✗", "ERROR": "!"}[r["status"]]
        tail = "" if r["status"] == "PASS" else f" — {r['error']}"
        print(f"  {sym} {r['id']}{tail}")
    print(f"\n{counts['PASS']} pass / {counts['FAIL']} fail / "
          f"{counts['ERROR']} error    "
          f"{len(untested)} modules without CONTRACTS")
    for p in untested[:20]:
        print(f"  · {p.relative_to(root.parent)}")
    return 0 if counts["FAIL"] + counts["ERROR"] == 0 else 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main(Path(sys.argv[1]).resolve())))
```

The visibility-of-gaps requirement (`untested` list) is mandatory per
msdmd. Drop it and the runner stops being a msdmd application.

## Anti-patterns

- **Contracts in test files instead of source files.** The contract
  belongs to the module that promises the behavior; the test file just
  implements the check. Putting the CONTRACTS block in the test file
  inverts the doctrine and lets the source module be deleted without
  the contract noticing.
- **Tests with no CONTRACTS entry.** Orphan tests don't run via the
  runner; they're dead weight. If you write a test, declare it.
- **Implementation-shaped ids.** `chat_create_returns_200` tells you
  nothing; `chat_create_owner_isolation` tells you what's protected.
  Ids are part of the documentation.
- **Catching unexpected exceptions in the test to "make it pass".**
  Let the exception escape — the runner will mark it `ERROR` (infra
  problem) instead of `PASS` (contract holds), which is the correct
  signal.

## Versioning

Field schema additions are non-breaking and don't bump the version.
Field renames or removals are breaking; bump the major version and
note the migration in the lib README. The `CONTRACTS` block name
itself is stable — never reuse it for a different purpose.
