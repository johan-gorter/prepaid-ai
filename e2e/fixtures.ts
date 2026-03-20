/**
 * Custom Playwright fixture that provides a pre-authenticated page.
 *
 * Each test using `authenticatedPage` gets a page where the test user
 * is already signed in via the Firebase Auth Emulator.
 */

import { test as base, type Page } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
  type TestUser,
} from "./helpers/auth";

type TestFixtures = {
  authenticatedPage: Page;
  testUser: TestUser;
};

/**
 * Sign in by navigating to the app, then using the Auth Emulator
 * signInWithPassword REST endpoint and injecting the session.
 */
async function signInOnPage(page: Page, user: TestUser): Promise<void> {
  // Navigate to the app first so Firebase SDK is loaded
  await page.goto("/login");
  await signInTestUser(page, user);

  // Navigate to home after sign-in and wait for auth guard to allow it
  await page.goto("/");
  await page.waitForURL("/", { timeout: 10000 });
}

export const test = base.extend<TestFixtures>({
  testUser: async ({}, use) => {
    const user = await createTestUser();

    try {
      await use(user);
    } finally {
      await deleteTestUser(user);
    }
  },

  authenticatedPage: async ({ page, testUser }, use) => {
    await signInOnPage(page, testUser);
    await use(page);
  },
});

export { expect } from "@playwright/test";
