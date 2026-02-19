# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

See [AGENTS.md](AGENTS.md) for detailed scripts, test conventions, and environment setup. Key commands:

| Task | Command |
|------|---------|
| Build (typecheck + bundle) | `npm run build` |
| Dev server (emulators) | `npm run dev:emulators` |
| Dev server (production Firebase) | `npm run dev` |
| Typecheck only | `npx vue-tsc -b` |
| Typecheck tests only | `npm run typecheck:tests` |
| Run all tests | `npm run test` (E2E + CT) |
| Run E2E tests | `npm run emulators` (terminal 1) then `npm run test:e2e` (terminal 2) |
| Run component tests | `npm run test:ct` |
| Run single E2E test | `npx playwright test --config=playwright.config.ts e2e/specs/home.spec.ts` |
| Run single CT test | `npx playwright test --config=playwright-ct.config.ts ct/new-renovation.ct.ts` |
| Start emulators | `npm run emulators` (requires Java) |

**Verify changes:** `npx vue-tsc -b` then `npm run build`. For full validation, also run tests.

## Architecture

**RenovisionAI** — Vue 3 PWA for AI-powered renovation visualizations. Users photograph a space, mask an area, and get AI-generated renovation impressions.

### Stack

Vue 3 (Composition API, `<script setup lang="ts">`) + Vite 7 + TypeScript (strict) + Firebase (Auth/Firestore/Storage) + Playwright (all testing) + vite-plugin-pwa.

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

### Test Architecture

Three separate Playwright configs — each is independent:

- **E2E** ([playwright.config.ts](playwright.config.ts)) — Full app tests against Firebase Emulators. Uses `authenticatedPage` fixture from [e2e/fixtures.ts](e2e/fixtures.ts). Auto-starts Vite dev server.
- **CT** ([playwright-ct.config.ts](playwright-ct.config.ts)) — Component isolation tests, no emulators. Test harness in [playwright/](playwright/) installs a minimal router before mount.
- **PWA** ([playwright-pwa.config.ts](playwright-pwa.config.ts)) — Runs against a production build (`vite build --mode test && vite preview` on port 4173). Tests service worker, manifest, offline support.

### Planned (Not Yet Implemented)

The core AI feature (NewRenovationPage) is a stub. The planned pipeline: Firebase Cloud Functions trigger on impression creation → Cloud Run service calls Nano Banana inpainting API → results stored in Firebase Storage. `NANO_BANANA_API_KEY` is server-side only.
