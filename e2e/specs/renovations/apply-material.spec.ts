import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  createGrayPng,
  createRenovationAndWaitForResult,
} from "../../helpers/renovation";
import {
  advanceToChooseAction,
  chooseApplyMaterial,
  clickNextChange,
  generateMaterialAndWait,
  paintMask,
  provideMaterialImage,
} from "../../helpers/wizard";

test.describe("Apply Material", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("choose-action shows the Apply material option with its price", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for material option",
    );

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      const btn = page.getByTestId("choose-apply-material");
      await expect(btn).toBeVisible();
      await expect(btn).toContainText("Apply material");
      await expect(btn).toContainText("10");
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("provides a material photo and generates without the prompt screen", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Cloud Function round-trip for the second impression
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for material flow",
    );
    const materialPath = await createGrayPng();

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      await chooseApplyMaterial(page);
      // No material selected yet → Generate is disabled.
      await expect(page.getByTestId("material-generate")).toBeDisabled();

      await provideMaterialImage(page, materialPath);
      await expect(page.getByTestId("material-generate")).toBeEnabled();

      // Generate skips the free-prompt screen, processes, lands on preview.
      await generateMaterialAndWait(page);
      await expect(page.getByTestId("prompt")).toHaveCount(0);
    } finally {
      rmSync(grayPngPath, { force: true });
      rmSync(materialPath, { force: true });
    }
  });

  test("remembers a used material and re-applies it from the grid", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Two sequential Cloud Function round-trips
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for material registry",
    );
    const materialPath = await createGrayPng();

    try {
      // First material application — populates the registry.
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);
      await chooseApplyMaterial(page);
      await provideMaterialImage(page, materialPath);
      await generateMaterialAndWait(page);

      // Second time around the remembered material shows in the grid and can be
      // re-applied without uploading again.
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);
      await chooseApplyMaterial(page);

      const grid = page.getByTestId("material-grid");
      await expect(grid).toBeVisible();
      await grid.locator("button").first().click();
      await expect(page.getByTestId("material-selected")).toBeVisible();
      await expect(page.getByTestId("material-generate")).toBeEnabled();

      await generateMaterialAndWait(page);
    } finally {
      rmSync(grayPngPath, { force: true });
      rmSync(materialPath, { force: true });
    }
  });
});
