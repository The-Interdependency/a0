---
name: infographic-builder
description: Design infographics that visualize data, processes, comparisons, and timelines as static one-pagers. Helps choose the right visual structure (sequence / list / compare / hierarchy) and emit either AntV-DSL syntax for downstream rendering or a self-contained React component.
triggers: ["infographic", "visual summary", "data graphic", "visual explainer", "information poster", "visualize this", "timeline graphic", "comparison chart", "process flow", "one-pager"]
---

# Infographic Builder (a0 port)

Turn data, information, or knowledge into a static visual one-pager. Infographics compress complex information using consistent symbols and structure so the reader gets the shape of the answer in seconds.

## When to use

- "Create an infographic," "make a visual summary," "turn this into a one-pager"
- Timeline, comparison, process flow, statistical summary — as a designed visual, not an interactive dashboard
- The user provides data or content and asks to "visualize" it in a static format

## When NOT to use

- Interactive dashboards or live-data charts → that's a different concern
- Single-chart requests (one bar chart) → just describe the chart directly
- Decorative imagery without information content → that's design, not infographic

## Procedure

### 1. Extract structure (always, first)

Before choosing visuals, extract:

- **Title and subtitle** — the one-sentence headline and supporting context
- **Sections / items** — logical groups (3-7 sections work best — fewer feels thin, more is unreadable)
- **Data points per item** — number, label, short description, optional icon
- **Source attribution** — where the data comes from
- **Style preferences** — color palette, theme, brand constraints

If the user supplied incomplete content, **ask for the missing pieces** (one focused question). Do not invent data or fill with placeholder text.

**Language rule:** the output language must match the user's input language.

### 2. Pick the structure

Match the content to one of these archetypes:

| Content shape | Pick |
|---|---|
| Process / steps / development trend | Sequence (vertical or horizontal) |
| Time-anchored events | Timeline |
| Roadmap with phases | Sequence-roadmap |
| Funnel / conversion stages | Funnel |
| Pyramid / hierarchy of importance | Pyramid |
| Bullet-list of key points | List-grid or list-row |
| Pros vs cons | Compare-binary |
| SWOT | Compare-SWOT |
| Quadrant (2×2 matrix) | Compare-quadrant |
| Tree / org chart | Hierarchy-tree |
| Concept map | Hierarchy-mindmap |

### 3. Pick the rendering target

Two routes:

**A. AntV S2 / G6 DSL** (preferred when the rendering pipeline supports it). Emit a DSL template (sequence-vertical-1, list-grid-3, etc.) populated with the user's data. Lightweight; renders to SVG.

**B. Self-contained React component** (fallback). When DSL isn't available, emit a single `.tsx` file using only Tailwind classes — no charting deps. Use semantic HTML (`<ol>` for sequences, `<dl>` for label-value, `<table>` for comparisons). Make it print at 1080×1920 (mobile story) or 1080×1080 (square) by default.

### 4. Visual rules

- **Color palette**: 1 accent + 2 neutrals. Avoid rainbow palettes for non-categorical data.
- **Typography**: ≤2 typefaces, ≤4 sizes. Title ≥ 2× body size.
- **Hierarchy**: title > section headers > body > caption. Whitespace ≥ 24px between sections.
- **Icons**: one icon set throughout (lucide-react, Heroicons, Material). No mixing.
- **Numbers**: align right or use tabular-nums. Always include units.
- **Source line**: small, bottom-aligned, present whenever data has a source.

### 5. Output

Return the artifact (DSL block or `.tsx` file) plus a 2-line "what this shows" caption the user can paste alongside the image.

## Anti-patterns

- 12+ sections crammed onto one canvas
- Pie charts for >5 slices
- 3D effects on bar charts
- Random color choices with no semantic mapping
- Decorative icons that don't reinforce the data
- Putting the source line in 6pt grey on light grey background
