# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](AGENTS.md) for the current command list, service-manager workflow, test conventions, and validation steps. See [docs/environments.md](docs/environments.md) for environment and deployment setup.

Use this file only for architecture notes that are not already maintained in [AGENTS.md](AGENTS.md).

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

The functions directory has its own `package.json` and TypeScript config. Emulator startup rebuilds the functions before launch, and Firebase deploy uses the configured predeploy hook. The emulator loads the compiled output from `functions/lib/index.js`.

### Test Architecture

Three separate Playwright configs — each is independent:

- **E2E** ([playwright.config.ts](playwright.config.ts)) — Full app tests against Firebase Emulators (Auth, Firestore, Storage, Functions). Uses `authenticatedPage` fixture from [e2e/fixtures.ts](e2e/fixtures.ts). Auto-starts Vite dev server. Runs on chromium + mobile-chrome.
- Local Vite defaults: `npm run dev` uses port 5173, `npm run dev:emulators` uses port 5174.
- **CT** ([playwright-ct.config.ts](playwright-ct.config.ts)) — Component isolation tests, no emulators. Test harness in [playwright/](playwright/) installs a minimal router before mount.
- **PWA** ([playwright-pwa.config.ts](playwright-pwa.config.ts)) — Runs against an emulator-mode build served by `vite preview` on port 4175. Tests the generated manifest, generated service worker, and offline app-shell behavior. Unlike E2E, it does not manage Firebase Emulator Suite lifecycle.

The service worker precaches the built app shell and runtime-caches Firebase Storage image requests for both production Storage URLs and local emulator Storage URLs. It does not cache Firestore/Auth/Functions traffic.

E2E tests run in parallel (`fullyParallel: true`). The `authenticatedPage` fixture creates a unique emulator user per authenticated test, so auth-dependent scenarios do not share Firestore or Auth state. The impression test (which exercises the full Cloud Function pipeline) is restricted to chromium only.
