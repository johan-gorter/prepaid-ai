#!/usr/bin/env node
/**
 * Standalone E2E test runner.
 *
 * Starts Firebase Emulators, waits for them, runs E2E tests, then stops
 * the emulators. No separate terminal needed.
 *
 * Usage:
 *   npm run test:e2e:standalone
 *   npm run test:e2e:standalone -- --headed
 *   npm run test:e2e:standalone -- e2e/specs/home.spec.ts
 */

import { execSync, spawn } from "node:child_process";
import { EMULATOR_URLS, PROJECT_ID } from "./emulator-config.mjs";

const TIMEOUT_S = 30;
const RETRY_DELAY_MS = 1000;
const PLAYWRIGHT_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";
const EMULATOR_START_COMMAND = `npx firebase emulators:start --project ${PROJECT_ID}`;

// Pass through extra args to Playwright (e.g. --headed, specific test files)
const playwrightArgs = process.argv.slice(2);

let emulatorProcess;

function cleanup() {
  if (emulatorProcess && !emulatorProcess.killed) {
    console.log("\nStopping emulators...");
    emulatorProcess.kill("SIGTERM");
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

async function waitForEmulators() {
  for (let i = 0; i < TIMEOUT_S; i++) {
    try {
      const res = await fetch(EMULATOR_URLS.ui);
      if (res.ok) {
        console.log("Firebase emulators are ready");
        return;
      }
    } catch {
      // Not ready yet
    }
    if (i > 0 && i % 5 === 0) {
      console.log(`Waiting for emulators... (${i}s)`);
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  throw new Error(`Emulators did not start within ${TIMEOUT_S}s`);
}

// Start emulators in background
console.log("Starting Firebase Emulators...");
emulatorProcess = spawn(EMULATOR_START_COMMAND, {
  stdio: "pipe",
  shell: true,
});

emulatorProcess.stdout.on("data", (data) => {
  const line = data.toString();
  if (line.includes("Error") || line.includes("error")) {
    process.stderr.write(line);
  }
});
emulatorProcess.stderr.on("data", (data) => {
  process.stderr.write(data);
});

try {
  await waitForEmulators();

  console.log("\nRunning E2E tests...\n");
  const cmd = [
    PLAYWRIGHT_COMMAND,
    "playwright",
    "test",
    "--config=playwright.config.ts",
    ...playwrightArgs,
  ].join(" ");
  execSync(cmd, { stdio: "inherit" });

  console.log("\n✅ E2E tests passed!");
  cleanup();
  process.exit(0);
} catch (err) {
  if (err.status !== undefined) {
    // execSync failure — test exit code
    console.error("\n❌ E2E tests failed");
    cleanup();
    process.exit(err.status);
  }
  console.error("❌", err.message);
  cleanup();
  process.exit(1);
}
