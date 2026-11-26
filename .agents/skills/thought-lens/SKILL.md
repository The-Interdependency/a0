---
name: thought-lens
description: Translate raw, context-heavy, recursive, fragmentary, coined, or private-language thought into audience-legible language without changing the underlying claim. Load this when a user says people do not understand what they mean; asks to make a thought understandable to strangers, the public, a specific audience, or a platform; supplies dense notes rather than finished prose; needs jargon or coined terms introduced only after their ordinary-language meaning lands; or wants multiple audience/surface renderings from one thought. Do not load merely to polish finished prose or to simplify an already-stable canonical document; use ordinary editing for the former and plain-lens for the latter. Inputs may include shorthand, partial equations, and compressed references; output may be a conversation answer, post, thread, article, academic framing, or technical note. Do not load for spelling, grammar, tone polishing, or an already-explicit claim.
---


Recover and freeze the claim before rendering it for an audience; back-translate and compare before delivery.

Use `domain-claims` when a translated term is proposed for canonical authority.
Use `char-compress` when the target is agent context size rather than human legibility.

## Source of truth

The supplied thought is the source of truth for intended meaning. Existing
canon, evidence, or repository sources constrain it when the thinker explicitly
refers to them, but the translator must not silently substitute a better-known
theory for the thought being translated.

Treat the source as evidence of intended meaning, not automatically as truth
about the world. Preserve the difference among:

```text
definition | observation | interpretation | hypothesis | causal claim
normative claim | metaphor | analogy | prediction | source-backed claim
```

Translation may change vocabulary. It may not silently change claim type,
certainty, polarity, quantifier, causal force, actor, scope, order, exception,
or status.

## Inputs

Minimum:

```yaml
source: <raw thought>
```

Optional controls:

```yaml
audience: stranger | peer | domain expert | named audience | hmmm
surface: conversation | x | thread | linkedin | article | formal | academic | technical | other
budget: 15_seconds | 1_minute | full | <user-supplied character/word budget>
goal: understand | respond | remember | inspect | act | ask_more
voice: preserve | neutral | <user-specified>
```

Defaults:

- `audience`: context-light adult stranger;
- `surface`: compact general explanation;
- `budget`: first layer readable in roughly 15 seconds, with deeper layers
  available beneath it;
- `voice`: preserve where it does not increase context debt.

Do not require the user to pre-structure the thought. Recovering structure is
the work of this skill.

## Workflow

### 1. Recover the thought map

Before writing audience prose, recover this structure internally:

```yaml
thought_map:
  subject: ...
  core_claims: [...]
  distinctions: [...]
  definitions: [...]
  relationships: [...]
  causal_claims: [...]
  evidence_or_examples: [...]
  implications: [...]
  qualifications: [...]
  coined_terms: [...]
  prerequisites: [...]
  rhetorical_material: [...]
  unresolved: [...]
```

Rules:

1. Recover; do not improve.
2. Infer only what is necessary to connect explicit fragments.
3. Keep multiple plausible structures unresolved rather than choosing the
   smoothest one.
4. Separate rhetoric, analogy, definition, mechanism, and evidence.
5. Record prerequisite concepts the source assumes the reader already knows.
6. Do not force a fragment into a complete theory.
7. Unknown becomes `hmmm`, not connective invention.

The thought map is normally internal. Show it when requested, when material
ambiguity exists, or when fidelity cannot be established without exposing the
fork.

### 2. Freeze the claim kernel

Create the smallest structure every valid rendering must preserve:

```yaml
kernel:
  claim_type: ...
  must_preserve:
    - actor / object / relation / condition / consequence
    - negation / quantifier / modal force / order / exception / scope
  must_not_imply:
    - claims not licensed by the source
  strength: observed | possible | proposed | likely | asserted | defined | source-backed | hmmm
  dependencies:
    - prerequisite concept required for full precision
  unresolved:
    - ...
```

The kernel is a translation contract, not a summary.

A shorter rendering is valid only when omitted material is not part of the
kernel or is explicitly deferred to a deeper layer. If deleting a detail changes
what could make the claim true or false, that detail belongs in the kernel.

### 3. Calculate the context gap

For every kernel element ask:

```text
What must this audience already know to parse it?
What ordinary distinction can carry the same relation?
What example makes the relation visible without becoming fake evidence?
Which coined term is useful only after its ordinary referent is understood?
```

Classify prerequisite context as:

- **required now** — omission causes first-pass misunderstanding;
- **defer safely** — needed for mechanism or precision, not first-pass meaning;
- **domain-only** — useful only to expert readers;
- **unresolved** — the mapping itself is uncertain; emit `hmmm`.

The optimization target is **reader context required**, not intellectual content
removed.

### 4. Render from the kernel

Use this order unless the target surface requires otherwise:

```text
ordinary distinction
-> concrete consequence/example when useful
-> coined or technical name only if it buys precision
-> mechanism / architecture
-> source or deeper treatment
```

A coined term normally enters as:

```text
<ordinary meaning>. I call this <term>.
```

not:

```text
<term> is <another unexplained term> involving <another unexplained term>.
```

Surface adapters:

- **Conversation** — answer the point first, then one layer of why.
- **X / short public post** — one usable distinction per post; no acronym as an
  entry requirement.
- **Thread** — concrete hook -> distinction -> claim -> implication -> mechanism
  or term -> deeper source -> `hmmm` if material.
- **LinkedIn / professional** — claim -> practical consequence -> mechanism or
  example -> source; remove platform-performance filler.
- **Academic** — state claim type and scope first; distinguish proposal from
  result; define terms before relying on them; identify evidence and unresolved
  bridges.
- **Technical** — preserve exact operators, entities, interfaces, values,
  dependencies, conditions, and status. Reduce context debt by adding
  definitions, not by deleting structure.

### 5. Build progressive disclosure

Default human-facing shape:

```text
UNDERSTAND THIS FIRST
<minimum context-independent statement>

SAY IT LIKE THIS
<audience/surface-ready rendering>

IF THEY ASK WHY
<one deeper layer, if useful>

IF THEY WANT THE MODEL
<technical/structural layer, if useful>

HMMM
<unresolved constraints whose omission would mislead>
```

Do not print empty sections. `SAY IT LIKE THIS` is the primary reusable output.

Machine/UI equivalent:

```yaml
translation:
  understand_first: ...
  say_it_like_this: ...
  if_they_ask_why: ... | null
  if_they_want_the_model: ... | null
  terms_introduced: [...]
  hmmm: [...]
```

### 6. Run the fidelity audit

Compare **source -> kernel -> rendering**:

```text
[ ] no kernel claim disappeared
[ ] no substantive new claim appeared
[ ] negation and polarity survived
[ ] quantifiers and scope survived
[ ] causal strength did not increase
[ ] certainty/status did not increase
[ ] actor and object did not swap
[ ] operative conditions, exceptions, and order survived
[ ] analogy is not presented as evidence
[ ] coined terms are defined before carrying argumentative weight
[ ] unresolved constraints remain visible as hmmm
```

If a rendering fails, regenerate from the kernel. Do not repair a bad
translation with persuasive filler.

### 7. Back-translate for legibility

Read the rendering as if the raw source were unavailable:

```yaml
back_translation:
  what_is_being_claimed: ...
  claim_type: ...
  strength: ...
  required_context_still_missing: [...]
```

Compare it to the kernel. Pass when a context-naive reading recovers the kernel
without acquiring a material new claim.

If a genuinely separate model or human is available, use it as the stronger
legibility check. If the same model performs the check, label it a **self-check**
and do not claim it proves human understanding.

Readability scores are not substitutes for this test. Short words can still
carry the wrong idea.

## Output contract

For ordinary use, return the smallest useful rendering first. Do not force the
user to inspect the thought map or kernel unless they asked for them or an
ambiguity must be exposed.

A good response allows the user to paste raw thought and immediately obtain text
they can use, while still retaining a path back to the full structure.

Example invocation:

```text
thought-lens this for a stranger, X, 15 seconds:
<raw thought>
```

or simply:

```text
translate this so someone without my context can understand it:
<raw thought>
```

## Example

Raw thought:

```text
A network gets called decentralized because there are many nodes, but if every
node must ask the same service who is allowed to speak, the authority is still
centralized. topology isn't authority.
```

Kernel:

```yaml
claim_type: distinction
must_preserve:
  - many execution nodes do not by themselves imply distributed authority
  - a shared permission authority can remain a central control point
  - topology and authority are distinct properties
must_not_imply:
  - the network has only one physical node
  - all centralized permission systems are necessarily bad
strength: asserted
```

Context-light rendering:

```text
A system can have thousands of independent machines and still have one
gatekeeper. Distribution of machines is not the same thing as distribution of
authority.
```

Technical layer:

```text
Physical or computational topology and authorization topology are separate
properties. A network with many execution nodes remains authority-centralized
when a single service controls admission or permission.
```

Different vocabulary; same falsifiable distinction.

## Anti-patterns

Reject or repair:

- **Jargon substitution** — replacing one private term with several unfamiliar
  public terms.
- **Flattening** — deleting conditions, exceptions, uncertainty, or interacting
  claims until only a slogan remains.
- **Persuasion drift** — changing `may` to `does`, `I suspect` to `is`, or a
  proposal into fact because certainty reads more cleanly.
- **Mechanism invention** — supplying a missing causal bridge from general
  knowledge without marking it as an addition.
- **Analogy capture** — using an analogy and then reasoning as though the target
  literally has the analogy's properties.
- **Audience caricature** — treating a general reader as stupid. Remove missing
  context, not intellectual content.
- **Voice erasure** — turning every rendering into generic institutional prose
  when the source's cadence can survive without increasing context debt.
- **Acronym-first output** — requiring the reader to join private language
  before the public idea exists for them.
- **False legibility claims** — declaring that humans understand because the
  generating model understands its own output.
- **Over-recovery** — turning an already explicit sentence into an unnecessary
  theory. Example: `The current implementation rejects unsigned requests.`
  needs explanation only when explanation is requested.

## Relation to neighboring skills

```text
raw thought
   |
   v
thought-lens        recover + freeze + translate
   |
   +--> public / conversational / academic / technical rendering
   |
   +--> stabilized document or canon candidate
            |
            v
        plain-lens   companion views of established dense source
```

`thought-lens` owns translation from pre-document cognition. `plain-lens` owns
companion views of stabilized dense source. `domain-claims` owns semantic
promotion. `char-compress` owns context-size compression. Do not collapse these
boundaries merely because all four transform language.

## Validation

Repository acceptance:

```bash
python -m unittest discover -s tests
python tools/check_skill_lib_drift.py
python tools/check_skill_compliance.py
python tools/build_codex_plugin_skills.py --check
```

`thought-lens/fixtures.json` supplies review cases for uncertainty, operator
preservation, coined-term introduction, context-gap reduction, and refusing to
over-recover explicit claims.

Repository checks prove registration, packaging, and procedural consistency.
They do not prove that a particular human audience understood a rendering.
Stronger field evidence requires an external reader, independent
back-translation, restatement, question, click/action, or another declared
observation.

## hmmm

- Human understanding cannot be guaranteed by model self-evaluation; the
  back-translation self-check is a guardrail, not proof.
- Audience models are approximations. A named audience can still vary widely in
  domain knowledge, literacy, language, culture, attention, and stakes.
- A future executable evaluator can compare claim kernels against independent
  human/model back-translations, but no universal legibility metric is claimed
  here.
- Sometimes the shortest path between two minds is a definition; sometimes it
  is a story. A compiler that cannot tell the difference eventually buys a
  trumpet.
