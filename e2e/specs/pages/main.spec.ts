import { test as baseTest, expect as baseExpect } from "@playwright/test";
import { createRandomTestUser, createTestUser } from "../../helpers/auth";
import { expect, test } from "../../fixtures";

test.describe("Main Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows main page content", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "payasyougo.app", exact: true })).toBeVisible();

    await expect(page.getByTestId("renovations-card-heading")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Chat privately with AI" }),
    ).toBeVisible();
  });

  test("shows the precise chat privacy claim linking to the policy", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/main");
    await expect(
      page.getByText("never used to train AI and are not reviewed by humans"),
    ).toBeVisible();
    const privacyLink = page.getByRole("link", {
      name: "Read our privacy policy",
    });
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
  });

  test("shows the footer with legal links and business identity", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/main");
    const footer = page.getByTestId("legal-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByTestId("footer-about")).toHaveAttribute(
      "href",
      "/about",
    );
    await expect(footer.getByTestId("footer-privacy")).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(footer.getByTestId("footer-terms")).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(footer).toContainText("KvK 94834571");
  });

  test("has navigation links to renovations and chat", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "payasyougo.app", exact: true })).toBeVisible();

    const renovationsLink = page.getByRole("link", { name: "YOUR RENOVATIONS" });
    await expect(renovationsLink).toBeVisible();
    await expect(renovationsLink).toHaveAttribute("href", "/renovations");

    const chatLink = page.getByRole("link", { name: "START CHATTING" });
    await expect(chatLink).toBeVisible();
    await expect(chatLink).toHaveAttribute("href", "/chat");
  });

  test("shows feedback form", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "payasyougo.app", exact: true })).toBeVisible();

    await expect(page.getByTestId("feedback-input")).toBeVisible();
    await expect(page.getByTestId("feedback-submit")).toBeVisible();
  });

  test("can submit feedback", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "payasyougo.app", exact: true })).toBeVisible();

    await page.getByTestId("feedback-input").fill("This is a great app!");
    await page.getByTestId("feedback-submit").click();

    await expect(page.getByText("Thanks for your feedback!")).toBeVisible();
  });

  test("navigates to balance page", async ({ authenticatedPage: page }) => {
    await page.goto("/main");
    await expect(page.getByRole("heading", { name: "payasyougo.app", exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Check Credits" }).click();
    await page.waitForURL("/balance");

    await expect(page.getByRole("heading", { name: "Balance" })).toBeVisible();
  });
});

baseTest.describe("Feedback anonymous → login flow", () => {
  baseTest.beforeEach(async ({}, testInfo) => {
    baseTest.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  baseTest(
    "restores feedback draft after anonymous submit → login round-trip",
    async ({ page }) => {
      // Pre-create the user server-side (parallel-safe). The user signs in
      // mid-test, simulating an anonymous → authenticated transition.
      const user = await createTestUser(createRandomTestUser());

      const message = "Please add a wallpaper preview tool!";

      // 1. Anonymous visitor lands on the main page and types feedback.
      await page.goto("/");
      await baseExpect(page.getByTestId("feedback-input")).toBeVisible();
      await page.getByTestId("feedback-input").fill(message);

      // 2. Pressing send while signed out persists the draft and redirects
      //    to /login with the main page as the post-login target.
      await page.getByTestId("feedback-submit").click();
      await page.waitForURL(/\/login\?/);
      const loginUrl = new URL(page.url());
      baseExpect(loginUrl.searchParams.get("redirect")).toBe("/");

      // 3. Sign in and follow the redirect, mirroring LoginPage.handleSignIn.
      await page.waitForFunction(
        () => typeof (window as any).__testSignIn === "function",
      );
      await page.evaluate(
        async (creds) => {
          await (window as any).__testSignIn(creds.email, creds.password);
        },
        { email: user.email, password: user.password },
      );
      await page.waitForFunction(() =>
        (window as any)
          .__testAuthReady?.()
          .then((uid: string | null) => uid != null),
      );
      await page.goto("/");

      // 4. The draft is restored into the textarea so the user can re-send.
      await baseExpect(page.getByTestId("feedback-input")).toHaveValue(message);

      // 5. Pressing send now lands the feedback in the `feedback` collection.
      await page.getByTestId("feedback-submit").click();
      await baseExpect(
        page.getByText("Thanks for your feedback!"),
      ).toBeVisible();
    },
  );
});
