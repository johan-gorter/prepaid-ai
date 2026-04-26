import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  createRenovationAndWaitForResult,
  drawMaskStroke,
} from "../../helpers/renovation";

test.describe("New Impression Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("loads source from original image (source=original) via timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change the color",
    );

    try {
      // Go to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Click original image → wizard preview stage with source=original
      await page.getByAltText("Original").click();
      await page.waitForURL(
        /\/new-impression\?source=original&renovation=[a-zA-Z0-9]+/,
      );

      // Preview stage hides the mask helper text but shows the canvas
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("loads source from impression result via timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add recessed lighting",
    );

    try {
      // Go to timeline, click result image
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

  test("Next Change on preview transitions to mask in-place", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint the trim",
    );

    try {
      // After Generate we land on preview stage with source=impression
      await page.waitForURL(/\/new-impression\?source=impression&/);

      // Mask helper text is hidden in preview stage
      await page.getByRole("button", { name: "Next Change" }).click();

      // Same URL — stage transitions in-place to mask
      await expect(page).toHaveURL(/\/new-impression\?source=impression&/);
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("full flow: mask, prompt, generate, result with three-button bar", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Two sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change for chaining",
    );

    try {
      // Already in preview stage after first Generate. Click Next Change to
      // transition to the mask stage in-place.
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Draw mask
      await drawMaskStroke(page);

      // Go to prompt stage
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("second change in chain");

      // Generate
      await page.getByRole("button", { name: "Generate" }).click();

      // Preview stage after completion — three-button bar visible
      await expect(
        page.getByRole("button", { name: "Renovation Details" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Trash" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Next Change" }),
      ).toBeVisible();

      // Result image visible
      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 45_000,
      });
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("back button navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change for back test",
    );

    try {
      // Already on preview stage with renovation in query — Back goes to
      // the renovation timeline.
      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await expect(
        page.getByRole("heading", { name: "Renovation Details" }),
      ).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Trash on preview deletes impression and navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "initial impression",
    );

    try {
      // After Generate, on preview stage with source=impression
      await page.waitForURL(/\/new-impression\?source=impression&/);

      // Trash → deletes the impression and goes to the timeline
      await page.getByRole("button", { name: "Trash" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // The impression is gone — only the original remains on the timeline
      await expect(page.getByAltText("Original")).toBeVisible();
      await expect(page.getByAltText("Result")).not.toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Renovation Details button on preview navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Two sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for chaining",
    );

    try {
      // Chain a second impression via Next Change
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      await drawMaskStroke(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByTestId("prompt").fill("chained impression");
      await page.getByRole("button", { name: "Generate" }).click();

      await expect(
        page.getByRole("button", { name: "Renovation Details" }),
      ).toBeVisible();

      // Click Renovation Details → timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByText("base for chaining")).toBeVisible();
      await expect(page.getByText("chained impression")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("consecutive Next Change: chained generation across three impressions", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Three sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change",
    );

    try {
      // --- Second impression ---
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      await drawMaskStroke(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByTestId("prompt").fill("second change");
      await page.getByRole("button", { name: "Generate" }).click();

      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 45_000,
      });

      // --- Third impression chained off the second ---
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      await drawMaskStroke(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByTestId("prompt").fill("third change");
      await page.getByRole("button", { name: "Generate" }).click();

      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 45_000,
      });
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("step navigation: back from prompt returns to mask", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "source for nav test",
    );

    try {
      await page.getByRole("button", { name: "Next Change" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Advance to prompt stage
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByTestId("prompt")).toBeVisible();

      // Back to mask
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
