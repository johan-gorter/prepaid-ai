import { expect, test } from "@playwright/test";

test.describe("Usage Terms Page", () => {
  test("shows all required clauses", async ({ page }) => {
    await page.goto("/terms");

    await expect(
      page.getByRole("heading", { name: "Usage Terms" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Acceptable use" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Credits", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Right of withdrawal" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Minimum age" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "AI output" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Liability" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Governing law" }),
    ).toBeVisible();
  });

  test("states the key PO decisions", async ({ page }) => {
    await page.goto("/terms");

    const main = page.locator("main");
    await expect(main).toContainText("Credits never expire");
    await expect(main).toContainText("waive your statutory 14-day right");
    await expect(main).toContainText("at least 13 years old");
  });

  test("accessible without authentication", async ({ page }) => {
    await page.goto("/terms");
    await expect(page).toHaveURL("/terms");
    await expect(
      page.getByRole("heading", { name: "Usage Terms" }),
    ).toBeVisible();
  });
});
