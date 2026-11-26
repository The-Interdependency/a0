# Evidence basis for information design

This reference records the evidence boundary behind the local information-design extension to `data-visualization/SKILL.md`. It is deliberately narrower than popular "color psychology": the operational doctrine relies most strongly on perception, visual search, multimedia signaling, accessibility, and replicated/meta-analytic findings.

## High-confidence operational findings

### Signaling and multimedia learning

Visual signaling — including color coding, arrows, outlines, labels, typographic emphasis, and other correspondence cues — generally improves learning when it clarifies organization or text-picture relations. Meta-analytic effects are positive but moderate; signaling cannot rescue incoherent content.

- Schneider, Beege, Nebel & Rey, *A meta-analysis of how signaling affects learning with media*, Educational Research Review 23 (2018): https://www.sciencedirect.com/science/article/abs/pii/S1747938X17300581
- Richter, Scheiter & Eitel, signaling text-picture relations dataset / meta-analysis materials: https://psycharchives.org/handle/20.500.12034/2019
- Cambridge Handbook of Multimedia Learning, signaling/cueing principle: https://www.cambridge.org/core/books/cambridge-handbook-of-multimedia-learning/signaling-or-cueing-principle-in-multimedia-learning/3972D4ACC628D5B53F7B2B4785DB2B06

Operational consequence: use color as one cue in a broader signaling system; prefer stable semantic mappings and direct correspondence over decorative saturation.

### Attention and visual search

Color is a basic visual feature that can support efficient target selection. A salient but irrelevant singleton can also capture attention. Salience depends on contrast with the surround, competing features, task goals, and expectations.

- Treisman & Gelade, *A Feature-Integration Theory of Attention*: https://www.cse.psu.edu/~rtc12/CSE597E/papers/treismanFeatIntegration.pdf
- Wolfe review of visual search: https://search.bwh.harvard.edu/new/pubs/the_review.pdf
- Adam et al., additional-singleton visual-search replication/open dataset: https://pmc.ncbi.nlm.nih.gov/articles/PMC8323537/

Operational consequence: budget salience. A bright accent means less if every element is bright, and decorative accents can compete with evidence-bearing signals.

### Color perception and luminance

Human color perception emerges from cone signals, opponent mechanisms, and interacting visual pathways. Fine chromatic differences and isoluminant boundaries can be weaker than boundaries reinforced by luminance, thickness, form, or motion.

- Gegenfurtner & Kiper, *Color Vision*: https://pubmed.ncbi.nlm.nih.gov/12574494/
- Masri et al., parvocellular/magnocellular pathway review: https://pmc.ncbi.nlm.nih.gov/articles/PMC7574660/

Operational consequence: do not make hue the only carrier of a critical boundary. Use luminance contrast, adequate line weight, shape, and labels.

### Accessibility and non-color redundancy

WCAG requires sufficient text and non-text contrast and requires a non-color means of conveying information when color carries meaning.

- W3C, Use of Color: https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
- W3C, Non-text Contrast: https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html
- W3C WCAG quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- Okabe & Ito Color Universal Design guidance: https://jfly.uni-koeln.de/color/

Operational consequence: normal text target 4.5:1; large text and essential graphical objects 3:1; state distinctions require label/shape/pattern/line-style redundancy.

## Useful but context-dependent findings

### Color and memory

Color can support recognition and memory when it contributes meaningful object or category information, organizes material, or supplies a stable retrieval cue. Arbitrary or excessive color can increase distraction and search cost.

- Review of color and memory: https://pmc.ncbi.nlm.nih.gov/articles/PMC3743993/
- Memory effects on color perception, *Handbook of Color Psychology*: https://www.cambridge.org/core/books/handbook-of-color-psychology/memory-effects-on-color-perception/8B6D32011AD699E4BBCD2299CDE46F3B

Operational consequence: color-code stable relations and categories, not every sentence or node.

### Color-emotion associations

There are broad cross-cultural regularities, but associations vary with language, geography, culture, context, brightness, saturation, and task.

- Jonauskaite et al., 30-country color-emotion study: https://pubmed.ncbi.nlm.nih.gov/32900287/

Operational consequence: treat cultural color meanings as priors to test, not universal laws.

### Red and cognitive performance

Popular claims that red reliably impairs cognition are not supported as a general rule. A meta-analysis of 67 effects found negligible estimates for several task classes and weak/unstable evidence elsewhere after publication-bias adjustment.

- Gnambs, *Limited evidence for the effect of red color on cognitive performance: A meta-analysis*: https://pubmed.ncbi.nlm.nih.gov/32696125/

Operational consequence: use vermillion/red because it communicates a declared diagnostic or warning role in context, not because it is assumed to manipulate reasoning.

### Color and decision framing

Color can change risk perception or choice salience in some contexts, including online risk tasks and risk matrices.

- Gnambs et al., red and risk-taking: https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0134033
- Proto et al., colored cells in risk matrices: https://onlinelibrary.wiley.com/doi/full/10.1111/risa.14091

Operational consequence: never let a color band replace the underlying number, threshold definition, or uncertainty.

## Claims this extension rejects

The evidence above does **not** establish universal rules such as:

- red makes people worse at reasoning;
- blue makes people more creative;
- green makes people learn better;
- one palette is optimal for every culture, task, display, or viewer;
- a colorblind-safe categorical palette automatically satisfies text-contrast requirements;
- passing a contrast calculation proves comprehension or accessibility of the whole artifact.

## Research provenance

This evidence list was assembled from the deep-research report **"Color as a Cognitive and Information-Design Instrument"**, completed 2026-08-07. The report synthesized peer-reviewed cognitive psychology, neuroscience, multimedia-learning meta-analyses, information-design evidence, and W3C accessibility guidance. This reference extracts only the claims needed for the operational extension; it does not reproduce the report as project canon or theorem evidence.

hmmm

- Future updates should prioritize systematic reviews, meta-analyses, replications, and standards over single-study novelty.
- Image-level CVD simulation needs a separate rendering tool; the stdlib audit only verifies color-independent redundancy and declared contrast.
