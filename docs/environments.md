# Environments

This project has four distinct runtime and deployment paths. The important distinction is whether the app is built with `VITE_USE_EMULATORS=true`.

## 1. Local Emulator Mode

Use this for normal local development against the Firebase Emulator Suite.

```bash
# Terminal 1
npm -s run services:start emulators

# Terminal 2
npm -s run services:start dev:emulators
npm -s run services:wait emulators
npm -s run services:wait dev:emulators

# Once per fresh emulator session
npm -s run emulators:seed
```

How it works:

- `npm -s run services:start dev:emulators` runs the tracked Vite emulator-mode dev service
- By default the emulator dev server runs on `http://localhost:5174`
- Vite loads `.env.emulator`, normal `.env` file is ignored
- `.env.emulator` sets `VITE_USE_EMULATORS=true`
- Emulator builds written with `vite build --mode emulator` go to `dist-emulator/`
- `src/firebase.ts` connects Auth, Firestore, and Storage to the local emulators
- `src/views/LoginPage.vue` renders the emulator-only dev login panel when `VITE_USE_EMULATORS === "true"`

This is the only mode where the `Dev Login` button should appear.

## 2. Local Real Firebase Mode

Use this when you want to run the app locally against a real Firebase project.

```bash
npm -s run services:start dev
```

How it works:

- `npm -s run services:start dev` runs the tracked Vite dev service in its default mode
- By default the real-Firebase dev server runs on `http://localhost:5173`
- Vite loads `.env`
- `.env` should contain real Firebase web app configuration. This can be the prepaid-ai-sandbox firebase project or a special one.
- `VITE_USE_EMULATORS` should be unset
- Normal hosted builds written with `vite build` or `npm -s run build` go to `dist/`

In this mode the app uses real Firebase services and the emulator-only dev login stays hidden.

## 3. Sandbox Deploy

This is the hosted preview environment deployed by CI to the `prepaid-ai-sandbox` Firebase project.

Source of truth:

- `.github/workflows/ci.yml`
- `.firebaserc`

How it works today:

- CI runs `npx vite build`
- The workflow injects the `*_SANDBOX` Firebase variables directly into the build step
- The workflow does not set `VITE_USE_EMULATORS`
- The resulting frontend bundle is emitted to `dist/`
- CI deploys with `firebase deploy --only hosting,functions,firestore:rules,storage --project prepaid-ai-sandbox`

Result:

- The sandbox deploy should behave like a real hosted environment
- The emulator-only dev login should not be visible there

If the emulator login appears on a sandbox deploy, that build was produced with emulator settings, typically by using the emulator Vite mode or by setting `VITE_USE_EMULATORS=true` during the build.

## 4. Production Deploy

The production deploy job is currently commented out in `.github/workflows/ci.yml`, but its intended shape is the same as the sandbox deploy:

- build a normal production bundle into `dist/`
- deploy Hosting, Functions, Firestore rules, and Storage rules
- do not set `VITE_USE_EMULATORS`

The configured Firebase project aliases are:

- `default` -> `prepaid-ai-sandbox`
- `production` -> `prepaid-ai-production`

## Automated Tests

The automated test stack deliberately uses emulator mode.

- Start the tracked `dev:emulators` service before E2E tests; it serves the app on `http://localhost:5174`
- Start the tracked `preview:emulators` service before PWA tests; it builds with `vite build --mode emulator` into `dist-emulator/` and serves that build on `http://localhost:4175`
- Playwright also injects fake Firebase config for emulator-backed runs

Important distinction:

- E2E tests require a live Firebase Emulator Suite and manage readiness through Playwright global setup; authenticated tests create their own emulator-backed users on demand
- PWA tests do **not** start or manage the Emulator Suite; they only build and serve the frontend in emulator mode
- If the PWA test app reaches Firebase APIs during runtime, it will target emulator endpoints because `VITE_USE_EMULATORS=true`, but no emulator lifecycle is orchestrated by the PWA suite itself

This is test infrastructure only. Do not reuse emulator-mode output for hosted environments.

## Service Worker And Backends

The generated service worker has two relevant jobs:

- Precache the built app shell assets emitted by Vite/Workbox so the app can boot offline
- Runtime-cache Firebase Storage image GET responses

Storage caching behavior:

- Production backend: matches Storage object downloads from `https://firebasestorage.googleapis.com/v0/b/.../o/...`
- Local emulator backend: matches Storage object downloads from `http://localhost:9199/v0/b/.../o/...` or `http://127.0.0.1:9199/v0/b/.../o/...`
- The cache key strips query parameters and keeps only `origin + pathname`, so token changes on Storage download URLs do not create duplicate cache entries for the same object path

What it does not do:

- It does not cache Firestore reads/writes, Auth traffic, or Cloud Functions calls

Client-side URL persistence:

- The app persists resolved `getDownloadURL()` results in `localStorage`, keyed by Firebase Storage path
- On later renders, the client checks that persisted mapping before calling `getDownloadURL()` again
- This reduces redundant download-URL resolution requests and helps previously seen images render again after a full offline refresh

Consequence:

- Offline route refresh works because the app shell is precached
- Offline image redisplay after a full refresh can work for previously seen images because the client can recover the same Storage object URL from local persistence and then let the service worker serve the cached bytes

## Rules Of Thumb

- Use `npm -s run services:start dev:emulators` for safe local development against emulators.
- Use `npm -s run services:start dev` for local development against a real Firebase project.
- Use plain `vite build` or `npm -s run build` for hosted builds that emit to `dist/`.
- Never deploy assets produced from emulator mode.
- Treat `dist-emulator/` as emulator/test infrastructure output only.
- If a hosted environment shows the emulator login panel, inspect the build inputs for `VITE_USE_EMULATORS=true`.
