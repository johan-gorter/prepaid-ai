import { rmSync } from "node:fs";
import { test, expect } from "@playwright/test";
import {
  advanceToChooseAction,
  chooseFreePrompt,
  fillPrompt,
  paintMask,
  uploadSourceImage,
} from "../helpers/wizard";
import { createGrayPng } from "../helpers/renovation";
import { expectMetricAtLeast } from "../helpers/metrics";

// Anonymous funnel & viral-loop measurement (issue #93, docs/measurement.md).
// A full signed-out walk of the early funnel must produce the expected
// per-step counter increments in Firestore — no login, no device storage, no
// consent banner. These are the cheap steps (1–5 in the viral-flow blueprint)
// that need no Cloud Function generation.
test.describe("Funnel measurement counters", () => {
  test("an anonymous landing on / counts landing_view", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("renovations-card")).toBeVisible();
    await expectMetricAtLeast("landing_view", "direct");
  });

  test("?src= attributes the funnel to that source", async ({ page }) => {
    // A crafted invite code rides along in the URL (no device storage) and is
    // locked first-touch, so the entry click is attributed to it.
    await page.goto("/?src=inv-e2etest");
    await page.getByTestId("renovations-card").click();
    await page.waitForURL(/\/(first-renovation|renovations)$/);
    await expectMetricAtLeast("cta_click", "inv-e2etest");
  });

  test("walks landing → cta → photo → mask → action → generate → paywall", async ({
    page,
  }) => {
    const grayPngPath = await createGrayPng();
    try {
      // 1. Landing.
      await page.goto("/");
      await expect(page.getByTestId("renovations-card")).toBeVisible();

      // 2. CTA into the flow (signed-out first-time experience).
      await page.getByRole("link", { name: "TRY WITH YOUR PHOTO" }).click();
      await page.waitForURL("/first-renovation");

      // 3. Photo → mask stage (no login wall — deferred auth).
      await uploadSourceImage(page, grayPngPath);

      // 4. Mask → choose-action (price reveal).
      await paintMask(page);
      await advanceToChooseAction(page);

      // 5. Pick the free-prompt action and Generate. Signed out with no
      // credits, Generate redirects to the paywall.
      await chooseFreePrompt(page);
      await fillPrompt(page, "make the wall blue");
      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForURL(/\/buy-credits/);

      // Every step on the walk landed a counter under the default source.
      await expectMetricAtLeast("landing_view", "direct");
      await expectMetricAtLeast("cta_click", "direct");
      await expectMetricAtLeast("photo_chosen", "direct");
      await expectMetricAtLeast("mask_done", "direct");
      await expectMetricAtLeast("action_chosen", "direct");
      await expectMetricAtLeast("generate_click", "direct");
      await expectMetricAtLeast("paywall_view", "direct");
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
