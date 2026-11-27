---
name: app-build
description: Load this when building, extending, or repairing an interactive app or web surface — a desk, form, dashboard, page, or sign-in path. Load msdmd and generate the docs from the metadata at the code. Data that must survive a wipe does not live in the preview in-memory store. Do not load to author or revise a skill; use skill-build. Do not load for interdependentway.org file edits; use website-builder-journal. Do not load for a static document or a skill-only module declaration.
---

# app-build — durable store, then msdmd, then the surface

`msdmd` is the skill that turns metadata at the code into the document. This skill does not redefine that path.

The preview in-memory store is not the desk. A wipe erases it. Renovate this skill before an app rebuild begins.

## Trigger

Load when the user asks to build, extend, or repair an interactive app or web surface.

## Non-trigger

- Authoring or revising a skill. Use `skill-build`.
- Editing `The-Interdependency/The-Interdependency.github.io`. Use `website-builder-journal`.
- A static document, deck, or spreadsheet.
- A module declaration with no user-facing surface.

## Workflow

1. Freeze the purpose as a description. Do not turn it into an org chart, curriculum, or legal object.
2. Name the durable store before writing a table or a screen.
   - Data that must follow the user, be shared, or survive a wipe lives in a durable external store.
   - The preview in-memory store is a cache. A restart wipes it. It is not the source of truth.
   - If the only store is the wipeable cache, the rebuild has not begun.
3. Load `msdmd/SKILL.md`.
4. Declare the persistence boundary at the owning source: which store is durable, which store is the wipeable cache, and what a wipe does.
5. Generate the doc with msdmd. Do not write a parallel document by hand.
   ```bash
   python -m msdmd.collect --root . --repo <repo> --out <repo>_msdmd.ts
   python -m msdmd.visualize <repo>_msdmd.ts --out <repo>_msdmd.mmd
   ```
   The `.ts` and `.mmd` are generated. If either is wrong, change the metadata and regenerate.
6. A signed-out gate must contain a real sign-in control. An optional identity check gates a hold, not entry, unless the user requires entry to be gated.
7. Verify in a browser at desktop and mobile. Then verify that a wipe does not erase the durable store.

## Validation

- The durable store is named, and it is not the preview in-memory store.
- A wipe of the preview cache does not erase the desk.
- The published doc was produced by msdmd from metadata at the code.
- Signed-out has a working sign-in control, or auth is off and the surface is usable.

## Anti-patterns

- Treating the preview in-memory store as the desk.
- Starting the rebuild before this skill states the durable-store rule.
- A handwritten README that restates the code.
- A local extractor that invents a second metadata schema.
- Blocks with no working control.

## hmmm

- Host-specific auth providers and database drivers stay in the host skill.
- If `msdmd` is not installed, propagate it from `The-Interdependency/skill-lib` into `.agents/skills/msdmd/` before generating. Do not substitute another collector.
- Which durable store a given host can reach is host-local. Name it. Do not invent one.
