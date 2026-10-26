---
name: forking-structure-meta
description: Derive fine-grained, reusable skill-construction lessons from branch/commit/test structure and convert them into actionable skill design artifacts.
---

# Forking Structure Meta

Use this skill when a user asks for exhaustive or fine-grained analysis of prior branch work and wants meta-lessons that improve future skill construction.

## Trigger Signals

- "forking analysis", "meta lessons", "from structure", "production-ready lessons"
- requests that compare commits/PRs and extract reusable process patterns

## Workflow

1. **Map change topology**
   - Inspect recent commits and touched files.
   - Separate behavior changes, safety changes, and docs/test changes.
2. **Build failure taxonomy**
   - Classify issues as: invariant drift, error-path gaps, dependency fragility, observability gaps, contract mismatch.
3. **Extract transferable lessons**
   - Convert each issue into a stable rule for future skills.
4. **Encode as skill guidance**
   - Write compact "Do / Avoid / Validate" bullets.
5. **Attach executable validation**
   - Include exact commands to re-check each rule.

## Fine-Grain Meta Lessons Template

For each lesson, output:

- **Signal:** what pattern in diffs/tests exposed the issue.
- **Skill Rule:** a reusable instruction for future tasks.
- **Guardrail:** what to implement to enforce it.
- **Validation:** deterministic command(s).

## Default Rule Set (seed)

1. **Invariant as constructor-time rule**
   - Put non-negotiable contract constraints in dataclass/model post-init hooks.
2. **Error paths are first-class outputs**
   - Invalid input must return structured, typed responses—not tracebacks.
3. **Optional integrations fail soft**
   - Defer optional dependency use and keep deterministic fallbacks.
4. **Do not drop boundary metadata on branch paths**
   - Ensure every return/log branch carries mandatory boundary objects.
5. **Tests must probe edge inputs, not just happy paths**
   - Add targeted tests for malformed payloads and type-shape variants.

## Production-Readiness Addendum

When asked "production ready?", report status across five gates:

- **Contract integrity** (invariants enforced everywhere)
- **Failure determinism** (structured error outputs)
- **Dependency resilience** (optional deps degrade gracefully)
- **Observability continuity** (metadata preserved in logs/responses)
- **Regression safety** (targeted tests for each guardrail)

Mark each gate as `pass`, `partial`, or `fail` with one-line evidence.
