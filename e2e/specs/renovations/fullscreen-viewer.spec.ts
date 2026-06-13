import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { createRenovationAndWaitForResult } from "../../helpers/renovation";

// Fullscreen result viewer (#90): the result/preview stage exposes an expand
// icon that opens a fullscreen, pinch-zoomable viewer. These tests cover the
// open-and-close contract (icon → open, X → close, back button → close)
// rather than the gesture maths.
test.describe("Fullscreen result viewer", () => {
  test.beforeEach(async ({}, testInfo) => {
    // Shares emulator state with the other generation specs — chromium only so
    // it can't race across parallel browser projects.
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("expand icon opens the viewer and the X button closes it", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "fullscreen open/close",
    );

    try {
      // The preview stage shows the expand affordance over the result image.
      const expand = page.getByTestId("fullscreen-open");
      await expect(expand).toBeVisible();

      await expand.click();
      await expect(page.getByTestId("fullscreen-viewer")).toBeVisible();

      // Close via the X button.
      await page.getByTestId("fullscreen-close").click();
      await expect(page.getByTestId("fullscreen-viewer")).toBeHidden();

      // The page itself stayed put — we only closed the overlay.
      await expect(page).toHaveURL(/\/new-impression\?source=impression&/);
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("browser back closes the viewer instead of leaving the page", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "fullscreen back button",
    );

    try {
      await page.getByTestId("fullscreen-open").click();
      await expect(page.getByTestId("fullscreen-viewer")).toBeVisible();

      // Opening pushed a history entry, so back closes the overlay and keeps
      // the user on the result page.
      await page.goBack();
      await expect(page.getByTestId("fullscreen-viewer")).toBeHidden();
      await expect(page).toHaveURL(/\/new-impression\?source=impression&/);
      await expect(page.getByTestId("fullscreen-open")).toBeVisible();
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });
});
