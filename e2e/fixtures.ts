/**
 * Custom Playwright fixture that provides a pre-authenticated page.
 *
 * Each test using `authenticatedPage` gets a fresh browser context
 * where the test user is created and signed in via a single
 * `createUserWithEmailAndPassword` call inside the browser.
 *
 * Using a fresh context per test and doing all auth in-browser avoids:
 * - Stale IndexedDB auth state from a previous test's deleted user
 * - Cross-process consistency gaps between Node REST and browser SDK
 */

import { test as base, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { deleteTestUser, type TestUser } from "./helpers/auth";

type TestFixtures = {
  authenticatedPage: Page;
  testUser: TestUser;
};

function createRandomId(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let result = "";
  for (const value of bytes) {
    result += alphabet[value % alphabet.length];
  }
  return result;
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: [
    async ({ browser }, use, testInfo) => {
      const randomId = createRandomId(8);
      const user: TestUser = {
        email: `test-${randomId}@prepaid.test`,
        displayName: `Test User ${randomId}`,
        password: `test-password-${randomId}`,
      };

      const context = await browser.newContext({
        ...testInfo.project.use,
      });
      const page = await context.newPage();

      // Navigate so Firebase SDK loads and __testSignUp is available
      await page.goto("/login");
      await page.waitForFunction(
        () => typeof (window as any).__testSignUp === "function",
        { timeout: 5000 },
      );

      // Create and sign in the user atomically in the browser
      const uid = await page.evaluate(
        async (u: { email: string; password: string; displayName: string }) => {
          const signUp = (window as any).__testSignUp as (
            email: string,
            password: string,
            displayName: string,
          ) => Promise<string>;
          return signUp(u.email, u.password, u.displayName);
        },
        { email: user.email, password: user.password, displayName: user.displayName },
      );

      user.uid = uid;

      // Use SPA navigation instead of page.goto("/") to avoid a full
      // page reload that races with IndexedDB auth persistence.
      await page.evaluate(() => {
        window.history.pushState({}, "", "/");
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      await page.waitForURL("/", { timeout: 10000 });

      try {
        await use(page);
      } finally {
        await deleteTestUser(user);
        await context.close();
      }
    },
    { scope: "test" },
  ],

  // Expose testUser for tests that need user metadata (e.g., uid)
  testUser: [
    async ({ authenticatedPage: _page }, use) => {
      // testUser depends on authenticatedPage to ensure sign-in happened first.
      // The user info is available via the page if needed.
      // This fixture is a placeholder for backwards compatibility.
      await use({
        email: "",
        displayName: "",
        password: "",
      });
    },
    { scope: "test" },
  ],
});

export { expect } from "@playwright/test";
