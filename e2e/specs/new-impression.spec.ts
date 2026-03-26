import fs from "node:fs";
import { expect, test } from "../fixtures";
import {
  createRenovationAndWaitForResult,
  drawMaskStroke,
} from "../helpers/renovation";

test.describe("New Impression Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("loads source from original image (source=before) via timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change the color",
    );

    try {
      // Go to timeline
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Click original image → new impression with source=before
      await page.getByAltText("Original").click();
      await page.waitForURL(/\/new\?source=before/);

      // Should show mask step after loading
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("loads source from impression result via timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add recessed lighting",
    );

    try {
      // Go to timeline, click result image
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 5000 });
      await page.getByAltText("Result").click();
      await page.waitForURL(/\/new\?source=(?!before)/);

      // Should show mask step
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("loads source from Next Change button on result step", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint the trim",
    );

    try {
      // Click Next Change directly from result step
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      // Should show mask step after loading source
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("full flow: mask, prompt, generate, result with three-button bar", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change for chaining",
    );

    try {
      // Navigate to new impression via Next Change
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      // Wait for mask step
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

      // Draw mask
      await drawMaskStroke(page);

      // Go to prompt step
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill("second change in chain");

      // Generate
      await page.getByRole("button", { name: "Generate" }).click();

      // Should show step 4 with three-button bar
      await expect(
        page.getByRole("button", { name: "Timeline" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(
        page.getByRole("button", { name: "Trash" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Next Change" }),
      ).toBeVisible();

      // Wait for result image
      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 30000,
      });
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("back button navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change for back test",
    );

    try {
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

      // Click header back button
      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await expect(page.locator("h1", { hasText: "Timeline" })).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("Trash on result resets to mask step with same source", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "initial impression",
    );

    try {
      // Navigate to new impression
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

      // Complete the flow
      await drawMaskStroke(page);
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await promptInput.fill("will be trashed");
      await page.getByRole("button", { name: "Generate" }).click();

      // Wait for result
      await expect(
        page.getByRole("button", { name: "Timeline" }),
      ).toBeVisible({ timeout: 15000 });
      await expect(page.getByAltText("Result")).toBeVisible({
        timeout: 30000,
      });

      // Trash it
      await page.getByRole("button", { name: "Trash" }).click();

      // Should reset to mask step
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();

      // Three-button bar gone
      await expect(
        page.getByRole("button", { name: "Timeline" }),
      ).not.toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("Timeline button on result navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for chaining",
    );

    try {
      // Create a second impression via Next Change
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

      await drawMaskStroke(page);
      await page.getByRole("button", { name: "Next" }).click();
      await page.getByTestId("prompt").fill("chained impression");
      await page.getByRole("button", { name: "Generate" }).click();

      await expect(
        page.getByRole("button", { name: "Timeline" }),
      ).toBeVisible({ timeout: 15000 });

      // Click Timeline
      await page.getByRole("button", { name: "Timeline" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // Should show both impressions on the timeline
      await expect(page.getByText("base for chaining")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText("chained impression")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });

  test("step navigation: back from prompt returns to mask", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(60000);
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "source for nav test",
    );

    try {
      await page.getByRole("button", { name: "Next Change" }).click();
      await page.waitForURL(/\/new\?source=/);

      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible({ timeout: 10000 });

      // Advance to prompt
      await page.getByRole("button", { name: "Next" }).click();
      await expect(page.getByTestId("prompt")).toBeVisible();

      // Go back to mask
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });
});
