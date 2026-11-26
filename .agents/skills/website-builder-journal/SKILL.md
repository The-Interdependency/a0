---
name: website-builder-journal
description: Load this when any modification to The-Interdependency/The-Interdependency.github.io is planned or underway, including source, content, configuration, tests, workflows, dependencies, generated-contract code, or deployment paths. Reserve an independent research allowance before the required By the builder entry; record date, time, and truthful model provenance while leaving subject and length to the model. Do not load for read-only inspection that changes no website file.
---

# website-builder-journal — every build leaves a builder trace

Use this procedural skill before changing `The-Interdependency/The-Interdependency.github.io`.

## Core contract

A website modification is incomplete until the builder expands **By the builder**.

For every change transaction that modifies any website-repository file other than the journal append itself:

1. append at least one new record to `src/_data/builder.json`;
2. preserve every previously published record byte-for-byte in value and order;
3. record the entry's **date**, **time**, and **model provenance** under the entry contract;
4. render the journal behind the site's collapsible `<details>` tree; and
5. pass the repository's builder-history gate before merge.

The journal append is part of the same transaction and does not recursively require a second append. Read-only inspection that changes no website file is the non-trigger.

## Entry contract

New records require:

```json
{
  "id": "<stable-fragment>",
  "date": "YYYY-MM-DD",
  "time": "HH:MM±HH:MM",
  "model": "<exact runtime model or unavailable>",
  "body": "<builder-chosen subject>"
}
```

`id` is a stable technical anchor. Optional fields may support presentation or append-only correction links, but they must not create editorial requirements beyond this contract.

### Model provenance

Record the exact runtime model identifier when the executing runtime or response metadata actually exposes it. Do not invent a model name or version, infer one from behavior, or substitute a provider, product, role, or generic agent label such as `OpenAI`, `Codex`, `Claude`, `builder`, or `AI`.

When that identifier is not exposed, use `"model": "unavailable"` and a non-empty `model_unavailable_reason` stating the source limitation. For example:

```json
{
  "id": "builder-provenance-example",
  "date": "2026-10-20",
  "time": "00:00+00:00",
  "model": "unavailable",
  "model_unavailable_reason": "The executing runtime does not expose an exact response model identifier.",
  "body": "A trace can preserve its own limits."
}
```

The unavailable marker without its reason is invalid. Do not attach `model_unavailable_reason` to an exact identifier. Missing model metadata alone does not block ordinary website work when this fallback is recorded; it remains visibly unresolved provenance, not evidence of identity.

A requested/configured model alias is not the actual response model. If useful and actually known, record it separately in optional `requested_model`; never promote it into `model` without runtime evidence identifying the executing model. The public journal must display the unavailable reason and label any requested alias as requested/configured.

This fallback changes only the journal's provenance requirement. Scientific or model-comparison claims whose validity depends on exact model identity retain their evidence requirements; unavailable identity cannot establish those claims.

### Subject and length

The model has complete discretion over the journal entry's subject matter. It does not have to summarize the patch, justify the modification, discuss the website, or follow a recurring theme.

Write only as much as is required to properly explicate the chosen subject. There is no minimum length, target length, mandatory title, changelog template, or required rhetorical shape.

### Independent research allowance

Give the diary a separate work phase before composing its entry. Choose freely how
to use it: investigation, computation, invention, reflection, or developing an
existing thought. The subject may be unrelated to the website change. Use available
tools within existing authorization; the allowance is not a requirement to search,
spend tokens, or produce any particular kind of discovery.

For the initial three-entry trial, reserve **40,000 total model tokens per diary
research session**, allocated as ceilings of **15,000 input tokens** and **25,000
generated tokens**. One website change transaction receives one such session, not
a fresh allowance per request, revision, or appended record. Keep this allowance
separate from the website implementation work; unused capacity stays unused.

Count all model requests belonging to the diary phase:

- Input includes instructions, context, sources and tool results actually sent to
  the model. Count repeated and cached inputs on each request as reported; a cache
  discount changes cost, not token count.
- Generated usage includes reasoning, visible writing and other generated tokens.
  Reasoning already included in the provider's output total is counted once.
- Sum input and generated usage across the session. Before another request,
  check both remaining allocations and reserve room for its generation. Do not
  start a request that cannot fit; preserve unfinished work as `hmmm`.

Use actual provider or host usage counters when exposed. If this executor cannot
meter or enforce the allowance, report **`hmmm: diary research usage unmetered;
40,000-token allowance is planning guidance, not an enforced cap`**. Keep the work
focused and preserve any available partial counters; do not invent usage or claim
exact compliance. Do not configure new paid execution merely to obtain a meter.

Keep usage accounting in execution receipts or the task report. It adds no required
section, topic, quotation, citation format or length to the journal body. The writer
may include any of it by choice. After the first three entries governed by this
allowance, review their actual available usage and reader-assessed value with Erin
before changing the allowance. Tokens spent do not establish that an entry is useful.

## Append-only boundary

Previously published entries are immutable.

- Corrections are new entries; never rewrite the earlier entry.
- Deletion, replacement, or reordering of prior entries fails the gate.
- Historical records that predate the date/time/model contract remain unchanged. Do not backfill them, because doing so would violate the stronger append-only rule.
- New entries must satisfy the current entry contract.

## Collapsible-tree boundary

`/by-the-builder/` is a static-first collapsible tree implemented with semantic `<details>` / `<summary>` elements. JavaScript may enhance it but must not be required to read the entries.

The tree presentation may evolve. The requirements that survive presentation changes are: the journal remains collapsible, every entry remains reachable, and its date, time, and model provenance remain visible.

## Workflow

1. Resolve the exact website base commit before editing.
2. Make the authorized website modification.
3. Use the independent diary work phase, then append one or more compliant builder records before terminal validation. This phase belongs to the same transaction and creates no recursive entry obligation.
4. Run:
   ```bash
   npm run check:builder -- --base <base-commit>
   ```
5. Run the website's normal release gate.
6. Merge only if the builder-history contract and the website's other required checks pass.

The builder-history checker is enforcement; this skill is the behavior contract. Neither substitutes for the other.

## Validation

A conforming implementation proves all of the following:

- a non-journal website diff with zero appended entries fails;
- a non-journal website diff with at least one valid appended entry may proceed;
- a journal-only append does not trigger infinite self-requirement;
- prior entries cannot be edited, deleted, or reordered;
- every newly appended entry has non-empty `date`, `time`, `model`, and `body`;
- the time includes an explicit UTC offset;
- exact identifiers and unavailable-with-reason records are accepted; unavailable without a reason, an exact identifier with an unavailable reason, and generic provider/agent labels are rejected;
- requested/configured aliases remain separate from actual response identity, and identity-dependent claims retain their evidence gates;
- the public route renders the entries inside a collapsible semantic tree;
- the gate runs in the website's normal validation path.

For the research allowance, check a multi-request usage trace rather than prose
length: reject a next request exceeding either remaining allocation, count included
reasoning once, and preserve unavailable counters as `hmmm`. Forward-test with a
freely chosen subject outside the immediate change; assess value from the resulting
entry and any evidence it chooses to use, not from budget consumption. The existing
builder-history gate enforces record integrity; it does not meter research or grade
editorial value.

## Anti-patterns

- Treating the journal as an optional changelog.
- Appending one entry once and letting later website changes reuse it.
- Rewriting an old entry to add the newly required model or time.
- Forcing the entry to describe the patch.
- Padding an entry to satisfy an invented word count.
- Recording only the provider or agent product instead of the exact model.
- Requiring another append because the current transaction appended to the journal.
- Treating the research allowance as a spending quota, a new template for prose,
  or an automatically enforced limit on a host that exposes no usage counters.

## Usage guidance

When this skill is installed in the website repository, load it before the first write. Complete the independent diary phase within the website change before composing its record. The smallest compliant transaction is:

```text
website change
+ one new builder record {date, time, model provenance, body}
+ check:builder
+ normal website release gate
```

## hmmm

The first published builder entry predates the date/time/exact-model contract. It remains intentionally unchanged because append-only history outranks retroactive schema neatness.

Exact research-token metering and enforcement depend on the executing host. This
skill grants the allowance and defines its accounting; it does not install a
provider-independent spending controller. The three-entry trial begins with entries
written under this revision; historical entries are not rewritten or retroactively
charged against it.
