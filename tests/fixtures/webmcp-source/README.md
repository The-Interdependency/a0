# Pinned canonical WebMCP fixture

`skills.json` and `wdll-SKILL.md` are unchanged source bytes from
The-Interdependency/skill-lib commit `83aef7813dbd040a67ddc07bbb8845f51eb38a3e`,
paths `skills.json` and `wdll/SKILL.md`. Upstream attribution/license remains
MPL-2.0; see this repository's vendored `skill-lib/LICENSE` and
https://github.com/The-Interdependency/skill-lib/blob/83aef7813dbd040a67ddc07bbb8845f51eb38a3e/LICENSE.

`website-wdll-envelope.json` contains actual `createSkillRegistry` output from
website `src/assets/js/webmcp-registry.js` at commit
`c955f2f9c36e69a68b8d3a7e0acb70e8fca6c36b`, supplied the canonical bytes above
with description trimming and empty dependency-list normalization. It includes
only the source/skill portion; the unit test supplies its disposable target.
It is evidence for this exact source tuple, not permission to use moving refs.

Usage: run `python -m unittest discover -s tests -p test_webmcp_validation.py -v`.
Do not regenerate expected output with the validator under test. On a deliberate
source update, obtain exact canonical bytes and independently regenerate through
the pinned website adapter, then record the new identities and raw-byte digest.
