# AGENTS.md — AI Agent Instructions

This file contains instructions for AI coding agents working on the Prepaid AI codebase.

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite 7
- **Auth:** Firebase Authentication (Google/Microsoft/Apple)
- **Database:** Cloud Firestore
- **Storage:** Firebase Storage (GCS-backed)
- **Cloud Functions:** Firebase Cloud Functions (Firestore triggers)
- **Testing:** Playwright (E2E + Component Tests + PWA)
- **Local Backend:** Firebase Emulator Suite (Auth, Firestore, Storage, Functions)
- **PWA:** vite-plugin-pwa

## Project Structure

```
src/                    # Vue application source
  composables/          # Vue composables (useAuth, useRenovations)
  router/               # Vue Router config with auth guards
  views/                # Page components (HomePage, LoginPage, NewRenovationPage)
  firebase.ts           # Firebase SDK init + emulator wiring
  types.ts              # TypeScript interfaces
e2e/                    # Playwright E2E tests
  specs/                # Test files (*.spec.ts)
  pwa/                  # PWA-specific test files
  helpers/              # Auth emulator helpers + centralized emulator config
  fixtures.ts           # Custom test fixtures (authenticatedPage)
  global-setup.ts       # Creates test user in emulator before all tests
  global-teardown.ts    # Cleans up emulator data after all tests
ct/                     # Playwright Component Tests (*.ct.ts)
functions/              # Firebase Cloud Functions
  src/index.ts          # processImpression Firestore trigger
  lib/                  # Compiled output (git-ignored, must build before E2E)
scripts/                # Developer utility scripts
  emulator-config.mjs   # Centralized emulator ports, project ID, URLs
  wait-for-emulators.mjs # Waits for emulators to become ready
  setup.mjs             # One-time project setup
  test-e2e-standalone.mjs # Self-contained E2E test runner (starts emulators)
  emulator-seed.mjs     # Seeds dev user into Auth Emulator
  emulator-clear.mjs    # Clears emulator data
```

## Available Scripts

### Setup

| Command         | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `npm run setup` | One-time setup: installs deps, Playwright browsers, and builds functions |

### Build & Development

| Command                              | Description                                                                |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `npm run build`                      | Type-check with `vue-tsc` then build for production with Vite              |
| `npm run build:preview`              | Build then preview the production bundle locally                           |
| `npm run services:start -- <name>`   | Start one or more tracked background services or service groups            |
| `npm run services:stop -- [name]`    | Stop one tracked service, one group, or all tracked services if omitted    |
| `npm run services:restart -- [name]` | Restart one tracked service, one group, or all tracked services if omitted |
| `npm run services:status`            | Show tracked service status, ports, error counts, and last useful log line |

Tracked service names:

- `dev` — Vite on port 5173
- `dev:emulators` — Vite emulator mode on port 5174
- `preview:emulators` — built emulator-mode preview server on port 4175 for PWA testing
- `emulators` — Firebase Emulator Suite

Tracked groups:

- `dev-with-emulators` — both Vite dev servers
- `pwa-with-emulators` — Firebase emulators plus the PWA preview server
- `all` — emulators plus both Vite dev servers and the PWA preview server

### Testing

| Command                       | Description                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run emulators:wait`      | Wait for emulators to become ready (used by CI and standalone test runner)                                                                 |
| `npm run test:e2e`            | Run Playwright E2E tests (requires emulators running separately)                                                                           |
| `npm run test:e2e:standalone` | Run E2E tests with auto-managed emulators (single command, no extra terminal)                                                              |
| `npm run test:ct`             | Run Playwright Component Tests (no emulators needed)                                                                                       |
| `npm run test:pwa`            | Run PWA tests against a built emulator-mode bundle with `vite preview`; validates manifest, service worker, and offline app-shell behavior |
| `npm run test`                | Run E2E, Component, and PWA tests sequentially                                                                                             |
| `npm run test:e2e:ui`         | Open Playwright UI mode for E2E tests (interactive debugging)                                                                              |
| `npm run test:e2e:headed`     | Run E2E tests in a visible browser window                                                                                                  |

### Type-checking

| Command                   | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `npx vue-tsc -b`          | Type-check app code only                       |
| `npm run typecheck:tests` | Type-check test code only                      |
| `npm run typecheck:all`   | Type-check app + tests + build Cloud Functions |

## How to Run Tests

### E2E Tests (require Firebase Emulators)

E2E tests use real Firebase Emulators for Auth, Firestore, Storage, and Functions.

**One-time setup:** Run `npm run setup` (or manually install deps, browsers, and build functions).

Start the tracked services first, then run the test command you need.

**Recommended tracked-service workflow:**

```bash
# Start the emulator suite plus the emulator-mode Vite app separately
npm run services:start -- emulators
npm run services:start -- dev:emulators

# Then run Playwright in another terminal
npm run test:e2e
```

The Playwright config (`playwright.config.ts`) automatically:

- Runs global setup which waits for emulators, clears data, and creates a test user
- Provides an `authenticatedPage` fixture for tests needing a signed-in user
- Clears Firestore data before each test (in fixture setup) for parallel-safe isolation

Playwright no longer starts or stops long-running services. Start `emulators` and `dev:emulators` through the service manager before the test run and leave them running until you stop them explicitly.

**No `.env` file is needed for tests** — the Playwright config injects fake Firebase config values directly. The emulators accept any project configuration.

**Important:** If you change Cloud Function code in `functions/src/`, rebuild with `cd functions && npm run build` and restart the emulators.

### Component Tests (no emulators needed)

Component tests mount individual Vue components in isolation. They do not need Firebase Emulators.

```bash
npm run test:ct
```

### PWA Tests

PWA tests validate the built app shell, manifest, and service worker behavior.

```bash
npm run test:pwa
```

How it works:

- `npm run test:pwa` runs `playwright test --config=playwright-pwa.config.ts`
- Start `npm run services:start -- preview:emulators` before running the suite; it builds the app with `vite build --mode emulator` into `dist-emulator/` and starts the tracked preview server on `http://localhost:4175`
- Playwright injects emulator-mode Firebase env vars (`VITE_USE_EMULATORS=true` and fake Firebase web config)
- The suite verifies the real generated manifest and generated service worker, plus offline navigation/app-shell behavior

Important distinctions:

- PWA tests use emulator mode, but they do **not** start, seed, clear, or wait for the Firebase Emulator Suite
- If `preview:emulators` is already running via `npm run services:start -- preview:emulators` or `npm run services:start -- pwa-with-emulators`, Playwright reuses that same preview server instead of starting another one
- E2E tests are the target that manages live emulator dependencies through global setup/teardown
- PWA tests therefore validate PWA behavior of the built frontend, not end-to-end Firebase flows

### Running a single test file

```bash
# E2E
npx playwright test --config=playwright.config.ts e2e/specs/home.spec.ts

# Component
npx playwright test --config=playwright-ct.config.ts ct/new-renovation.ct.ts
```

## How to Verify Changes

After making code changes, run these commands in order:

1. **Type-check:** `npm run typecheck:all` — checks app, tests, and Cloud Functions
2. **Build:** `npm run build` — runs type-check + Vite production build, must complete without errors
3. **Component tests:** `npm run test:ct` — no emulators needed
4. **E2E tests:** `npm run test:e2e:standalone` — runs with auto-managed emulators

For a quick validation without emulators, steps 1-2 are sufficient.

## TypeScript Configuration

- **`tsconfig.app.json`** — App source files (`src/**`). Used by `vue-tsc -b` during build.
- **`tsconfig.node.json`** — Node-side config files (`vite.config.ts`). Used by `vue-tsc -b` during build.
- **`tsconfig.test.json`** — Test files (`e2e/**`, `ct/**`, Playwright configs). **Not part of the build** — provides editor/IDE support only. Playwright handles its own TS compilation at runtime.
- **`tsconfig.json`** — Root project references (app + node only). Does not include test config.

## Environment & Configuration

- **`.env`** — Real Firebase credentials for development (not committed, see `.env.example`)
- **`.env.emulator`** — Fake Firebase config for emulator mode (committed, uses emulators)
- **`firebase.json`** — Emulator port configuration (source of truth for ports)
- **`scripts/emulator-config.mjs`** — Centralized emulator config (project ID, ports, URLs) used by all scripts
- **`e2e/helpers/emulator-config.ts`** — TypeScript mirror of the above, used by Playwright test code and configs
- **`.nvmrc`** — Pins Node.js version to 22 (matches Cloud Functions requirement)
- When `VITE_USE_EMULATORS=true`, the app connects to local Firebase Emulators instead of production. See [docs/environments.md](docs/environments.md) for all environment and deploy paths.

## Test Conventions

- E2E test files go in `e2e/specs/` with the pattern `*.spec.ts`
- Component test files go in `ct/` with the pattern `*.ct.ts`
- Use the `authenticatedPage` fixture from `e2e/fixtures.ts` for tests that need a logged-in user
- Use standard `page` from `@playwright/test` for unauthenticated tests (e.g., login page)
- Each E2E test gets a clean Firestore state (data is cleared before each test in the fixture setup, not after, to avoid race conditions with parallel tests)

## Important Notes

- **Do not execute queries against production databases.** Use emulators for all testing.
- The Firebase client config values (`VITE_*`) are public by design — they are secured by Firestore security rules and Auth.
- Persist Firebase Storage object paths in Firestore, not long-lived download URLs. The client should resolve paths to URLs at render time through the authenticated Firebase Storage SDK.
- Offline image access is handled by the custom PWA service worker runtime cache. Treat cached renovation images as device-local convenience data that may remain available after sign-out.
- The service worker precaches the built app shell and uses SPA navigation fallback for offline route refreshes.
- The service worker also runtime-caches Firebase Storage image responses for both production Storage URLs (`firebasestorage.googleapis.com`) and local emulator Storage URLs (`localhost`/`127.0.0.1` with `/v0/b/.../o/...`).
- The service worker does **not** cache Auth, Firestore, or Cloud Functions traffic. Offline data access there depends on the Firebase SDKs, not Workbox routing.
- The client persists resolved Firebase Storage download URLs in `localStorage` keyed by Storage path, and reuses them before calling `getDownloadURL()` again. This reduces redundant URL-resolution requests and makes image rendering after refresh more likely to stay offline-capable once an image has been seen online.
- If you change Storage runtime caching, make sure the service worker still matches both production Firebase Storage URLs and emulator Storage URLs.
- Cached image bytes plus the persisted path-to-URL mapping are what allow image rendering after a full offline refresh. If either side changes, re-check the PWA image-loading behavior.
- The `NANO_BANANA_API_KEY` is server-side only and must never be exposed in client code.
- Java must be installed for Firebase Emulators to run.
- Tracked service logs and PID files are written under `logs/services/`.
