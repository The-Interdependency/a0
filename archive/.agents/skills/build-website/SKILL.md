---
name: build-website
description: Build a website that works for the people who actually use it. Use whenever the task is to author or modify a public-facing web page, landing page, app UI, or any HTML/CSS/JS interface a user will interact with.
---

# Build an Effective Website

Most "websites built by AI" fail because they optimize for impressing the person who commissioned them, not for the person who has to use them. Invert that.

## Decision hierarchy

Decisions made earlier in this list constrain decisions made later. Don't pick a font before you know what the page is for.

1. **Purpose**: what does the user need to do here? One sentence. If you can't write it, you don't know.
2. **Information architecture**: what does the user need to see, in what order, to do that? Group, rank, cut.
3. **Content**: real words for real things. Lorem ipsum hides bad design. Write the actual copy first.
4. **Layout**: how does the eye move? Where does it land first?
5. **Visual style**: color, type, spacing, imagery. Serves the layout. Never leads it.
6. **Interaction polish**: hover, focus, transitions, micro-animations. Last 5% of the work, gets 90% of the praise, deserves neither.

## Non-negotiables

- **Mobile first.** More than half of all web traffic is phone. The Galaxy A16 in your hand is the test device. If it doesn't work at 360px wide, it doesn't work.
- **Semantic HTML.** `<button>`, `<nav>`, `<main>`, `<article>`, `<form>`. Not divs all the way down.
- **Color contrast** at WCAG AA (4.5:1 body, 3:1 large text) minimum. Light grey on white is malpractice.
- **Keyboard navigable.** Every interactive element reachable via Tab, operable via Enter/Space.
- **All four states** for any data view: loading, error, empty, populated. Skipping any one is a bug.
- **Visible focus indicator.** Don't disable the outline without replacing it with something equally visible.

## Performance floor

- First content visible under 2 seconds on mid-tier mobile and a 4G connection. If it's slower, find what's blocking and remove it.
- No layout shift after first paint. Reserve space for images, embeds, ads.
- Inline the critical-path CSS for the above-the-fold content. Defer the rest.

## What to skip

- Auto-playing video with sound. Every time. No exceptions.
- Animations that interfere with reading (typewriter effects on body copy, parallax that hijacks scroll).
- Cookie banners larger than the content beneath them.
- Modal popups before the user has done anything.
- Hero sections taller than the viewport unless the page is literally one line long.

## How to know it's done

Hand it to someone who has never seen it. Ask them to do the one thing the page is for. If they do it without help, you're done. If they ask "what is this for?", you're not.

## Diagnosing display issues

When a page "doesn't display right," do not start tweaking styles. Identify the category first.

### 1. Look at the page before touching it

- Take a screenshot at the actual breakpoint that's broken (mobile = 360px wide, not desktop).
- Check the browser console for errors and warnings. A blank or partial page is almost always a JS error, a 401/404 on a critical fetch, or a render exception in a child swallowed by an error boundary.
- Compare the DOM in devtools to the source. If a component is in the source but missing in the DOM, something short-circuited the render. If it's in the DOM but invisible, it's a layout/visibility/scroll problem.

### 2. Categorize the symptom

- **Content cut off at the top or sides** → scroll position issue, not a styling issue. Look for `scrollIntoView`, `scrollTo`, `focus({preventScroll: false})`, or anchor links firing on mount. Auto-scroll inside a child often scrolls the page-level scroll container too.
- **Content cut off at the bottom on mobile only** → `100vh` instead of `100dvh`, or a fixed bottom bar overlapping content without bottom padding/safe-area inset.
- **Whole page is just whitespace** → render exception, error boundary swallowed it, or auth redirect loop. Check console + network tab.
- **Content centered but framing/header missing** → the page is rendering, but you're scrolled past the header. Check #1.
- **Layout shifts after load** → image/embed without reserved dimensions, or a font swap, or a late-arriving query result reflowing the layout.
- **Looks fine on desktop, broken on phone** → fixed widths, `min-w-*` larger than 360, horizontal overflow from a single wide child (often a `<pre>`, table, or long URL).
- **Looks fine logged in, broken logged out** (or vice versa) → conditional render branch you didn't test. Re-screenshot in both states.

### 3. Common React-specific traps

- `useEffect` with `scrollIntoView` runs on mount even with empty data. Gate it on a meaningful condition (`if (items.length === 0) return`).
- `min-h-screen` inside a parent with `h-dvh overflow-hidden` makes the child taller than its container, forcing inner scroll. The page then auto-scrolls the moment any focus or scrollIntoView fires.
- Conditional rendering of a sibling with `useEffect` side-effects can scroll/focus the page before the user sees it.
- A late-mounting `<Toaster />`, `<Tooltip>`, or portal can shift focus and trigger scroll.

### 4. Fix the cause, not the symptom

- If the page scrolls on load: don't add `scroll-mt-*` to the title. Find what's scrolling and stop it.
- If a layout overflows: don't add `overflow-hidden` to hide it. Find the wide child and constrain it.
- If a section is invisible: don't bump z-index or opacity. Find what's covering or hiding it.

Symptom-fixes accumulate. Cause-fixes don't.
