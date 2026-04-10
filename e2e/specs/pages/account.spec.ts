import { expect, test } from "../../fixtures";

test.describe("Account Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows account page content", async ({ authenticatedPage: page }) => {
    await page.goto("/account");

    await expect(page.locator("h4", { hasText: "Account" })).toBeVisible();
    await expect(page.getByText("Last Activity")).toBeVisible();
    await expect(page.getByText("Danger Zone")).toBeVisible();
  });

  test("shows delete account button", async ({ authenticatedPage: page }) => {
    await page.goto("/account");

    await expect(
      page.getByRole("button", { name: "Delete my account" }),
    ).toBeVisible();
  });

  test("shows confirmation dialog on delete click", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/account");

    await page.getByRole("button", { name: "Delete my account" }).click();

    await expect(page.getByText("Are you sure?")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Cancel" }),
    ).toBeVisible();
  });

  test("cancel button hides confirmation", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/account");

    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("Are you sure?")).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Are you sure?")).not.toBeVisible();
  });

  test("back to main navigates correctly", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/account");

    await page.getByRole("link", { name: "Back to Main" }).click();

    await page.waitForURL("/main");
    await expect(page).toHaveURL("/main");
  });
});
