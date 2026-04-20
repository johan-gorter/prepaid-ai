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
| production  | `prepaid-ai-production` | CI on merge to `release/production` | `release/production` |

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

Each environment gets its own state prefix. From the `terraform/` directory:

```powershell
# Dev (has an .auto.tfvars for OAuth secrets — include both)
terraform init `
  "-backend-config=bucket=prepaid-ai-terraform-state" `
  "-backend-config=prefix=env/dev"

terraform plan  "-var-file=environments/dev.tfvars" "-var-file=environments/dev.auto.tfvars"
terraform apply "-var-file=environments/dev.tfvars" "-var-file=environments/dev.auto.tfvars"
```

To switch environments, re-run `terraform init` with a different prefix (Terraform will ask to migrate — say no, it's a separate state):

```powershell
# Production
terraform init -reconfigure `
  "-backend-config=bucket=prepaid-ai-terraform-state" `
  "-backend-config=prefix=env/production"

terraform plan  "-var-file=environments/production.tfvars"
terraform apply "-var-file=environments/production.tfvars"
```

```powershell
# Sandbox (has an .auto.tfvars for OAuth secrets — include both)
terraform init -reconfigure `
  "-backend-config=bucket=prepaid-ai-terraform-state" `
  "-backend-config=prefix=env/sandbox"

terraform plan  "-var-file=environments/sandbox.tfvars" "-var-file=environments/sandbox.auto.tfvars"
terraform apply "-var-file=environments/sandbox.tfvars" "-var-file=environments/sandbox.auto.tfvars"
```

### 5. Set the GEMINI_API_KEY secret value

Terraform creates the secret _container_. You set the actual value once per environment.

Get a key from https://aistudio.google.com/apikey — select the target project when creating it.

```powershell
"your-gemini-api-key" | gcloud secrets versions add GEMINI_API_KEY `
  --project=prepaid-ai-dev `
  --data-file=-
```

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

```powershell
cd terraform

# See what would change
terraform plan "-var-file=environments/dev.tfvars" "-var-file=environments/dev.auto.tfvars"

# Apply changes
terraform apply "-var-file=environments/dev.tfvars" "-var-file=environments/dev.auto.tfvars"

# Read outputs (e.g., for updating CI config)
terraform output web_app_config
terraform output ci_service_account_email
```

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

Terraform creates three Secret Manager secrets and manages their IAM bindings. The function code declares them in the `secrets` option and reads them as `process.env.<SECRET_NAME>` at runtime.

| Secret           | Terraform variable | Description                                                           |
| ---------------- | ------------------ | --------------------------------------------------------------------- |
| `GEMINI_API_KEY` | (manual)           | API key for Google AI Studio; only needed when `AI_BACKEND=google-ai` |
| `AI_BACKEND`     | `ai_backend`       | Which AI backend to use: `vertex`, `google-ai`, or `dummy`            |
| `AI_REGION`      | `ai_region`        | GCP region for Vertex AI workloads (e.g. `us-central1`)               |

`AI_BACKEND` and `AI_REGION` values are set automatically by Terraform from the `.tfvars` file. `GEMINI_API_KEY` must be set manually once per environment:

```powershell
"your-gemini-api-key" | gcloud secrets versions add GEMINI_API_KEY `
  --project=prepaid-ai-dev `
  --data-file=-
```

To deploy functions after changing secrets:

```powershell
firebase deploy --only functions --project prepaid-ai-dev --force
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

Each environment has a **separate GCS state prefix**. You must run `terraform init -reconfigure` with the correct `-backend-config="prefix=env/<env>"` **before** running `plan` or `apply`. Forgetting this will target whatever state was last initialized, potentially planning destructive changes against the wrong project.

The `terraform plan` output always shows the project ID in the resource addresses (e.g., `prepaid-ai-dev` vs `prepaid-ai-sandbox`). **Verify the project in the first few "Refreshing state" lines before approving an apply.**

### gcloud auth expiry

Terraform resources that shell out to `gcloud` (e.g., the `null_resource.storage_cors` provisioner) will fail with an opaque `exit status 1` if gcloud tokens have expired. Re-authenticate with `gcloud auth login` before retrying.
