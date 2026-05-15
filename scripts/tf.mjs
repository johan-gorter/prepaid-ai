#!/usr/bin/env node
/**
 * Terraform wrapper that pins the GCS backend prefix and tfvars to a single
 * environment argument, so plan/apply cannot be run against the wrong project
 * by mistake.
 *
 * Usage:
 *   node scripts/tf.mjs <sandbox|dev|production> <terraform-command> [extra args]
 *
 * Examples:
 *   node scripts/tf.mjs dev plan
 *   node scripts/tf.mjs dev apply
 *   node scripts/tf.mjs production plan
 *   node scripts/tf.mjs sandbox output web_app_config
 *   node scripts/tf.mjs dev state list
 *
 * What it does, in order:
 *   1. Resolves the env to its state-bucket prefix and tfvars files.
 *   2. Runs `terraform init -reconfigure` with the matching -backend-config.
 *   3. Reads terraform/.terraform/terraform.tfstate and verifies the backend
 *      bucket + prefix in it match what we asked for. Aborts on mismatch.
 *   4. Runs the requested terraform command. For plan/apply/destroy/refresh
 *      the matching -var-file flags are appended automatically.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const terraformDir = resolve(repoRoot, "terraform");

const STATE_BUCKET = "prepaid-ai-terraform-state";

const ENVS = {
  sandbox: { project: "prepaid-ai-sandbox" },
  dev: { project: "prepaid-ai-dev" },
  production: { project: "payasyougo-production" },
};

// Terraform commands that consume -var-file. For anything else we don't
// inject tfvars (e.g. `output`, `state`, `fmt`, `validate`, `console`).
const VAR_FILE_COMMANDS = new Set([
  "plan",
  "apply",
  "destroy",
  "refresh",
  "import",
  "console",
]);

const usage = `Usage: node scripts/tf.mjs <${Object.keys(ENVS).join("|")}> <terraform-command> [extra args]`;

const [envArg, command, ...extraArgs] = process.argv.slice(2);

if (!envArg || !command || !ENVS[envArg]) {
  console.error(usage);
  process.exit(1);
}

const env = ENVS[envArg];
const expectedPrefix = `env/${envArg}`;

function runTerraform(args) {
  execFileSync("terraform", args, {
    cwd: terraformDir,
    // shell:true is required on Windows where terraform may be terraform.exe
    // resolved through PATHEXT.
    shell: true,
    stdio: "inherit",
  });
}

// --- Step 1: init -reconfigure with the matching backend prefix --------------

console.log(`\n→ terraform init -reconfigure (bucket=${STATE_BUCKET}, prefix=${expectedPrefix})\n`);

try {
  runTerraform([
    "init",
    "-reconfigure",
    `-backend-config=bucket=${STATE_BUCKET}`,
    `-backend-config=prefix=${expectedPrefix}`,
  ]);
} catch {
  console.error(`\n✗ terraform init failed. Re-authenticate with 'gcloud auth application-default login' and try again.`);
  process.exit(1);
}

// --- Step 2: verify the initialized backend matches what we asked for --------

const backendStateFile = resolve(terraformDir, ".terraform", "terraform.tfstate");

if (!existsSync(backendStateFile)) {
  console.error(`\n✗ Expected ${backendStateFile} after init but it is missing.`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(backendStateFile, "utf8"));
} catch (err) {
  console.error(`\n✗ Failed to parse ${backendStateFile}: ${err.message}`);
  process.exit(1);
}

const actualBucket = parsed?.backend?.config?.bucket;
const actualPrefix = parsed?.backend?.config?.prefix;

if (actualBucket !== STATE_BUCKET || actualPrefix !== expectedPrefix) {
  console.error(
    `\n✗ Backend verification failed.\n` +
      `    expected: bucket=${STATE_BUCKET}  prefix=${expectedPrefix}\n` +
      `    actual:   bucket=${actualBucket}  prefix=${actualPrefix}\n` +
      `  The local .terraform metadata does not match the requested environment.\n` +
      `  Delete terraform/.terraform/ and re-run this script.`,
  );
  process.exit(1);
}

console.log(`✓ Backend verified: bucket=${actualBucket}, prefix=${actualPrefix}`);

// --- Step 3: run the requested terraform command -----------------------------

const args = [command];

if (VAR_FILE_COMMANDS.has(command)) {
  const tfvars = resolve(terraformDir, "environments", `${envArg}.tfvars`);
  const autoTfvars = resolve(terraformDir, "environments", `${envArg}.auto.tfvars`);

  if (!existsSync(tfvars)) {
    console.error(`\n✗ Missing tfvars file: ${tfvars}`);
    process.exit(1);
  }

  args.push(`-var-file=environments/${envArg}.tfvars`);
  if (existsSync(autoTfvars)) {
    args.push(`-var-file=environments/${envArg}.auto.tfvars`);
  }
}

args.push(...extraArgs);

console.log(`\n→ terraform ${args.join(" ")}\n`);

try {
  runTerraform(args);
} catch {
  // terraform already printed its error; exit non-zero to propagate.
  process.exit(1);
}
