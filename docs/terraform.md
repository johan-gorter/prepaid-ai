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
gcloud projects create prepaid-ai-infra --name="Prepaid AI Infra"
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
gcloud projects create prepaid-ai-dev --name="Prepaid AI Dev"
gcloud billing projects link prepaid-ai-dev --billing-account=YOUR_BILLING_ACCOUNT_ID
```

Find your billing account ID with `gcloud billing accounts list`.

### 4. Initialize Terraform (per environment)

Each environment gets its own state prefix. From the `terraform/` directory:

```bash
# Dev
terraform init \
  -backend-config="bucket=prepaid-ai-terraform-state" \
  -backend-config="prefix=env/dev"

terraform plan  -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

To switch environments, re-run `terraform init` with a different prefix (Terraform will ask to migrate — say no, it's a separate state):

```bash
# Production
terraform init -reconfigure \
  -backend-config="bucket=prepaid-ai-terraform-state" \
  -backend-config="prefix=env/production"

terraform plan  -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

```bash
# Sandbox
terraform init -reconfigure \
  -backend-config="bucket=prepaid-ai-terraform-state" \
  -backend-config="prefix=env/sandbox"

terraform plan  -var-file=environments/sandbox.tfvars
terraform apply -var-file=environments/sandbox.tfvars
```

### 5. Set the GEMINI_API_KEY secret value

Terraform creates the secret _container_. You set the actual value once per environment.

Get a key from https://aistudio.google.com/apikey — select the target project when creating it.

```bash
echo -n "your-gemini-api-key" | gcloud secrets versions add GEMINI_API_KEY \
  --project=prepaid-ai-dev \
  --data-file=-
```

### 6. Export CI service account key

After `terraform apply`, create a key for the CI deployer:

```bash
SA_EMAIL=$(terraform output -raw ci_service_account_email)

gcloud iam service-accounts keys create sa-key.json \
  --iam-account="$SA_EMAIL" \
  --project=prepaid-ai-dev
```

Store the contents of `sa-key.json` as a GitHub Actions secret (e.g., `FIREBASE_SERVICE_ACCOUNT_DEV`). Then delete the local file:

```bash
rm sa-key.json
```

### 7. Update GitHub Actions variables

Read the web app config from Terraform output:

```bash
terraform output web_app_config
```

Set the corresponding `VITE_FIREBASE_*` variables in GitHub repo settings for each environment.

## Day-to-Day Usage

```bash
cd terraform

# See what would change
terraform plan -var-file=environments/dev.tfvars

# Apply changes
terraform apply -var-file=environments/dev.tfvars

# Read outputs (e.g., for updating CI config)
terraform output web_app_config
terraform output ci_service_account_email
```

## What Terraform Manages vs. Firebase CLI

| Managed by Terraform        | Managed by Firebase CLI      |
| --------------------------- | ---------------------------- |
| GCP API enablement          | Hosting deployment (`dist/`) |
| Firebase project + web app  | Cloud Functions code         |
| Firestore database instance | Firestore security rules     |
| Firebase Storage bucket     | Storage security rules       |
| Secret Manager secrets      |                              |
| CI service account + IAM    |                              |

## Cloud Functions + Secret Manager

To wire `GEMINI_API_KEY` from Secret Manager into Cloud Functions, deploy with:

```bash
firebase deploy --only functions --project prepaid-ai-dev \
  --force
```

In your function code, read the secret at runtime using the Secret Manager client library, or configure the function to mount the secret as an environment variable via `firebase.json` or the `defineSecret()` API in Firebase Functions v2.

## Source Control

| File                              | In git? | Notes                                            |
| --------------------------------- | ------- | ------------------------------------------------ |
| `terraform/*.tf`                  | Yes     | Infrastructure as code                           |
| `terraform/environments/*.tfvars` | Yes     | No secrets — just project IDs and regions        |
| `terraform/.terraform/`           | No      | Local provider cache (like `node_modules/`)      |
| `terraform/.terraform.lock.hcl`   | Yes     | Provider version lock (like `package-lock.json`) |
| `terraform.tfstate`               | No      | Stored in GCS backend, never local               |
| `*.auto.tfvars`                   | No      | Gitignored, for local secret overrides           |
