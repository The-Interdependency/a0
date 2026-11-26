---
name: plain-lens
description: Building a plain-language, multi-lens companion view of dense canonical text — an easier on-ramp that does not replace or talk down to the source. Load this when you are asked to make an informationally dense document (canon, spec, articles, legal/normative text) easier to approach for newcomers; when building an "explain it through the lens of X" selector (domain, audience, or role); when designing progressive-disclosure or layered ELI-not-stupid reading UX; when a dynamic, data-driven site must keep its existing static page as a graceful fallback; or when you need an EDCM-style two-speaker tension reading between a body text and its footnotes/caveats. Use this when the risk is either drowning readers in density or insulting them with oversimplification. Do not load to edit canon itself. Lenses may follow a work domain, audience, or role; footnotes, caveats, and dissent may act as the second speaker.
---


Build a companion view; it never becomes the source of truth. If it disagrees with canon, correct the companion.

## Workflow: the five rules

1. **On-ramp, not replacement.** The plain reading is the default view,
   but the original text and its footnotes are always one interaction
   away and never hidden behind the paraphrase. Link back to the full
   source from every view.
2. **Concrete over condescending.** Lower the reading load by swapping
   abstraction for concrete, domain-native examples — not by removing
   substance, hedging, or adding "don't worry" tone. Respect the reader's
   intelligence; assume only that they lack *this* context, not capacity.
   Keep sentences short and familiar; that helps dyslexic, ADHD,
   non-native, and screen-reader readers without insulting anyone.
3. **Preserve the operators.** A paraphrase must carry the source's
   negations, quantifiers, conditions, and named obligations intact
   ("none", "only", "save those", "tantamount to"). Dropping an operator
   is not simplification; it is a different claim. (See `char-compress`
   for the bone/flesh discipline this rule borrows.)
4. **One source of truth, generated views.** Keep the explanations in a
   structured data file (one entry per article/section, one field per
   lens) and render every view from it. Do not hand-maintain parallel
   copies that can drift.
5. **Mark what you invented.** A companion view is commentary. Label it
   as generated, attribute it (accreditation doctrine), and write `hmmm`
   where a mapping is a stretch rather than guessing a clean answer.

## The lens pattern

A *lens* is a vocabulary, not a new claim. The same article is re-said in
the working language of a domain the reader already inhabits, so the
structure transfers by analogy.

- Keep a `general` / plain lens as the default and floor. Every other
  lens is a sibling of it, not a replacement.
- Each lens entry is short (1–3 sentences), concrete, and structurally
  faithful to the source — same obligation, same exception, same actor.
- The lens menu is a flat, low-commitment selector (chips / buttons), not
  a deep navigation tree. Persist the reader's choice.
- A lens may not add an obligation or exception the source does not
  contain. If a domain genuinely has no clean mapping, say so plainly
  rather than inventing one.

## Progressive disclosure UX

Layer the page so the first screen is calm and the depth is opt-in.

- Surface: the lens menu + the plain/lens reading of each entry.
- One click down: the verbatim original article.
- One click down: the footnotes / caveats.
- One click down: the EDCM-style tension panel.

Collapse the deeper layers by default; build their contents lazily on
open. The goal is low cognitive load on arrival and full fidelity on
demand — never fidelity *or* approachability, always both, layered.

## Static fallback discipline

"Dynamic" must never mean "blank without scripts." A data-driven
companion page must keep a complete, readable static version of at least
the plain reading in the served HTML, plus a `noscript` note and a link
to the full source. The script reveals the interactive view only once its
data is in hand, and on any failure leaves the static fallback visible.
Treat the pre-existing static site as the floor the dynamic layer rests
on, not something it overwrites.

## EDCM-style two-speaker reading

When a text carries footnotes, caveats, or dissent, treat the body as one
speaker and the annotations as a second, and report the tension between
them. This is an **EDCM-style heuristic** (Energy–Dissonance Circuit
Model framing), illustrative only — it is not an EDCM metric runtime,
and you must not claim EDCM measurement status for it. Compute it transparently
(ship the math next to the output) over families such as:

- intensity / valence per speaker (caps, terminal punctuation, charged
  lexicon);
- constraint mismatch (vocabulary overlap between body and notes);
- drift (cosine distance between body and notes term vectors);
- dissonance (density of negation / tension markers in the notes);
- divergence (topic scatter across multiple notes);
- turn balance (length asymmetry between the two speakers).

Label the readings as a heuristic, declare what context each used, and
keep the panel behind progressive disclosure — it is for the curious, not
the first screen.

## Output shape

A good plain-lens deliverable is:

- a structured data file: one entry per source unit, with the verbatim
  source, its footnotes, a `general` reading, and one field per lens;
- a render layer that builds the lens menu, the cards, and the disclosure
  layers from that data;
- a complete static fallback in the served markup;
- an accreditation line and a visible link back to the full canon;
- a `hmmm` wherever a mapping is uncertain.

## Anti-patterns / things to refuse

- Do not let the companion view drift from or override the canon.
- Do not drop negations, quantifiers, conditions, or named obligations
  in the name of simplicity.
- Do not adopt a reassuring, hand-holding, or "explained for dummies"
  register; concreteness is the tool, not condescension.
- Do not present the EDCM-style reading as an EDCM measurement or
  claim unearned theorem/metric status.

## hmmm

- The EDCM-style reading here is an illustrative heuristic, not an
  EDCM runtime; precise cross-speaker metric formulas live in
  `edcm` (`docs/EDCM_MATHEMATICS.md`) / `a0`, not in this skill.
- "Without talking down" is a judgement call; this skill gives rules and
  registers, not a measurable condescension score.
