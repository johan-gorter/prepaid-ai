import { expect, test } from "@playwright/test";

test.describe("About Page", () => {
  test("shows about page content", async ({ page }) => {
    await page.goto("/about");

    await expect(
      page.getByRole("heading", { name: "About payasyougo.app" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Acceptable Use" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data Retention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible();
  });

  test("accessible without authentication", async ({ page }) => {
    await page.goto("/about");

    // Should not redirect to login — URL stays at /about
    await expect(page).toHaveURL("/about");
    await expect(
      page.getByRole("heading", { name: "About payasyougo.app" }),
    ).toBeVisible();
  });

  test("shows all legal sections", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByRole("heading", { name: "Acceptable Use" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Data Retention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible();
  });

  test("shows breadcrumb and back link", async ({ page }) => {
    await page.goto("/about");

    await expect(page.getByTestId("app-logo")).toBeVisible();
    await expect(page.getByRole("link", { name: /Back/ })).toBeVisible();
  });

  test("login page links to about", async ({ page }) => {
    await page.goto("/login");

    const tosLink = page.getByRole("link", { name: "Terms of Service" });
    await expect(tosLink).toBeVisible();
    await expect(tosLink).toHaveAttribute("href", "/about");
  });
});
