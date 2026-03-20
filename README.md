# Prepaid AI

A Vue 3 PWA that lets users take or upload a photo of a space, mark an area to change, and get an AI-generated impression of their renovation idea.

**Stack:** Vue 3 · Vite 7 · TypeScript · Firebase (Auth · Firestore · Storage) · Playwright

---

## Prerequisites

| Tool    | Version | Notes                                |
| ------- | ------- | ------------------------------------ |
| Node.js | ≥ 20    |                                      |
| Java    | ≥ 11    | Required for Firebase Emulators only |

> **Windows note:** If Java is not on your PATH, prefix emulator commands with the Java bin directory:
>
> ```powershell
> $env:PATH = "D:\tools\jdk-25.0.2\bin;$env:PATH"
> npm run emulators
> ```

---

## Quick Start (with emulators, recommended)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install chromium

# 3. Start Firebase Emulators in a terminal and keep it running
npm run emulators

# 4. In a second terminal, start the dev server connected to the emulators
npm run dev:emulators

# 5. Create a dev user in the emulator (first time, or after clearing auth)
npm run emulators:seed
```

Open **http://localhost:5174** — click the **⚡ Dev Login** button to sign in instantly.
The Emulator Suite UI is available at **http://localhost:4000**.

Environment and deployment details live in [docs/environments.md](docs/environments.md).

---

## Development Modes

See [docs/environments.md](docs/environments.md) for the canonical breakdown of local emulator mode, local real Firebase mode, CI experimental deploys, and production deploys.

---

## Authentication

### In Emulator Mode

The Auth Emulator runs at `http://localhost:4000/auth`. Three ways to sign in:

**Option A — Dev Login button (easiest)**

1. Run `npm run emulators:seed` to create the dev user
2. Open the app and click **⚡ Dev Login** — it signs you in with `dev@prepaid.test`

**Option B — Browser console**

In emulator mode the app exposes a `window.__testSignIn` helper:

```js
// Open browser DevTools → Console
await __testSignIn("dev@prepaid.test", "dev-password");
// Then navigate to /
```

**Option C — Emulator UI**

1. Go to http://localhost:4000/auth
2. Click **Add user** to create a user manually
3. Return to the app and sign in with those credentials via the login page

**Note on OAuth providers (Google/Microsoft/Apple):** The Auth Emulator intercepts
OAuth flows and shows a special emulator popup where you can pick or create a test
identity. This fully simulates the production OAuth experience without needing real
provider credentials.

For the full environment matrix and hosted deployment rules, see [docs/environments.md](docs/environments.md).

### In Production

The app uses Firebase Auth with three OAuth providers:

- **Google** — sign in with any Google account
- **Microsoft** — sign in with any Microsoft/Outlook account
- **Apple** — sign in with any Apple ID

No additional configuration is needed beyond setting up the providers in the Firebase Console
(**Authentication → Sign-in method**) and adding the authorised domain.

### Fake / Automated Authentication (for tests)

Playwright E2E tests use the `authenticatedPage` fixture from `e2e/fixtures.ts`.
It calls `window.__testSignIn` (exposed by `src/firebase.ts` when emulators are active)
to sign in programmatically without UI interaction.

See [e2e/fixtures.ts](e2e/fixtures.ts) and [e2e/helpers/auth.ts](e2e/helpers/auth.ts) for implementation details.

---

## Database Management

### Clearing Emulator Data

```bash
# Clear everything (Firestore + Auth users)
npm run emulators:clear

# Clear Firestore only (keep users)
npm run emulators:clear:firestore

# Clear Auth only (keep Firestore data)
npm run emulators:clear:auth
```

The emulators must be running when you run these commands.

### Starting Over (Full Reset)

The simplest way to get a completely clean state is to **restart the emulators** — they start empty every time:

```bash
# Stop emulators (Ctrl+C in their terminal), then restart
npm run emulators

# Re-create your dev user
npm run emulators:seed
```

### Resetting Just the Data (without restarting)

```bash
# Clear all data while keeping the emulators running
npm run emulators:clear

# Re-seed dev user
npm run emulators:seed
```

### Clearing Production Firestore

> ⚠️ **Danger:** This permanently deletes production data.

Use the Firebase Console (**Firestore → Data → Delete collection**) or the
`firebase firestore:delete --all-collections` CLI command (requires `firebase login`).

---

## Building

```bash
# Type-check app + test files, then build for production
npm run build

# Type-check only (no build output)
npx vue-tsc -b
npm run typecheck:tests
```

The build output goes to `dist/`. A service worker is generated for PWA support.

---

## Testing

### Prerequisites for E2E Tests

E2E tests require the Firebase Emulators to be running:

```bash
# Terminal 1 — keep running during tests
npm run emulators
```

The emulator data is cleared and a test user is created automatically by the global setup before each test run.

### Run All Tests

```bash
# Requires emulators running
npm run test
```

### E2E Tests Only

```bash
# Headless (default)
npm run test:e2e

# With browser visible
npm run test:e2e:headed

# Interactive Playwright UI (great for debugging)
npm run test:e2e:ui
```

The Playwright config starts a Vite dev server automatically in emulator mode (`VITE_USE_EMULATORS=true`).
Port 5174 must be free.

### Component Tests Only

```bash
# No emulators needed
npm run test:ct
```

Component tests use `@playwright/experimental-ct-vue` to mount individual Vue components in isolation.
Setup file: `playwright/index.ts` (installs a minimal in-memory router).

### Run a Specific Test File

```bash
# E2E
npx playwright test --config=playwright.config.ts e2e/specs/home.spec.ts

# Component
npx playwright test --config=playwright-ct.config.ts ct/new-renovation.ct.ts
```

---

## Scripts Reference

| Script                              | Description                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                       | Start dev server against production Firebase on `localhost:5173` (needs `.env`)     |
| `npm run dev:emulators`             | Start dev server against local emulators on `localhost:5174` (uses `.env.emulator`) |
| `npm run build`                     | Type-check everything and build for production                                      |
| `npm run preview`                   | Preview the production build locally                                                |
| `npm run emulators`                 | Start Firebase Emulator Suite (Auth, Firestore, Storage, UI)                        |
| `npm run emulators:seed`            | Create a dev user in the Auth Emulator                                              |
| `npm run emulators:clear`           | Clear all emulator data (Firestore + Auth)                                          |
| `npm run emulators:clear:firestore` | Clear Firestore data only                                                           |
| `npm run emulators:clear:auth`      | Clear Auth users only                                                               |
| `npm run test`                      | Run all tests (E2E + component)                                                     |
| `npm run test:e2e`                  | Run E2E tests (requires emulators)                                                  |
| `npm run test:ct`                   | Run component tests (no emulators needed)                                           |
| `npm run test:e2e:ui`               | Open Playwright UI for E2E debugging                                                |
| `npm run test:e2e:headed`           | Run E2E tests with visible browser                                                  |

---

## Environment Variables

| Variable                            | Required for     | Description                                      |
| ----------------------------------- | ---------------- | ------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`             | Production       | Firebase project API key                         |
| `VITE_FIREBASE_AUTH_DOMAIN`         | Production       | Firebase auth domain                             |
| `VITE_FIREBASE_PROJECT_ID`          | Production       | Firebase project ID                              |
| `VITE_FIREBASE_STORAGE_BUCKET`      | Production       | Firebase storage bucket                          |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Production       | Firebase messaging sender ID                     |
| `VITE_FIREBASE_APP_ID`              | Production       | Firebase app ID                                  |
| `VITE_USE_EMULATORS`                | Emulator mode    | Set to `"true"` to connect to local emulators    |
| `NANO_BANANA_API_KEY`               | Server-side only | AI service key — **never expose in client code** |

Copy `.env.example` to `.env` for production credentials. The `.env.emulator` file is already configured for emulator mode and committed to the repo (it contains only fake/placeholder values). See [docs/environments.md](docs/environments.md) for which file each workflow uses.

---

## Project Structure

```
src/
  composables/        Vue composables (useAuth, useRenovations)
  router/             Vue Router config with auth guards
  views/              Page components
  firebase.ts         Firebase SDK init + emulator wiring
  types.ts            TypeScript interfaces

e2e/
  specs/              E2E test files (*.spec.ts)
  helpers/auth.ts     Auth Emulator REST helpers
  fixtures.ts         authenticatedPage fixture
  global-setup.ts     Runs before all tests: waits for emulators, creates test user
  global-teardown.ts  Cleans up after all tests

ct/                   Component tests (*.ct.ts)
playwright/
  index.html          CT harness entry point
  index.ts            CT hooks: installs minimal router before each mount

scripts/
  emulator-seed.mjs   Creates a dev user in the Auth Emulator
  emulator-clear.mjs  Clears Firestore / Auth emulator data
```
