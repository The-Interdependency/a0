# msdmd doctrine: CONTRACTS / CHECKS / audit

Status: ratified for skill-lib. Reference implementation:
`skill_lib/safety/repo_loto.py` + `tests/test_repo_loto.py`.

## The triad

```
CONTRACTS are obligations.
CHECKS are accountable witnesses.
audit reconciles the witness list against the obligation list.
```

Source modules own promises. Test modules own evidence. Neither owns
the other's declarations.

## Ownership

**CONTRACTS live in the source module.** A contract is a normative
claim: what must remain true of this module's behavior. It belongs to
the module doing the promising, never to the file checking it.

**CHECKS live in the test module.** A check is an evidentiary
procedure: an executable claim to prove a named contract. Test
topology is the test module's business; source modules do not carry
`call:` fields. There is no legacy bridge in skill-lib — new code
adopts this split directly.

## Grammar

Blocks are comment-fenced, one entry per `id:`, fields indented
beneath it:

```python
# === CONTRACTS ===
# id: loto_scope_enforced
#   given: files touched outside the declared --files globs
#   then: close refuses with the violating paths named
#   class: safety
# === END CONTRACTS ===
```

```python
# === CHECKS ===
# id: check_scope_enforced
#   proves: loto_scope_enforced
#   call: self::test_scope_enforced
#   requires: git, python3, posix_shell
#   timeout: 20
#   mutates: filesystem
#   cleanup: tempdir_teardown
# === END CHECKS ===
```

CONTRACTS fields: `id`, `given`, `then`, `class`
(doctrine | evidence | safety | security).

CHECKS fields, all consumed: `id`, `proves`, `call`, `requires`
(runner refuses to execute on hosts missing them), `timeout` (runner
sets the active subprocess bound per check), `mutates` and `cleanup`
(danger documentation read by humans deciding when a check may run).

## The field-entry rule

A field enters the schema in the same change that makes a runner
consume it, not before. Declared-but-unread metadata is F6 —
decorative preservation — and is treated as a defect, not diligence.
(`determinism` and `level` are currently out for exactly this reason;
they enter when a runner mode reads them. Note that `determinism` is
self-reported until a runner measures it by repeated execution.)

## call: resolution

The only sanctioned form is `self::fn` — a callable defined in the
file that declares the check. Dotted import paths are refused by the
audit: Python imports execute module top level, and **an audit that
executes is not an audit**. The `self::` form is also rename-immune;
copies and uploads reconcile identically.

## audit

The cheapest runner mode and the first one built: no execution, pure
reconciliation of the declared graph. It must report, at minimum:

```
GAP  <contract>  has no CHECKS entry claiming to prove it
GAP  <check> claims unknown contract: <id>
GAP  <check> call does not resolve: <reason>
GAP  executable check <fn> has no resolving CHECKS declaration
```

Exit nonzero on any gap. A reconciler that has only ever said
"closed" is itself unverified: every audit implementation must be
negative-tested by planting an orphan contract, a phantom `proves`
target, and an unresolvable call, and observing the GAP.

## Semantics of "proves"

`proves:` means *claims to prove*. The audit verifies linkage and
resolution, not that the check exercises the contract. The rung above
— break the module, confirm the witness notices (mutation-level
verification) — is named here so its absence stays visible. A module
is `[test-backed]` when its suite passes and its graph closes; it is
not thereby mutation-verified.

## Evidence discipline

- **Latest run wins, per identical command.** A rerun supersedes its
  predecessor as standing evidence; history persists in working
  memory until distillation. Superseding is by exact command string —
  a passing narrow rerun does not launder a failing broad one.
- **Skipped or flaky checks are non-proof** unless explicitly waived,
  and waivers ride the record; they do not erase it.
- **Execution semantics are evidence.** Records carry `shell:`,
  exit codes, and timestamps, not just command strings.
- **Harness errors are results.** The runner reports TimeoutExpired,
  CalledProcessError, and resolver failures as `ERROR` per check and
  continues; an aborted run is not evidence about the unrun checks.
- **Subprocesses are bounded and owned.** Every spawned process runs
  in its own session with a metadata-driven timeout; on expiry the
  whole process group is killed. A hung witness is dismissed, on the
  record, not waited on.

## Status vocabulary

```
[implemented-prototype]   runs; verified by session contact only
[test-backed]             suite passes and audit closes the graph
[mutation-verified]       checks demonstrated to notice planted breakage
```

Each term is earned, never assumed, and never claimed one rung above
its evidence.

hmmm: the block-type for harness/infrastructure tests that prove no
contract remains unnamed; mutation-level verification is defined but
unbuilt; the audit grammar is currently specified by its reference
parser rather than by this document, and if a second parser disagrees,
one of them yields here, in writing.
