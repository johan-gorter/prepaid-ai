/**
 * Composable wizard-step helpers for E2E tests.
 *
 * Each function encapsulates exactly one stage transition (button name,
 * testid, or URL assertion). Issues #85–#87 rename buttons and restructure
 * footers — with all selectors centralised here only this file needs
 * updating, not the four spec files that drive the wizard.
 */

import { expect, type Page } from "@playwright/test";

/**
 * Timeout for waiting on the processImpression Cloud Function.
 * The Functions emulator cold-starts its worker on the first invocation and
 * serialises CPU-bound sharp work across parallel Playwright workers, so a
 * single generate can take well over the 10 s default expect timeout.
 */
export const CLOUD_FUNCTION_TIMEOUT = 45_000;

// ---------------------------------------------------------------------------
// Source image upload (mask stage entry)
// ---------------------------------------------------------------------------

/**
 * Set the camera-input file and wait for the wizard to land on the mask stage.
 *
 * Assumes the page is at /renovations with the NewRenovationCard visible.
 * The caller owns the temp file and must clean it up.
 */
export async function uploadSourceImage(
  page: Page,
  filePath: string,
): Promise<void> {
  await page.locator('[data-testid="camera-input"]').setInputFiles(filePath);
  await page.waitForURL("/new-impression?source=photo");
  await expect(
    page.getByText("Paint over what should change"),
  ).toBeVisible();
}

// ---------------------------------------------------------------------------
// Mask stage
// ---------------------------------------------------------------------------

/**
 * Draw a mask stroke across the centre of the canvas element.
 */
export async function paintMask(page: Page): Promise<void> {
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

/**
 * Advance from the mask stage to the choose-action stage.
 */
export async function advanceToChooseAction(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByTestId("choose-action")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Choose-action stage
// ---------------------------------------------------------------------------

/**
 * Pick the free-prompt ("Other") option on the choose-action stage.
 */
export async function chooseFreePrompt(page: Page): Promise<void> {
  const otherButton = page.getByTestId("choose-other");
  await expect(otherButton).toBeVisible();
  await otherButton.click();
}

// ---------------------------------------------------------------------------
// Prompt stage
// ---------------------------------------------------------------------------

/**
 * Fill the free-prompt text input with the given text.
 */
export async function fillPrompt(page: Page, promptText: string): Promise<void> {
  const promptInput = page.getByTestId("prompt");
  await expect(promptInput).toBeVisible();
  await promptInput.fill(promptText);
}

// ---------------------------------------------------------------------------
// Generate / preview stage
// ---------------------------------------------------------------------------

/**
 * Wait for the wizard to land on the preview stage after a Generate click.
 *
 * The wizard stays on the processing stage until the processImpression Cloud
 * Function writes `status: "completed"`. The footer's "Timeline" button is the
 * first element gated on the Cloud Function and must carry the long timeout;
 * the result-image check that follows needs no extended timeout.
 */
export async function waitForPreviewResult(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Timeline" }),
  ).toBeVisible({ timeout: CLOUD_FUNCTION_TIMEOUT });
  await expect(page.getByAltText("Result")).toBeVisible();
}

/**
 * Click Generate and wait for the preview stage (Cloud Function round-trip).
 */
export async function generateAndWait(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Generate" }).click();
  await waitForPreviewResult(page);
}

// ---------------------------------------------------------------------------
// Post-preview navigation
// ---------------------------------------------------------------------------

/**
 * Click "Next Change" on the preview footer and wait for the mask stage to
 * appear in-place (same URL, stage transition only).
 */
export async function clickNextChange(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Next Change" }).click();
  await expect(
    page.getByText("Paint over what should change"),
  ).toBeVisible();
}

/**
 * Click the "Timeline" footer button and wait for the renovation timeline URL.
 */
export async function goToRenovationDetails(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Timeline" }).click();
  await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
}

// ---------------------------------------------------------------------------
// Compound step
// ---------------------------------------------------------------------------

/**
 * Chain a new impression from the current preview stage.
 *
 * Sequence: Next Change → paint mask → choose-action → Other → fill prompt →
 * Generate → wait for preview result.
 *
 * Replaces the six-to-eight lines of inline wizard navigation that appear in
 * every chaining test across the four spec files.
 */
export async function chainImpression(
  page: Page,
  promptText: string,
): Promise<void> {
  await clickNextChange(page);
  await paintMask(page);
  await advanceToChooseAction(page);
  await chooseFreePrompt(page);
  await fillPrompt(page, promptText);
  await generateAndWait(page);
}
