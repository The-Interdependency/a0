# Intake for skill-lib maintainers

Branch purpose: land the procedural skill `agent-ops` for steward review. This file is an authoring handoff. It is not canon and it is not a pull request.

## Decision

- Home: new procedural skill `agent-ops/SKILL.md`.
- Rejected home: a thin extension of `loop-eng`. See `overlap.md`.
- External OWASP, NIST, CISA, and NCSC texts stay recommendations. See `sources.md`.
- `loop-eng/SKILL.md` is unchanged.
- `skills.json` `depends_on` is `loop-eng`, `risk-boundary-build`, and `action-calibration`. `github-tests` stays a prose cross-load. Installing this skill does not install `github-tests`, `repo-audit-repair`, or `test-build`.

## Unresolved

- Maintainer acceptance of the slug, the eight controls, and the proposed-versus-declared line.
- Whether `loop-eng` should later gain a one-line cross-load. Left unchanged here.
- hmmm: `risk-boundary-build` remains a hard `depends_on`, so a selected install still pulls `msdmd` and `meta-module-build`. Whether that closure should also become prose-only is unresolved. It is not a merge blocker for the `github-tests` correction.
- Whether a supplemental agent-contract metadata block should exist later.
- Organization-standard redacted log fields and retention.
- A verification method for enforcement beyond declaration review.
- How much external wording to tighten into the skill after review.
- Full page-level reading of the 2023 CISA/NCSC guideline PDF. The announcement was read; the PDF body was not.
- Whether the neighboring OWASP Top 10 for Agentic Applications (ASI01–ASI10) should be cited beside the Version 1.1 threats paper.
- Propagation into consumer repos. Not done. `docs/propagation-checklist.md` applies after merge.
- No pull request was opened from this work. If a platform opens one automatically, that publication was not requested.

## Excluded from this commit

- Private operator diary.
- Personal usage state and usage percentages.
- Third-party data dumps.
- The local research zip as a second canon.

## Checks

The implementing notes in the commit message and the steward handoff record the commands actually run. This file lists the required commands so a later edit of the results does not have to chase the collection snapshot:

```bash
python3.13 -m unittest discover -s tests
python3.13 tools/check_skill_lib_drift.py --warnings-fail
python3.13 tools/check_skill_compliance.py --warnings-fail
python3.13 ratios/ratios_check.py --strict
python3.13 -m llms.build --root . --out llms.txt --check
python3.13 tools/build_codex_plugin_skills.py --check
```

Collection regeneration, when required by the committed `skill-lib_msdmd.ts` gate, uses Python 3.13 and the command in `.github/workflows/ci.yml`. `hmmm` marks any command that was not run.
