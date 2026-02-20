import { expect, test } from "@playwright/test";

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
    expect(manifest.name).toBe("RenovisionAI");
    expect(manifest.short_name).toBe("Renovision");
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
        const registrations =
          await navigator.serviceWorker.getRegistrations();
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

  test("precaches assets with revision hashes for cache-busting", async ({
    page,
  }) => {
    // The SW file contains a precache manifest with revision hashes.
    // When app files change, workbox generates new hashes, causing the
    // SW to update and fetch fresh assets from the server.
    const swResponse = await page.request.get("/sw.js");
    expect(swResponse.ok()).toBe(true);

    const swText = await swResponse.text();

    // Workbox precache manifest entries have a { url, revision } shape
    expect(swText).toContain("precacheAndRoute");

    // Verify hashed JS/CSS assets are in the precache list
    // Vite produces filenames like assets/index-<hash>.js
    expect(swText).toMatch(/assets\/index-[\w-]+\.js/);
  });

  test("navigateFallback serves index.html for SPA routes", async ({
    page,
  }) => {
    // The SW should intercept navigation requests to SPA routes
    // and serve index.html so client-side routing works offline.
    // Workbox compiles navigateFallback into NavigationRoute + createHandlerBoundToURL.
    const swResponse = await page.request.get("/sw.js");
    const swText = await swResponse.text();

    expect(swText).toContain("NavigationRoute");
    expect(swText).toContain('createHandlerBoundToURL("index.html")');
  });
});
