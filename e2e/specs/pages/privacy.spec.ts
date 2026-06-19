import { expect, test } from "@playwright/test";

test.describe("Privacy Policy Page", () => {
  test("shows the privacy policy sections", async ({ page }) => {
    await page.goto("/privacy");

    await expect(
      page.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "What we collect" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Who processes your data" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your rights" }),
    ).toBeVisible();
  });

  test("names the processors and the no-tracking-cookies stance", async ({
    page,
  }) => {
    await page.goto("/privacy");

    const main = page.locator("main");
    await expect(main).toContainText("Stripe");
    await expect(main).toContainText("Gemini");
    await expect(main).toContainText("no cookie-consent banner");
  });

  test("accessible without authentication", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL("/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeVisible();
  });
});
