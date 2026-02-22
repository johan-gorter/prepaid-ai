# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

See [AGENTS.md](AGENTS.md) for detailed scripts, test conventions, and environment setup.

**Verify changes:** `npx vue-tsc -b` then `npm run build`. For full validation, also run tests.

### Common Commands

| Task | Command |
|------|---------|
| Build (typecheck + bundle) | `npm run build` |
| Typecheck only | `npx vue-tsc -b` |
| Typecheck tests only | `npm run typecheck:tests` |
| Dev server (emulators) | `npm run dev:emulators` |
| Dev server (production Firebase) | `npm run dev` |

### Running Tests

| Task | Command |
|------|---------|
| Run all tests | `npm run test` (E2E + CT + PWA, sequentially) |
| Run E2E tests | `npm run emulators` (terminal 1) then `npm run test:e2e` (terminal 2) |
| Run component tests | `npm run test:ct` (no emulators needed) |
| Run PWA tests | `npm run test:pwa` (builds production bundle automatically) |
| Run single E2E test | `npx playwright test --config=playwright.config.ts e2e/specs/home.spec.ts` |
| Run single CT test | `npx playwright test --config=playwright-ct.config.ts ct/new-renovation.ct.ts` |

### Prerequisites (one-time setup)

Before tests will pass, ensure these are done:

1. `npm install` — root project dependencies
2. `npx playwright install` — download Playwright browsers
3. `cd functions && npm install && npm run build` — compile Cloud Functions (required for E2E impression test)
4. Java must be installed for Firebase Emulators

## Architecture

**Prepaid AI** — Vue 3 PWA for AI-powered renovation visualizations. Users photograph a space, mask an area, and get AI-generated renovation impressions.

### Stack

Vue 3 (Composition API, `<script setup lang="ts">`) + Vite 7 + TypeScript (strict) + Firebase (Auth/Firestore/Storage/Cloud Functions) + Playwright (all testing) + vite-plugin-pwa.

### Key Patterns

- **No ESLint/Vitest** — TypeScript strict mode enforces quality; all testing is Playwright (E2E + CT + PWA).
- **`erasableSyntaxOnly: true`** — No TypeScript `enum`, `namespace`, or parameter decorators. Use string literal unions instead.
- **No path aliases** — All imports use relative paths.
- **Composables as singletons** — `useAuth` and `useRenovations` use module-level `ref`s, not Pinia stores (Pinia is installed but unused).
- **VueFire integration** — `VueFire` + `VueFireAuth()` plugins in [main.ts](src/main.ts). Router guard uses VueFire's `getCurrentUser()` (not the composable) for async-safe auth resolution.
- **Emulator wiring** — [firebase.ts](src/firebase.ts) conditionally connects to emulators when `VITE_USE_EMULATORS=true` and exposes `window.__testSignIn` for Playwright automation.

### Data Model (Firestore)

```
users/{uid}                                    # UserProfile
  renovations/{renovationId}                   # Renovation
    impressions/{impressionId}                 # Impression (status: pending|processing|completed|failed)
```

Security rules enforce user-scoped access: users can only read/write their own subtree.

### Cloud Functions (`functions/`)

A `processImpression` Firestore trigger ([functions/src/index.ts](functions/src/index.ts)) fires on impression creation. Currently uses a dummy jimp-based processor that overlays prompt text on the image and writes PromptLog metadata into PNG tEXt chunks. When `NANO_BANANA_API_KEY` is configured, it will call the real inpainting API (not yet implemented).

The functions directory has its own `package.json` and TypeScript config. After changes, rebuild with `cd functions && npm run build`. The emulator loads the compiled output from `functions/lib/index.js`.

### Test Architecture

Three separate Playwright configs — each is independent:

- **E2E** ([playwright.config.ts](playwright.config.ts)) — Full app tests against Firebase Emulators (Auth, Firestore, Storage, Functions). Uses `authenticatedPage` fixture from [e2e/fixtures.ts](e2e/fixtures.ts). Auto-starts Vite dev server. Runs on chromium + mobile-chrome.
- **CT** ([playwright-ct.config.ts](playwright-ct.config.ts)) — Component isolation tests, no emulators. Test harness in [playwright/](playwright/) installs a minimal router before mount.
- **PWA** ([playwright-pwa.config.ts](playwright-pwa.config.ts)) — Runs against a production build (`vite build --mode test && vite preview` on port 4173). Tests service worker, manifest, offline support.

E2E tests run in parallel (`fullyParallel: true`). The `authenticatedPage` fixture clears Firestore data **before** each test (not after) to avoid race conditions between parallel tests. The impression test (which exercises the full Cloud Function pipeline) is restricted to chromium only.
