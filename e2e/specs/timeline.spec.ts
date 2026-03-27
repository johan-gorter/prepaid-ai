import fs from "node:fs";
import { expect, test } from "../fixtures";
import {
  createRenovationAndWaitForResult,
  drawMaskStroke,
} from "../helpers/renovation";

test.describe("Timeline Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows original image, completed impression, and prompt text", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const promptText = "add a skylight";
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      promptText,
    );

    try {
      // Navigate to timeline
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Header
      await expect(page.locator("h1", { hasText: "Timeline" })).toBeVisible();

      // Original image pinned at top
      await expect(page.getByAltText("Original")).toBeVisible();
      await expect(page.getByText("Original")).toBeVisible();

      // Completed result image
      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 5000 });

      // Prompt text shown below the impression
      await expect(page.getByText(promptText)).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("first impression is auto-starred", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add plants",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Wait for star to appear on the completed impression
      const starBtn = page.getByTitle("Set as after image");
      await expect(starBtn).toBeVisible({ timeout: 5000 });

      // Should be filled (★ = starred)
      await expect(starBtn).toHaveClass(/starred/);
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("three-button bar shows Timeline active, Trash, Next Change", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "widen the hallway",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Verify all three buttons in the bar
      const timelineBtn = page.locator(".three-button-bar .bar-btn", {
        hasText: "Timeline",
      });
      const trashBtn = page.locator(".three-button-bar .bar-btn", {
        hasText: "Trash",
      });
      const nextChangeBtn = page.locator(".three-button-bar .bar-btn", {
        hasText: "Next Change",
      });

      await expect(timelineBtn).toBeVisible();
      await expect(trashBtn).toBeVisible();
      await expect(nextChangeBtn).toBeVisible();

      // Timeline should be highlighted (active)
      await expect(timelineBtn).toHaveClass(/bar-btn-active/);
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("back button navigates to home", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint ceiling",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL("/");
      await expect(page.getByText("My Renovations")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("clicking original image navigates to new impression with source=before", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "remove wallpaper",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByAltText("Original")).toBeVisible();
      await page.getByAltText("Original").click();

      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=before/);

      // Should load source and show mask step
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("clicking result image navigates to new impression with source=impressionId", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add lighting",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 5000 });
      await page.getByAltText("Result").click();

      // Should navigate to new impression with source= an impression ID (not "before")
      await page.waitForURL(
        /\/renovation\/[a-zA-Z0-9]+\/new\?source=(?!before)[a-zA-Z0-9]+/,
      );

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("Next Change button navigates to new impression page", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "install new windows",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await page.locator(".three-button-bar .bar-btn", { hasText: "Next Change" }).click();

      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=/);

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("trash button on impression deletes it from timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "replace flooring",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Verify impression is visible
      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 5000 });

      // Click the trash button on the impression
      await page.getByTitle("Delete impression").click();

      // Impression should be removed — no more Result images
      await expect(page.getByAltText("Result")).not.toBeVisible({ timeout: 5000 });

      // Original image should still be there
      await expect(page.getByAltText("Original")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("delete renovation navigates back to home", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "demolish wall",
    );

    try {
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Accept the confirmation dialog
      page.on("dialog", (dialog) => dialog.accept());

      // Click Trash in the bottom bar (delete renovation)
      await page.locator(".three-button-bar .bar-btn-danger").click();

      // Should navigate back to home
      await page.waitForURL("/", { timeout: 10000 });
      await expect(page.getByText("My Renovations")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("star toggle switches between impressions", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120000);

    // Create first renovation and go to result
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change",
    );

    try {
      // Go to timeline
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      const timelineUrl = page.url();

      // First impression should be starred
      await expect(page.getByTitle("Set as after image")).toHaveClass(/starred/, { timeout: 5000 });

      // Create a second impression via Next Change
      await page.locator(".three-button-bar .bar-btn", { hasText: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      // Wait for source image to load
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

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
        page.getByRole("button", { name: "Timeline" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 30000,
      });

      // Go back to timeline
      await page.getByRole("button", { name: "Timeline" }).click();
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
      fs.unlinkSync(grayPngPath);
    }
  });
});
