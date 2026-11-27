---
name: domain-claims
description: Domain-first lexical and semantic governance for canonical terms. Load this when a word or phrase is being promoted into a theorem term, ontology primitive, schema field, encoding label, skill doctrine, cross-domain mapping, or other meaning-bearing control surface; when multiple domains use the same word differently; when an acronym, initialism, symbol, or compact handle is being mistaken for a fixed expansion or definition; or when conversational provenance is about to be attached to a definition. Do not load for ordinary prose, casual wording choices, or simple dictionary explanations that will not control canon or structure.
---

# domain-claims — establish semantic standing before provenance

The governing rule is:

> Before a word becomes a canonical term, identify which domain has standing to
> claim the applicable sense and scope.

For compact handles, an additional rule applies:

> |∆|Acronyms identify; they do not define. Expansions are instance-resolved
> properties, not canonical identities, unless the claiming domain explicitly
> ratifies a fixed expansion as identity-bearing.|∆|

A domain claim does not own a word everywhere. It claims authority over one bounded
sense of that word inside a declared scope.

## Load this when

- A word is being promoted into canon, a theorem, a schema, an ontology, an encoding,
  a skill, a metric, a module field, or another structural control surface.
- A definition is being derived from conversation and will later authorize an
  implementation or encoding.
- The same surface word appears in several domains with different meanings.
- An acronym, initialism, symbol, or compact project handle is being expanded and the
  expansion could be mistaken for the handle's identity.
- A cross-domain import, specialization, translation, or shared term needs to be
  declared.
- An agent must decide whether provenance belongs to this sense of a word or to a
  different homonym.

## Do not load this when

- The user is choosing ordinary prose that will not become canon or structure.
- The task is only to provide a general-language dictionary meaning.
- A spelling, grammar, or style edit does not alter the governing sense of a term.
- The relevant domain claim has already been ratified and no collision or scope
  change is present.

## Zeroth-provenance doctrine

The semantic dependency order is:

```text
domain claim
  -> domain-bound definition
  -> conversational/source provenance
  -> ratification status
  -> canonical semantic record
  -> downstream encoding or implementation
```

Provenance may show where words were spoken or written. It cannot by itself establish
which domain had standing to define the operative sense.

Therefore:

- a definition without a domain claim is **unscoped**;
- provenance attached to an unscoped word is **lexically ambiguous**;
- an encoding based on an unresolved word is **not authorized**;
- a domain collision is a fail-closed boundary, not a cue to choose the most familiar
  meaning.

## Despecified handles

A **despecified handle** is a stable surface identifier whose identity is not exhausted
by, and does not require, one canonical lexical expansion. This is the default treatment
for The Interdependency's acronym-like semantic control surfaces unless a domain claim
explicitly ratifies a fixed expansion.

Despecified does not mean unspecified. Identity remains constrained by the resolved
term id, claiming domain, scope, relations, invariants, provenance, and current instance.
An expansion may improve legibility in one outward-facing artifact without becoming a
global definition.

For an acronym, initialism, symbol, or compact handle, extend the domain-claim record
when needed:

```yaml
handle:
  kind: acronym | initialism | symbol | compact-name
  identity_mode: despecified | fixed-expansion
  canonical_expansion: none | <ratified text> | hmmm
  instance_expansions:
    - text: <expansion used in this instance>
      scope: <artifact, audience, domain, or other bounded context>
      status: instance-definition | proposed | ratified | superseded
      provenance: <source or hmmm>
```

Rules:

- `despecified` means the handle can remain stable while instance expansions vary;
- an instance expansion is a property of that instance, not retroactive authority over
  every use of the handle;
- `fixed-expansion` requires explicit domain ratification; familiarity, search rank,
  historical usage, or lexical plausibility is insufficient;
- external acronym collisions do not redefine an internal handle; they remain separate
  domain claims and are tested only where scopes overlap;
- changing an expansion does not change identity unless the active domain claim makes
  that expansion identity-bearing;
- a handle whose relations, invariants, scope, and provenance cannot recover its
  operative identity is underspecified and remains `hmmm`.

## Domain-claim record

Before canonization or encoding, produce a record containing at least:

```yaml
surface_form: <word or phrase as used>
term_id: <stable domain-qualified identifier>
claiming_domain: <domain with standing over this sense>
claimed_sense: <the distinction the term names>
scope: <where this sense controls interpretation>
claim_type: native | borrowed | specialized | translated | shared | contested | provisional
authority_source: <canon, specification, ratified conversation, or hmmm>
status: proposed | provisional | ratified | contested | superseded
included_uses:
  - <use included by this claim>
excluded_uses:
  - <nearby use explicitly outside this claim>
neighboring_terms:
  - <term whose boundary must remain visible>
known_collisions:
  - <overlapping domain claim or none>
effective_version: <version, date, commit, or hmmm>
supersedes: <prior claim identifier or none>
unresolved:
  - <hmmm that must survive>
```

The stable `term_id` should be domain-qualified, for example:

```text
ucns.relational_geometry.radius
metapat.encoding.fork
software_architecture.layer
```

Do not use the bare surface word as the global identifier.

## Claim types

- **native** — the domain defines the sense directly.
- **borrowed** — the domain imports another domain's sense without changing it.
- **specialized** — the domain narrows a broader sense.
- **translated** — the domain maps a source-domain term into a target vocabulary.
- **shared** — several domains deliberately use one reconciled sense.
- **contested** — overlapping claims remain live and unreconciled.
- **provisional** — the sense may be used experimentally but is not ratified canon.

Claim type and status are separate. A translated claim may be ratified; a native
claim may still be provisional.

## Collision test

A `DOMAIN_COLLISION` exists when all are true:

1. the surface word, phrase, or handle is the same or treated as equivalent;
2. the scopes overlap for the current task;
3. the claimed senses differ materially;
4. no explicit translation, specialization, precedence, or disambiguation rule
   resolves the overlap.

Different expansions of a despecified handle are not by themselves a collision. Test
the domain-bound senses and overlapping scopes, not merely the words chosen to expand
the letters.

On collision, emit:

```text
DOMAIN_COLLISION
term: <surface form>
applicable claims:
- <domain-qualified term id>: <sense and scope>
- <domain-qualified term id>: <sense and scope>
resolution required before canonization or encoding
```

Do not silently choose by recency, popularity, model familiarity, lexical similarity,
repository proximity, or the most common acronym expansion returned by search.

## Workflow

1. **Detect promotion.** Determine whether the word will control canon, structure,
   theorem language, implementation, measurement, or encoding. If not, stop;
   ordinary language remains fluid.
2. **Enumerate candidate domains.** Name every domain whose claim could reasonably
   apply in the current scope.
3. **Declare the claim.** Create or retrieve the domain-claim record before drafting
   the operative definition.
4. **Resolve handle identity.** For acronyms, initialisms, symbols, and compact names,
   determine whether identity is `despecified` or explicitly `fixed-expansion` before
   treating any expansion as semantic authority.
5. **Run the collision test.** Fail closed on unresolved overlap.
6. **Bind the definition.** Write the definition as a claim of the domain, not as a
   universal statement about the surface word or expansion.
7. **Attach provenance.** Attach conversation excerpts, documents, commits, examples,
   corrections, and counterexamples to the domain-qualified sense.
8. **Ratify honestly.** Mark proposed, provisional, ratified, contested, or superseded.
   Do not turn accepted discussion into retroactive authority for earlier artifacts.
9. **Authorize downstream use.** Only a resolved domain-bound definition may control
   an ontology, schema, theorem term, METAPAT record, UCNS encoding, or other structural
   surface.
10. **Preserve hmmm.** Unresolved scope, collisions, borrowing rules, handle identity,
    and authority questions remain visible.

## Relationship to other skills

- **Before `canon`:** `domain-claims` establishes which domain-qualified sense is under
  review; `canon` then determines whether the claim is declared, implemented,
  repo-local, inferred, desired, or `hmmm`.
- **Before `gonol-build`:** lexical classification must not collapse domain-specific
  senses that require separate term identities.
- **Before `plain-lens`:** companion views may simplify wording but must preserve the
  active domain claim and disclose when a familiar word carries a specialized sense.
  Expanding a despecified handle for readability must remain explicitly instance-bound.
- **Before semantic encodings:** structural possibility does not authorize meaning.
  The encoding must cite the resolved domain claim.

## Minimal examples

### Radius

```yaml
surface_form: radius
term_id: ucns.relational_geometry.radius
claiming_domain: UCNS relational geometry
claimed_sense: recursive payload depth
scope: UCNS objects and UCNS-derived relational projections
claim_type: specialized
status: ratified
excluded_uses:
  - breadth valuation log(len(A_plus))
  - Euclidean physical distance from a center
neighboring_terms:
  - ucns.relational_geometry.breadth
```

### Despecified acronym

```yaml
surface_form: EDCM
term_id: the-interdependency.edcm
claiming_domain: The Interdependency
claimed_sense: <resolved project/object sense>
scope: <current instance scope>
handle:
  kind: acronym
  identity_mode: despecified
  canonical_expansion: none
  instance_expansions:
    - text: <audience-appropriate expansion>
      scope: <this outward-facing instance>
      status: instance-definition
      provenance: <source>
```

A search result that expands `EDCM` differently supplies another domain claim, not a
replacement definition. Resolve scope and sense first. The letters remain the stable
handle.

### Fork

UCNS may claim the structural sense "multiple payload-bearing branches." METAPAT may
separately claim the semantic sense "simultaneous constitutive components of one
parent." The structural fact does not supply the semantic authorization. An encoding
must cite the METAPAT claim before treating a payload fork as a hyper-tensor layer.

## Output shape

When this skill is active, return:

```markdown
## Domain claim
- Surface form:
- Term id:
- Claiming domain:
- Claimed sense:
- Scope:
- Claim type:
- Status:
- Handle identity: despecified | fixed-expansion | not-applicable | hmmm

## Boundaries
- Included:
- Excluded:
- Neighboring terms:

## Collision check
- Applicable claims:
- Resolution: clear | DOMAIN_COLLISION | hmmm

## Provenance allowed next
- Sources that may now attach to this domain-qualified sense:

## Downstream authorization
- Canon/encoding/implementation permitted: yes | no | provisional
```

## Validation

A successful application demonstrates that:

- the domain claim appears before the definition and provenance;
- the term has a stable domain-qualified identifier;
- scope and exclusions are explicit;
- acronym/handle expansions are not promoted to identity without explicit ratification;
- overlapping claims were tested rather than ignored;
- unresolved collisions block downstream structural use;
- provenance is attached to the claimed sense, not merely the surface word;
- ordinary language was not needlessly forced into a registry.

## Anti-patterns

- Treating a dictionary definition as authority for a specialized domain term.
- Attaching a conversation to a bare word and assuming every later use inherits it.
- Saying a domain owns a word globally.
- Treating the most familiar or searchable acronym expansion as the handle's definition.
- Freezing an outward-facing expansion into global canon without explicit ratification.
- Using repository location as semantic precedence.
- Encoding a homonym because its field name matches.
- Treating structural detectability as semantic authorization.
- Creating domain claims for every ordinary word and making conversation unusable.
- Erasing contested claims instead of preserving the collision.

hmmm

- whether domain-claim records should later gain an msdmd metadata-block sibling and
  registry runner
- whether despecified-handle records need an organization-wide machine-readable registry
  or should remain attached only to domain-qualified claims
- whether ratified conversational definition events should have a standard immutable
  transcript-envelope schema
- how multilingual surface forms share or fork a term identity without assuming exact
  translation
- how domain authority is delegated, revoked, or shared across organizations
