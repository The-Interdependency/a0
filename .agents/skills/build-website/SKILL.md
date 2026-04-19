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
