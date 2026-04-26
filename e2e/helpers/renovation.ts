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
 * Navigate through the streamlined New Renovation flow up to (but not
 * including) the Generate step.
 *
 * Flow: Renovations card (camera input) → Mask → Prompt
 *
 * Sets a file on the camera input, which stashes it in IndexedDB and
 * navigates directly to the mask stage of the unified wizard
 * (/new-impression?source=photo). Then draws a mask stroke and advances
 * to the prompt stage with the given text filled in.
 *
 * Assumes the page is at /renovations with the NewRenovationCard visible.
 *
 * Returns the temp file path so the caller can clean it up.
 */
export async function fillNewRenovationForm(
  page: Page,
  promptText: string,
): Promise<string> {
  const grayPngPath = await createGrayPng();

  // Select photo via camera input → auto-navigates to mask stage
  await page.locator('[data-testid="camera-input"]').setInputFiles(grayPngPath);
  await page.waitForURL("/new-impression?source=photo");
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

  // Advance to prompt stage
  await page.getByRole("button", { name: "Next" }).click();
  const promptInput = page.getByTestId("prompt");
  await expect(promptInput).toBeVisible();
  await promptInput.fill(promptText);

  return grayPngPath;
}

/**
 * Create a full renovation: fill form, click Generate, wait for result step.
 *
 * Flow: Home (camera input) → Mask → Prompt → Generate → Result
 *
 * Returns { grayPngPath } for cleanup.
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
  await expect(page.getByAltText("Result")).toBeVisible({ timeout: 45_000 });

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
