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

| Command                              | Description                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `npm run build`                      | Type-check with `vue-tsc` then build for production with Vite                                                  |
| `npm run build:preview`              | Build then preview the production bundle locally                                                               |
| `npm run dev`                        | Start Vite dev server on `localhost:5173` (requires real Firebase config in `.env`)                            |
| `npm run dev:emulators`              | Start Vite dev server on `localhost:5174` in emulator mode (uses `.env.emulator`, connects to local emulators) |
| `npm run preview`                    | Preview an already-built production bundle                                                                     |
| `npm run services:start -- <name>`   | Start one or more tracked background services or service groups                                                |
| `npm run services:stop -- [name]`    | Stop one tracked service, one group, or all tracked services if omitted                                        |
| `npm run services:restart -- [name]` | Restart one tracked service, one group, or all tracked services if omitted                                     |
| `npm run services:status`            | Show tracked service status, ports, error counts, and last useful log line                                     |

Tracked service names:

- `dev` — Vite on port 5173
- `dev:emulators` — Vite emulator mode on port 5174
- `emulators` — Firebase Emulator Suite

Tracked groups:

- `dev-with-emulators` — both Vite dev servers
- `all` — emulators plus both Vite dev servers

### Testing

| Command                       | Description                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run emulators`           | Start Firebase Emulator Suite (Auth :9099, Functions :5001, Firestore :8080, Storage :9199, UI :4000). **Requires Java.** Must be running before E2E tests. |
| `npm run emulators:wait`      | Wait for emulators to become ready (used by CI and standalone test runner)                                                                                  |
| `npm run test:e2e`            | Run Playwright E2E tests (requires emulators running separately)                                                                                            |
| `npm run test:e2e:standalone` | Run E2E tests with auto-managed emulators (single command, no extra terminal)                                                                               |
| `npm run test:ct`             | Run Playwright Component Tests (no emulators needed)                                                                                                        |
| `npm run test:pwa`            | Run PWA tests (auto-builds production bundle)                                                                                                               |
| `npm run test`                | Run E2E, Component, and PWA tests sequentially                                                                                                              |
| `npm run test:e2e:ui`         | Open Playwright UI mode for E2E tests (interactive debugging)                                                                                               |
| `npm run test:e2e:headed`     | Run E2E tests in a visible browser window                                                                                                                   |

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

**Easiest way — single command:**

```bash
npm run test:e2e:standalone
```

This starts the emulators, waits for them, runs tests, and stops the emulators. Extra args are passed through to Playwright (e.g. `npm run test:e2e:standalone -- --headed`).

**Two-terminal way (for repeated runs):**

```bash
# Terminal 1 — start emulators (keep running)
npm run emulators

# Terminal 2 — run E2E tests
npm run test:e2e
```

**Tracked background services:**

```bash
# Start the emulator suite plus the emulator-mode Vite app separately
npm run services:start -- emulators
npm run services:start -- dev:emulators

# Or start both Vite dev servers together
npm run services:start -- dev-with-emulators

# Inspect or stop everything that is being tracked
npm run services:status
npm run services:stop
```

The Playwright config (`playwright.config.ts`) automatically:

- Starts a Vite dev server on port 5174 with emulator env vars
- Runs global setup which waits for emulators, clears data, and creates a test user
- Provides an `authenticatedPage` fixture for tests needing a signed-in user
- Clears Firestore data before each test (in fixture setup) for parallel-safe isolation

**No `.env` file is needed for tests** — the Playwright config injects fake Firebase config values directly. The emulators accept any project configuration.

**Important:** If you change Cloud Function code in `functions/src/`, rebuild with `cd functions && npm run build` and restart the emulators.

### Component Tests (no emulators needed)

Component tests mount individual Vue components in isolation. They do not need Firebase Emulators.

```bash
npm run test:ct
```

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
- If you change Storage runtime caching, make sure the service worker matches both production Firebase Storage URLs and emulator Storage URLs.
- The `NANO_BANANA_API_KEY` is server-side only and must never be exposed in client code.
- Java must be installed for Firebase Emulators to run.
- Tracked service logs and PID files are written under `logs/services/`.
