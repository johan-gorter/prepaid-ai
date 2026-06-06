import { expect, test } from "@playwright/test";
import {
  createRandomTestUser,
  createTestUser,
  signInTestUser,
} from "../../helpers/auth";
import { EMULATOR_URLS, PROJECT_ID } from "../../helpers/emulator-config";

/**
 * Read the `locale` field from a user's Firestore doc via the emulator REST
 * API (same approach as `seedTestUserBalance` in helpers/auth.ts).
 */
async function readUserLocale(uid: string): Promise<string | null> {
  const res = await fetch(
    `${EMULATOR_URLS.firestore}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    fields?: { locale?: { stringValue?: string } };
  };
  return data.fields?.locale?.stringValue ?? null;
}

async function waitForVueAuth(page: import("@playwright/test").Page) {
  await page.waitForFunction(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any)
      .__testAuthReady?.()
      .then((uid: string | null) => uid != null),
  );
}

test.describe("i18n language switching", () => {
  test("auto-detects Dutch from the browser locale", async ({ browser }) => {
    const context = await browser.newContext({ locale: "nl-NL" });
    const page = await context.newPage();
    await page.goto("/renovations");
    await expect(
      page.getByRole("heading", { name: "Make-overs" }),
    ).toBeVisible();
    await context.close();
  });

  test("defaults to English for a non-Dutch locale", async ({ browser }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/renovations");
    await expect(
      page.getByRole("heading", { name: "Renovations" }),
    ).toBeVisible();
    await context.close();
  });

  test("signed-out user can switch language, and it persists across reload", async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto("/renovations");
    await expect(
      page.getByRole("heading", { name: "Renovations" }),
    ).toBeVisible();

    await page.getByTestId("language-switcher").click();
    await page.getByTestId("language-option-nl").click();
    await expect(
      page.getByRole("heading", { name: "Make-overs" }),
    ).toBeVisible();

    // Stored in IndexedDB → survives a full reload (and beats navigator detect,
    // which would otherwise pick English from the en-US context).
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Make-overs" }),
    ).toBeVisible();

    await context.close();
  });

  test("signed-in choice saves to Firestore and syncs to a fresh device", async ({
    browser,
  }) => {
    const user = await createTestUser(createRandomTestUser());

    // Device A: sign in (en-US), switch to Dutch from the user menu.
    const ctxA = await browser.newContext({ locale: "en-US" });
    const pageA = await ctxA.newPage();
    await pageA.goto("/login");
    await signInTestUser(pageA, user);
    await waitForVueAuth(pageA);
    await pageA.goto("/renovations");
    await expect(
      pageA.getByRole("heading", { name: "Renovations" }),
    ).toBeVisible();

    await pageA.getByRole("button", { name: "User menu" }).click();
    await pageA.getByTestId("usermenu-switch-language").click();
    await pageA.getByTestId("language-option-nl").click();
    await expect(
      pageA.getByRole("heading", { name: "Make-overs" }),
    ).toBeVisible();

    // The per-account preference is written to Firestore.
    await expect.poll(() => readUserLocale(user.uid!)).toBe("nl");
    await ctxA.close();

    // Device B: brand-new context (empty IndexedDB, en-US) → adopts the
    // Dutch preference from Firestore on sign-in.
    const ctxB = await browser.newContext({ locale: "en-US" });
    const pageB = await ctxB.newPage();
    await pageB.goto("/login");
    await signInTestUser(pageB, user);
    await waitForVueAuth(pageB);
    await pageB.goto("/renovations");
    await expect(
      pageB.getByRole("heading", { name: "Make-overs" }),
    ).toBeVisible();
    await ctxB.close();
  });
});
