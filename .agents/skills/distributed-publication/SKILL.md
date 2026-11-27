---
name: distributed-publication
description: Provenance-bearing publication from distributed source owners. Load this when assembling, displaying, or maintaining one ordered textbook, report, standard, corpus, archive, knowledge surface, or public reading sequence whose authoritative units live in multiple repositories or independently owned files; when a publication consumer must retrieve exact commits, blobs, and content digests; when source order, source-local license or status, explicit fallback, correction routing, or public build identity must remain intact. Load interdependent-work-graph with it. Do not load for ordinary single-repository documentation, a link index that does not reproduce source content, or cross-repository code coordination with no publication artifact.
---

# distributed-publication — gather the reading, not the authority

Load `interdependent-work-graph/SKILL.md` first or alongside this skill. The work-graph skill identifies participants, exact identities, authority roles, relations, and non-transfer boundaries. This skill specializes the publication edge: how independently owned source units become one bounded reading surface without losing their ownership.

## Core contract

```text
one reading surface != one source authority
publication order != ownership transfer
content identity != producer authentication
```

- Declare the complete ordered source spine before implementing routes or rendering.
- Resolve every displayed source to an exact commit or immutable artifact identity.
- Bind content to repository, path, expected title or identity marker, commit, blob or object identity, and content digest.
- Preserve source-local license, canon, theorem, proof, certification, measurement, empirical, and frontier status.
- Render source text exactly unless a separately labeled transformation is explicitly requested.
- Route corrections to the source owner; refresh the publication after the source changes.
- Fail closed in production when required current sources cannot be resolved.
- Make retained snapshots or offline copies visibly fallback, never silently current.
- Publish the source identities used by the built artifact so the live surface can be independently checked.
- Preserve unresolved signatures, licensing questions, renderer limits, and source conflicts as `hmmm`.

## Non-trigger

Do not load this skill for:

- a document whose authoritative content and release history live entirely inside one repository;
- a directory of outbound links that does not reproduce, transform, or order the linked content;
- ordinary package dependencies or a multi-repository code change with no publication surface;
- a one-time quotation or citation that already follows the source's normal attribution rules;
- a plain-language companion view over one source — use `plain-lens` for that transformation contract.

Load it when publication creates a new combined reading object whose truth depends on preserving several independently owned sources together.

## Authority model

Each publication has at least two kinds of participant:

```text
source owner          owns its content, license, status, and correction history
publication consumer  owns ordering, retrieval, rendering, navigation, indexing, and display provenance
```

Additional participants may include a canon source, research ledger, external corpus, renderer, static fallback, search index, or deployment environment. Their authority must be stated rather than inferred from proximity.

The publication consumer may say:

- which source was displayed;
- which immutable identity and digest were used;
- where it appears in the reading order;
- which license declaration and license-review state the source supplied;
- whether retrieval was current or fallback;
- which rendering and accessibility checks passed.

The publication consumer may not say, merely by displaying the source:

- that it owns or supersedes the source;
- that all source licenses have merged;
- that theorem or proof status crosses source boundaries;
- that an implementation chapter validates a theory chapter;
- that an exact digest authenticates who authored or transported the content;
- that a retained snapshot is the current source.

## Workflow

1. **Load the work graph.** Resolve every source owner, publication consumer, renderer, deployment surface, and other participant that can change the published result.
2. **Declare the publication object.** Name the textbook, report, standard, corpus, archive, or other combined reading surface. State whether order is load-bearing.
3. **Define the ordered source spine.** For every unit declare position, stable source identifier, repository or artifact owner, path or object locator, expected title or identity marker, source-local license and license-review state, source-local status, and correction destination.
4. **Resolve immutable identity.** Pin commit and blob/object identity where available, plus a content digest over the exact bytes displayed. Branch names remain navigation aids only.
5. **Declare non-transfer boundaries.** At minimum cover authorship, ownership, license, canon status, proof status, certification status, measurement validity, empirical validity, and frontier status.
6. **Choose rendering mode.** Prefer exact, static-first rendering. Disable source HTML unless it is explicitly trusted and sanitized. If content is transformed, label the output as interpretation and preserve a path to exact source.
7. **Define failure and fallback policy.** Required current sources fail closed in production. Offline or degraded builds may use a retained snapshot only when visibly marked with its retained identity and retrieval failure.
8. **Build navigable publication surfaces.** Provide an ordered index, stable unit routes, source evidence, previous/next navigation where sequence matters, search where useful, and a static/no-JavaScript reading path.
9. **Publish build identity.** Emit a machine-readable artifact binding the publication build to every displayed source identity and fallback state.
10. **Validate locally and across sources.** Check order, completeness, expected titles or identity markers, license fields, digests, exact source links, status labels, routes, accessibility, and the public build manifest.
11. **Route corrections upstream.** Patch source content only in its owning repository. Patch ordering, rendering, or provenance defects only in the publication consumer.
12. **Carry hmmm forward.** Preserve unresolved signatures, source conflicts, license ambiguity, inaccessible formats, renderer gaps, or deployment freshness as explicit boundaries.

## Distributed-publication reference contract

A machine-consumed publication manifest may use this reference shape:

```json
{
  "schema": "the-interdependency.distributed-publication",
  "version": "1.0.0",
  "publication_id": "<stable-id>",
  "title": "<publication title>",
  "order_is_load_bearing": true,
  "sources": [
    {
      "position": 0,
      "source_id": "<stable-source-id>",
      "repository": "owner/name",
      "path": "path/to/source.md",
      "expected_title": "<expected source heading or identity marker>",
      "commit": "<40-hex commit>",
      "blob": "<immutable object identity>",
      "content_sha256": "<64-hex digest>",
      "authority": "what this source owns",
      "license": "SPDX expression|source-declared text|hmmm",
      "license_status": "declared|unknown|human-review-required",
      "status": "source-local status",
      "correction_target": "owner/name:path/to/source.md",
      "fallback": false
    }
  ],
  "consumer": {
    "repository": "owner/publication",
    "commit": "<40-hex commit>",
    "route_prefix": "/publication/",
    "renderer": "exact-markdown-static",
    "fallback_policy": "fail-closed-production|explicit-retained-snapshot"
  },
  "boundaries": {
    "authorship_transfer": false,
    "ownership_transfer": false,
    "license_transfer": false,
    "canonical_status_transfer": false,
    "proof_status_transfer": false,
    "certification_status_transfer": false,
    "measurement_status_transfer": false,
    "empirical_status_transfer": false,
    "digest_is_authentication": false,
    "hmmm": []
  },
  "publication_sha256": "<sha256>"
}
```

For version `1.0.0`, `publication_sha256` is SHA-256 over canonical JSON containing exactly `publication_id`, `title`, `order_is_load_bearing`, `sources`, `consumer`, and `boundaries`, sorted by object key with compact separators. Array order is preserved and therefore part of identity. A schema revision is required to add or reinterpret hashed fields.

`expected_title` may contain a complete title, heading prefix, or other declared identity marker, but its matching rule must be explicit in the consumer. `license` records the source's own declaration rather than a publication-wide inference. `license_status` keeps unknown or human-review-required compatibility visible; neither field authorizes the consumer to relicense the source.

This reference contract complements, rather than replaces, `the-interdependency.stack-manifest`. The stack manifest identifies the complete work graph. The distributed-publication manifest identifies the exact ordered reading artifact produced from that graph.

## Exact source and transformed views

Exact source display and companion interpretation are separate publication modes.

- Exact mode reproduces source content without editorial rewriting and exposes immutable source identity.
- Transformed mode may summarize, translate, annotate, or provide an audience/domain lens, but must label the transformation and link to exact source.
- When transformed views are required, load `plain-lens` in addition to this skill.
- A transformed view must not replace the exact source route or inherit source-local status merely because it is adjacent.

## Failure and fallback discipline

A production publication must not silently omit, reorder, or replace required units.

Fail production when:

- a required source cannot resolve to its declared path or object;
- a source title or identity marker no longer matches `expected_title` under the declared matching rule;
- an exact commit, object identity, or digest is missing;
- a source-local license declaration or license-review state is absent rather than explicitly `hmmm` or `unknown`;
- the ordered spine contains duplicates, gaps, or unexpected reordering;
- current retrieval falls back while the release claims current source coverage;
- rendered output loses a required status or provenance boundary.

A degraded or offline mode may continue only when:

- the retained source identity is visible;
- fallback state is machine-readable and human-readable;
- no retained copy is called current;
- missing content becomes `hmmm`, not invented prose;
- production and degraded policies are distinguishable in tests and configuration.

## Output shape

When this skill is active, produce or maintain:

```markdown
## Publication object
- title, stable ID, ordered/unordered status

## Ordered source spine
- position: source identity — expected title/marker — authority — license/status — correction target

## Publication consumer
- repository, routes, renderer, search/navigation, fallback policy

## Non-transfer boundaries
- authorship, ownership, license, canon, proof, certification, measurement, empirical, authentication

## Build identity
- consumer commit
- source commits/objects/digests
- fallback states

## Validation
- source completeness and order
- expected identity markers and source-local license fields
- exact rendering and routes
- browser/accessibility/static fallback
- public build-manifest check

## hmmm
- unresolved source, license, authentication, rendering, or deployment boundaries
```

For machine consumption, also emit the versioned distributed-publication manifest or an explicitly named equivalent with the same obligations.

## Validation

A successful application demonstrates:

- every required source appears exactly once in the declared order;
- every source has an exact or visibly unresolved identity;
- every source carries an expected title or identity marker with a declared matching rule;
- every source carries its own license declaration and license-review state, including explicit `hmmm` or `unknown` where unresolved;
- content digests recompute from the bytes displayed;
- the publication consumer does not shadow or rewrite source-owned content in exact mode;
- source-local licenses and statuses remain visible and do not transfer;
- corrections route to the owning source;
- production fails closed on missing or fallback required sources;
- degraded mode remains explicit and non-inventive;
- stable index and unit routes render without JavaScript;
- sequential navigation works where order matters;
- automated accessibility checks pass and manual review remains acknowledged;
- the public build artifact exposes every source identity used;
- later agents can reproduce the same publication from the manifest without rediscovering the source spine.

## Anti-patterns

- Copying distributed source files into the publication repository and treating the copies as new authority.
- Fetching `main`, `latest`, package availability, or an unpinned URL during an evidence-producing build without recording the resolved immutable identity.
- Treating a digest as a signature or author authentication.
- Omitting per-source license declarations and then implying one publication-wide license.
- Combining licenses into one implied publication license without explicit permission.
- Letting a theory chapter inherit implementation or test status from neighboring chapters.
- Silently dropping a source that failed retrieval.
- Reordering a load-bearing sequence according to filename or fetch completion order.
- Rendering trusted HTML from distributed Markdown by default.
- Fixing source prose in the publication consumer instead of the owning source.
- Allowing fallback content in a production build that claims current completeness.
- Making the exact reading experience depend on client-side JavaScript.
- Publishing provenance only in logs rather than in the artifact visitors receive.

## Minimal example

The first reference implementation is the distributed Interdependency textbook:

```text
Chapter 0  metapat             root theory
Chapter 1  ucns                carrier foundations
Chapter 2  edcm                measurement discipline
Chapter 3  skill-lib           self-declaration method
Chapter 4  interdependent-lib  cross-repository canon placement
Chapter 5  ptcna               architecture
Chapter 6  a0                  research instrument
Chapter 7  zfae                theory under development
website    publication consumer
```

The website owns the reading sequence, routes, rendering, accessibility, and publication provenance. It owns none of the chapter texts or their source-local status.

## hmmm

- Content digests establish byte identity, not cryptographic authorship or transport authentication.
- A general signed-source contract for distributed publications is not yet selected.
- License compatibility can be displayed and checked for declared metadata, but legal compatibility still requires competent human review.
- Mathematical notation accessibility requires more than automated HTML accessibility scanning; the canonical cross-format expectation remains unresolved.
- Whether the reference manifest becomes its own metadata-block/schema skill after multiple independent implementations.
- Whether publication consumers should retain source snapshots in version control, release artifacts, object storage, or an external content-addressed archive remains context-dependent.
