import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { createRenovationAndWaitForResult } from "../../helpers/renovation";
import {
  advanceToChooseAction,
  chainImpression,
  chooseFreePrompt,
  clickNextChange,
  fillPrompt,
  generateAndWait,
  goToRenovationDetails,
  paintMask,
} from "../../helpers/wizard";

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
      await goToRenovationDetails(page);

      // Header
      await expect(
        page.getByRole("heading", { name: "Renovation Details" }),
      ).toBeVisible();

      // Inline AI disclaimer near the results (#81)
      await expect(
        page.getByTestId("renovation-ai-disclaimer"),
      ).toContainText("AI-generated impressions");

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
      await goToRenovationDetails(page);

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
      await goToRenovationDetails(page);

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
      await goToRenovationDetails(page);

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
      await goToRenovationDetails(page);

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
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change",
    );

    try {
      // Go to timeline
      await goToRenovationDetails(page);

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

      // Preview stage — click Next Change to transition to the mask stage.
      await expect(page.locator("canvas")).toBeVisible();
      await chainImpression(page, "second change");

      // Go back to timeline
      await goToRenovationDetails(page);

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
      await goToRenovationDetails(page);

      // Wait for result image to appear
      await expect(page.getByAltText("Result")).toBeVisible();

      // Click result image — should navigate to wizard with source=impression
      await page.getByAltText("Result").click();
      await page.waitForURL(
        /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible. Chain a second impression.
      await expect(page.locator("canvas")).toBeVisible();
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);
      await chooseFreePrompt(page);
      await fillPrompt(page, "chained from result");
      await generateAndWait(page);

      // Navigate back to timeline
      await goToRenovationDetails(page);

      // Two result images present without prompt captions
      await expect(page.getByAltText("Result")).toHaveCount(2);
      await expect(page.getByText("base impression")).not.toBeVisible();
      await expect(page.getByText("chained from result")).not.toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
