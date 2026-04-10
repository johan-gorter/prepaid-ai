import { expect, test } from "../../fixtures";

test.describe("Balance Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows balance page with initial credits", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/balance");
    await expect(page.getByTestId("balance-amount")).toBeVisible();
    await expect(page.getByTestId("balance-amount")).toContainText(
      "100 credits",
    );
  });

  test("shows no transactions initially", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/balance");
    await expect(page.getByText("No transactions yet.")).toBeVisible();
  });

  test("shows recent transactions heading", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/balance");
    await expect(
      page.getByRole("heading", { name: "Recent transactions" }),
    ).toBeVisible();
  });

  test("back to main link navigates correctly", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/balance");
    await page.getByRole("link", { name: "Back to Main" }).click();
    await page.waitForURL("/main");
  });
});
