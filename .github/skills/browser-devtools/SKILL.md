---
name: browser-devtools
description: "Interact with the running app via Chrome DevTools MCP (io.github.ChromeDevTools/chrome-devtools-mcp). Use when: testing UI flows end-to-end in the browser, debugging runtime errors, verifying console output, checking network failures, or validating that a fix actually works in the running app."
argument-hint: "Optional: URL to navigate to (default: http://localhost:5174)"
---

# Browser DevTools — Chrome DevTools MCP

## When to Use

- Verifying a UI change works in the running app
- Debugging console errors or network failures
- Testing a multi-step user flow (login → navigate → interact)
- Checking that a backend fix resolves a client-visible error
- Inspecting Firestore/Auth emulator connectivity issues

## Prerequisites

Before interacting with the browser, ensure the required services are running:

```bash
npm -s run services:status
```

Required services for most flows:

- **emulators** — Firebase Emulator Suite (Auth, Firestore, Storage, Functions)
- **dev:emulators** — Vite dev server in emulator mode on port 5174

If either is crashed or stopped, start/restart them:

```bash
npm -s run services:start emulators
npm -s run services:start dev:emulators
npm -s run services:wait emulators
npm -s run services:wait dev:emulators
```

## Authentication Flow

The app requires authentication. Most pages redirect unauthenticated users to `/login`.

### Step 1 — Navigate to the login page

```
navigate_page → url: http://localhost:5174/login
```

### Step 2 — Check if already authenticated

After navigation, check the actual URL in the page snapshot. If the URL is NOT `/login` (e.g., `/chat` or `/main`), the user is already logged in from a previous session. Skip to the target page.

### Step 3 — Handle stale alerts

If a dialog/alert appears (e.g., "Dev login failed"), **dismiss it first** before proceeding:

```
handle_dialog → action: accept
```

### Step 4 — Click the Dev Login button

Use the accessibility snapshot to find and click the dev login button:

```
take_snapshot → find button "Dev Login (dev@prepaid.test)" → click it by uid
```

**Important:** The dev user must be seeded first. If login fails with `auth/user-not-found`, run:

```bash
node scripts/emulator-seed.mjs
```

If the seed script fails with `EMAIL_EXISTS`, clear first:

```bash
node scripts/emulator-clear.mjs
node scripts/emulator-seed.mjs
```

### Step 5 — Wait for navigation

After clicking Dev Login, wait for a known element on the destination page (e.g., `"Balance:"`) to confirm auth succeeded.

## Gotchas and Common Pitfalls

### 1. `wait_for` text parameter must be an array

The `wait_for` tool's `text` parameter is an **array of strings**, not a plain string:

```
# WRONG
wait_for → text: "Balance:"

# CORRECT
wait_for → text: ["Balance:"]
```

### 2. Screenshots can be blank — prefer snapshots for interaction

Screenshots are viewport-dependent and may show a blank page while loading. Use `take_snapshot` to get the accessibility tree, which is more reliable for finding interactive elements and reading text content.

Use screenshots only for visual verification (layout, colors, images).

### 3. Sending Enter to submit forms

The chat input and other forms may not have a visible submit button once text is entered. Use `press_key → Enter` or find the submit button in the snapshot and click it.

### 4. Emulators crash but the error is not obvious

If the page shows blank or console shows `ERR_CONNECTION_REFUSED`:

1. Run `npm -s run services:status` — check if emulators show **crashed**
2. Check the log: `Get-Content logs/services/emulators.log -Tail 30`
3. Common crash causes:
   - **Port conflict** from zombie Java processes: `Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force` then restart
   - **IPv6/IPv4 mismatch**: `firebase.json` emulator hosts should be `"localhost"` not `"127.0.0.1"` so the Firebase CLI and Java Firestore emulator resolve consistently on Node 22
   - **Functions build failure**: check the emulator log for TypeScript compilation errors

### 5. Auth emulator state is ephemeral

After restarting emulators, all users and Firestore data are lost. Always re-seed:

```bash
node scripts/emulator-clear.mjs
node scripts/emulator-seed.mjs
```

The seed creates `dev@prepaid.test` with 100 credits.

### 6. Console messages reset on navigation

`list_console_messages` only shows messages since the last page navigation. If you navigate to a new URL, previous console messages are gone. Capture them before navigating if needed.

### 7. Network request inspection

Use `list_network_requests` (no arguments) to see all requests. Look for:

- `net::ERR_CONNECTION_REFUSED` — emulator is down on that port
- `400` responses — emulator is up but request is invalid (e.g., user not seeded)
- `403` responses — Firestore security rules blocking the request

### 8. Dialog alerts block interaction

If the page has a JavaScript `alert()` or `confirm()` showing, all other interactions will fail silently or error. Always handle dialogs first:

```
handle_dialog → action: accept
```

The page snapshot will indicate when a dialog is open.

## Typical Investigation Workflow

1. **Check services:** `npm -s run services:status`
2. **Navigate:** `navigate_page → http://localhost:5174/login`
3. **Handle dialogs** if any are shown
4. **Authenticate** via Dev Login button
5. **Navigate** to the target page
6. **Check console:** `list_console_messages` for errors
7. **Check network:** `list_network_requests` for failed requests
8. **Take snapshot** to read page content and interact with elements
9. **Take screenshot** for visual verification
