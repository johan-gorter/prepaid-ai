#!/usr/bin/env node

/**
 * Add credits to a user's balance.
 *
 * Usage:
 *   node devtools/add-credits.mjs <environment> <user-email> <amount>
 *
 * Examples:
 *   node devtools/add-credits.mjs sandbox johan@johangorter.com 100
 *   node devtools/add-credits.mjs production user@example.com 50
 *
 * Prerequisites:
 *   gcloud auth application-default login
 *
 * The caller must have Firestore write access on the target project.
 * This is enforced by Google Cloud IAM — only project admins / editors
 * can run this script successfully.
 */

import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// ── Environment → project mapping ──────────────────────────────────────────

const ENVIRONMENTS = {
  sandbox: "prepaid-ai-sandbox",
  dev: "prepaid-ai-dev",
  production: "prepaid-ai-production",
};

// ── Parse arguments ────────────────────────────────────────────────────────

const [env, email, amountStr] = process.argv.slice(2);

if (!env || !email || !amountStr) {
  console.error(
    "Usage: node devtools/add-credits.mjs <environment> <user-email> <amount>",
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

const amount = Number(amountStr);
if (!Number.isInteger(amount) || amount <= 0) {
  console.error("amount must be a positive integer");
  process.exit(1);
}

const projectId = ENVIRONMENTS[env];

// ── Initialize Firebase Admin (uses Application Default Credentials) ───────
// Force the quota project to the target so API calls (Auth, Firestore) hit
// the correct project even if ADC defaults to a different one.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;

const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);

// ── Look up user by email ──────────────────────────────────────────────────

let userRecord;
try {
  userRecord = await auth.getUserByEmail(email);
} catch (err) {
  console.error(`No user found with email ${email} in project ${projectId}`);
  process.exit(1);
}

const uid = userRecord.uid;
console.log(`Found user ${email} (uid: ${uid}) in ${env} (${projectId})`);

// ── Add credits in a Firestore transaction ─────────────────────────────────

const userRef = db.doc(`users/${uid}`);
const txnCollection = db.collection(`users/${uid}/balanceTransactions`);

const newBalance = await db.runTransaction(async (txn) => {
  const snap = await txn.get(userRef);
  if (!snap.exists) {
    throw new Error(`User document users/${uid} does not exist in Firestore`);
  }
  const currentBalance = snap.data()?.balance ?? 0;
  const updatedBalance = currentBalance + amount;

  txn.set(txnCollection.doc(), {
    reasonKey: "admin_adjustment",
    amount,
    balanceAfter: updatedBalance,
    createdAt: FieldValue.serverTimestamp(),
  });
  txn.update(userRef, { balance: updatedBalance });

  return updatedBalance;
});

console.log(`Done! ${email} now has ${newBalance} credits (+${amount}).`);
