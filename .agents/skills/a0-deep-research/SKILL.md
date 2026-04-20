---
name: deep-research
description: Conduct thorough, multi-source research with structured reports, source triangulation, and credibility scoring. Use for multi-angle analysis, market/industry surveys, due diligence, technology evaluation, and any request that demands more than a 1-2 search lookup.
triggers: ["research", "deep dive", "investigate", "white paper", "due diligence", "literature review", "state of the art", "competitive landscape", "market analysis", "fact-check", "what does the research say"]
---

# Deep Research (a0 port)

Conduct comprehensive, multi-source research and synthesize it into a structured report with citations and source credibility ratings.

## When to use

- "Research this," "do a deep dive," "investigate," "white paper on..."
- Industry/market analysis, competitive landscape, due diligence on private companies
- Decision support: pros/cons, risks, strategy benchmarking
- Verification: fact-check, conflicting-claim resolution, multi-angle review
- Literature review, state-of-the-art technology survey

## When NOT to use

- Simple factual lookups (1-2 searches) → call `web_search` directly
- Searching the user's data the agent already holds → query that directly
- Stock tickers / public-company financials → that's a separate concern; research can support it but is not the primary tool

## Depth tiers

| Tier | Sub-agents | Min sources | When |
|---|---|---|---|
| Quick | 2 | 6 | Focused single-domain question |
| Standard | 4 | 12 | Most requests |
| Deep | 5 + 1 gap-fill pass | 20 | Critical decisions, comprehensive reviews |

Default to **Standard** when the user does not specify.

## Procedure

### 1. Scope (always, before any search)

Write down, in your own scratch, the answer to:

- What is the user actually trying to decide or learn?
- What's the audience and tone? (technical / executive / lay)
- What's the time horizon? (current state / 1-2y trend / historical)
- What are the 3-7 sub-questions the report must answer?

If you can't write these in one paragraph, ask the user one clarifying question. One, not three.

### 2. Plan parallel sub-agents

For Standard or Deep, use `sub_agent_spawn` to fan out the sub-questions. Each sub-agent gets:

- A single sub-question
- An explicit source-count target (e.g. "find 4-6 distinct sources")
- A constraint to return cited findings in the format below, not prose

### 3. Search and triangulate

Each finding must come from at least 2 independent sources where possible. Independent = different organizations, not different URLs from the same publisher.

Rate each source on three axes (1-5):

- **Authority** — primary source / peer-reviewed / official > journalism > blog > forum
- **Recency** — within the relevant time horizon
- **Bias risk** — funding, ownership, ideological framing

Drop or flag findings whose only source rates ≤2 on Authority.

### 4. Synthesize

After sub-agents return (`sub_agent_merge`), produce the report:

```
# Title

## TL;DR
3-5 bullets. The actual answer to the user's question.

## Key findings
For each sub-question:
- Finding (1-2 sentences)
- Evidence: [source 1], [source 2]
- Confidence: high / medium / low (with one-line reason)

## Conflicts and uncertainties
List anything where sources disagree, with both sides cited.

## Sources
Numbered list. Each: title, publisher, date, URL, authority/recency/bias scores.
```

### 5. Stop conditions

Stop when any of these is true:
- All sub-questions have ≥2 independent sources
- The marginal next source adds no new information
- The user's deadline / token budget is reached

Do NOT keep researching to feel thorough. Diminishing-returns research wastes the user's tokens.

## Anti-patterns

- Citing the same publisher multiple times and calling it "triangulated"
- Reporting "no information found" without naming what you searched
- Padding the report with section headers that have no findings under them
- Burying the actual answer below 800 words of context
