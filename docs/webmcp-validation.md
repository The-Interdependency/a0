# WebMCP executor: dormant validation slice

This advances the input-validation part of [a0 #113](https://github.com/The-Interdependency/a0/issues/113).
It does **not** enable skill execution. No HTTP route, MCP tool advertisement,
authentication method, credential, database schema, background job or runtime
permission changes are included.

## FROM → TO

From a documented browser envelope without a reusable canonical-input check to
an offline validator that binds selected instructions to separately supplied
source bytes and target observations. The full browser-to-executor transition
remains open in #113.

DONE WHEN the helper rejects altered source identities/closure and stale target
observations, and preserves complete instruction bodies in immutable output.
PROVEN BY the offline adversarial tests below and canonical 45-skill replay.
FAILS IF validation is described as authentication, authorization, queue
acceptance, task execution, or independently verified completion.

## Work graph and edit ownership

| Participant baseline | Authority and relation |
| --- | --- |
| website `c955f2f9c36e69a68b8d3a7e0acb70e8fca6c36b` | Owns human UI and submitted envelope. `docs/webmcp-execution.md` and `src/assets/js/webmcp-registry.js` define the consumed projection. |
| skill-lib `83aef7813dbd040a67ddc07bbb8845f51eb38a3e` | Owns registry, canonical full instructions and dependency graph. |
| a0 `b5be72523b687c2fbf5fb45893d1d5643c086700` | Owns execution/auth/queue integration; this branch adds only dormant validation. |

The equivalent shared identity record is `docs/work-graphs/webmcp-executor.json`.
The a0 identity is the inspected base, not a claim that this branch's new module
already exists in that commit. Repository linkage transfers no authority,
semantic claims, certification, proof, measurement status, or empirical validity.
Public repository visibility never grants write or model-budget authority.

## Usage

```python
from python.services.webmcp_validation import validate_skill_request

checked = validate_skill_request(
    browser_envelope,
    approved_registry_commit=server_configured_commit,
    registry_bytes=trusted_raw_registry_bytes,
    skill_bodies=trusted_same_commit_file_bytes_by_path,
    target_heads={"The-Interdependency/a0": independently_observed_head},
)
```

The call performs no I/O. Supply all keyword inputs from a trusted server-side
adapter, never by echoing browser fields. The future adapter must authenticate
retrieval from the canonical repository at the approved exact commit and obtain
fresh target state. `skills.json` has no body digests: locally hashing supplied
SKILL.md bytes binds returned content but does not authenticate its source.

The website sends a short repository name and a closure including the selected
skill itself. Closure order is dependency-first DFS in canonical `depends_on`
order. Registry SHA-256 covers raw bytes, not reserialized JSON. Both procedural
and metadata-block skills are supported. Request text is limited to 4,000
characters; registry/envelope/body sizes and nesting have independent limits.
Paths are canonical `<slug>/SKILL.md` identities; no submitted URL is fetched.

Validation compares authority-bearing source/skill fields, including the derived
human title. Non-authoritative target display metadata and registry `hmmm` are
not promoted into the returned instruction/identity object. This is not a full
JSON-schema validator for every presentation field. Returned identities and
bodies are immutable; no authorization or completion status is returned.

An absent target-head mapping entry is refused. Mapping membership is only the
caller's supplied selection boundary, not proof of user permission. Authentication,
per-repository scope, permitted effects, tool approval, provider and budget must
be enforced separately and checked again at eventual dispatch. `fallback=true`
is conservatively refused for execution preparation, without claiming the
website's fallback snapshot is corrupt.

## Verification

```sh
python -m unittest discover -s tests -p test_webmcp_validation.py -v
python scripts/annotate.py python/services/webmcp_validation.py tests/test_webmcp_validation.py
git diff --check
```

These tests require only Python's standard library. They load this module in
isolation because importing `python.services` loads existing service dependencies.
They do not require a database, provider credential, VM or network. Tests cover
source substitution, raw-byte mismatch, type confusion, malformed JSON/UTF-8,
path and closure tampering, cyclic/missing dependencies, stale/unlisted targets,
missing/oversized bodies, request/nesting limits and deep output immutability.
The successful path also patches socket/process/file-open primitives to fail.

A local replay on 2026-10-19 constructed the website projection and checked all
45 skills plus full prerequisite bodies from the exact skill-lib baseline above.
Raw registry SHA-256:
`09f8259f61f2ea22ce9150ff6ab6d7baf4f6d0ab605c926bd7d64fb0d78581a9`.
This demonstrates compatibility with those bytes, not live authentication or
end-to-end execution. Full a0 service/DB/browser integration was not run for this
isolated slice.

## Integration blockers (hmmm)

- No deployed authenticated `tiw_execute_skill` endpoint has been established.
- Existing operator-only CLI bearer resolution may be reusable; its current
  scope must not be silently widened. No credential provisioning is part of this patch.
- The website omits cookies. Ordinary a0 session authentication alone cannot
  authenticate its direct MCP requests. Host, trusted transport and allowed
  origins need an explicit integration decision.
- `sub_agent_spawn` truncates `task_summary` to 2,000 characters. Do not serialize
  these full instructions into that field or bypass the canonical spawn path.
- A queue insert exception currently still reaches a spawned-shaped response.
  A future adapter needs durable acceptance/readback evidence.
- The existing worker creates `AgentInstance` with `user_id=None`; it must carry
  and enforce caller/effect/budget authority before serving this contract.
- Inference completion is not proof the requested work succeeded. Receipts need
  separate verification, terminal failure/blocked states and authenticated readback.
- Live canary/success runs, security-negative cases, review, merge and deployment
  remain separate gates. The public registry stays read-only.

Rollback: remove the unreferenced validation module, its tests and this slice's
documentation. There is no migration or live state to undo.
