# Terraform — Multi-Environment Firebase Infrastructure

Terraform manages GCP/Firebase **infrastructure** (projects, databases, buckets, secrets, IAM). The Firebase CLI still handles **application deployments** (hosting, functions code, security rules).

## Directory Structure

```
terraform/
  versions.tf          # Provider versions + GCS backend declaration
  main.tf              # Provider config + module instantiation
  variables.tf         # Root input variables
  outputs.tf           # Exported values (web app config, service account, etc.)
  environments/        # One .tfvars file per environment
    sandbox.tfvars
    dev.tfvars
    production.tfvars
  modules/
    firebase-env/      # Reusable module: APIs, Firebase, Firestore, Storage, Secrets, IAM
      main.tf
      variables.tf
      outputs.tf
```

## Environments

| Environment | Project ID              | Deployed by                         | Branch               |
| ----------- | ----------------------- | ----------------------------------- | -------------------- |
| sandbox     | `prepaid-ai-sandbox`    | Manual / local dev                  | —                    |
| dev         | `prepaid-ai-dev`        | CI on merge to `main`               | `main`               |
| production  | `payasyougo-production` | CI on merge to `release/production` | `release/production` |

## Prerequisites

1. **Install Terraform** (>= 1.5): https://developer.hashicorp.com/terraform/install
2. **Install gcloud CLI**: https://cloud.google.com/sdk/docs/install
3. **GCP permissions**: You need Owner or Editor on each target project, plus `storage.admin` on `prepaid-ai-infra` (the state bucket project).

## Bootstrap (one-time setup)

### 1. Authenticate

```bash
gcloud auth login
gcloud auth application-default login
```

### 2. Create the state bucket

Create a dedicated project to host shared infrastructure (state bucket, etc.):

```bash
gcloud projects create prepaid-ai-infra --name="payasyougo.app Infra"
gcloud billing projects link prepaid-ai-infra --billing-account=YOUR_BILLING_ACCOUNT_ID

gcloud storage buckets create gs://prepaid-ai-terraform-state \
  --project=prepaid-ai-infra \
  --location=europe-west1 \
  --uniform-bucket-level-access
```

Enable versioning so you can recover from state corruption:

```bash
gcloud storage buckets update gs://prepaid-ai-terraform-state --versioning
```

### 3. Create any new GCP projects

If `prepaid-ai-dev` doesn't exist yet:

```bash
gcloud projects create prepaid-ai-dev --name="payasyougo.app Dev"
gcloud billing projects link prepaid-ai-dev --billing-account=YOUR_BILLING_ACCOUNT_ID
```

Find your billing account ID with `gcloud billing accounts list`.

### 4. Initialize Terraform (per environment)

Use the `tf.mjs` wrapper for every Terraform invocation. It takes the env name as its single source of truth and:

1. Runs `terraform init -reconfigure` with `-backend-config=prefix=env/<env>`.
2. Reads back `terraform/.terraform/terraform.tfstate` and aborts if the recorded bucket/prefix don't match the requested env.
3. Runs the requested command, auto-appending `-var-file=environments/<env>.tfvars` (and `<env>.auto.tfvars` if it exists) for plan/apply/destroy/refresh.

```bash
node scripts/tf.mjs dev plan
node scripts/tf.mjs dev apply

node scripts/tf.mjs production plan
node scripts/tf.mjs production apply

node scripts/tf.mjs sandbox plan
node scripts/tf.mjs sandbox apply
```

You should not need to invoke `terraform` directly. If you do, the cross-variable `validation` block on `var.project_id` in `terraform/variables.tf` is the second line of defense: it asserts that the environment label matches the project ID and aborts with a clear error if you mix `-var-file` with the wrong backend prefix. This catches the apply-against-wrong-project case before any state is refreshed.

### 5. Set secret values

Terraform creates the secret _containers_ but never writes the actual values. Populate them using the `push-secrets` script, which reads from your local (gitignored) `.env` file and writes each value to a temp file before calling `gcloud` — avoiding the trailing-newline pitfall of `Read-Host` piping.

Add the secrets you need to your `.env` file:

```ini
# .env  (gitignored)
GEMINI_API_KEY=AIza...          # from https://aistudio.google.com/apikey
STRIPE_SECRET_KEY=sk_test_...   # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_... # from Stripe Dashboard → Webhooks → endpoint
```

Then push to the target environment:

```powershell
node scripts/push-secrets.mjs .env sandbox
# or: node scripts/push-secrets.mjs .env dev
# or: node scripts/push-secrets.mjs .env production
```

The script skips any key not present in the file, so you can push a partial set safely. See [docs/stripe.md](stripe.md) for the full Stripe setup sequence.

### 6. Export CI service account key

After `terraform apply`, create a key for the CI deployer:

```powershell
$SA_EMAIL = terraform output -raw ci_service_account_email

gcloud iam service-accounts keys create sa-key.json `
  "--iam-account=$SA_EMAIL" `
  --project=prepaid-ai-dev
```

Store the contents of `sa-key.json` as a GitHub Actions secret (e.g., `FIREBASE_SERVICE_ACCOUNT_DEV`). Then delete the local file:

```powershell
Remove-Item sa-key.json
```

### 7. Update GitHub Actions variables

Read the web app config from Terraform output:

```powershell
terraform output web_app_config
```

Set the corresponding `VITE_FIREBASE_*` variables in GitHub repo settings for each environment.

## Day-to-Day Usage

Always go through `scripts/tf.mjs <env> <command>`:

```bash
# See what would change
node scripts/tf.mjs dev plan

# Apply changes
node scripts/tf.mjs dev apply

# Read outputs (e.g., for updating CI config)
node scripts/tf.mjs dev output web_app_config
node scripts/tf.mjs dev output ci_service_account_email
```

Any extra args after the command are passed through to Terraform, e.g. `node scripts/tf.mjs dev plan -target=module.firebase_env.google_firestore_database.default`.

## Storage CORS

`terraform apply` automatically sets a CORS policy on the Firebase Storage bucket so the web app (and its service worker) can fetch images cross-origin. The policy lives in `modules/firebase-env/cors.json` and allows `GET`/`HEAD` from any origin — actual access control is enforced by Firebase Security Rules and the token in each download URL.

To apply CORS manually without a full `terraform apply`:

```powershell
gcloud storage buckets update gs://prepaid-ai-dev.firebasestorage.app "--cors-file=modules/firebase-env/cors.json"
```

## What Terraform Manages vs. Firebase CLI

| Managed by Terraform        | Managed by Firebase CLI      |
| --------------------------- | ---------------------------- |
| GCP API enablement          | Hosting deployment (`dist/`) |
| Firebase project + web app  | Cloud Functions code         |
| Firestore database instance | Firestore security rules     |
| Firebase Storage bucket     | Storage security rules       |
| Storage bucket CORS policy  |                              |
| Secret Manager secrets      |                              |
| CI service account + IAM    |                              |

## Cloud Functions + Secret Manager

Terraform creates Secret Manager secrets and manages their IAM bindings. The function code declares them in the `secrets` option and reads them as `process.env.<SECRET_NAME>` at runtime.

| Secret                  | Set by    | Description                                                            |
| ----------------------- | --------- | ---------------------------------------------------------------------- |
| `GEMINI_API_KEY`        | manual    | API key for Google AI Studio; only needed when `AI_BACKEND=google-ai`  |
| `AI_BACKEND`            | Terraform | Which AI backend to use: `vertex`, `google-ai`, or `dummy`             |
| `AI_REGION`             | Terraform | GCP region for Vertex AI workloads (e.g. `us-central1`)                |
| `STRIPE_BACKEND`        | Terraform | `"stripe"` for real Stripe Checkout, `"dummy"` to skip Stripe entirely |
| `STRIPE_SECRET_KEY`     | manual    | Stripe secret key (`sk_test_...` or `sk_live_...`)                     |
| `STRIPE_WEBHOOK_SECRET` | manual    | Stripe webhook signing secret (`whsec_...`)                            |

`AI_BACKEND`, `AI_REGION`, and `STRIPE_BACKEND` are set automatically by Terraform from the `.tfvars` file. The remaining three must be set manually using the `push-secrets` script — see step 5 above.

To deploy functions after changing secrets:

```powershell
firebase deploy --only functions --project prepaid-ai-dev
```

### Cloud Functions environment variables

Most runtime config is either derived from the project ID at runtime or injected via Secret Manager. The only remaining `.env` file variable is:

| Variable     | Description                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ADMIN_UIDS` | Comma-separated Firebase Auth UIDs allowed to call `addCredits`. Set in `functions/.env.<project>` only for environments that need admin access. |

| File                                 | Picked up when deploying to    |
| ------------------------------------ | ------------------------------ |
| `functions/.env.prepaid-ai-sandbox`  | `--project prepaid-ai-sandbox` |
| `functions/.env.prepaid-ai-dev`      | `--project prepaid-ai-dev`     |
| `functions/.env.prepaid-ai-emulator` | Emulator Suite                 |

Firebase Functions v2 loads the matching `.env.<projectId>` file automatically at deploy time.

## Source Control

| File                              | In git? | Notes                                            |
| --------------------------------- | ------- | ------------------------------------------------ |
| `terraform/*.tf`                  | Yes     | Infrastructure as code                           |
| `terraform/environments/*.tfvars` | Yes     | No secrets — just project IDs and regions        |
| `terraform/.terraform/`           | No      | Local provider cache (like `node_modules/`)      |
| `terraform/.terraform.lock.hcl`   | Yes     | Provider version lock (like `package-lock.json`) |
| `terraform.tfstate`               | No      | Stored in GCS backend, never local               |
| `*.auto.tfvars`                   | No      | Gitignored, for local secret overrides           |

## PowerShell Pitfalls (for AI agents and developers)

This project is developed on Windows with PowerShell as the default shell. Terraform CLI arguments with `=` are frequently misinterpreted by PowerShell.

### Quoting `-var-file` and `-backend-config`

PowerShell treats bare `-var-file=path` as **two separate tokens** (`-var-file` and `=path`), causing `Error: Too many command line arguments`. Always wrap the entire flag in double quotes:

```powershell
# WRONG — PowerShell splits on the =
terraform plan -var-file=environments/sandbox.tfvars

# CORRECT
terraform plan "-var-file=environments/sandbox.tfvars"
```

The same applies to `-backend-config`:

```powershell
terraform init -reconfigure `
  "-backend-config=bucket=prepaid-ai-terraform-state" `
  "-backend-config=prefix=env/sandbox"
```

### Line continuation

PowerShell uses the backtick (`` ` ``) for line continuation, not backslash (`\`). A trailing backslash is a valid path character on Windows and will not continue the command.

### State isolation

Each environment has a **separate GCS state prefix**. The `scripts/tf.mjs` wrapper handles `init -reconfigure` with the correct `-backend-config="prefix=env/<env>"` and verifies the result before running any command — use it instead of calling `terraform` directly. If you do bypass the wrapper, the `validation` block on `var.project_id` will still catch a tfvars/backend mismatch, but the wrapper is what guarantees the backend prefix itself is correct.

### gcloud auth expiry

Terraform resources that shell out to `gcloud` (e.g., the `null_resource.storage_cors` provisioner) will fail with an opaque `exit status 1` if gcloud tokens have expired. Re-authenticate with `gcloud auth login` before retrying.
