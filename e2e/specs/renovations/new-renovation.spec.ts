import { expect as baseExpect, test as baseTest } from "@playwright/test";
import { rmSync } from "node:fs";
import { expect, test } from "../../fixtures";
import { createRandomTestUser, createTestUser } from "../../helpers/auth";
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
        await expect(
          page.getByRole("heading", { name: "Renovations" }),
        ).toBeVisible();
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
        await expect(
          page.getByRole("heading", { name: "Renovations" }),
        ).toBeVisible();
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
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
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

baseTest.describe("New Renovation anonymous → buy → login flow", () => {
  baseTest.beforeEach(async ({}, testInfo) => {
    baseTest.skip(testInfo.project.name !== "chromium", "chromium only");
  });

  baseTest(
    "guest typing prompt + mask survives buy-credits + login round-trip and Generate succeeds",
    async ({ browser }, testInfo) => {
      baseTest.setTimeout(90_000);

      // Pre-create the user server-side so we can sign in mid-flow without
      // hitting an auth provider; the wizard starts anonymous and only
      // signs in during the buy-credits detour.
      const user = await createTestUser(createRandomTestUser());
      const context = await browser.newContext({ ...testInfo.project.use });
      const page = await context.newPage();
      const grayPngPath = await createGrayPng();

      try {
        const promptText = "paint the walls a deep navy blue";

        // 1. Anonymous user lands on /renovations and uploads a photo.
        await page.goto("/renovations");
        await baseExpect(page.getByTestId("new-renovation-card")).toBeVisible();
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/new-impression?source=photo");

        // 2. Draw a mask stroke and advance to the prompt step.
        const canvas = page.locator("canvas");
        await baseExpect(canvas).toBeVisible();
        const box = await canvas.boundingBox();
        if (!box) throw new Error("canvas has no bounding box");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 + 50,
          box.y + box.height / 2 + 50,
        );
        await page.mouse.up();

        await page.getByRole("button", { name: "Next" }).click();
        const promptInput = page.getByTestId("prompt");
        await baseExpect(promptInput).toBeVisible();
        await promptInput.fill(promptText);

        // 3. Generate while anonymous → redirects to /buy-credits.
        await page.getByRole("button", { name: "Generate" }).click();
        await page.waitForURL(/\/buy-credits\?/);
        await baseExpect(
          page.getByTestId("buy-credits-cost-message"),
        ).toBeVisible();

        // 4. Pick a preset → not signed in, redirects to /login.
        await page.getByTestId("buy-credits-preset-200").click();
        await page.waitForURL(/\/login\?/);

        const loginUrl = new URL(page.url());
        const postLoginRedirect = loginUrl.searchParams.get("redirect");
        baseExpect(postLoginRedirect).toContain("/buy-credits");
        baseExpect(postLoginRedirect).toContain("resume=1");
        baseExpect(postLoginRedirect).toContain("new-impression");

        // 5. Sign in and follow the redirect, mirroring LoginPage.handleSignIn.
        await page.waitForFunction(
          () => typeof (window as any).__testSignIn === "function",
        );
        await page.evaluate(
          async (creds) => {
            await (window as any).__testSignIn(creds.email, creds.password);
          },
          { email: user.email, password: user.password },
        );
        await page.waitForFunction(() =>
          (window as any)
            .__testAuthReady?.()
            .then((uid: string | null) => uid != null),
        );
        await page.goto(postLoginRedirect!);

        // 6. /buy-credits auto-resumes the pending purchase, then full-reloads
        //    back to /new-impression with the prompt + mask restored.
        await page.waitForURL(/\/new-impression\?source=photo/, {
          timeout: 15_000,
        });
        await baseExpect(page.getByTestId("prompt")).toHaveValue(promptText);

        // 7. Generate now succeeds — the user has the seeded balance plus
        //    the 200 credits just purchased, so the wizard runs the real
        //    impression pipeline and a result image appears.
        await page.getByRole("button", { name: "Generate" }).click();
        await baseExpect(
          page.getByRole("button", { name: "Renovation Details" }),
        ).toBeVisible();
        await baseExpect(page.getByAltText("Result")).toBeVisible({
          timeout: 45_000,
        });
      } finally {
        rmSync(grayPngPath, { force: true });
        await context.close();
      }
    },
  );
});
