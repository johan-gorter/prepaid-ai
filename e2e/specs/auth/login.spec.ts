import { expect, test } from "@playwright/test";

test.describe("Login Page", () => {
  test("shows login form with enabled providers", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText("payasyougo.app")).toBeVisible();
    await expect(
      page.getByText("An account is free — it keeps your credits and your work safe."),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Continue with Google/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Continue with Microsoft/ }),
    ).toBeVisible();
    // Apple sign-in is temporarily disabled until Apple credentials are
    // configured — the button is commented out in LoginPage.vue.
    await expect(
      page.getByRole("button", { name: /Continue with Apple/ }),
    ).toHaveCount(0);

    // Terms and privacy links are required (privacy link is mandated by
    // Google sign-in policies) and must be tappable.
    await expect(
      page.getByRole("link", { name: "Terms of Service" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Privacy Policy" }),
    ).toBeVisible();
  });

  test("redirects to login when accessing protected route unauthenticated", async ({
    page,
  }) => {
    await page.goto("/account");
    await page.waitForURL(/\/login/);
    await expect(page.getByText("payasyougo.app")).toBeVisible();
  });

  test("guest can browse renovations and sees sign-in CTA", async ({
    page,
  }) => {
    await page.goto("/renovations");
    await expect(page).toHaveURL("/renovations");
    await expect(page.getByTestId("renovations-sign-in")).toBeVisible();
    await expect(page.getByTestId("header-sign-in")).toBeVisible();
  });
});
