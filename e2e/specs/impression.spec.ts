import fs from "node:fs";
import { expect, test } from "../fixtures";
import {
  createGrayPng,
  drawMaskStroke,
} from "../helpers/renovation";

// Run only on chromium — this integration test uses shared emulator state
// and cannot safely run in parallel across multiple browser projects.
test.describe("Impression processing", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("uploads image, triggers Cloud Function, and produces a result image", async ({
    authenticatedPage: page,
  }) => {
    const promptText = "remove the furniture";

    // 1. Create a dummy 1024x1024 gray PNG
    const grayPngPath = await createGrayPng();

    try {
      // 2. Set the camera input on the home page — simulates taking a photo.
      //    This navigates directly to the mask step (source=cropped).
      await page.getByTestId("camera-input").setInputFiles(grayPngPath);
      await page.waitForURL("/renovation/new?source=cropped");

      // 3. Mask step — draw a stroke
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();
      await drawMaskStroke(page);

      // 4. Advance to prompt step
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();
      await promptInput.fill(promptText);

      // 5. Generate — triggers submit, shows result step (step 4)
      await page.getByRole("button", { name: "Generate" }).click();

      // 6. Three-button bar appears immediately
      await expect(page.getByRole("button", { name: "Renovation Details" })).toBeVisible();

      // 7. Wait for Cloud Function to produce the result image
      const resultImage = page.getByAltText("Result");
      await expect(resultImage).toBeVisible({ timeout: 30000 });

      // 8. Navigate to timeline
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // 9. Verify timeline shows the result
      await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
      const timelineResultImage = page.getByAltText("Result");
      await expect(timelineResultImage).toBeVisible();

      // 10. Download the result image and verify it is non-empty
      const resultSrc = await timelineResultImage.getAttribute("src");
      expect(resultSrc).toBeTruthy();

      const res = await fetch(resultSrc!, {
        headers: { Authorization: "Bearer owner" },
      });
      expect(res.ok).toBe(true);
      const resultBuffer = Buffer.from(await res.arrayBuffer());
      expect(resultBuffer.length).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });
});
