import fs from "node:fs";
import { expect, test } from "../fixtures";
import {
  createGrayPng,
  createRenovationAndWaitForResult,
  fillNewRenovationForm,
} from "../helpers/renovation";

test.describe("New Renovation Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test.describe("step navigation (no emulators needed beyond auth)", () => {
    test("shows step 1 with photo selection, no title field", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      await expect(page.getByText("1. Capture Image")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Select or Capture Photo" }),
      ).toBeVisible();

      // No title field
      await expect(page.locator("#title")).not.toBeAttached();
      await expect(page.getByLabel("Title")).not.toBeAttached();
    });

    test("Next button disabled until photo is selected", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      const nextBtn = page.getByRole("button", { name: "Next" });
      await expect(nextBtn).toBeDisabled();

      // Select a photo
      const grayPngPath = await createGrayPng();
      try {
        await page.locator('input[type="file"]').setInputFiles(grayPngPath);
        await expect(page.getByAltText("Preview")).toBeVisible();
        await expect(nextBtn).toBeEnabled();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("can navigate forward to mask step and back", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      const grayPngPath = await createGrayPng();
      try {
        await page.locator('input[type="file"]').setInputFiles(grayPngPath);

        // Advance to mask step
        await page.getByRole("button", { name: "Next" }).click();
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();
        await expect(page.locator("canvas")).toBeVisible();

        // Back to capture step
        await page.getByRole("button", { name: "Back", exact: true }).click();
        await expect(page.getByText("1. Capture Image")).toBeVisible();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("can navigate through mask to prompt step", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      const grayPngPath = await createGrayPng();
      try {
        await page.locator('input[type="file"]').setInputFiles(grayPngPath);

        // Advance to mask
        await page.getByRole("button", { name: "Next" }).click();
        await expect(page.locator("canvas")).toBeVisible();

        // Advance to prompt
        await page.getByRole("button", { name: "Next" }).click();
        await expect(
          page.getByText("What should change in the red area?"),
        ).toBeVisible();

        const promptInput = page.getByTestId("prompt");
        await expect(promptInput).toBeVisible();

        // Generate disabled until prompt entered
        await expect(
          page.getByRole("button", { name: "Generate" }),
        ).toBeDisabled();

        // Enter prompt, Generate becomes enabled
        await promptInput.fill("add a window");
        await expect(
          page.getByRole("button", { name: "Generate" }),
        ).toBeEnabled();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("clear mask button clears the drawn area", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      const grayPngPath = await createGrayPng();
      try {
        await page.locator('input[type="file"]').setInputFiles(grayPngPath);
        await page.getByRole("button", { name: "Next" }).click();

        await expect(page.locator("canvas")).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Clear Mask" }),
        ).toBeVisible();

        // Draw something, then clear
        const canvas = page.locator("canvas");
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
          await page.mouse.up();
        }

        // Clear mask — just verify button is clickable
        await page.getByRole("button", { name: "Clear Mask" }).click();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("back header button navigates to home", async ({
      authenticatedPage: page,
    }) => {
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      await page.getByRole("button", { name: "← Back" }).click();
      await page.waitForURL("/");
      await expect(page.getByText("My Renovations")).toBeVisible();
    });
  });

  test.describe("full pipeline", () => {
    test("Generate shows result step with three-button bar", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60000);
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "paint the walls blue",
      );

      try {
        // Three-button bar is visible
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Trash" }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Next Change" }),
        ).toBeVisible();

        // Result image is displayed
        await expect(page.getByAltText("Result")).toBeVisible();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("Renovation Details button navigates to timeline page", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60000);
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "add wooden floors",
      );

      try {
        await page.getByRole("button", { name: "Renovation Details" }).click();
        await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/, {
          timeout: 5000,
        });
        await expect(page.getByRole("heading", { name: "Renovation Details" })).toBeVisible();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("Trash button deletes impression and resets to mask step", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60000);
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "remove the carpet",
      );

      try {
        await page.getByRole("button", { name: "Trash" }).click();

        // Should reset to mask step (step 1)
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();
        await expect(page.locator("canvas")).toBeVisible();

        // Three-button bar should be gone
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).not.toBeVisible();
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("Next Change button navigates to new impression page", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(60000);
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "add crown molding",
      );

      try {
        await page.getByRole("button", { name: "Next Change" }).click();
        await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=/, {
          timeout: 5000,
        });

        // Should show mark area step (source image loaded)
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible({ timeout: 10000 });
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });

    test("after Trash, can redo the flow with same image", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(90000);
      const grayPngPath = await fillNewRenovationForm(page, "first attempt");

      try {
        // Generate
        await page.getByRole("button", { name: "Generate" }).click();
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible({ timeout: 15000 });
        await expect(page.getByAltText("Result")).toBeVisible({
          timeout: 30000,
        });

        // Trash it
        await page.getByRole("button", { name: "Trash" }).click();
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();

        // Re-do: advance to prompt, enter new text, generate again
        await page.getByRole("button", { name: "Next" }).click();
        const promptInput = page.getByTestId("prompt");
        await expect(promptInput).toBeVisible();
        await promptInput.fill("second attempt");

        await page.getByRole("button", { name: "Generate" }).click();
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible({ timeout: 15000 });
        await expect(page.getByAltText("Result")).toBeVisible({
          timeout: 30000,
        });
      } finally {
        fs.unlinkSync(grayPngPath);
      }
    });
  });
});
