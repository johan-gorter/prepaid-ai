/**
 * Custom Playwright fixture that provides a pre-authenticated page.
 *
 * Each test using `authenticatedPage` gets a fresh browser context
 * with a unique emulator user. User creation happens via the Auth
 * Emulator REST API (Node-side), then the browser signs in with
 * `__testSignIn`. This avoids the `auth/user-token-expired` errors
 * that occurred when multiple parallel workers called
 * `createUserWithEmailAndPassword` + `updateProfile` in-browser.
 */

import { test as base, type Page } from "@playwright/test";
import {
  createRandomTestUser,
  createTestUser,
  signInTestUser,
  type TestUser,
} from "./helpers/auth";

type TestFixtures = {
  authenticatedPage: Page;
  testUser: TestUser;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: [
    async ({ browser }, use, testInfo) => {
      // Create the user server-side via the Auth Emulator REST API.
      // This is safe under parallel load — no browser token management involved.
      const user = await createTestUser(createRandomTestUser());

      const context = await browser.newContext({
        ...testInfo.project.use,
      });
      const page = await context.newPage();

      // Navigate so Firebase SDK loads and __testSignIn is available
      await page.goto("/login");

      // Sign in the pre-created user in the browser
      await signInTestUser(page, user);

      // Wait for Vue-side auth state (onAuthStateChanged in useAuth.ts) to
      // propagate, not just the Firebase SDK. The router guard calls
      // getCurrentUser() which depends on the Vue loading ref, not auth.currentUser.
      await page.waitForFunction(
        () => (window as any).__testAuthReady?.().then((uid: string | null) => uid != null),
      );

      // Navigate to home — the router guard will now see the authenticated user.
      await page.goto("/");
      await page.waitForSelector('text=My Renovations');

      try {
        await use(page);
      } finally {
        // Per-test user deletion is intentionally skipped.
        // The Auth Emulator's bulk DELETE endpoint ignores the localIds body
        // and wipes ALL users, breaking parallel tests. Global teardown
        // handles cleanup after the full suite finishes.
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
