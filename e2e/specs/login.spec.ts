import { expect, test } from "@playwright/test";

test.describe("Login Page", () => {
  test("shows login form with all providers", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("RenovisionAI")).toBeVisible();
    await expect(page.getByText("Reimagine your space with AI")).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Sign in with Google/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sign in with Microsoft/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Sign in with Apple/ }),
    ).toBeVisible();
  });

  test("redirects to login when accessing protected route unauthenticated", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/);
    await expect(page.getByText("RenovisionAI")).toBeVisible();
  });
});
