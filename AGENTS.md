# AGENTS.md — AI Agent Instructions

This file contains instructions for AI coding agents working on the Prepaid AI codebase.

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Vite 7
- **Auth:** Firebase Authentication (Google/Microsoft/Apple)
- **Database:** Cloud Firestore
- **Storage:** Firebase Storage (GCS-backed)
- **Testing:** Playwright (E2E + Component Tests)
- **Local Backend:** Firebase Emulator Suite
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
  helpers/              # Auth emulator helpers
  fixtures.ts           # Custom test fixtures (authenticatedPage)
  global-setup.ts       # Creates test user in emulator before all tests
  global-teardown.ts    # Cleans up emulator data after all tests
ct/                     # Playwright Component Tests (*.ct.ts)
```

## Available Scripts

### Build & Development

| Command                 | Description                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `npm run build`         | Type-check with `vue-tsc` then build for production with Vite                      |
| `npm run dev`           | Start Vite dev server (requires real Firebase config in `.env`)                    |
| `npm run dev:emulators` | Start Vite dev server in test mode (uses `.env.test`, connects to local emulators) |
| `npm run preview`       | Preview production build locally                                                   |

### Testing

| Command                   | Description                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run emulators`       | Start Firebase Emulator Suite (Auth :9099, Firestore :8080, Storage :9199, UI :4000). **Requires Java.** Must be running before E2E tests. |
| `npm run test:e2e`        | Run Playwright E2E tests (auto-starts Vite dev server in test mode)                                                                        |
| `npm run test:ct`         | Run Playwright Component Tests (no emulators needed)                                                                                       |
| `npm run test`            | Run both E2E and Component Tests sequentially                                                                                              |
| `npm run test:e2e:ui`     | Open Playwright UI mode for E2E tests (interactive debugging)                                                                              |
| `npm run test:e2e:headed` | Run E2E tests in a visible browser window                                                                                                  |

### Type-checking only

```bash
npx vue-tsc --noEmit
```

## How to Run Tests

### E2E Tests (require Firebase Emulators)

E2E tests use real Firebase Emulators for Auth, Firestore, and Storage. The emulators must be running before you start E2E tests.

```bash
# Terminal 1 — start emulators (keep running)
npm run emulators

# Terminal 2 — run E2E tests
npm run test:e2e
```

The Playwright config (`playwright.config.ts`) automatically:

- Starts a Vite dev server on port 5173 with emulator env vars
- Runs global setup which waits for emulators, clears data, and creates a test user
- Provides an `authenticatedPage` fixture for tests needing a signed-in user
- Cleans up Firestore data between tests for isolation

**No `.env` file is needed for tests** — the Playwright config injects fake Firebase config values directly. The emulators accept any project configuration.

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

1. **Type-check:** `npx vue-tsc -b` — must exit with code 0, no output means success
2. **Build:** `npm run build` — runs type-check + Vite production build, must complete without errors
3. **Component tests:** `npm run test:ct` — no emulators needed
4. **E2E tests:** Start emulators (`npm run emulators`), then `npm run test:e2e`

For a quick validation without emulators, steps 1-2 are sufficient.

## TypeScript Configuration

- **`tsconfig.app.json`** — App source files (`src/**`). Used by `vue-tsc -b` during build.
- **`tsconfig.node.json`** — Node-side config files (`vite.config.ts`). Used by `vue-tsc -b` during build.
- **`tsconfig.test.json`** — Test files (`e2e/**`, `ct/**`, Playwright configs). **Not part of the build** — provides editor/IDE support only. Playwright handles its own TS compilation at runtime.
- **`tsconfig.json`** — Root project references (app + node only). Does not include test config.

## Environment & Configuration

- **`.env`** — Real Firebase credentials for development (not committed, see `.env.example`)
- **`.env.test`** — Fake Firebase config for test mode (committed, uses emulators)
- **`firebase.json`** — Emulator port configuration
- When `VITE_USE_EMULATORS=true`, the app connects to local Firebase Emulators instead of production

## Test Conventions

- E2E test files go in `e2e/specs/` with the pattern `*.spec.ts`
- Component test files go in `ct/` with the pattern `*.ct.ts`
- Use the `authenticatedPage` fixture from `e2e/fixtures.ts` for tests that need a logged-in user
- Use standard `page` from `@playwright/test` for unauthenticated tests (e.g., login page)
- Each E2E test gets a clean Firestore state (data is cleared after each test using the fixture)

## Important Notes

- **Do not execute queries against production databases.** Use emulators for all testing.
- The Firebase client config values (`VITE_*`) are public by design — they are secured by Firestore security rules and Auth.
- The `NANO_BANANA_API_KEY` is server-side only and must never be exposed in client code.
- Java must be installed for Firebase Emulators to run.
