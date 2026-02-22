#!/usr/bin/env node
/**
 * Waits for Firebase Emulators to become ready.
 *
 * Usage:
 *   node scripts/wait-for-emulators.mjs          # wait up to 30s
 *   node scripts/wait-for-emulators.mjs --timeout 60  # wait up to 60s
 *
 * Exits 0 when emulators are ready, 1 on timeout.
 */

import { EMULATOR_URLS } from "./emulator-config.mjs";

const DEFAULT_TIMEOUT_S = 30;
const RETRY_DELAY_MS = 1000;

function parseTimeout() {
  const idx = process.argv.indexOf("--timeout");
  if (idx !== -1 && process.argv[idx + 1]) {
    return parseInt(process.argv[idx + 1], 10);
  }
  return DEFAULT_TIMEOUT_S;
}

const timeoutS = parseTimeout();

for (let i = 0; i < timeoutS; i++) {
  try {
    const res = await fetch(EMULATOR_URLS.ui);
    if (res.ok) {
      console.log("Firebase emulators are ready");
      process.exit(0);
    }
  } catch {
    // Not ready yet
  }
  if (i > 0 && i % 5 === 0) {
    console.log(`Waiting for emulators... (${i}s)`);
  }
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
}

console.error(
  `Firebase emulators did not start within ${timeoutS}s.\n` +
    `Make sure to run: npm run emulators`,
);
process.exit(1);
