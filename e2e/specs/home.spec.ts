import { expect, test } from "../fixtures";

test.describe("Home Page", () => {
  test.describe.configure({ mode: "serial" });

  test("shows empty state when user has no renovations", async ({
    authenticatedPage: page,
  }) => {
    // The authenticated fixture already navigated to /
    await expect(page.getByText("No renovations yet")).toBeVisible();
    await expect(
      page.getByText("Take or upload a photo of your space"),
    ).toBeVisible();
  });

  test("shows the New Renovation button", async ({
    authenticatedPage: page,
  }) => {
    await expect(
      page.getByRole("link", { name: "+ New Renovation" }),
    ).toBeVisible();
  });

  test("navigates to new renovation page", async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole("link", { name: "+ New Renovation" }).click();
    await page.waitForURL("/renovation/new");
    await expect(page.getByText("New Renovation")).toBeVisible();
    await expect(page.getByLabel("Title")).toBeVisible();
  });

  test("shows user info in header", async ({ authenticatedPage: page }) => {
    await expect(page.getByText("Prepaid AI")).toBeVisible();
    await expect(page.getByText("Sign out")).toBeVisible();
  });
});
