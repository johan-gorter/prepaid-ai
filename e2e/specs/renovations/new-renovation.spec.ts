import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import {
  createGrayPng,
  createRenovationAndWaitForResult,
  fillNewRenovationForm,
} from "../../helpers/renovation";

test.describe("New Renovation Page", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  test.describe("step navigation (no emulators needed beyond auth)", () => {
    test("shows mask step immediately after taking photo", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();
        await expect(page.locator("canvas")).toBeVisible();

        // No title field
        await expect(page.locator("#title")).not.toBeAttached();
        await expect(page.getByLabel("Title")).not.toBeAttached();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("mask step shows Retake, Trash, and Next buttons", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

        await expect(
          page.getByRole("button", { name: "Retake" }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Trash" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Next" })).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("Trash at mask step navigates to home", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

        await page.getByRole("button", { name: "Trash" }).click();
        await page.waitForURL("/renovations");
        await expect(page.getByText("My Renovations")).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("can navigate from mask to prompt step", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

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
        rmSync(grayPngPath, { force: true });
      }
    });

    test("clear mask button clears the drawn area", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

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
          await page.mouse.move(
            box.x + box.width / 2 + 30,
            box.y + box.height / 2,
          );
          await page.mouse.up();
        }

        // Clear mask — just verify button is clickable
        await page.getByRole("button", { name: "Clear Mask" }).click();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("back header button navigates to home", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/renovation/new?source=cropped");

        await page.getByRole("button", { name: "← Back" }).click();
        await page.waitForURL("/renovations");
        await expect(page.getByText("My Renovations")).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });
  });

  test.describe("full pipeline", () => {
    test("Generate shows result step with three-button bar", async ({
      authenticatedPage: page,
    }) => {
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "paint the walls blue",
      );

      try {
        // Three-button bar is visible
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Trash" })).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Next Change" }),
        ).toBeVisible();

        // Result image is displayed
        await expect(page.getByAltText("Result")).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("Renovation Details button navigates to timeline page", async ({
      authenticatedPage: page,
    }) => {
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "add wooden floors",
      );

      try {
        await page.getByRole("button", { name: "Renovation Details" }).click();
        await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
        await expect(
          page.getByRole("heading", { name: "Renovation Details" }),
        ).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("Trash button deletes impression and resets to mask step", async ({
      authenticatedPage: page,
    }) => {
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
        rmSync(grayPngPath, { force: true });
      }
    });

    test("Next Change button navigates to new impression page", async ({
      authenticatedPage: page,
    }) => {
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "add crown molding",
      );

      try {
        await page.getByRole("button", { name: "Next Change" }).click();
        await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+\/new\?source=/);

        // Should show mark area step (source image loaded)
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
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
        ).toBeVisible();
        await expect(page.getByAltText("Result")).toBeVisible({
          timeout: 30000,
        });

        // Trash it (from result step → resets to mask step)
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
        ).toBeVisible();
        await expect(page.getByAltText("Result")).toBeVisible({
          timeout: 30000,
        });
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });
  });
});
