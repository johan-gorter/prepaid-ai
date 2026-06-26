import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { createRenovationAndWaitForResult } from "../../helpers/renovation";
import {
  advanceToChooseAction,
  chainImpression,
  chooseFreePrompt,
  clickNextChange,
  goToRenovationDetails,
  paintMask,
  waitForPreviewResult,
} from "../../helpers/wizard";

test.describe("New Impression Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("loads source from original image (source=original) via timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change the color",
    );

    try {
      // Go to timeline
      await goToRenovationDetails(page);

      // Click original image → wizard preview stage with source=original
      await page.getByAltText("Original").click();
      await page.waitForURL(
        /\/new-impression\?source=original&renovation=[a-zA-Z0-9]+/,
      );

      // Preview stage hides the mask helper text but shows the canvas
      await expect(page.locator("canvas")).toBeVisible();

      // The original is the renovation's base image, not a discardable
      // artifact — deleting the whole renovation lives in the timeline's ⋮
      // menu, so the original preview must not offer a Trash button.
      await expect(page.getByRole("button", { name: "Trash" })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Timeline" }),
      ).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("loads source from impression result via timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "add recessed lighting",
    );

    try {
      // Go to timeline, click result image
      await goToRenovationDetails(page);

      await expect(page.getByAltText("Result")).toBeVisible();
      await page.getByAltText("Result").click();
      await page.waitForURL(
        /\/new-impression\?source=impression&renovation=[a-zA-Z0-9]+&impression=[a-zA-Z0-9]+/,
      );

      // Preview stage — canvas visible, mask helper hidden
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Next Change on preview transitions to mask in-place", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "paint the trim",
    );

    try {
      // After Generate we land on preview stage with source=impression
      await page.waitForURL(/\/new-impression\?source=impression&/);

      await clickNextChange(page);

      // Same URL — stage transitions in-place to mask
      await expect(page).toHaveURL(/\/new-impression\?source=impression&/);
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("full flow: mask, prompt, generate, result with three-button bar", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Two sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change for chaining",
    );

    try {
      // Chain a second impression
      await chainImpression(page, "second change in chain");

      // Three-button bar visible
      await expect(
        page.getByRole("button", { name: "Trash" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Another Change" }),
      ).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Timeline footer button navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "change for back test",
    );

    try {
      await goToRenovationDetails(page);
      await expect(
        page.getByRole("heading", { name: "Timeline" }),
      ).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Trash on preview deletes impression and navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "initial impression",
    );

    try {
      // After Generate, on preview stage with source=impression
      await page.waitForURL(/\/new-impression\?source=impression&/);

      // Trash → deletes the impression and goes to the timeline
      await page.getByRole("button", { name: "Trash" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);

      // The impression is gone — only the original remains on the timeline
      await expect(page.getByAltText("Original")).toBeVisible();
      await expect(page.getByAltText("Result")).not.toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("Timeline button on preview navigates to timeline", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Two sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for chaining",
    );

    try {
      // Chain a second impression via Next Change
      await chainImpression(page, "chained impression");

      // Click Timeline → timeline
      await goToRenovationDetails(page);

      await expect(page.getByAltText("Result")).toHaveCount(2);
      await expect(page.getByText("base for chaining")).not.toBeVisible();
      await expect(page.getByText("chained impression")).not.toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("consecutive Next Change: chained generation across three impressions", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Three sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "first change",
    );

    try {
      await chainImpression(page, "second change");
      await chainImpression(page, "third change");
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("step navigation: back from prompt returns to choose-action, then to mask", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "source for nav test",
    );

    try {
      await clickNextChange(page);

      // Advance to choose-action stage
      await advanceToChooseAction(page);

      // Pick Other → prompt stage
      await chooseFreePrompt(page);
      await expect(page.getByTestId("prompt")).toBeVisible();

      // Back from prompt → choose-action
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(page.getByTestId("choose-action")).toBeVisible();

      // Back from choose-action → mask
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByText("Paint over what should change"),
      ).toBeVisible();
      await expect(page.locator("canvas")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("choose-action: shows the masked photo, every option's price, and the anchor", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for choose-action layout",
    );

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      // The masked photo stays visible while the user chooses an action (#86).
      await expect(page.locator("canvas")).toBeVisible();

      // Guidance note + price anchor.
      await expect(page.getByTestId("choose-guidance")).toBeVisible();
      await expect(page.getByTestId("choose-price-anchor")).toHaveText(
        "1 🪙 = $0.01",
      );

      // Every option shows its credit price (remove 5, colour 10, other 10).
      await expect(page.getByTestId("choose-remove")).toContainText("5");
      await expect(page.getByTestId("choose-paint")).toContainText("10");
      await expect(page.getByTestId("choose-other")).toContainText("10");

      // Renamed color-change label.
      await expect(page.getByTestId("choose-paint")).toContainText(
        "Change color",
      );
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("choose-action: Verwijderen runs generate without showing the prompt screen", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Cloud Function round-trip for the second impression
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for remove flow",
    );

    try {
      // Chain a second impression via Next Change → mask → choose-action.
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      // Click Remove — should skip the prompt screen and go straight to
      // processing, then land on the preview stage with a result image.
      await page.getByTestId("choose-remove").click();
      await expect(page.getByTestId("prompt")).toHaveCount(0);
      await waitForPreviewResult(page);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("choose-action: Schilder opens the paint step; Back returns to choose-action", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for paint back",
    );

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      // Click Paint — paint step appears, prompt screen does not.
      await page.getByTestId("choose-paint").click();
      await expect(page.getByTestId("paint-step")).toBeVisible();
      await expect(page.getByTestId("paint-standard")).toBeVisible();
      await expect(page.getByTestId("prompt")).toHaveCount(0);

      // Custom tab reveals the inline colour picker.
      await page.getByTestId("paint-tab-custom").click();
      await expect(page.getByTestId("paint-color")).toBeVisible();

      // Back → choose-action stage.
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByTestId("choose-action")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("choose-action: Schilder picks a colour and generates without the prompt screen", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Cloud Function round-trip for the second impression
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for paint flow",
    );

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      // Open the paint step, pick a curated RAL swatch, then Generate.
      await page.getByTestId("choose-paint").click();
      await expect(page.getByTestId("paint-step")).toBeVisible();
      await page.getByTestId("paint-swatch-#27352A").click();
      await page.getByTestId("paint-generate").click();

      // Skips the prompt screen, processes, lands on preview with a result.
      await expect(page.getByTestId("prompt")).toHaveCount(0);
      await waitForPreviewResult(page);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
