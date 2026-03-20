import { expect, test } from "@playwright/test";
import { Jimp } from "jimp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "../helpers/auth";
import { EMULATOR_URLS } from "../helpers/emulator-config";

async function signInOnPage(
  page: import("@playwright/test").Page,
  user: { email: string; password: string },
) {
  await page.goto("/login");
  await signInTestUser(page, {
    email: user.email,
    password: user.password,
    displayName: "PWA Test User",
  });
}

async function areEmulatorsAvailable() {
  try {
    const response = await fetch(EMULATOR_URLS.ui);
    return response.ok;
  } catch {
    return false;
  }
}

async function createGrayPng() {
  const image = new Jimp({ width: 300, height: 300, color: 0x808080ff });
  const buffer = await image.getBuffer("image/png");
  const filePath = path.join(os.tmpdir(), `pwa-upload-${Date.now()}.png`);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

test.describe("PWA Requirements", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("has a valid web app manifest", async ({ page }) => {
    // Manifest link is injected by vite-plugin-pwa
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    const href = await manifestLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Fetch and validate manifest contents
    const response = await page.request.get(href!);
    expect(response.ok()).toBe(true);

    const manifest = await response.json();

    // Required manifest fields
    expect(manifest.name).toBe("Prepaid AI");
    expect(manifest.short_name).toBe("Prepaid AI");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#1a1a2e");
    expect(manifest.background_color).toBe("#1a1a2e");
    expect(manifest.description).toBeTruthy();

    // Must have at least a 192x192 and a 512x512 icon
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ]),
    );
  });

  test("icons are accessible", async ({ page }) => {
    const icon192 = await page.request.get("/pwa-192x192.png");
    expect(icon192.ok()).toBe(true);
    expect(icon192.headers()["content-type"]).toContain("image/png");

    const icon512 = await page.request.get("/pwa-512x512.png");
    expect(icon512.ok()).toBe(true);
    expect(icon512.headers()["content-type"]).toContain("image/png");
  });

  test("has required meta tags", async ({ page }) => {
    // viewport meta tag
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toBeAttached();
    const viewportContent = await viewport.getAttribute("content");
    expect(viewportContent).toContain("width=device-width");

    // theme-color meta tag
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toBeAttached();
    expect(await themeColor.getAttribute("content")).toBe("#1a1a2e");

    // apple-touch-icon
    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleTouchIcon).toBeAttached();
    const appleIconHref = await appleTouchIcon.getAttribute("href");
    expect(appleIconHref).toBeTruthy();

    // Verify the apple-touch-icon is accessible
    const appleIconResponse = await page.request.get(appleIconHref!);
    expect(appleIconResponse.ok()).toBe(true);
  });

  test("registers a service worker", async ({ page }) => {
    // Wait for SW registration (vite-plugin-pwa registers on load)
    const swRegistered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;

      // Wait up to 10s for a registration to appear
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) return true;
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    });

    expect(swRegistered).toBe(true);
  });

  test("service worker controls the page after activation", async ({
    page,
  }) => {
    // Wait for the SW to become active
    const swActive = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;

      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null;
    });

    expect(swActive).toBe(true);
  });

  test("is served over a secure context or localhost", async ({ page }) => {
    const isSecure = await page.evaluate(() => window.isSecureContext);
    expect(isSecure).toBe(true);
  });

  test("generated service worker references built app assets", async ({
    page,
  }) => {
    // The generated service worker should reference the built app shell
    // assets so the installable app can boot offline.
    const swResponse = await page.request.get("/sw.js");
    expect(swResponse.ok()).toBe(true);

    const swText = await swResponse.text();

    // Verify hashed JS assets are present in the generated SW output.
    // Vite produces filenames like assets/index-<hash>.js
    expect(swText).toMatch(/assets\/index-[\w-]+\.js/);
  });

  test("navigateFallback serves index.html for SPA routes", async ({
    page,
    context,
  }) => {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Reload so the active SW controls this page before going offline.
    await page.reload();
    await context.setOffline(true);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("body")).not.toBeEmpty();

    await context.setOffline(false);
  });

  test("app shell loads after going offline", async ({ page, context }) => {
    // Wait for service worker to become active and control the page
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });

    // Reload so the active SW controls this page (first load is uncontrolled)
    await page.reload();

    // Cut the network
    await context.setOffline(true);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("body")).not.toBeEmpty();

    await context.setOffline(false);
  });

  test("previously viewed uploaded PNG still renders after offline refresh", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);

    test.skip(
      !(await areEmulatorsAvailable()),
      "requires live Firebase emulators for auth, firestore, and storage",
    );

    const user = await createTestUser();

    const uploadPath = await createGrayPng();

    try {
      await signInOnPage(page, user);
      await page.goto("/");
      await page.waitForURL("/");
      await page.getByRole("link", { name: "+ New Renovation" }).click();
      await page.waitForURL("/renovation/new");

      await page.getByLabel("Title").fill("Offline cached thumbnail");
      await page.getByLabel("Photo (PNG)").setInputFiles(uploadPath);
      await expect(page.getByAltText("Preview")).toBeVisible();
      await page
        .getByLabel("Describe your renovation")
        .fill("verify cached image survives refresh");

      await page.getByRole("button", { name: "Create Renovation" }).click();
      await page.waitForURL(/\/renovation\/[a-zA-Z0-9]+/, { timeout: 15000 });

      await expect(page.locator(".status-completed")).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByAltText("Result")).toBeVisible({ timeout: 5000 });

      await page.goto("/");
      await page.waitForURL("/");

      const thumbnail = page.locator(".renovation-thumbnail").first();
      await expect(
        page.getByRole("heading", { name: "Offline cached thumbnail" }),
      ).toBeVisible({ timeout: 30000 });
      await expect(thumbnail).toBeVisible({ timeout: 30000 });
      await expect
        .poll(async () => {
          return thumbnail.evaluate((img) => {
            const image = img as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          });
        })
        .toBe(true);

      const srcBeforeOffline = await thumbnail.getAttribute("src");
      expect(srcBeforeOffline).toBeTruthy();

      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
      });

      await context.setOffline(true);
      await page.reload();
      await page.waitForURL("/");

      const offlineThumbnail = page.locator(".renovation-thumbnail").first();
      await expect(offlineThumbnail).toBeVisible({ timeout: 15000 });
      await expect
        .poll(async () => {
          return offlineThumbnail.evaluate((img) => {
            const image = img as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          });
        })
        .toBe(true);
      await expect(offlineThumbnail).toHaveAttribute("src", srcBeforeOffline!);

      await context.setOffline(false);
    } finally {
      await deleteTestUser(user);
      if (fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }
    }
  });
});
