# Overlap decision — agent-ops

## Choice

Add a procedural skill `agent-ops`. Leave `loop-eng/SKILL.md` unchanged.

The researched alternative was a thin extension under `loop-eng`. That extension would put permission, injection, idempotency, and log controls into the skill whose authoritative job is the Discover → Plan → Execute → Verify → Iterate cycle and its six building blocks. Those controls also apply when nobody is designing a loop: a one-shot tool review, an approval map, or an idempotency key. `risk-boundary-build` owns effect declarations, and it already says declarations are not enforcement. `action-calibration` owns action size. `github-tests` owns CI evidence. None of those is the checklist that binds the controls together.

The minimal contribution is one new skill that cross-loads those owners, plus the index rows the drift gate requires. It is smaller in doctrine than rewriting `loop-eng`, and it is the smallest home that can load for the actual trigger.

## Action record

```yaml
decision: independent procedural skill versus a thin loop-eng extension
decision_layer: skill placement
load_bearing_unknown: whether tool-effect controls are the same relation as loop structure
choice: maximal coherent skill text at the independent home, after the placement falsifier
rationale: the user required a complete doctrine-compliant contribution; the placement check selected the home before the text was written
excluded_work:
  - editing loop-eng doctrine
  - a new metadata block or runner
  - consumer propagation
  - pull request or merge
hmmm:
  - a later one-line cross-load inside loop-eng
```

## METAPAT consultation

question: Should tool-using agent controls be their own boundary, or part of loop-eng?

METAPAT standing: axiom (Boundary; Domain Qualification) and postulate (Partial Domains), plus `DOMAIN_RESTRAINT.md`.

Consulted `The-Interdependency/metapat` default branch tree `af17dae458a806b5a0d607cbaa61be8f68b85a5e`. Blobs read: `AXIOMS.md` `90b7fea71369f08bee09d4fa100491a66e0c498e`, `POSTULATES.md` `e6003140a569e26fbe22ac63f34c0525b27cab48`, `DOMAIN_RESTRAINT.md` `8d3626384c55350832767ba6f4fa913f48a5afd0`.

relevant relation: a boundary is between things, and structural resemblance does not transfer a domain term.

transfers: bounded action, a stop, and a separate check can be shared by cross-load.

does not transfer: loop stage names into this checklist as its skeleton; OWASP, NIST, CISA, or NCSC terms into METAPAT; METAPAT axioms into this skill as the security doctrine.

downstream consequence: write `agent-ops` and cite `loop-eng` for iterative execution.

EDCM seed: none. Placement is a design boundary. No new metric is authorized.

hmmm: current METAPAT was read through GitHub contents at the tree above. A later commit on metapat can supersede this consultation for a future edit.

## Sibling map

| Skill | Owns | This skill |
|---|---|---|
| `loop-eng` | Closed cycle, six blocks, maker/checker | Cites it for iterative Verify |
| `risk-boundary-build` | Native effects and supplemental `BOUNDARIES` | Asks for updates when code changes; preserves the enforcement gap |
| `action-calibration` and `RESOURCE_RUN_INVARIANT.md` | Size and scarce-resource preflight | Cites them before launch |
| `agent-instantiation`, `a0p-instancing` | Repo-specific lifecycles | Refuses to generalize their APIs |
| `github-tests`, `test-build` | Evidence and contracts | Cites them for eval and CI behavior |
| `ssh-automation`, `vm-mcp` | Specific connector planes | Cross-load when those planes appear |
| `skill-usage` | Local maturity records | One record after material use, outside the canonical tree |
| `website-builder-journal` | Website append-only journal | Different artifact |
