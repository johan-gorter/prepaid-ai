import fs from "node:fs";
import { expect, test } from "../fixtures";
import { createRenovationAndWaitForResult } from "../helpers/renovation";

test.describe("Home Page", () => {
  test("shows empty state when user has no renovations", async ({
    authenticatedPage: page,
  }) => {
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
    await expect(page.getByText("1. Capture Image")).toBeVisible();
  });

  test("shows user info in header", async ({ authenticatedPage: page }) => {
    await expect(page.getByText("Prepaid AI")).toBeVisible();
    await page.getByRole("button", { name: "User menu" }).click();
    await expect(page.getByText("Sign out")).toBeVisible();
  });

  test("empty state has link to start first renovation", async ({
    authenticatedPage: page,
  }) => {
    await expect(page.getByText("No renovations yet")).toBeVisible({ timeout: 10000 });
    const startLink = page.getByRole("link", {
      name: "Start your first renovation",
    });
    await expect(startLink).toBeVisible();
    await startLink.click();
    await page.waitForURL("/renovation/new");
  });

  test("sign out navigates to login page", async ({
    authenticatedPage: page,
  }) => {
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByText("Sign out").click();
    await page.waitForURL(/\/login/);
    await expect(page.getByText("Reimagine your space with AI")).toBeVisible();
  });
});

test.describe("Home Page with renovations", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "home-chromium",
      "desktop chromium only",
    );
  });

  test("shows renovation card after creation", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(15000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add a fireplace",
    );

    try {
      // Navigate back to home via Renovation Details → Back
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL("/");

      // Should show a renovation card (not empty state)
      await expect(page.getByText("No renovations yet")).not.toBeVisible();

      // Should see a card with an image (the diagonal composite)
      const card = page.getByTestId("renovation-card");
      await expect(card).toBeVisible({ timeout: 10000 });
      await expect(card.locator("img")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("clicking renovation card navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(15000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change the countertops",
    );

    try {
      // Go home
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL("/");

      // Click the card
      const card = page.getByTestId("renovation-card");
      await expect(card).toBeVisible({ timeout: 10000 });
      await card.click();

      // Should navigate to timeline
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });
});
