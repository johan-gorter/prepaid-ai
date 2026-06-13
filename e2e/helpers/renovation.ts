/**
 * Shared helpers for E2E tests that create renovations through the UI.
 */

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { expect, type Page } from "@playwright/test";
import {
  advanceToChooseAction,
  chooseFreePrompt,
  CLOUD_FUNCTION_TIMEOUT,
  fillPrompt,
  generateAndWait,
  paintMask,
  uploadSourceImage,
  waitForPreviewResult,
} from "./wizard";

// Re-export shared step helpers so existing imports from this module still
// resolve without change (allows incremental migration to wizard.ts).
export {
  chooseFreePrompt,
  CLOUD_FUNCTION_TIMEOUT,
  waitForPreviewResult,
};

/** @deprecated Use paintMask from wizard.ts instead. */
export const drawMaskStroke = paintMask;

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
 * Assumes the page is at /renovations with the NewRenovationCard visible.
 * Returns the temp file path so the caller can clean it up.
 */
export async function fillNewRenovationForm(
  page: Page,
  promptText: string,
): Promise<string> {
  const grayPngPath = await createGrayPng();
  await uploadSourceImage(page, grayPngPath);
  await paintMask(page);
  await advanceToChooseAction(page);
  await chooseFreePrompt(page);
  await fillPrompt(page, promptText);
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
  await generateAndWait(page);
  return { grayPngPath };
}
