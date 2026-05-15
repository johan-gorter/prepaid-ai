---
name: terraform
description: "Terraform infrastructure management for payasyougo.app GCP/Firebase environments. Use when: running terraform plan/apply/init/destroy/output, modifying .tf files, editing .tfvars files, managing GCP infrastructure, configuring environments (sandbox/dev/production), managing Secret Manager secrets, pushing secrets, creating or rotating service account keys, debugging terraform errors, working with the tf.mjs wrapper, managing GCS state backend, setting up CORS on Storage buckets, or any IaC (infrastructure as code) task."
argument-hint: "Optional: environment name (sandbox, dev, production) or terraform command"
---

# Terraform Skill

**Always read [docs/terraform.md](../../../docs/terraform.md) before performing any Terraform-related action.**

Load the full reference with:

```
read_file docs/terraform.md
```

This file contains:

- Directory structure and module layout
- Environment matrix (sandbox / dev / production)
- Bootstrap steps (auth, state bucket, project creation, init)
- The `scripts/tf.mjs` wrapper — **always use it instead of raw `terraform` commands**
- Secret Manager workflow (`scripts/push-secrets.mjs`)
- CI service account key export
- Day-to-day plan / apply / output workflow
- What Terraform manages vs. Firebase CLI
- Cloud Functions + Secret Manager integration
- Source control conventions (what's committed, what's gitignored)
- **PowerShell pitfalls** (quoting `-var-file`, line continuation, state isolation, gcloud auth expiry)

## Quick Reference

```bash
# Plan
node scripts/tf.mjs <env> plan

# Apply
node scripts/tf.mjs <env> apply

# Read outputs
node scripts/tf.mjs <env> output web_app_config

# Push secrets from .env
node scripts/push-secrets.mjs .env <env>
```

## Critical Rules

1. **Never call `terraform apply` directly** — use `node scripts/tf.mjs <env> <command>`.
2. **Never run against production without explicit user confirmation.**
3. On PowerShell, wrap flags containing `=` in double quotes (e.g., `"-var-file=..."`). The wrapper handles this automatically.
4. Errors like `exit status 1` can mean the user is not logged in. Ask the user to run `gcloud auth application-default login` and/or `firebase login --reauth` and wait until he confirms.
