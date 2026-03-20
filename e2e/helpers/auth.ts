/**
 * Test utilities for Firebase Auth Emulator.
 *
 * Authenticated tests create their own emulator-backed user so they can run
 * concurrently without clearing shared Firestore state between tests.
 */

import type { Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { EMULATOR_URLS, PROJECT_ID } from "./emulator-config";

const RANDOM_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export interface TestUser {
  uid?: string;
  email: string;
  displayName: string;
  password: string;
}

interface EmulatorSignUpResponse {
  localId: string;
}

function createRandomId(length: number): string {
  const bytes = randomBytes(length);
  let result = "";

  for (const value of bytes) {
    result += RANDOM_ID_ALPHABET[value % RANDOM_ID_ALPHABET.length];
  }

  return result;
}

export function createRandomTestUser(): TestUser {
  const randomId = createRandomId(8);

  return {
    email: `test-${randomId}@prepaid.test`,
    displayName: `Test User ${randomId}`,
    password: `test-password-${randomId}`,
  };
}

/**
 * Create a test user in the Auth Emulator via REST API.
 */
export async function createTestUser(
  user: TestUser = createRandomTestUser(),
): Promise<TestUser> {
  const signUpRes = await fetch(
    `${EMULATOR_URLS.auth}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        returnSecureToken: true,
      }),
    },
  );

  if (!signUpRes.ok) {
    const err = await signUpRes.text();
    throw new Error(`Failed to create test user: ${err}`);
  }

  const data = (await signUpRes.json()) as EmulatorSignUpResponse;

  return {
    ...user,
    uid: data.localId,
  };
}

/**
 * Delete a specific test user from the Auth emulator.
 */
export async function deleteTestUser(user: TestUser): Promise<void> {
  if (!user.uid) {
    return;
  }

  const response = await fetch(
    `${EMULATOR_URLS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ localIds: [user.uid] }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to delete test user: ${err}`);
  }
}

/**
 * Sign in a specific test user on a Playwright page.
 *
 * Call this AFTER page.goto() so the Firebase SDK is loaded.
 */
export async function signInTestUser(
  page: Page,
  user: TestUser,
): Promise<void> {
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
    { email: user.email, password: user.password },
  );

  await page.waitForTimeout(500);
}

/**
 * Clear all Firestore data in the emulator.
 */
export async function clearFirestoreData(): Promise<void> {
  await fetch(
    `${EMULATOR_URLS.firestore}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

/**
 * Clear all Auth emulator users.
 */
export async function clearAuthUsers(): Promise<void> {
  await fetch(
    `${EMULATOR_URLS.auth}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: "DELETE", headers: { "Content-Type": "application/json" } },
  );
}
