/**
 * Test utilities for Firebase Auth Emulator.
 *
 * Uses the Auth Emulator REST API to create a test user
 * and obtain an ID token, which is then signed in via
 * the Firebase client SDK on the page.
 */

import type { Page } from "@playwright/test";

const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
const PROJECT_ID = "prepaid-ai-test";

export const TEST_USER = {
  uid: "test-user-001",
  email: "testuser@prepaid.test",
  displayName: "Test User",
  password: "test-password-123",
};

interface EmulatorSignInResponse {
  idToken: string;
  refreshToken: string;
  localId: string;
}

/**
 * Create a test user in the Auth Emulator via REST API.
 * Idempotent — deletes existing user first if present.
 */
export async function createTestUser(): Promise<void> {
  // Delete user if exists (ignore errors)
  try {
    await fetch(
      `${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localIds: [TEST_USER.uid] }),
      },
    );
  } catch {
    // Ignore — user may not exist
  }

  // Create user via the emulator's signUp endpoint
  const signUpRes = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
        displayName: TEST_USER.displayName,
        returnSecureToken: true,
      }),
    },
  );

  if (!signUpRes.ok) {
    const err = await signUpRes.text();
    throw new Error(`Failed to create test user: ${err}`);
  }
}

/**
 * Get an ID token for the test user via the Auth Emulator.
 */
export async function getTestUserToken(): Promise<string> {
  const res = await fetch(
    `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_USER.email,
        password: TEST_USER.password,
        returnSecureToken: true,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to sign in test user: ${err}`);
  }

  const data = (await res.json()) as EmulatorSignInResponse;
  return data.idToken;
}

/**
 * Sign in the test user on a Playwright page by executing
 * Firebase signInWithCustomToken in the browser context.
 *
 * Call this AFTER page.goto() so the Firebase SDK is loaded.
 */
export async function signInTestUser(page: Page): Promise<void> {
  // Wait for the test sign-in helper to be exposed by firebase.ts
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => typeof (window as any).__testSignIn === "function",
    { timeout: 5000 },
  );

  await page.evaluate(
    async (user: { email: string; password: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signIn = (window as any).__testSignIn as (
        email: string,
        password: string,
      ) => Promise<unknown>;
      await signIn(user.email, user.password);
    },
    { email: TEST_USER.email, password: TEST_USER.password },
  );

  // Wait for auth state to propagate
  await page.waitForTimeout(500);
}

/**
 * Clear all Firestore data in the emulator.
 */
export async function clearFirestoreData(): Promise<void> {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

/**
 * Clear all Auth emulator users.
 */
export async function clearAuthUsers(): Promise<void> {
  await fetch(
    `${AUTH_EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: "DELETE", headers: { "Content-Type": "application/json" } },
  );
}
