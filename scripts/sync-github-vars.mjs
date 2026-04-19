#!/usr/bin/env node
/**
 * Sync Terraform outputs to GitHub repository variables.
 *
 * Usage:
 *   node scripts/sync-github-vars.mjs <env>   # env = dev | production
 *
 * Prerequisites:
 *   - `gh` CLI authenticated with repo access
 *   - Terraform initialized for the target environment
 *     (cd terraform && terraform init -reconfigure -backend-config=...)
 *
 * What it does:
 *   1. Reads `terraform output -json` from the terraform/ directory
 *   2. Maps web_app_config values to VITE_FIREBASE_*_<ENV> GitHub variables
 *   3. Sets each variable via `gh variable set`
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const terraformDir = resolve(__dirname, "..", "terraform");

const ENVS = ["dev", "production"];

function usage() {
  console.error("Usage: node scripts/sync-github-vars.mjs <env>");
  console.error(`  env: ${ENVS.join(" | ")}`);
  process.exit(1);
}

const env = process.argv[2];
if (!env || !ENVS.includes(env)) usage();

const suffix = env.toUpperCase(); // DEV or PRODUCTION

// 1. Read Terraform outputs
console.log(`Reading Terraform outputs from ${terraformDir} ...`);
let outputs;
try {
  const raw = execSync("terraform output -json", {
    cwd: terraformDir,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  outputs = JSON.parse(raw);
} catch (err) {
  console.error(
    "Failed to read Terraform outputs. Make sure Terraform is initialized",
  );
  console.error(`for the ${env} environment (see docs/terraform.md).`);
  console.error(err.message);
  process.exit(1);
}

// 2. Extract web_app_config
const config = outputs.web_app_config?.value;
if (!config) {
  console.error("Terraform output 'web_app_config' not found.");
  process.exit(1);
}

// 3. Map to GitHub variable names
const vars = {
  [`VITE_FIREBASE_API_KEY_${suffix}`]: config.api_key,
  [`VITE_FIREBASE_AUTH_DOMAIN_${suffix}`]: config.auth_domain,
  [`VITE_FIREBASE_PROJECT_ID_${suffix}`]: config.project_id,
  [`VITE_FIREBASE_STORAGE_BUCKET_${suffix}`]: config.storage_bucket,
  [`VITE_FIREBASE_MESSAGING_SENDER_ID_${suffix}`]: config.messaging_sender_id,
  [`VITE_FIREBASE_APP_ID_${suffix}`]: config.app_id,
};

// 4. Set each variable
console.log(`\nSetting GitHub variables for ${env}:\n`);
let errors = 0;
for (const [name, value] of Object.entries(vars)) {
  try {
    execSync(`gh variable set ${name} --body "${value}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(`  ✔ ${name} = ${value}`);
  } catch (err) {
    console.error(`  ✘ ${name}: ${err.message}`);
    errors++;
  }
}

console.log(
  errors === 0
    ? "\nAll variables synced successfully."
    : `\n${errors} variable(s) failed to sync.`,
);
process.exit(errors > 0 ? 1 : 0);
