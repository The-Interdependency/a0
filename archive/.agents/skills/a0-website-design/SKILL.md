---
name: website-design
description: Design and build high-quality websites, landing pages, and web UIs. Covers layout, typography, color, component patterns, and responsive design. Use when asked to build, redesign, or improve any web interface.
triggers: ["build a website", "landing page", "web design", "redesign", "website", "UI design", "web UI", "homepage", "hero section", "make it look good", "improve the design", "style this", "make this beautiful", "web page", "site design", "front end design", "layout", "responsive design"]
---

# Website Design (a0 skill)

Design and implement web interfaces with high visual quality: clear hierarchy, tight typography, purposeful color, and layout that works at every screen size.

## When to use

- "Build me a website / landing page / homepage"
- "Redesign this page" or "make this look better"
- Any request to create or improve a web UI (marketing, app shell, dashboard, docs)
- Hero sections, feature grids, pricing tables, contact forms, footers
- Responsive polish, dark mode, accessibility improvements

## When NOT to use

- Pure data/logic work with no UI surface — skip straight to implementation
- The user has already approved a mockup and just wants it coded → go straight to code, no re-design
- Backend-only changes — call the relevant tool directly

## Core design principles

### 1. Visual hierarchy
Every screen has one primary action and one primary message. Everything else supports them. If everything is bold nothing is bold.

### 2. Typography first
Pick one typeface family (or two max: one for headings, one for body). Set a modular scale — do not mix arbitrary sizes. Default scale: 12 / 14 / 16 / 20 / 24 / 32 / 48 / 64px. Line-height: 1.4–1.6 for body, 1.1–1.2 for headings.

### 3. Spacing rhythm
Use a base unit (4px or 8px) and stay on multiples. Padding inside components: 16–24px. Between components: 32–64px. Between sections: 80–120px. Consistent rhythm reads as "designed"; inconsistent rhythm reads as "assembled."

### 4. Color
- One brand color for primary actions. One neutral palette for backgrounds and text.
- Dark backgrounds: text contrast ≥ 4.5:1 (WCAG AA). Use `text-muted-foreground` for secondary copy.
- Accent sparingly — it loses power when overused.
- Avoid pure black (#000) backgrounds; use a near-black with slight hue (e.g. #09090b, #0A0A0F).

### 5. Whitespace
Err on the side of more. Cramped layouts feel cheap. Generous whitespace signals confidence.

### 6. Motion
Subtle only. Transitions: 150–250ms ease-out. Never animate layout properties (width, height, top/left) — use transform and opacity. Respect `prefers-reduced-motion`.

---

## Layout patterns

### Hero
```
[nav]
[headline — largest text on page]
[subheadline — one sentence, supporting]
[CTA button + optional secondary link]
[hero image / illustration / video — below or beside]
```
Headline should answer: "What is this and why should I care?" in under 8 words.

### Feature grid
3-column on desktop, 1-column on mobile. Each card: icon → title → 1–2 line description. No walls of text.

### Pricing / donation
Single prominent option first. Reduce cognitive load — one decision at a time.

### Footer
Logo + tagline | Nav links | Legal. Keep it minimal. Not a sitemap.

---

## Component checklist

For every interactive element:
- [ ] Default state
- [ ] Hover state (cursor change + subtle elevation or color shift)
- [ ] Active / pressed state
- [ ] Disabled state (if applicable)
- [ ] Focus ring (keyboard nav — never remove outline without a replacement)
- [ ] Loading state (if async action)

---

## Responsive breakpoints (Tailwind)

| Prefix | min-width | Usage |
|--------|-----------|-------|
| (none) | 0px       | Mobile-first base styles |
| `sm:`  | 640px     | Large phones / small tablets |
| `md:`  | 768px     | Tablets |
| `lg:`  | 1024px    | Desktop |
| `xl:`  | 1280px    | Wide desktop |

Mobile-first always. Build the small layout first, then expand.

---

## Procedure

### 1. Scope (always first)
Answer before writing any code:
- What is the page for? Who is the primary user?
- What is the ONE thing the user should do or understand?
- What content exists? What needs to be created?
- Any existing design system / colors / fonts to match?

### 2. Structure
Sketch the section order in plain text before writing HTML/JSX:
```
nav → hero → [feature/proof] → [social proof / stats] → CTA → footer
```
Cut any section that does not serve the primary goal.

### 3. Implement
- Start with semantic HTML structure
- Apply spacing and typography classes
- Add color and visual treatment last
- Wire interactions (hover, focus, loading) before considering done

### 4. Review against quality bar
- Does it work at 375px (iPhone SE)?
- Does it work at 1440px?
- Is there a clear primary CTA above the fold?
- Does text have sufficient contrast?
- Are all interactive elements keyboard-accessible?
- Does it load fast? (No unoptimized images, no render-blocking resources)

---

## Common mistakes to avoid

- **Too many fonts / sizes**: pick a scale and stick to it
- **Low contrast text**: muted-foreground on dark card still needs ≥ 4.5:1
- **No hover state on buttons**: every clickable element needs feedback
- **Fixed pixel widths on containers**: use `max-w-*` + `w-full`, never `width: 800px`
- **Missing `alt` text**: every `<img>` needs a description or `alt=""`
- **Animating layout**: use `transform` not `left`/`top`/`width`
- **Forgetting dark mode**: if the app has dark mode, every new component must handle it explicitly

---

## Tailwind quick-reference (this codebase)

```tsx
// Section wrapper
<section className="py-20 px-4 max-w-5xl mx-auto">

// Hero headline
<h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground">

// Subheadline
<p className="text-lg text-muted-foreground max-w-xl mx-auto mt-4">

// Primary CTA
<Button size="lg" className="mt-8">

// Feature card
<div className="rounded-xl border border-border bg-card p-6 hover:bg-accent/5 transition-colors">

// Grid
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">

// Muted section background
<div className="bg-muted/30 rounded-2xl p-8">
```

Color tokens in use: `text-foreground`, `text-muted-foreground`, `bg-background`, `bg-card`, `bg-muted`, `border-border`, `text-primary`, `bg-primary`.
