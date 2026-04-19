# Configuration Variables

This document lists every configuration variable in the project, where it is stored, and where it is consumed.

## Overview

Configuration lives in three places:

| Storage location                  | Committed to git?                | Purpose                                                   |
| --------------------------------- | -------------------------------- | --------------------------------------------------------- |
| `.env` / `.env.emulator` (root)   | `.env` no, `.env.emulator` yes   | Vite build-time variables for the frontend                |
| `terraform/environments/*.tfvars` | `.tfvars` yes, `.auto.tfvars` no | Terraform input variables for infrastructure provisioning |
| GitHub repo settings              | No (stored in GitHub)            | CI build vars (`vars.*`) and deploy secrets (`secrets.*`) |
| GCP Secret Manager                | No (stored in GCP)               | Runtime secrets injected into Cloud Functions by Firebase |

Cloud Functions **do not use `.env` files** for deployed environments. All runtime
config is either derived from the project ID or injected via Secret Manager.

---

## Frontend Variables (Vite / `VITE_*`)

These are baked into the frontend bundle at build time by Vite. They configure the Firebase JS SDK.

| Variable                            | Example value                 | Description                                      |
| ----------------------------------- | ----------------------------- | ------------------------------------------------ |
| `VITE_FIREBASE_API_KEY`             | `AIzaSy...`                   | Firebase Web API key                             |
| `VITE_FIREBASE_AUTH_DOMAIN`         | `project.firebaseapp.com`     | Firebase Auth domain                             |
| `VITE_FIREBASE_PROJECT_ID`          | `prepaid-ai-dev`              | Firebase project ID                              |
| `VITE_FIREBASE_STORAGE_BUCKET`      | `project.firebasestorage.app` | Cloud Storage bucket                             |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `38477299350`                 | FCM sender ID                                    |
| `VITE_FIREBASE_APP_ID`              | `1:384...:web:353...`         | Firebase app ID                                  |
| `VITE_USE_EMULATORS`                | `true`                        | When `true`, connect to local Firebase Emulators |

These values are **public by design** — security comes from Firestore rules and Auth, not from hiding these keys.

### Where each storage location provides them

| Context                                     | Source                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Local dev** (`npm run dev`)               | `.env` file in project root (not committed; copy from `.env.example`)                                       |
| **Emulator mode** (`npm run dev:emulators`) | `.env.emulator` (committed; contains fake values)                                                           |
| **Tests** (Playwright)                      | Hardcoded in `scripts/emulator-config.mjs` → `TEST_FIREBASE_ENV`, injected by Playwright configs            |
| **CI build** (GitHub Actions)               | GitHub repository **variables** (`vars.VITE_FIREBASE_API_KEY_DEV`, etc.) — set in repo Settings → Variables |
| **Production build**                        | Would use production GitHub variables (not yet configured)                                                  |

### Consumed by

- `src/firebase.ts` — reads `import.meta.env.VITE_*` to initialize the Firebase SDK
- `src/firebase.ts` — reads `VITE_USE_EMULATORS` to decide whether to connect to emulators
- Vite build process — inlines the values into the JS bundle

---

## Cloud Functions Runtime Config

Cloud Functions get their configuration from two sources:

1. **Automatic variables** set by Cloud Functions runtime (`GCLOUD_PROJECT`, `FUNCTIONS_EMULATOR`)
2. **Secret Manager secrets** injected via the `secrets` option in function definitions

There are **no manually maintained `.env` files** for deployed environments. Values
that were previously duplicated across `.env` files are now derived at runtime.

### Derived values (no config needed)

| Value                  | How it's derived                                                                    | Used in                                |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| **Environment label**  | `GCLOUD_PROJECT.replace("prepaid-ai-", "")` → `sandbox`, `dev`, `production`        | `beforeCreate.ts` — domain restriction |
| **CORS origins**       | `GCLOUD_PROJECT` → `https://{project}.web.app`, `https://{project}.firebaseapp.com` | `utils.ts` → `chat` function           |
| **Emulator detection** | `FUNCTIONS_EMULATOR === "true"` (set automatically)                                 | `beforeCreate.ts`                      |

### Remaining `.env` variable

| Variable     | Used in    | Description                                                                                                                                      |
| ------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADMIN_UIDS` | `utils.ts` | Comma-separated Firebase Auth UIDs allowed to call `addCredits`. Set in `functions/.env.<project>` only for environments that need admin access. |

---

## GCP Secret Manager Secrets

Managed by Terraform. Injected into Cloud Functions at runtime via the `secrets` option in function definitions. The function code reads them as `process.env.<SECRET_NAME>`.

| Secret           | Terraform resource                            | Value source                    | Used in                               | Description                                                           |
| ---------------- | --------------------------------------------- | ------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `GEMINI_API_KEY` | `google_secret_manager_secret.gemini_api_key` | Manually set in GCP Console     | `ai.ts` (`chat`, `processImpression`) | API key for Google AI Studio; only needed when `AI_BACKEND=google-ai` |
| `AI_BACKEND`     | `google_secret_manager_secret.ai_backend`     | Terraform variable `ai_backend` | `ai.ts` (`chat`, `processImpression`) | Which AI backend to use: `vertex`, `google-ai`, or `dummy`            |
| `AI_REGION`      | `google_secret_manager_secret.ai_region`      | Terraform variable `ai_region`  | `ai.ts` (`chat`, `processImpression`) | GCP region for Vertex AI workloads (e.g. `us-central1`)               |

### IAM bindings (per secret)

Terraform grants these roles so the functions and CI deployer can access the secrets:

- **`roles/secretmanager.secretAccessor`** → default Cloud Functions SA (`<project>@appspot.gserviceaccount.com`) and CI deployer SA
- **`roles/secretmanager.viewer`** → CI deployer SA (needed for `firebase deploy` to validate secret versions)

### Important: no overlap with env vars

Secret names must **not** also appear in `functions/.env.*` files. Cloud Run rejects deploys where the same variable name is defined as both a plain env var and a secret env var.

---

## Terraform Variables

Defined in `terraform/variables.tf` and `terraform/modules/firebase-env/variables.tf`. Values are provided via `.tfvars` files in `terraform/environments/`.

### Committed files (`*.tfvars`)

These contain non-sensitive, environment-specific settings:

| Variable             | Example                          | Description                                                                       |
| -------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `project_id`         | `prepaid-ai-dev`                 | GCP project ID                                                                    |
| `environment`        | `dev`                            | Environment label (`sandbox`, `dev`, `production`)                                |
| `region`             | `europe-west1`                   | GCP region for Cloud Functions and Storage                                        |
| `firestore_location` | `eur3`                           | Firestore multi-region location                                                   |
| `public_url`         | `https://prepaid-ai-dev.web.app` | Primary public URL                                                                |
| `ai_backend`         | `vertex`                         | AI backend (`vertex`, `google-ai`, `dummy`) → stored in Secret Manager            |
| `ai_region`          | `us-central1`                    | GCP region for AI workloads (may differ from `region`) → stored in Secret Manager |

### Secret files (`*.auto.tfvars` — not committed)

These contain OAuth credentials and are git-ignored (`terraform/**/*.auto.tfvars`):

| Variable                        | Description                               |
| ------------------------------- | ----------------------------------------- |
| `google_oauth_client_id`        | Google OAuth 2.0 client ID                |
| `google_oauth_client_secret`    | Google OAuth 2.0 client secret            |
| `microsoft_oauth_client_id`     | Microsoft (Azure AD) client ID (optional) |
| `microsoft_oauth_client_secret` | Microsoft client secret (optional)        |
| `apple_services_id`             | Apple Services ID (optional)              |
| `apple_private_key`             | Apple private key PEM (optional)          |

### State backend

Terraform state is stored in a GCS bucket (`prepaid-ai-terraform-state`) with a per-environment prefix. Switch environments by re-running `terraform init` with the appropriate `-backend-config`:

```powershell
terraform init -reconfigure `
  "-backend-config=bucket=prepaid-ai-terraform-state" `
  "-backend-config=prefix=env/sandbox"    # or env/dev, env/production
```

---

## GitHub Repository Configuration

Set in the GitHub repo under **Settings → Secrets and variables → Actions**.

### Variables (`vars.*`) — not sensitive

Used by the CI build job to inject Firebase config into the Vite build:

| GitHub variable name                    | Maps to                             |
| --------------------------------------- | ----------------------------------- |
| `VITE_FIREBASE_API_KEY_DEV`             | `VITE_FIREBASE_API_KEY`             |
| `VITE_FIREBASE_AUTH_DOMAIN_DEV`         | `VITE_FIREBASE_AUTH_DOMAIN`         |
| `VITE_FIREBASE_PROJECT_ID_DEV`          | `VITE_FIREBASE_PROJECT_ID`          |
| `VITE_FIREBASE_STORAGE_BUCKET_DEV`      | `VITE_FIREBASE_STORAGE_BUCKET`      |
| `VITE_FIREBASE_MESSAGING_SENDER_ID_DEV` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `VITE_FIREBASE_APP_ID_DEV`              | `VITE_FIREBASE_APP_ID`              |

The values come from Terraform output `web_app_config`. Use the sync script to update them automatically:

```bash
# After terraform apply for dev:
node scripts/sync-github-vars.mjs dev

# After terraform apply for production:
node scripts/sync-github-vars.mjs production
```

### Secrets (`secrets.*`) — sensitive

| GitHub secret name             | Description                                                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_DEV` | JSON key for the `ci-deployer` service account in `prepaid-ai-dev`; used by the deploy job to authenticate `firebase deploy` |

---

## How it all connects

```
terraform apply
  ├── Creates GCP project infrastructure (Firestore, Storage, IAM, etc.)
  ├── Creates Secret Manager secrets (GEMINI_API_KEY, AI_BACKEND, AI_REGION)
  ├── Outputs web_app_config values
  │     └── node scripts/sync-github-vars.mjs <env>  →  GitHub vars
  └── Creates ci-deployer service account
        └── JSON key manually stored as GitHub secret (FIREBASE_SERVICE_ACCOUNT_DEV)

CI pipeline (on push to main)
  ├── Build job: GitHub vars → VITE_* env → Vite bundles them into dist/
  ├── Test jobs: hardcoded emulator config (no real credentials needed)
  └── Deploy job: GitHub secret (SA key) → firebase deploy
        ├── Deploys dist/ to Firebase Hosting
        ├── Deploys functions/ to Cloud Functions
        │     ├── Derives ENVIRONMENT and ALLOWED_ORIGINS from GCLOUD_PROJECT
        │     └── Injects Secret Manager secrets (GEMINI_API_KEY, AI_BACKEND, AI_REGION)
        └── Deploys firestore.rules and storage.rules

Local development
  ├── Frontend: .env (from .env.example) → Vite dev server
  ├── Emulator mode: .env.emulator → Vite + Firebase Emulators
  └── Manual deploy: firebase deploy --project <id>
        └── Secrets come from Secret Manager; runtime derives the rest
```
