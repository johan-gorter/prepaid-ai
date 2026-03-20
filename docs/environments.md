# Environments

This project has four distinct runtime and deployment paths. The important distinction is whether the app is built with `VITE_USE_EMULATORS=true`.

## 1. Local Emulator Mode

Use this for normal local development against the Firebase Emulator Suite.

```bash
# Terminal 1
npm run emulators

# Terminal 2
npm run dev:emulators

# Once per fresh emulator session
npm run emulators:seed
```

How it works:
- `npm run dev:emulators` runs `vite --mode emulator`
- Vite loads `.env.emulator`
- `.env.emulator` sets `VITE_USE_EMULATORS=true`
- `src/firebase.ts` connects Auth, Firestore, and Storage to the local emulators
- `src/views/LoginPage.vue` renders the emulator-only dev login panel when `VITE_USE_EMULATORS === "true"`

This is the only mode where the `Dev Login` button should appear.

## 2. Local Real Firebase Mode

Use this when you want to run the app locally against a real Firebase project.

```bash
npm run dev
```

How it works:
- `npm run dev` runs Vite in its default mode
- Vite loads `.env`
- `.env` should contain real Firebase web app configuration
- `VITE_USE_EMULATORS` should be unset

In this mode the app uses real Firebase services and the emulator-only dev login stays hidden.

## 3. Experimental Deploy

This is the hosted preview environment deployed by CI to the `prepaid-ai-experimental` Firebase project.

Source of truth:
- `.github/workflows/ci.yml`
- `.firebaserc`

How it works today:
- CI runs `npx vite build`
- The workflow injects the `*_EXPERIMENTAL` Firebase variables directly into the build step
- The workflow does not set `VITE_USE_EMULATORS`
- CI deploys with `firebase deploy --only hosting,functions,firestore:rules,storage --project prepaid-ai-experimental`

Result:
- The experimental deploy should behave like a real hosted environment
- The emulator-only dev login should not be visible there

If the emulator login appears on an experimental deploy, that build was produced with emulator settings, typically by using the emulator Vite mode or by setting `VITE_USE_EMULATORS=true` during the build.

## 4. Production Deploy

The production deploy job is currently commented out in `.github/workflows/ci.yml`, but its intended shape is the same as the experimental deploy:
- build a normal production bundle into `dist/`
- deploy Hosting, Functions, Firestore rules, and Storage rules
- do not set `VITE_USE_EMULATORS`

The configured Firebase project aliases are:
- `default` -> `prepaid-ai-experimental`
- `production` -> `renovision-ai`

## Automated Tests

The automated test stack deliberately uses emulator mode.

- E2E tests start Vite with `--mode emulator`
- PWA tests build with `vite build --mode emulator` into `dist-emulator/`
- Playwright also injects fake Firebase config for emulator-backed runs

This is test infrastructure only. Do not reuse emulator-mode output for hosted environments.

## Rules Of Thumb

- Use `npm run dev:emulators` for safe local development against emulators.
- Use `npm run dev` for local development against a real Firebase project.
- Use plain `vite build` or `npm run build` for hosted builds.
- Never deploy assets produced from emulator mode.
- If a hosted environment shows the emulator login panel, inspect the build inputs for `VITE_USE_EMULATORS=true`.
