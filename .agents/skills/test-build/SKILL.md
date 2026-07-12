---
name: test-build
description: Self-declaring contract tests built on msdmd. Source modules own behavior obligations in `# === CONTRACTS ===` blocks; test modules own executable evidence in `# === CHECKS ===` blocks. Load this when adding tests that ride the msdmd convention, when refactoring a module with CONTRACTS/CHECKS declarations, or when authoring a contract/check audit or executor.
---

# test-build — Contract tests on msdmd

`test-build` is an application of [msdmd](../msdmd/SKILL.md). The
foundational skill defines the comment-block convention, the universal
parser, and the visible-gap requirement; this skill applies the
convention to behavior contracts and their executable witnesses.

Read `msdmd/SKILL.md` first if you haven't — the block syntax,
parser contract, and visibility rules below are inherited from there
and not redefined.

For the ratified doctrine behind this split, see
[`doctrine/msdmd-checks.md`](../doctrine/msdmd-checks.md).

## The split

```text
CONTRACTS are obligations.
CHECKS are accountable witnesses.
audit reconciles the witness list against the obligation list.
```

Source modules own promises. Test modules own evidence. Neither owns
the other's declarations.

## Source block: CONTRACTS

Every module that promises behavior declares those obligations in a
`CONTRACTS` block. A contract says what must remain true; it does not
name the test topology.

```python
# === CONTRACTS ===
# id: chat_create_owner_isolation
#   given: POST /api/v1/conversations with x-user-id=A and body.user_id=B
#   then:  stored row has user_id=A; smuggled value is dropped
#   class: security
#
# id: chat_get_other_owner_404
#   given: GET /api/v1/conversations/{id} where conv.user_id != caller
#   then:  returns 404 (existence non-disclosure, not 403)
#   class: security
# === END CONTRACTS ===
```

### CONTRACTS field schema

Required:

| Field | Meaning |
|---|---|
| `id` | Unique snake_case identifier, stable across refactors. Becomes the contract handle in reports. |
| `given` | Plain-English precondition / request shape. State the input, not the implementation. |
| `then` | The asserted post-condition — the actual contract, not the steps to verify it. |

Optional:

| Field | Meaning |
|---|---|
| `class` | Free-text tag (`security`, `correctness`, `idempotency`, `auth`, `regression`, `doctrine`, `evidence`, `safety`). The runner counts entries per class in summaries. |
| `requires` | Comma-separated list of other contract ids this contract depends on. |
| `since` | Version or date the contract was added. |
| `deprecated` | If present, the runner skips and reports the entry as deprecated. |

`call:` is not a CONTRACTS field in skill-lib. The call belongs to the
CHECKS entry that owns the executable evidence.

## Test block: CHECKS

A test module declares the checks it contributes in a `CHECKS` block.
A check is an evidentiary procedure: an executable claim to prove one
or more named contracts.

```python
# === CHECKS ===
# id: check_chat_create_owner_isolation_http
#   proves: chat_create_owner_isolation
#   call: self::test_chat_create_owner_isolation_http
#   requires: python3, posix_shell
#   timeout: 20
#   mutates: db
#   cleanup: transaction_rollback
#
# id: check_chat_get_other_owner_404_http
#   proves: chat_get_other_owner_404
#   call: self::test_chat_get_other_owner_404_http
#   requires: python3, posix_shell
#   timeout: 20
#   mutates: db
#   cleanup: transaction_rollback
# === END CHECKS ===
```

### CHECKS field schema

Required:

| Field | Meaning |
|---|---|
| `id` | Unique snake_case identifier for this evidentiary procedure. |
| `proves` | Comma-separated contract ids this check claims to prove. "Proves" means claims-to-prove; audit verifies linkage, not mutation sensitivity. |
| `call` | Executable target resolved by the runner. In Python skill-lib checks, the sanctioned no-exec audit form is `self::fn`. |
| `mutates` | Declared side-effect surface (`none`, `filesystem`, `db`, `network`, `external_service`, etc.). |
| `cleanup` | Cleanup/isolation obligation (`none`, `tempdir_teardown`, `transaction_rollback`, `finally_delete_created_rows`, etc.). |

Conditionally required when consumed by the runner:

| Field | Meaning |
|---|---|
| `requires` | Comma-separated host capabilities. A runner that reads this field must refuse execution when requirements are missing. |
| `timeout` | Per-check execution bound. A runner that reads this field must apply it to the spawned work, not merely print it. |

Fields enter the schema in the same change that makes a runner consume
them. Declared-but-unread metadata is decorative and should be treated
as a defect, not diligence.

## The contract for check functions

A check function:

- Is resolvable at the path declared in `call:`.
- Takes no required arguments. The executor does not inject fixtures
  or context; the check is self-contained or pulls from the language's
  standard environment (env vars, a known service URL, etc.).
- Returns `None` on pass.
- Raises `AssertionError` on behavior violation. The runner reports
  this as `FAIL`.
- Lets unexpected exceptions escape. The runner reports these as
  `ERROR` (infrastructure/harness failure) rather than `FAIL`
  (contract violation).
- Cleans up any persistent state it creates. Isolation is the check's
  responsibility unless the runner explicitly provides a fixture.

## Authoring an audit

Audit is the cheapest runner mode: reconcile declarations without
executing checks. A Python audit for `self::fn` checks can avoid import
side effects entirely:

```python
def resolve_self_call(spec: str, namespace: dict) -> object:
    if not spec.startswith("self::"):
        raise LookupError(f"only self::fn resolves without execution: {spec}")
    fn = namespace.get(spec[len("self::"):])
    if not callable(fn):
        raise LookupError(f"not callable: {spec}")
    return fn
```

An audit MUST report, at minimum:

```text
GAP  <contract>  has no CHECKS entry claiming to prove it
GAP  <check> claims unknown contract: <id>
GAP  <check> call does not resolve: <reason>
GAP  executable check <fn> has no resolving CHECKS declaration
```

Exit nonzero on any gap. A reconciler that has only ever said
"closed" is itself unverified; negative-test it by planting an orphan
contract, a phantom `proves` target, and an unresolvable call, then
observing the GAP.

## Authoring an executor

A full executor runs after audit or as part of the same command. It
should:

1. Parse source `CONTRACTS` and test `CHECKS` using the msdmd parser.
2. Reconcile the graph before execution.
3. Refuse execution when consumed `requires` fields are unmet.
4. Apply consumed `timeout` fields to the actual spawned work.
5. Report per-check `PASS`, `FAIL`, and `ERROR` without aborting the
   remaining checks on a single harness error.
6. Surface source contracts with no proving checks, checks proving
   unknown contracts, and executable checks with no declaration.

The visibility-of-gaps requirement is mandatory per msdmd. Drop it and
the runner stops being a msdmd application.

## Semantics of "proves"

`proves:` means claims-to-prove. Audit verifies linkage and call
resolution. A passing check demonstrates the declared witness ran
successfully. It does not prove the check is sensitive to every
possible breakage of the contract.

Status vocabulary:

```text
[implemented-prototype]   runs; verified by session contact only
[test-backed]             suite passes and audit closes the graph
[mutation-verified]       checks demonstrated to notice planted breakage
```

Do not claim one rung above the evidence.

## Anti-patterns

- **Contracts in test files instead of source files.** The contract
  belongs to the module that promises the behavior; the test file owns
  the check.
- **`call:` in CONTRACTS.** Source modules should not know test
  topology. Put executable targets in CHECKS.
- **Executable tests with no CHECKS entry.** They may still run through
  ad hoc tooling, but they are invisible to the msdmd evidence graph.
- **CHECKS proving unknown CONTRACTS.** This is an orphan witness; fix
  the target id or declare the source contract.
- **Implementation-shaped ids.** `chat_create_returns_200` tells you
  little; `chat_create_owner_isolation` tells you what's protected.
- **Importing during audit.** Python imports execute module top level.
  Use no-exec resolution such as `self::fn`, or make import execution
  an explicit non-audit mode.
- **Catching unexpected exceptions in the check to "make it pass".**
  Let the exception escape so the runner can mark `ERROR` honestly.

## Versioning

The `CONTRACTS` block name remains stable for source-owned
obligations. `CHECKS` is the paired test-owned evidence block.
Field additions are non-breaking only when they are additive and
consumed by a runner. Field renames or removals are breaking; bump the
major version and note the migration in the lib README.

hmmm
- The block type for harness/infrastructure tests that prove no product contract remains unnamed is still unsettled.
- Mutation-level verification is defined but not yet generalized across skills.
- Slow/flaky/quarantined states should enter only when a runner consumes them rather than as decorative labels.
