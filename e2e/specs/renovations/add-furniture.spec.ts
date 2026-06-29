import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  createGrayPng,
  createRenovationAndWaitForResult,
} from "../../helpers/renovation";
import {
  advanceToChooseAction,
  chooseReference,
  clickNextChange,
  generateReferenceAndWait,
  paintMask,
  provideReferenceImage,
} from "../../helpers/wizard";

test.describe("Add Furniture", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test("choose-action shows the Add furniture option with its price", async ({
    authenticatedPage: page,
  }) => {
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for furniture option",
    );

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      const btn = page.getByTestId("choose-add-furniture");
      await expect(btn).toBeVisible();
      await expect(btn).toContainText("Add furniture");
      await expect(btn).toContainText("10");
    } finally {
      rmSync(grayPngPath, { force: true });
    }
  });

  test("provides a furniture photo and generates without the prompt screen", async ({
    authenticatedPage: page,
  }) => {
    test.slow(); // Cloud Function round-trip for the second impression
    const { grayPngPath } = await createRenovationAndWaitForResult(
      page,
      "base for furniture flow",
    );
    const furniturePath = await createGrayPng();

    try {
      await clickNextChange(page);
      await paintMask(page);
      await advanceToChooseAction(page);

      await chooseReference(page, "furniture");
      // No furniture selected yet → Generate is disabled.
      await expect(page.getByTestId("furniture-generate")).toBeDisabled();

      await provideReferenceImage(page, "furniture", furniturePath);
      await expect(page.getByTestId("furniture-generate")).toBeEnabled();

      // Generate skips the free-prompt screen, processes, lands on preview.
      await generateReferenceAndWait(page, "furniture");
      await expect(page.getByTestId("prompt")).toHaveCount(0);
    } finally {
      rmSync(grayPngPath, { force: true });
      rmSync(furniturePath, { force: true });
    }
  });
});
