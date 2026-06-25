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

  test("mouse wheel scroll zooms the image in", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "fullscreen wheel zoom",
    );

    try {
      await page.getByTestId("fullscreen-open").click();
      const viewer = page.getByTestId("fullscreen-viewer");
      await expect(viewer).toBeVisible();

      const image = viewer.locator("img.fsv-image");
      const scaleOf = async () => {
        const t = await image.evaluate((el) => el.style.transform);
        return Number(/scale\(([^)]+)\)/.exec(t)?.[1] ?? "1");
      };

      // Starts at fit (1×).
      expect(await scaleOf()).toBeCloseTo(1);

      // Scroll up over the image → zoom in past 1×.
      await viewer.hover();
      await page.mouse.wheel(0, -400);
      await expect.poll(scaleOf).toBeGreaterThan(1.1);
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
