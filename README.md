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
> npm -s run services:start -- emulators
> ```

---

## Quick Start (with emulators, recommended)

```bash
# 1. Install dependencies
npm install

# 2. Install Playwright browsers (first time only)
npx playwright install chromium

# 3. Start the tracked emulator-backed development services
npm -s run services:start -- emulators
npm -s run services:start -- dev:emulators
npm -s run services:wait -- emulators
npm -s run services:wait -- dev:emulators

# 5. Create a dev user in the emulator (first time, or after clearing auth)
npm -s run emulators:seed
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

1. Run `npm -s run emulators:seed` to create the dev user
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
npm -s run emulators:clear

# Clear Firestore only (keep users)
npm -s run emulators:clear:firestore

# Clear Auth only (keep Firestore data)
npm -s run emulators:clear:auth
```

The emulators must be running when you run these commands.

### Starting Over (Full Reset)

The simplest way to get a completely clean state is to **restart the emulators** — they start empty every time:

```bash
# Restart the tracked emulator service
npm -s run services:restart -- emulators
npm -s run services:wait -- emulators

# Re-create your dev user
npm -s run emulators:seed
```

If you change Cloud Functions code in `functions/src/`, restart `emulators` so the updated functions are rebuilt and loaded before you continue testing.

### Resetting Just the Data (without restarting)

```bash
# Clear all data while keeping the emulators running
npm -s run emulators:clear

# Re-seed dev user
npm -s run emulators:seed
```

### Clearing Production Firestore

> ⚠️ **Danger:** This permanently deletes production data.

Use the Firebase Console (**Firestore → Data → Delete collection**) or the
`firebase firestore:delete --all-collections` CLI command (requires `firebase login`).

---

## Building

```bash
# Type-check app + test files, then build for production
npm -s run build

# Type-check only (no build output)
npx vue-tsc -b
npm -s run typecheck:tests
npm -s run typecheck:all
```

The build output goes to `dist/`. A service worker is generated for PWA support.

---

## Testing

### Prerequisites for E2E Tests

E2E tests require the Firebase Emulators to be running:

```bash
# Start the tracked emulator service once and leave it running
npm -s run services:start -- emulators
npm -s run services:start -- dev:emulators
npm -s run services:wait -- emulators
npm -s run services:wait -- dev:emulators
```

The global setup waits for the emulator suite, and authenticated tests create their own isolated emulator user on demand.

### Run All Tests

```bash
# Requires emulator and preview services already running
npm -s run test
```

`test:*` commands never start or stop services. For local runs, start the required services yourself and wait for them with `npm -s run services:wait -- <name>`. In CI, GitHub Actions owns that startup and wait sequence.

To run the full test matrix in parallel, start and wait for the required services first, then run `npm -s run test:all`.

### E2E Tests Only

```bash
# Headless (default)
npm -s run test:e2e

# With browser visible
npm -s run test:e2e:headed

# Interactive Playwright UI (great for debugging)
npm -s run test:e2e:ui
```

Start the tracked `dev:emulators` service before running E2E. The Playwright config no longer starts or stops long-running services for you. Port 5174 must be free before you start the service.

### Component Tests Only

```bash
# No emulators needed
npm -s run test:ct
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

## Service-Manager Reference

| Command                                          | Description                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm -s run services:start -- dev`               | Start the tracked dev server against real Firebase on `localhost:5173`       |
| `npm -s run services:start -- emulators`         | Start the tracked Firebase Emulator Suite                                    |
| `npm -s run services:start -- dev:emulators`     | Start the tracked dev server against local emulators on `localhost:5174`     |
| `npm -s run services:wait -- <name>`             | Wait up to 45 seconds until one tracked service port is open                 |
| `npm -s run services:start -- preview:emulators` | Build and start the tracked emulator-mode preview server on `localhost:4175` |
| `npm -s run services:status`                     | Show tracked service status, ports, error counts, and recent log output      |
| `npm -s run services:restart -- <name>`          | Restart one tracked service                                                  |
| `npm -s run services:stop -- [name]`             | Stop one tracked service, or all tracked services if omitted                 |

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
  global-setup.ts     Runs before all tests: waits for emulators
  global-teardown.ts  Cleans up after all tests

ct/                   Component tests (*.ct.ts)
playwright/
  index.html          CT harness entry point
  index.ts            CT hooks: installs minimal router before each mount

scripts/
  emulator-seed.mjs   Creates a dev user in the Auth Emulator
  emulator-clear.mjs  Clears Firestore / Auth emulator data
```
