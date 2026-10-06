---
name: test-build
description: Native-first contract evidence built on msdmd. Source owners declare behavior obligations and test owners declare accountable witnesses through supported native conventions or supplemental CONTRACTS and CHECKS blocks. Preserve explicit claim linkage and no-exec audit boundaries. Load this when adding tests that use msdmd, refactoring CONTRACTS/CHECKS declarations, or authoring a contract/check audit or executor.
---

# test-build — Contract tests on msdmd

`test-build` is an application of [msdmd](../msdmd/SKILL.md). The
foundation defines native-first ingestion, supplemental block syntax, reader
support and information coverage; this skill applies those contracts to
behavior obligations and accountable executable witnesses.

Read `msdmd/SKILL.md` first. For the ratified source/test ownership split,
see [`doctrine/msdmd-checks.md`](../doctrine/msdmd-checks.md).

## Native-first coverage

Source-owned native contracts/assertions and test-owned witness declarations
may supply evidence-graph inputs through explicit, tested mappings. Keep each
obligation and witness attributable to its actual owner. A native witness needs
no CHECKS copy when the supported mapping provides the required linkage,
execution target and safety information. Test names, markers and examples alone
do not establish a `proves` relationship or a passing execution result.

Native fields retain their own schemas; the block schemas below constrain
supplemental entries. They do not require native sources to manufacture MSDMD
IDs or strings. Preserve qualified source identities and unresolved mappings.

Implementation status: the examples and bundled RepoLOTO audit/check path use
CONTRACTS/CHECKS blocks. Native contract/witness readers and a unified native
evidence reconciler are not shipped by this skill revision. A block-only audit
must disclose that scope, and cannot call required native scope complete.

## The split

```text
CONTRACTS are obligations.
CHECKS are accountable witnesses.
audit reconciles the witness list against the obligation list.
```

Source modules own promises. Test modules own evidence. Neither owns
the other's declarations. Native ingestion preserves this ownership split.

## Source block: CONTRACTS

Source owners declare promised behavior through supported native contracts or
supplemental `CONTRACTS` entries. A contract says what must remain true; it does
not name the test topology. Supplement unexpressed obligations as follows:

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

Required for a supplemental CONTRACTS entry:

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
CHECKS entry or native witness that owns the executable evidence.

## Test block: CHECKS

Use `CHECKS` for witness information not adequately expressed by a supported
native source. A check is an evidentiary procedure: an executable claim to prove
one or more named contracts.

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

Required for a supplemental CHECKS entry:

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

A check function in the block executor contract:

- Is resolvable at the path declared in `call:`.
- Takes no required arguments. The executor does not inject fixtures
  or context; the check is self-contained or pulls from the language's
  standard environment (env vars, a known service URL, etc.).
- Returns `None` on pass.
- Raises `AssertionError` on behavior violation. The runner reports `FAIL`.
- Lets unexpected exceptions escape. The runner reports `ERROR`
  (infrastructure/harness failure), not `FAIL` (contract violation).
- Cleans up persistent state. Isolation belongs to the check unless the runner
  explicitly supplies a fixture.

A native framework adapter must separately declare its actual calling and
fixture conventions rather than pretending every native test has this shape.

## Authoring an audit

Audit reconciles declarations without executing checks. Resolve `self::fn`
against the declaring file's **parsed** definitions — never by importing the
module, since importing executes its top level:

```python
import ast

def defined_functions(source_path: str) -> set[str]:
    tree = ast.parse(open(source_path, encoding="utf-8").read())
    return {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    }

def resolve_self_call(spec: str, defined: set[str]) -> str:
    if not spec.startswith("self::"):
        raise LookupError(f"only self::fn resolves without execution: {spec}")
    name = spec[len("self::"):]
    if name not in defined:
        raise LookupError(f"self:: target not defined in file: {spec}")
    return name
```

The bundled `tests/test_repo_loto.py` may read `globals()` because its audit runs
as that module; a central audit of other test files has no such shortcut.

For an explicitly block-only audit, the existing diagnostics are:

```text
GAP  <contract>  has no CHECKS entry claiming to prove it
GAP  <check> claims unknown contract: <id>
GAP  <check> call does not resolve: <reason>
GAP  executable check <fn> has no resolving CHECKS declaration
```

A native-capable audit applies the same semantic obligations to supported native
witnesses as well. Missing CHECKS syntax alone is not missing evidence. Required
unsupported mappings are unresolved coverage and fail a strict audit; they must
not be reported as proof that no witness exists.

Exit nonzero on genuine evidence gaps. Negative-test the audit with an orphan
contract, a phantom `proves` target and an unresolvable call. A reconciler that
has only ever reported closed is unverified.

## Authoring an executor

A full executor should:

1. Extract supported native obligations/witnesses and parse supplemental
   source `CONTRACTS` and test `CHECKS` using the msdmd parser. An existing
   block-only executor must disclose its narrower scope.
2. Reconcile the evidence graph before execution; refuse required unresolved scope.
3. Refuse execution when consumed `requires` fields are unmet.
4. Apply consumed `timeout` fields to the actual spawned work.
5. Report per-check `PASS`, `FAIL` and `ERROR` without concealing harness failures.
6. Surface contracts without accountable witnesses, orphan witness claims and
   tests lacking required linkage, without requiring duplicate native declarations.

The visibility-of-gaps requirement is mandatory per msdmd. Report information
and evidence coverage, supported extraction and block adoption separately.

## Semantics of "proves"

`proves:` means claims-to-prove. Audit verifies linkage and call
resolution. A passing check demonstrates the declared witness ran
successfully. It does not prove sensitivity to every possible breakage.

Status vocabulary:

```text
[implemented-prototype]   runs; verified by session contact only
[test-backed]             suite passes and audit closes the graph
[mutation-verified]       checks demonstrated to notice planted breakage
```

Do not claim one rung above the evidence.

## Validation

Native-only witness fixtures need explicit source-linked obligations, executable
targets and safety metadata, with no invented `proves` edges or CHECKS copies.
Pair these future reader tests with orphan, unsupported-reader, unsafe-import
and wrong-revision-report cases. Existing block audit fixtures remain required.

## Anti-patterns

- **Contracts in test files instead of source files.** The promise belongs to
  its source owner; the test file owns the check.
- **`call:` in CONTRACTS.** Put executable targets with their accountable witnesses.
- **Executable tests with no CHECKS entry.** Do not label them untracked until
  eligible native witness mappings have been inspected; missing required mapping
  is unresolved coverage, not permission to invent evidence.
- **CHECKS proving unknown CONTRACTS.** Repair the orphan target or source obligation.
- **Implementation-shaped ids.** `chat_create_returns_200` says less about the
  protected capability than `chat_create_owner_isolation`.
- **Importing during audit.** Use no-exec resolution or a separately authorized execution mode.
- **Catching unexpected exceptions to make a check pass.** Preserve `ERROR` honestly.

## Versioning

The `CONTRACTS` block name remains stable for source-owned obligations.
`CHECKS` remains the paired test-owned evidence block. Field additions are
non-breaking only when additive and consumed by a runner; renames or removals
require a major version and migration note. Native schema migration is separate.

hmmm
- native contract/witness readers and qualified evidence identities remain implementation work
- the block type for harness tests that prove no product contract remains unsettled
- mutation-level verification is not yet generalized across skills
- slow/flaky/quarantined states need actual consumers before becoming schema fields
