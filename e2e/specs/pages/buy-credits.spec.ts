import { expect, test } from "../../fixtures";

test.describe("Buy Credits Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows preset buttons and custom amount input", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=5&max=15&redirect=/chat");
    await expect(page.getByTestId("buy-credits-preset-50")).toBeVisible();
    await expect(page.getByTestId("buy-credits-preset-200")).toBeVisible();
    await expect(page.getByTestId("buy-credits-preset-500")).toBeVisible();
    await expect(page.getByTestId("buy-credits-custom-input")).toHaveValue(
      "1000",
    );
    await expect(page.getByTestId("buy-credits-custom-buy")).toBeEnabled();
  });

  test("shows the cost-range message from the query params", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=5&max=15&redirect=/chat");
    await expect(
      page.getByTestId("buy-credits-cost-message"),
    ).toContainText("between 5 and 15 credits");
  });

  test("preset purchase tops up balance and returns to redirect", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=5&max=15&redirect=/chat");
    await page.getByTestId("buy-credits-preset-50").click();
    await page.waitForURL("/chat");

    // Balance went from the seeded baseline up by 50.
    await page.goto("/balance");
    await expect(page.getByTestId("balance-amount")).toContainText("150");
  });

  test("rejects out-of-range custom amounts", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/buy-credits?min=5&max=15&redirect=/main");
    const input = page.getByTestId("buy-credits-custom-input");
    await input.fill("5");
    await expect(page.getByTestId("buy-credits-custom-buy")).toBeDisabled();
    await input.fill("99999");
    await expect(page.getByTestId("buy-credits-custom-buy")).toBeDisabled();
    await input.fill("250");
    await expect(page.getByTestId("buy-credits-custom-buy")).toBeEnabled();
  });
});
