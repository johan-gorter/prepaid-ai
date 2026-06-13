import { expect, test } from "../../fixtures";

test.describe("Buy Credits Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows the choice list, trust lines, waiver and sticky CTA", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=10&max=10&redirect=/chat");
    await expect(page.getByTestId("buy-credits-preset-75")).toBeVisible();
    await expect(page.getByTestId("buy-credits-preset-200")).toBeVisible();
    await expect(page.getByTestId("buy-credits-preset-500")).toBeVisible();
    await expect(page.getByTestId("buy-credits-custom-input")).toBeVisible();
    await expect(page.getByTestId("buy-credits-waiver")).toBeVisible();
    // Default selection is the 75 preset; CTA shows the live amount.
    await expect(page.getByTestId("buy-credits-preset-75")).toBeChecked();
    await expect(page.getByTestId("buy-credits-submit")).toContainText("$0.75");
  });

  test("shows the action-cost context message from the query params", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=5&max=15&redirect=/chat");
    await expect(page.getByTestId("buy-credits-cost-message")).toContainText(
      "5–15 credits",
    );
  });

  test("CTA is gated by the withdrawal-waiver checkbox", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=10&max=10&redirect=/chat");
    // Without the waiver ticked the CTA stays disabled.
    await expect(page.getByTestId("buy-credits-submit")).toBeDisabled();
    await page.getByTestId("buy-credits-waiver").check();
    await expect(page.getByTestId("buy-credits-submit")).toBeEnabled();
  });

  test("preset purchase tops up balance and returns to redirect", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=10&max=10&redirect=/chat");
    await page.getByTestId("buy-credits-preset-75").check();
    await page.getByTestId("buy-credits-waiver").check();
    await page.getByTestId("buy-credits-submit").click();
    await page.waitForURL("/chat");

    // Balance went from the seeded baseline up by 75.
    await page.goto("/balance");
    await expect(page.getByTestId("balance-amount")).toContainText("175");
  });

  test("rejects out-of-range custom amounts", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=10&max=10&redirect=/main");
    await page.getByTestId("buy-credits-waiver").check();
    await page.getByTestId("buy-credits-custom-option").check();
    const input = page.getByTestId("buy-credits-custom-input");
    await input.fill("5");
    await expect(page.getByTestId("buy-credits-submit")).toBeDisabled();
    await input.fill("99999");
    await expect(page.getByTestId("buy-credits-submit")).toBeDisabled();
    await input.fill("250");
    await expect(page.getByTestId("buy-credits-submit")).toBeEnabled();
  });
});
