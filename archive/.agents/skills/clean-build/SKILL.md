# Clean Build Skill

## Purpose

Documents how to make this codebase build portably in any environment — CI, Docker, Cloud Run — without errors caused by Replit-specific dev plugins.

---

## The Problem: Replit-only Vite Plugins in Production Builds

Several Replit packages are listed in `package.json` as dev-dependencies:

- `@replit/vite-plugin-runtime-error-modal`
- `@replit/vite-plugin-cartographer`
- `@replit/vite-plugin-dev-banner`

These packages may not be installed (or may fail to resolve) in environments outside Replit. If any of them are statically imported at the top of `vite.config.ts`, the build will fail immediately in CI or Docker — even if the plugin is never actually used.

---

## The Fix: Fully Dynamic, REPL_ID-Gated Imports

All Replit-specific Vite plugins must be imported **dynamically** and **conditionally**, gated on both `NODE_ENV !== "production"` and `process.env.REPL_ID !== undefined`.

### Pattern (applied in `vite.config.ts`)

```ts
// WRONG — static top-level import always resolves the package
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// CORRECT — dynamic import, only resolved when running inside Replit dev environment
...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
  ? [
      await import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
      await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer()),
      await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
    ]
  : []),
```

**Rules:**
1. No `@replit/*` package may appear as a static top-level `import` in `vite.config.ts`.
2. All Replit plugins must be wrapped in `await import(...)` inside the conditional spread.
3. The condition must check **both** `NODE_ENV !== "production"` and `REPL_ID !== undefined`.
4. Default exports must be accessed via `.default()`, named exports via `.exportName()`.

---

## Server Build: `packages: "external"` in esbuild

The server is compiled with esbuild in `script/build.ts`. The key setting that prevents Replit (and other) packages from being bundled into the server output is:

```ts
packages: "external",
```

This tells esbuild to leave all `node_modules` as external references rather than inlining them. Combined with a Docker image or Cloud Run environment that only installs production dependencies (`npm ci --omit=dev`), this ensures no dev-only packages are resolved at runtime.

Do **not** remove `packages: "external"` from the esbuild config.

---

## How to Verify a Clean Build Locally

Run the full build with `REPL_ID` fully unset (not set to an empty string) and `NODE_ENV=production`:

```bash
env -u REPL_ID NODE_ENV=production npx tsx script/build.ts
```

A clean build:
- Completes without errors
- Produces `dist/public/` (client) and `dist/index.cjs` (server)
- Contains no `@replit` references in the bundled client assets

To confirm no Replit code leaked into the client bundle:

```bash
grep -r "@replit" dist/public/assets/ | wc -l
# Should output: 0
```

---

## CI Check: Automated Regression Guard

A GitHub Actions workflow (`.github/workflows/clean-build-check.yml`) runs on every push and pull request to `main` and automatically enforces the clean-build constraint:

1. **Build step** — runs the full production build with `REPL_ID` fully unset:
   ```bash
   env -u REPL_ID NODE_ENV=production npx tsx script/build.ts
   ```

2. **Grep step** — scans `dist/public/assets/` for any `@replit` references and fails with an error annotation if any are found:
   ```bash
   grep -r "@replit" dist/public/assets/ | wc -l
   # Must be 0 — any match fails the workflow
   ```

This catches regressions automatically if a static `@replit` import is accidentally added back to `vite.config.ts` or any other file included in the client bundle.

---

## Checklist When Adding New Vite Plugins

When adding any Vite plugin that is only needed during Replit development:

- [ ] Use dynamic `await import(...)` — never a static top-level import
- [ ] Gate the import behind `process.env.REPL_ID !== undefined`
- [ ] Also gate behind `process.env.NODE_ENV !== "production"` if applicable
- [ ] Run `env -u REPL_ID NODE_ENV=production npx tsx script/build.ts` and confirm success
- [ ] Confirm zero `@replit` references in `dist/public/assets/`

---

## Relevant Files

| File | Role |
|------|------|
| `vite.config.ts` | Vite configuration — all Replit plugin imports live here |
| `script/build.ts` | Full build script (client via Vite + server via esbuild) |
| `package.json` | Dev dependencies for `@replit/*` packages |
| `.github/workflows/clean-build-check.yml` | CI workflow that enforces the clean-build constraint |
