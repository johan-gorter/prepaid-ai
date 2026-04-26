import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  createRenovationAndWaitForResult,
  drawMaskStroke,
} from "../../helpers/renovation";

test.describe("Renovation Details Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows original image, completed impression, and prompt text", async ({
    authenticatedPage: page,
  }) => {
    const promptText = "add a skylight";
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      promptText,
    );

    try {
      // Navigate to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Header
      await expect(
        page.getByRole("heading", { name: "Renovation Details" }),
      ).toBeVisible();

      // Original image pinned at top
      await expect(page.getByAltText("Original")).toBeVisible();
      await expect(page.getByText("Original")).toBeVisible();

      // Completed result image
      await expect(page.getByAltText("Result")).toBeVisible();

      // Prompt text shown below the impression
      await expect(page.getByText(promptText)).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("first impression is auto-starred", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add plants",
    );

    try {
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Wait for star to appear on the completed impression
      const starBtn = page.getByTitle("Set as after image");
      await expect(starBtn).toBeVisible();

      // Should be filled (★ = starred)
      await expect(starBtn).toHaveClass(/starred/);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("back button navigates to home", async ({ authenticatedPage: page }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint ceiling",
    );

    try {
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL("/renovations");
      await expect(page.getByText("My Renovations")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("clicking original image navigates to wizard with source=original", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "remove wallpaper",
    );

    try {
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByAltText("Original")).toBeVisible();
      await page.getByAltText("Original").click();

      await page.waitForURL(
        /\/new-impression\?source=original&renovation=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible, mask helper hidden
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("clicking result image navigates to wizard with source=impression", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add lighting",
    );

    try {
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByAltText("Result")).toBeVisible();
      await page.getByAltText("Result").click();

      await page.waitForURL(
        /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible, mask helper hidden
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("trash button on impression deletes it from timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "replace flooring",
    );

    try {
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Verify impression is visible
      await expect(page.getByAltText("Result")).toBeVisible();

      // Open the more menu then click Delete
      await page.getByTestId("impression-more-menu").click();
      await page.getByRole("link", { name: "Delete" }).click();

      // Impression should be removed — no more Result images
      await expect(page.getByAltText("Result")).not.toBeVisible();

      // Original image should still be there
      await expect(page.getByAltText("Original")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("star toggle switches between impressions", async ({
    authenticatedPage: page,
  }) => {
    // Create first renovation and go to result
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change",
    );

    try {
      // Go to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // First impression should be starred
      await expect(page.getByTitle("Set as after image")).toHaveClass(
        /starred/,
      );

      // Create a second impression by clicking the result image from the timeline
      await expect(page.getByAltText("Result")).toBeVisible();
      await page.getByAltText("Result").click();
      await page.waitForURL(
        /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible, mask helper hidden. Click Next
      // Change to transition to the mask stage.
      await expect(page.locator("canvas")).toBeVisible();
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Draw mask
      await drawMaskStroke(page);

      // Go to prompt
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("second change");

      // Generate
      await page.getByRole("button", { name: "Generate" }).click();
      await expect(
        page.getByRole("button", { name: "Renovation Details" }),
      ).toBeVisible();
      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 30000,
      });

      // Go back to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Should see two Result images + prompts
      await expect(page.getByText("first change")).toBeVisible();
      await expect(page.getByText("second change")).toBeVisible();

      // Two star buttons should be visible
      const starButtons = page.getByTitle("Set as after image");
      await expect(starButtons).toHaveCount(2);

      // First should still be starred (auto-star only happens on first)
      // Click the second star to switch
      const secondStar = starButtons.nth(1);
      await secondStar.click();

      // Second star should now be starred
      await expect(secondStar).toHaveClass(/starred/);

      // First star should be unstarred
      const firstStar = starButtons.nth(0);
      await expect(firstStar).not.toHaveClass(/starred/);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("chaining: click result image, complete full impression flow, verify both on timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base impression",
    );

    try {
      // Navigate to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Wait for result image to appear
      await expect(page.getByAltText("Result")).toBeVisible();

      // Click result image — should navigate to wizard with source=impression
      await page.getByAltText("Result").click();
      await page.waitForURL(
        /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible. Click Next Change to reach mask.
      await expect(page.locator("canvas")).toBeVisible();
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Draw mask stroke
      await drawMaskStroke(page);

      // Advance to prompt step
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("chained from result");

      // Generate
      await page.getByRole("button", { name: "Generate" }).click();

      // Processing starts — three-button bar appears
      await expect(
        page.getByRole("button", { name: "Renovation Details" }),
      ).toBeVisible();

      // Wait for the chained result image
      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 30000 });

      // Navigate back to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Both impression prompts visible on timeline
      await expect(page.getByText("base impression")).toBeVisible();
      await expect(page.getByText("chained from result")).toBeVisible();

      // Two result images present
      await expect(page.getByAltText("Result")).toHaveCount(2);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
