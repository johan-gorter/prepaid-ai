#!/usr/bin/env node

/**
 * Send a "message" notification to a specific user. The message pops up as a
 * modal in the user's app (NotificationModal.vue) with a Dismiss button.
 *
 * Usage:
 *   node scripts/send-message.mjs <environment> <user-email> <message...>
 *
 * Examples:
 *   node scripts/send-message.mjs emulator   dev@prepaid.test "Welcome to the app!"
 *   node scripts/send-message.mjs sandbox    johan@johangorter.com "Heads up: maintenance tonight."
 *   node scripts/send-message.mjs production user@example.com "Thanks for your purchase."
 *
 * The message text can be one quoted argument or several bare words (they are
 * joined with spaces).
 *
 * Prerequisites:
 *   - emulator:        the Firebase emulators must be running locally.
 *   - sandbox/dev/prod: gcloud auth application-default login, and your account
 *                       must have Firestore write access on the target project
 *                       (enforced by Google Cloud IAM).
 *
 * Notifications are server-write-only (Firestore rules block client writes), so
 * this script writes via the Admin SDK exactly like the Cloud Functions do.
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  EMULATOR_HOST,
  EMULATOR_PORTS,
  PROJECT_ID as EMULATOR_PROJECT_ID,
} from "./emulator-config.mjs";

// ── Environment → project mapping ──────────────────────────────────────────

const ENVIRONMENTS = {
  emulator: EMULATOR_PROJECT_ID,
  sandbox: "prepaid-ai-sandbox",
  dev: "prepaid-ai-dev",
  production: "payasyougo-production",
};

// ── Parse arguments ────────────────────────────────────────────────────────

const [env, email, ...messageParts] = process.argv.slice(2);
const message = messageParts.join(" ").trim();

if (!env || !email || !message) {
  console.error(
    'Usage: node scripts/send-message.mjs <environment> <user-email> <message...>',
  );
  console.error(`  environment: ${Object.keys(ENVIRONMENTS).join(", ")}`);
  process.exit(1);
}

if (!ENVIRONMENTS[env]) {
  console.error(
    `Unknown environment "${env}". Choose from: ${Object.keys(ENVIRONMENTS).join(", ")}`,
  );
  process.exit(1);
}

const projectId = ENVIRONMENTS[env];
const isEmulator = env === "emulator";

// ── Initialize Firebase Admin ──────────────────────────────────────────────
// For the emulator we point the Admin SDK at the local Auth/Firestore
// emulators (no real credentials needed). For real environments we use
// Application Default Credentials and force the quota project to the target.

if (isEmulator) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORTS.auth}`;
  process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORTS.firestore}`;
} else {
  process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
}

const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);

// ── Look up user by email ──────────────────────────────────────────────────

let userRecord;
try {
  userRecord = await auth.getUserByEmail(email);
} catch (err) {
  if (err?.code === "auth/user-not-found") {
    console.error(`No user found with email ${email} in project ${projectId}`);
    process.exit(1);
  }
  console.error(`Failed to look up user ${email} in project ${projectId}:`);
  console.error(`  code:    ${err?.code ?? "(none)"}`);
  console.error(`  message: ${err?.message ?? err}`);
  if (isEmulator) {
    console.error("");
    console.error(
      "Hint: are the Firebase emulators running? Start them with:",
    );
    console.error("  npm -s run services:start emulators");
  } else if (
    /credential|reauth|token|UNAUTHENTICATED|PERMISSION_DENIED/i.test(
      String(err?.message ?? ""),
    )
  ) {
    console.error("");
    console.error(
      "Hint: your Application Default Credentials may be missing or expired.",
    );
    console.error("  Run: gcloud auth application-default login");
    console.error(
      `  And ensure your account has access to project ${projectId}.`,
    );
  }
  process.exit(1);
}

const uid = userRecord.uid;
console.log(`Found user ${email} (uid: ${uid}) in ${env} (${projectId})`);

// ── Write the notification ──────────────────────────────────────────────────

const ref = await db.collection(`users/${uid}/notifications`).add({
  type: "message",
  text: message,
  createdAt: FieldValue.serverTimestamp(),
});

console.log(`Done! Sent message notification ${ref.id} to ${email}:`);
console.log(`  "${message}"`);
