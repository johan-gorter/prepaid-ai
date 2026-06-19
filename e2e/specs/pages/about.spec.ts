import { expect, test } from "@playwright/test";

test.describe("About Page", () => {
  test("shows about page intro and colofon", async ({ page }) => {
    await page.goto("/about");

    await expect(
      page.getByRole("heading", { name: "About payasyougo.app" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Who runs this service" }),
    ).toBeVisible();
    // Colofon carries the traceable business identity (KvK number).
    await expect(page.getByTestId("about-colofon")).toContainText("94834571");
  });

  test("accessible without authentication", async ({ page }) => {
    await page.goto("/about");

    // Should not redirect to login — URL stays at /about
    await expect(page).toHaveURL("/about");
    await expect(
      page.getByRole("heading", { name: "About payasyougo.app" }),
    ).toBeVisible();
  });

  test("shows the footer with the three legal links", async ({ page }) => {
    await page.goto("/about");

    const footer = page.getByTestId("legal-footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByTestId("footer-privacy")).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(footer.getByTestId("footer-terms")).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(footer).toContainText("94834571");
  });

  test("shows app-bar logo and back link", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByTestId("app-logo")).toBeVisible();
    await expect(page.getByRole("link", { name: /Back/ })).toBeVisible();
  });

  test("login page links to terms and privacy", async ({ page }) => {
    await page.goto("/login");

    const tosLink = page.getByRole("link", { name: "Terms of Service" });
    await expect(tosLink).toBeVisible();
    await expect(tosLink).toHaveAttribute("href", "/terms");

    const privacyLink = page.getByRole("link", { name: "Privacy Policy" });
    await expect(privacyLink.first()).toHaveAttribute("href", "/privacy");
  });
});
