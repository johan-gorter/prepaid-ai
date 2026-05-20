# Sandbox Deployment (from a dev PC)

The **sandbox** environment (`prepaid-ai-sandbox` Firebase project) is the only
hosted environment that is **not** deployed by CI. It is deployed **manually
from a developer machine** when you want to preview changes on a real hosted
Firebase project (real Auth, Firestore, Storage, and real Stripe in test mode).

## How this differs from dev and production

| Environment    | Trigger                          | Defined in                  |
| -------------- | -------------------------------- | --------------------------- |
| **dev**        | Automatic — push to `main`       | `.github/workflows/ci.yml` (`deploy-dev`) |
| **production** | Automatic — push to `release`    | `.github/workflows/ci.yml` (`deploy-production`) |
| **sandbox**    | **Manual — `firebase deploy` from a dev PC** | this document |

There is intentionally no sandbox job in CI. If you want sandbox updated, you
run the steps below yourself.

## When to use it (and when not to)

- **Prefer the Firebase Emulator Suite for local development.** It is faster,
  free, isolated, and does not touch a shared hosted project. See
  [environments.md](environments.md) section 1.
- Use a sandbox deploy only when you specifically need to validate behaviour on
  a **real hosted environment** — e.g. real OAuth provider redirects (Google /
  Microsoft sign-in popups), real Stripe test-mode checkout, PWA install on a
  real HTTPS origin, or sharing a live preview URL with someone.
- Sandbox is a **shared** environment. A deploy overwrites whatever was there
  before. Coordinate with anyone else who might be using it.

## Prerequisites

- Firebase CLI authenticated as a user with deploy rights on
  `prepaid-ai-sandbox`. Check with `npx firebase projects:list` — the sandbox
  project should be listed.
- Terraform access to read the sandbox outputs (the `tf.mjs` wrapper, used
  below, handles backend init). This is how the build gets the correct
  `VITE_FIREBASE_*` values without committing them.
- Node 22 (see `.nvmrc`).
- **Do not** set `VITE_USE_EMULATORS` for this build. An emulator-mode bundle
  must never be deployed to a hosted project (it would show the dev-login panel
  and target local emulator endpoints).

## Steps

### 1. Pull the sandbox web config

CI normally injects these from GitHub variables. Locally, read them from
Terraform so the bundle points at the sandbox project:

```bash
node scripts/tf.mjs sandbox output -json web_app_config
node scripts/tf.mjs sandbox output -json functions_region
```

`web_app_config` returns `api_key`, `auth_domain`, `project_id`,
`storage_bucket`, `messaging_sender_id`, and `app_id`. `functions_region` is
currently `europe-west4` for sandbox. (These Firebase web config values are
public by design — they are protected by Firestore/Storage rules and Auth.)

### 2. Build the frontend with the sandbox config

Map the Terraform outputs onto the `VITE_FIREBASE_*` env vars (same names CI
uses) and run a normal production build (output goes to `dist/`):

```bash
VITE_FIREBASE_API_KEY="<api_key>" \
VITE_FIREBASE_AUTH_DOMAIN="<auth_domain>" \
VITE_FIREBASE_PROJECT_ID="prepaid-ai-sandbox" \
VITE_FIREBASE_STORAGE_BUCKET="<storage_bucket>" \
VITE_FIREBASE_MESSAGING_SENDER_ID="<messaging_sender_id>" \
VITE_FIREBASE_APP_ID="<app_id>" \
VITE_FUNCTIONS_REGION="europe-west4" \
npm run build
```

On Windows PowerShell, set the variables with `$env:VITE_FIREBASE_API_KEY="..."`
on separate lines (or run the build through the Bash tool / Git Bash).

### 3. Build the Cloud Functions

```bash
npm ci --prefix functions
npm run --prefix functions build
```

### 4. Deploy

```bash
npx firebase deploy \
  --only hosting,functions,firestore:rules,storage \
  --project prepaid-ai-sandbox \
  --force
```

When it finishes you'll get the hosting URL:
**https://prepaid-ai-sandbox.web.app**

## Verify

- Open https://prepaid-ai-sandbox.web.app — the emulator-only **Dev Login**
  panel must **not** appear. If it does, the bundle was built with
  `VITE_USE_EMULATORS=true`; rebuild without it.
- Exercise the flow you changed (e.g. Google/Microsoft sign-in).

## Notes & gotchas

- **You deploy your working tree, not a committed/tested commit.** Unlike the CI
  paths, a local sandbox deploy ships whatever is currently in your working
  directory, with no test gate. Run `npm run build` / tests yourself first if it
  matters.
- **Functions region is `europe-west4` for sandbox** (dev is `europe-west1`).
  The Stripe webhook URL is therefore
  `https://europe-west4-prepaid-ai-sandbox.cloudfunctions.net/stripeWebhook`
  (see [stripe.md](stripe.md)). If functions were previously in another region,
  the deploy will delete and recreate them, causing a brief outage during the
  swap.
- **OAuth providers** (Google/Microsoft/Apple) are configured per-project via
  Terraform, not by this deploy. Enabling a provider on sandbox is a
  `node scripts/tf.mjs sandbox apply` step, and the provider's redirect URI must
  list `https://prepaid-ai-sandbox.firebaseapp.com/__/auth/handler`.
- This deploy does **not** push Secret Manager secrets or run Terraform. Use the
  terraform skill / `tf.mjs` for infrastructure and secrets.
