/**
 * Custom Playwright fixture that provides a pre-authenticated page.
 *
 * Each test using `authenticatedPage` gets a page where the test user
 * is already signed in via the Firebase Auth Emulator.
 */

import { test as base, type Page } from "@playwright/test";
import { clearFirestoreData, TEST_USER } from "./helpers/auth";

type TestFixtures = {
  authenticatedPage: Page;
};

/**
 * Sign in by navigating to the app, then using the Auth Emulator
 * signInWithPassword REST endpoint and injecting the session.
 */
async function signInOnPage(page: Page): Promise<void> {
  // Navigate to the app first so Firebase SDK is loaded
  await page.goto("/login");

  // Wait for the test sign-in helper to be exposed by firebase.ts
  await page.waitForFunction(
    () =>
      typeof (window as Record<string, unknown>).__testSignIn === "function",
    { timeout: 5000 },
  );

  // Sign in via the exposed helper (avoids bare module import issues in evaluate)
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

  // Navigate to home after sign-in and wait for auth guard to allow it
  await page.goto("/");
  await page.waitForURL("/", { timeout: 10000 });
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    await signInOnPage(page);
    await use(page);
    // Clean Firestore data between tests for isolation
    await clearFirestoreData();
  },
});

export { expect } from "@playwright/test";
