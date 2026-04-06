/**
 * Shared helpers for E2E tests that create renovations through the UI.
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { expect, type Page } from "@playwright/test";

/**
 * Create a 1024x1024 gray PNG using jimp and save it to a temp file.
 */
export async function createGrayPng(): Promise<string> {
  const { Jimp } = await import("jimp");
  const image = new Jimp({ width: 1024, height: 1024, color: 0x808080ff });
  const buffer = await image.getBuffer("image/png");
  const tmpPath = path.join(os.tmpdir(), `test-gray-${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

/**
 * Navigate through the New Renovation flow up to (but not including) the
 * Generate step. Ends on step 2 (prompt) with the given prompt filled in.
 *
 * Assumes the page is on the home page ("/") with the NewRenovationCard visible.
 *
 * Returns the temp file path so the caller can clean it up.
 */
export async function fillNewRenovationForm(
  page: Page,
  promptText: string,
): Promise<string> {
  const grayPngPath = await createGrayPng();

  // Set the camera input directly (simulates Take Photo → camera)
  await page.locator('[data-testid="camera-input"]').setInputFiles(grayPngPath);

  // Auto-navigates to mask step
  await page.waitForURL("/renovation/new?source=cropped");
  await expect(page.getByText("Paint the area you want to change")).toBeVisible();

  // Draw a mask stroke
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

  // Advance to Step 2: Prompt
  await page.getByRole("button", { name: "Next" }).click();
  const promptInput = page.getByTestId("prompt");
  await expect(promptInput).toBeVisible();
  await promptInput.fill(promptText);

  return grayPngPath;
}

/**
 * Create a full renovation: fill form, click Generate, wait for step 4 result.
 *
 * Returns { grayPngPath, renovationId } for cleanup and further navigation.
 */
export async function createRenovationAndWaitForResult(
  page: Page,
  promptText: string,
): Promise<{ grayPngPath: string }> {
  const grayPngPath = await fillNewRenovationForm(page, promptText);

  // Click Generate
  await page.getByRole("button", { name: "Generate" }).click();

  // Wait for step 4 — three-button bar appears
  await expect(
    page.getByRole("button", { name: "Renovation Details" }),
  ).toBeVisible();

  // Wait for the Cloud Function to produce the result image
  await expect(page.getByAltText("Result")).toBeVisible({ timeout: 30000 });

  return { grayPngPath };
}

/**
 * Draw a mask stroke on a canvas element.
 */
export async function drawMaskStroke(page: Page): Promise<void> {
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
}
