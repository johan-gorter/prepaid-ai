import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { createGrayPng } from "../../helpers/renovation";

// Run only on chromium — this integration test uses shared emulator state
// and cannot safely run in parallel across multiple browser projects.
test.describe("Impression processing", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  /**
   * End-to-end flow through the streamlined photo pipeline:
   *
   *   Home (camera input) → Mask → Prompt → Generate → Result → Timeline
   *
   * Take Photo opens a camera file input on the home page. Selecting an
   * image reads it as a data URL and navigates directly to the mask step
   * (/renovation/new?source=camera), skipping the old image-capture step.
   * From the mask step, the user draws a mask, enters a prompt, and clicks
   * Generate. The Cloud Function processes the impression and produces a
   * result image visible on both the result step and the timeline page.
   */
  test("uploads image, triggers Cloud Function, and produces a result image", async ({
    authenticatedPage: page,
  }) => {
    const promptText = "remove the furniture";
    const grayPngPath = await createGrayPng();

    try {
      // 1. Select photo via camera input → auto-navigates to mask step
      await page.locator('[data-testid="camera-input"]').setInputFiles(grayPngPath);
      await page.waitForURL("/renovation/new?source=camera");
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // 2. Draw a mask stroke on the canvas
      const canvas = page.locator("canvas");
      await expect(canvas).toBeVisible();
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 + 50,
          box.y + box.height / 2 + 50,
        );
        await page.mouse.up();
      }

      // 3. Advance to prompt step and enter description
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill(promptText);

      // 4. Generate — triggers upload + Cloud Function processing
      await page.getByRole("button", { name: "Generate" }).click();

      // 5. Result step: three-button bar and Cloud Function output
      await expect(page.getByRole("button", { name: "Renovation Details" })).toBeVisible();
      const resultImage = page.getByAltText("Result");
      await expect(resultImage).toBeVisible({ timeout: 30000 });

      // 6. Navigate to timeline and verify the result appears there too
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
      await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
      const timelineResultImage = page.getByAltText("Result");
      await expect(timelineResultImage).toBeVisible();

      // 7. Download the result image and verify it is valid
      const resultSrc = await timelineResultImage.getAttribute("src");
      expect(resultSrc).toBeTruthy();

      const res = await fetch(resultSrc!, {
        headers: { Authorization: "Bearer owner" },
      });
      expect(res.ok).toBe(true);
      const resultBuffer = Buffer.from(await res.arrayBuffer());
      expect(resultBuffer.length).toBeGreaterThan(0);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
