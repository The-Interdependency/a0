---
name: github-solution-finder
description: Find battle-tested open-source libraries on GitHub instead of building from scratch. Use GitHub's search operators for precise discovery, then evaluate candidates on activity, license, and fitness.
triggers: ["library for", "package for", "is there a library", "find a library", "any open source", "github project", "alternative to", "instead of writing", "before i build"]
---

# GitHub Solution Finder (a0 port)

Before writing custom code for a problem someone has surely solved already, search GitHub. This skill teaches a0 to use GitHub's search operators precisely and to evaluate candidates fairly.

## When to use

- The user is about to ask a0 to write something nontrivial (auth, parser, image pipeline, scheduler, etc.)
- The user explicitly asks "is there a library for…?" or "what's the best package for…?"
- a0 is about to recommend rolling its own solution to a generic problem

## When NOT to use

- Truly bespoke business logic
- One-off scripts where a dependency would be heavier than the code
- The user explicitly wants to learn by building it themselves

## Search operators (combine with spaces = AND)

| Operator | Example | Effect |
|---|---|---|
| `stars:>N` | `stars:>1000` | More than N stars |
| `language:X` | `language:python` | Primary language |
| `pushed:>DATE` | `pushed:>2025-06-01` | **Key freshness signal** — commits after date |
| `created:>DATE` | `created:>2024-01-01` | Repo created after date |
| `topic:X` | `topic:cli` | Tagged with topic |
| `license:mit` | `license:apache-2.0` | License filter |
| `archived:false` | — | Exclude abandoned |
| `is:public` | — | Public repos only |

Use the `web_search` tool with the query `site:github.com "<term>" stars:>500 pushed:>2025-01-01` for free-text discovery. Use the `github_api` tool for direct API queries when you need structured data.

## Evaluation rubric

Score each candidate (1-5 each):

- **Activity** — last commit within 6 months = 5; within 12 = 4; >24 = 1
- **Adoption** — stars + dependents + downloads (npm/PyPI/crates)
- **Health** — open-issue ratio, PRs merged, release cadence
- **License** — permissive (MIT/Apache-2/BSD) = 5; copyleft (GPL/AGPL) = 2-3 depending on use; unlicensed = 1
- **Fit** — does it solve the actual problem with minimal glue?

Drop anything that scores ≤2 on Activity OR Health unless it's a finished, intentionally inactive utility (e.g. a stable parser).

## Procedure

1. Restate the user's need in 1 sentence — what does the library need to do?
2. Build a search query using the operators above. Filter by language and recency aggressively.
3. Fetch top 5-10 results.
4. Score each on the rubric. Keep top 2-3.
5. For each finalist, report: name, stars, last-commit date, license, install command, 1-line API example, top 1 caveat.
6. Recommend ONE. State why it beat the runner-up.

## Output template

```
**Recommended: <name>** (★N · <license> · last commit <date>)

Install: `pip install …` / `npm i …`

Why: <1-2 sentences>

Quick example:
```code
…
```

Runner-up: <name> — <why it lost>

Caveats: <one line>
```

## Anti-patterns

- Recommending a library you didn't actually find (fabrication)
- Picking by stars alone — a 10k-star repo abandoned in 2022 is worse than a 500-star repo with weekly commits
- Ignoring the license, then surprising the user later
- Recommending 5 alternatives instead of picking one
