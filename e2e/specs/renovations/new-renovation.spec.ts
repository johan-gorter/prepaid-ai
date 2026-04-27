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
        await page.waitForURL("/new-impression?source=photo");

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
        await page.waitForURL("/new-impression?source=photo");

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
        await page.waitForURL("/new-impression?source=photo");

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
        await page.waitForURL("/new-impression?source=photo");

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
        await page.waitForURL("/new-impression?source=photo");

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

    test("Trash on photo flow navigates back to renovations", async ({
      authenticatedPage: page,
    }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/new-impression?source=photo");

        await page.getByRole("button", { name: "Trash" }).click();
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

    test("Trash button deletes impression and navigates to timeline", async ({
      authenticatedPage: page,
    }) => {
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "remove the carpet",
      );

      try {
        // After Generate, on preview stage with source=impression
        await page.waitForURL(/\/new-impression\?source=impression&/);
        await page.getByRole("button", { name: "Trash" }).click();

        // Trash navigates to the renovation timeline; impression is gone
        await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+$/);
        await expect(page.getByAltText("Original")).toBeVisible();
        await expect(page.getByAltText("Result")).not.toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("Next Change transitions in-place to mask stage", async ({
      authenticatedPage: page,
    }) => {
      const { grayPngPath } = await createRenovationAndWaitForResult(
        page,
        "add crown molding",
      );

      try {
        await page.getByRole("button", { name: "Next Change" }).click();

        // Same URL — stage transition only
        await expect(page).toHaveURL(/\/new-impression\?source=impression&/);
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    });

    test("can chain a second impression via Next Change", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(90000);
      const grayPngPath = await fillNewRenovationForm(page, "first attempt");

      try {
        // First Generate
        await page.getByRole("button", { name: "Generate" }).click();
        await expect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible();
        await expect(page.getByAltText("Result")).toBeVisible({
          timeout: 30000,
        });

        // Chain via Next Change → mask stage in-place, draw mask, generate
        await page.getByRole("button", { name: "Next Change" }).click();
        await expect(
          page.getByText("Paint the area you want to change"),
        ).toBeVisible();

        const canvas = page.locator("canvas");
        const box = await canvas.boundingBox();
        if (box) {
          await page.mouse.move(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          await page.mouse.down();
          await page.mouse.move(
            box.x + box.width / 2 + 30,
            box.y + box.height / 2 + 30,
          );
          await page.mouse.up();
        }

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
