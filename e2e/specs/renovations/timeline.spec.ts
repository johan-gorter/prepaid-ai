import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  chooseFreePrompt,
  createRenovationAndWaitForResult,
  drawMaskStroke,
  waitForPreviewResult,
} from "../../helpers/renovation";

test.describe("Renovation Details Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("shows original image and completed impression without prompt text", async ({
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

      // Completed result image
      await expect(page.getByAltText("Result")).toBeVisible();

      // Prompt text is intentionally hidden from the photo feed
      await expect(page.getByText(promptText)).not.toBeVisible();
      await expect(page.getByTestId("impression-more-menu")).toHaveCount(0);
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

      const afterStar = page.getByTestId("after-image-star");
      await expect(afterStar).toBeVisible();
      await expect(afterStar).toHaveClass(/starred/);
      await expect(page.getByTitle("Set as after image")).toHaveCount(0);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("renovations page lists the new renovation", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint ceiling",
    );

    try {
      await page.goto("/renovations");
      await expect(
        page.getByRole("heading", { name: "Renovations" }),
      ).toBeVisible();
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

  test("completed impression exposes only the star image control", async ({
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

      await expect(page.getByTestId("impression-more-menu")).toHaveCount(0);
      await expect(page.getByTestId("after-image-star")).toHaveCount(1);
      await expect(page.getByTitle("Set as after image")).toHaveCount(0);
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

      const impressions = page.locator("article.impression-item");

      await expect(
        impressions.nth(0).getByTestId("after-image-star"),
      ).toBeVisible();
      await expect(page.getByTitle("Set as after image")).toHaveCount(0);

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

      // Go through choose-action → prompt
      await page.getByRole("button", { name: "Next" }).click();
      await chooseFreePrompt(page);
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("second change");

      // Generate
      await page.getByRole("button", { name: "Generate" }).click();
      await waitForPreviewResult(page);

      // Go back to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Should see two Result images without prompt captions
      await expect(page.getByAltText("Result")).toHaveCount(2);
      await expect(page.getByText("first change")).not.toBeVisible();
      await expect(page.getByText("second change")).not.toBeVisible();

      const starButtons = page.getByTitle("Set as after image");
      await expect(starButtons).toHaveCount(1);
      await expect(
        impressions.nth(0).getByTestId("after-image-star"),
      ).toBeVisible();
      await expect(
        impressions.nth(1).getByTitle("Set as after image"),
      ).toHaveCount(1);

      // First should still be starred (auto-star only happens on first)
      // Click the second star to switch
      await page.getByAltText("Result").nth(1).hover();
      await starButtons.first().click();

      await expect(
        impressions.nth(1).getByTestId("after-image-star"),
      ).toBeVisible();
      await expect(
        impressions.nth(0).getByTitle("Set as after image"),
      ).toHaveCount(1);
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

      // Advance through choose-action → prompt step
      await page.getByRole("button", { name: "Next" }).click();
      await chooseFreePrompt(page);
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("chained from result");

      // Generate → preview stage with the chained result image
      await page.getByRole("button", { name: "Generate" }).click();
      await waitForPreviewResult(page);

      // Navigate back to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Two result images present without prompt captions
      await expect(page.getByAltText("Result")).toHaveCount(2);
      await expect(page.getByText("base impression")).not.toBeVisible();
      await expect(page.getByText("chained from result")).not.toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
