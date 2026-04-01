import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "../fixtures";

/**
 * Create a 1024x1024 gray PNG using jimp and save it to a temp file.
 */
async function createGrayPng(): Promise<string> {
  const { Jimp } = await import("jimp");
  const image = new Jimp({ width: 1024, height: 1024, color: 0x808080ff });
  const buffer = await image.getBuffer("image/png");
  const tmpPath = path.join(os.tmpdir(), `test-gray-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

// Run only on chromium — this integration test uses shared emulator state
// and cannot safely run in parallel across multiple browser projects.
test.describe("Impression processing", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("uploads image, triggers Cloud Function, and produces PNG with PromptLog metadata", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(15000);
    const promptText = "remove the furniture";

    // 1. Create a dummy 1024x1024 gray PNG
    const grayPngPath = await createGrayPng();

    try {
      // 2. Navigate to New Renovation page
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      // Step 1: Image capture — select file (no title)
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(grayPngPath);

      await expect(page.getByAltText("Preview")).toBeVisible();

      // Advance to Step 2: Mask
      await page.getByRole("button", { name: "Next" }).click();
      await expect(
        page.getByText("Paint the area you want to change"),
      ).toBeVisible();

      // Draw a small mask stroke on the canvas
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

      // Advance to Step 3: Prompt
      await page.getByRole("button", { name: "Next" }).click();
      const promptInput = page.getByTestId("prompt");
      await expect(promptInput).toBeVisible();

      await promptInput.fill(promptText);

      // Click Generate — triggers submit, stays on page at step 4 (Result)
      await page.getByRole("button", { name: "Generate" }).click();

      // 5. Should show the three-button bar (Renovation Details, Trash, Next Change)
      await expect(page.getByRole("button", { name: "Renovation Details" })).toBeVisible({
        timeout: 15000,
      });

      // 6. Wait for the result image to appear (Cloud Function processing)
      const resultImage = page.getByAltText("Result");
      await expect(resultImage).toBeVisible({ timeout: 30000 });

      // 7. Click Renovation Details to navigate to the renovation detail page
      await page.getByRole("button", { name: "Renovation Details" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/, { timeout: 5000 });

      // 8. Verify the timeline page shows the result
      await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
      const timelineResultImage = page.getByAltText("Result");
      await expect(timelineResultImage).toBeVisible({ timeout: 5000 });

      // 9. Download the result image via its src URL and verify PNG metadata
      const resultSrc = await timelineResultImage.getAttribute("src");
      expect(resultSrc).toBeTruthy();

      const res = await fetch(resultSrc!, {
        headers: { Authorization: "Bearer owner" },
      });
      expect(res.ok).toBe(true);
      const resultBuffer = Buffer.from(await res.arrayBuffer());

      // 10. Verify the PNG has PromptLog tEXt metadata
      const extractChunks = (await import("png-chunks-extract")).default;
      const textChunk = (await import("png-chunk-text")).default;

      const chunks = extractChunks(new Uint8Array(resultBuffer)) as Array<{
        name: string;
        data: Uint8Array;
      }>;
      const textChunks = chunks
        .filter((c) => c.name === "tEXt")
        .map(
          (c) => textChunk.decode(c.data) as { keyword: string; text: string },
        );

      const promptLogChunk = textChunks.find((c) => c.keyword === "PromptLog");
      expect(promptLogChunk).toBeTruthy();

      // 11. Verify the prompt log contains our prompt
      const promptLog = JSON.parse(promptLogChunk!.text) as string[];
      expect(promptLog).toContain(promptText);
    } finally {
      fs.unlinkSync(grayPngPath);
    }
  });
});
