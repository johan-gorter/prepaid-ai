import { rmSync } from "node:fs";
import { test as baseTest, expect as baseExpect } from "@playwright/test";
import { expect, test } from "../../fixtures";
import { createGrayPng } from "../../helpers/renovation";

// The signed-out first-time experience (#83). The home CTA routes signed-out
// visitors to /first-renovation; deferred auth must stay intact — all three
// input methods start the wizard without a login wall.
baseTest.describe("First renovation page (signed out)", () => {
  baseTest(
    "home CTA routes a signed-out visitor to /first-renovation, not login",
    async ({ page }) => {
      await page.goto("/");
      const cta = page.getByRole("link", { name: "TRY WITH YOUR PHOTO" });
      await baseExpect(cta).toBeVisible();
      await baseExpect(cta).toHaveAttribute("href", "/first-renovation");

      await cta.click();
      await page.waitForURL("/first-renovation");
      await baseExpect(
        page.getByRole("heading", { name: "See the result before you start" }),
      ).toBeVisible();
    },
  );

  baseTest(
    "shows the how-it-works steps, an example, and the three inputs — no price",
    async ({ page }) => {
      await page.goto("/first-renovation");

      await baseExpect(page.getByText("How it works")).toBeVisible();
      await baseExpect(
        page.getByText("Mark the area & choose modification"),
      ).toBeVisible();
      await baseExpect(
        page.getByTestId("first-renovation-example"),
      ).toBeVisible();

      await baseExpect(
        page.getByTestId("first-renovation-take-photo"),
      ).toBeVisible();
      await baseExpect(
        page.getByRole("button", { name: "Upload Image" }),
      ).toBeVisible();
      await baseExpect(page.getByTestId("paste-image-btn")).toBeVisible();

      // Invariant: price is revealed only after the mask (viral-flow.md §3).
      await baseExpect(page.locator("main")).not.toContainText("credit");
      await baseExpect(page.locator("main")).not.toContainText("$0.01");
    },
  );

  baseTest(
    "primary Take photo starts the wizard while signed out (deferred auth)",
    async ({ page }) => {
      await page.goto("/first-renovation");
      await page.getByTestId("first-renovation-take-photo").click();
      await page.waitForURL("/photo");
    },
  );

  baseTest(
    "camera input bypass goes straight to the mask stage while signed out",
    async ({ page }) => {
      const grayPngPath = await createGrayPng();
      try {
        await page.goto("/first-renovation");
        await page
          .locator('[data-testid="camera-input"]')
          .setInputFiles(grayPngPath);
        await page.waitForURL("/new-impression?source=photo");
        await baseExpect(
          page.getByText("Paint over what should change"),
        ).toBeVisible();
      } finally {
        rmSync(grayPngPath, { force: true });
      }
    },
  );

  baseTest(
    "subordinate login hint links to login with a renovations redirect",
    async ({ page }) => {
      await page.goto("/first-renovation");
      const hint = page.getByTestId("first-renovation-sign-in");
      await baseExpect(hint).toBeVisible();

      await hint.click();
      await page.waitForURL(/\/login\?/);
      baseExpect(new URL(page.url()).searchParams.get("redirect")).toBe(
        "/renovations",
      );
    },
  );

  baseTest("does not horizontally scroll at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/first-renovation");
    await page
      .getByRole("heading", { name: "See the result before you start" })
      .waitFor({ state: "visible" });

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    baseExpect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});

test.describe("First renovation page (signed in)", () => {
  test("a signed-in user is redirected to their gallery", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/first-renovation");
    await page.waitForURL("/renovations");
    await expect(
      page.getByRole("heading", { name: "Renovations" }),
    ).toBeVisible();
  });
});
