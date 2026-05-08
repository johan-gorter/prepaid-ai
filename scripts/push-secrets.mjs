#!/usr/bin/env node
/**
 * Pushes secrets from a local env file to GCP Secret Manager.
 *
 * Reads the specified env file, then calls `gcloud secrets versions add` for
 * each recognised key that is present in the file. Values are written to a
 * temp file before being passed to gcloud so that no trailing newline is
 * included (a common pitfall with Read-Host piping).
 *
 * Usage:
 *   node scripts/push-secrets.mjs <envFile> <sandbox|dev|production>
 *   node scripts/push-secrets.mjs .env sandbox
 *   node scripts/push-secrets.mjs .env.sandbox sandbox
 *
 * Secret file format:
 *   STRIPE_SECRET_KEY=sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 *   GEMINI_API_KEY=AIza...
 *
 * Lines starting with # are ignored. Values may be optionally quoted.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENV_TO_PROJECT = {
  sandbox: "prepaid-ai-sandbox",
  dev: "prepaid-ai-dev",
  production: "payasyougo-production",
};

// Secrets recognised by this script. Add new ones here as needed.
const KNOWN_SECRETS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GEMINI_API_KEY",
];

const usage = `Usage: node scripts/push-secrets.mjs <envFile> <${Object.keys(ENV_TO_PROJECT).join("|")}>`;

const [envFileArg, envArg] = process.argv.slice(2);
if (!envFileArg || !envArg || !ENV_TO_PROJECT[envArg]) {
  console.error(usage);
  process.exit(1);
}

const project = ENV_TO_PROJECT[envArg];
const envFile = resolve(__dirname, "..", envFileArg);

if (!existsSync(envFile)) {
  console.error(`\nFile not found: ${envFile}\n`);
  process.exit(1);
}

/** Parse a .env file into a plain object, stripping comments and optional quotes. */
function parseEnvFile(path) {
  const vars = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const vars = parseEnvFile(envFile);

console.log(`\nPushing secrets to project ${project} from ${envFile}\n`);

let pushed = 0;
let skipped = 0;

for (const key of KNOWN_SECRETS) {
  const value = vars[key];
  if (!value) {
    console.log(`  skip  ${key}  (not in file)`);
    skipped++;
    continue;
  }

  // Write the exact bytes to a temp file — avoids any shell newline injection.
  const tmp = resolve(tmpdir(), `gcp-secret-${key}-${Date.now()}.tmp`);
  writeFileSync(tmp, value, { encoding: "utf8" });

  try {
    execFileSync(
      "gcloud",
      [
        "secrets",
        "versions",
        "add",
        key,
        `--data-file=${tmp}`,
        `--project=${project}`,
      ],
      // shell:true is required on Windows where gcloud is gcloud.cmd
      { shell: true, stdio: ["ignore", "inherit", "inherit"] },
    );
    console.log(`  ✓     ${key}`);
    pushed++;
  } catch {
    console.error(`  ✗     ${key}  (gcloud error above)`);
  } finally {
    unlinkSync(tmp);
  }
}

console.log(`\nDone: ${pushed} pushed, ${skipped} skipped.\n`);
