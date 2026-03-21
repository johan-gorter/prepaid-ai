#!/usr/bin/env node
/**
 * Clears data from the Firebase Emulators (Firestore and/or Auth).
 *
 * Usage:
 *   npm -s run emulators:clear            # clear both Firestore and Auth
 *   npm -s run emulators:clear:firestore  # clear Firestore only
 *   npm -s run emulators:clear:auth       # clear Auth only
 *
 * Requires the Firebase emulators to be running first:
 *   npm -s run services:start emulators
 */

import { EMULATOR_URLS, PROJECT_ID } from "./emulator-config.mjs";

async function clearFirestore() {
  const res = await fetch(
    `${EMULATOR_URLS.firestore}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  console.log("✅ Firestore data cleared");
}

async function clearAuth() {
  const res = await fetch(
    `${EMULATOR_URLS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: "DELETE", headers: { "Content-Type": "application/json" } },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  console.log("✅ Auth users cleared");
}

const target = process.argv[2]; // "auth", "firestore", or undefined (both)

try {
  if (!target || target === "firestore") await clearFirestore();
  if (!target || target === "auth") await clearAuth();
} catch (err) {
  console.error("❌ Clear failed:", err.message);
  console.error(
    "\nMake sure the Firebase emulators are running: npm -s run services:start emulators",
  );
  process.exit(1);
}
