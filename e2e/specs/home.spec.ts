import fs from "node:fs";
import { expect, test } from "../fixtures";
import { createGrayPng, createRenovationAndWaitForResult } from "../helpers/renovation";

test.describe("Home Page", () => {
  test("shows new renovation card", async ({
    authenticatedPage: page,
  }) => {
    await expect(page.getByTestId("new-renovation-card")).toBeVisible();
    await expect(page.getByRole("heading", { name: "New Renovation" })).toBeVisible();
  });

  test("navigates to new renovation page via take photo", async ({
    authenticatedPage: page,
  }) => {
    const grayPngPath = await createGrayPng();
    try {
      await page.locator('[data-testid="camera-input"]').setInputFiles(grayPngPath);
      await page.waitForURL("/renovation/new?source=cropped");
      await expect(page.getByText("Paint the area you want to change")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("stays on home page when camera input is cancelled", async ({
    authenticatedPage: page,
  }) => {
    // Simulate cancelling the file dialog by setting empty files
    await page.locator('[data-testid="camera-input"]').setInputFiles([]);
    // Should remain on the home page
    await expect(page).toHaveURL("/");
    await expect(page.getByTestId("new-renovation-card")).toBeVisible();
  });

  test("shows user info in header", async ({ authenticatedPage: page }) => {
    await expect(page.getByText("Prepaid AI")).toBeVisible();
    await page.getByRole("button", { name: "User menu" }).click();
    await expect(page.getByText("Sign out")).toBeVisible();
  });

  test("new renovation card has upload button", async ({
    authenticatedPage: page,
  }) => {
    const uploadButton = page.getByRole("button", { name: "Upload Image" });
    await expect(uploadButton).toBeVisible();
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

      // Should show a renovation card alongside the new-renovation card

      // Should see a card with an image (the diagonal composite)
      const card = page.getByTestId("renovation-card");
      await expect(card).toBeVisible();
      await expect(card.locator("img")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("clicking renovation card navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
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
      await expect(card).toBeVisible();
      await card.click();

      // Should navigate to timeline
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });
});
