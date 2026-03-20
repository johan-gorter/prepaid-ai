#!/usr/bin/env node
/**
 * Seeds the Firebase Auth Emulator with a dev user for local development.
 *
 * Usage:
 *   npm run emulators:seed
 *
 * Requires the Firebase emulators to be running first:
 *   npm run services:start -- emulators
 */

import { EMULATOR_URLS, PROJECT_ID } from "./emulator-config.mjs";

const AUTH_URL = EMULATOR_URLS.auth;

export const DEV_USER = {
  email: "dev@prepaid.test",
  password: "dev-password",
  displayName: "Dev User",
};

async function seedDevUser() {
  // Look up existing user and delete if present
  try {
    const lookupRes = await fetch(
      `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fake-api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: [DEV_USER.email] }),
      },
    );
    if (lookupRes.ok) {
      const data = await lookupRes.json();
      const uid = data.users?.[0]?.localId;
      if (uid) {
        await fetch(`${AUTH_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localIds: [uid] }),
        });
      }
    }
  } catch {
    // ignore — user may not exist
  }

  // Create the dev user
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: DEV_USER.email,
        password: DEV_USER.password,
        displayName: DEV_USER.displayName,
        returnSecureToken: true,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Failed to create dev user:", err);
    console.error(
      "\nMake sure the Firebase emulators are running: npm run services:start -- emulators",
    );
    process.exit(1);
  }

  console.log("✅ Dev user created in Auth Emulator:");
  console.log(`   Email:    ${DEV_USER.email}`);
  console.log(`   Password: ${DEV_USER.password}`);
  console.log(
    "\nOpen http://localhost:5174 and use the 'Dev Login' button, or",
  );
  console.log(
    "sign in manually with the credentials above via the login page.",
  );
}

seedDevUser().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
