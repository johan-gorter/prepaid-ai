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
 * Flow: Renovations card (camera input) → Mask → Choose action → Prompt
 *
 * Sets a file on the camera input, which stashes it in IndexedDB and
 * navigates directly to the mask stage of the unified wizard
 * (/new-impression?source=photo). Then draws a mask stroke, picks the
 * "Other" choice on the action picker, and advances to the prompt stage
 * with the given text filled in.
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

  // Mask stage → choose-action stage → prompt stage
  await page.getByRole("button", { name: "Next" }).click();
  await chooseFreePrompt(page);
  const promptInput = page.getByTestId("prompt");
  await expect(promptInput).toBeVisible();
  await promptInput.fill(promptText);

  return grayPngPath;
}

/**
 * Click the "Other" button on the choose-action stage to land on the
 * free-prompt screen with the standard magenta checkerboard composite.
 */
export async function chooseFreePrompt(page: Page): Promise<void> {
  const otherButton = page.getByTestId("choose-other");
  await expect(otherButton).toBeVisible();
  await otherButton.click();
}

/**
 * Default timeout for waiting on the processImpression Cloud Function.
 * The Functions emulator cold-starts its worker on the first invocation and
 * serializes CPU-bound sharp work across parallel Playwright workers, so a
 * single generate can take well over the 10s default expect timeout.
 */
export const CLOUD_FUNCTION_TIMEOUT = 45_000;

/**
 * Wait for the wizard to land on the preview stage after a Generate click.
 *
 * The wizard stays on the processing stage until the processImpression
 * Cloud Function (running in the Functions emulator) writes
 * `status: "completed"` — only then does the preview footer render. The
 * footer's "Renovation Details" button is therefore the first element gated
 * on the Cloud Function and must carry the long timeout; once it is visible
 * the result is already written, so the result-image check that follows
 * needs no extended timeout.
 */
export async function waitForPreviewResult(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Renovation Details" }),
  ).toBeVisible({ timeout: CLOUD_FUNCTION_TIMEOUT });
  await expect(page.getByAltText("Result")).toBeVisible();
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

  // Click Generate, then wait out the Cloud Function round-trip
  await page.getByRole("button", { name: "Generate" }).click();
  await waitForPreviewResult(page);

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
