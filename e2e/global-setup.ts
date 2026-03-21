/**
 * Playwright global setup.
 *
 * Runs once before all tests:
 * 1. Waits for Firebase emulators to be ready
 */

import { EMULATOR_URLS } from "./helpers/emulator-config";

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 1000;

async function waitForEmulators(): Promise<void> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const res = await fetch(EMULATOR_URLS.ui);
      if (res.ok) {
        console.log("Firebase emulators are ready");
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  throw new Error(
    `Firebase emulators did not start within ${MAX_RETRIES}s. ` +
      `Make sure to run: npm -s run services:start emulators`,
  );
}

export default async function globalSetup(): Promise<void> {
  await waitForEmulators();
  console.log("Global setup complete: emulators ready");
}
