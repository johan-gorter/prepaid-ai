import { defineConfig, devices } from "@playwright/test";

/**
 * PWA tests run against an emulator-backed build (vite preview) so the
 * service worker, manifest, and all PWA assets are generated for real.
 */
export default defineConfig({
  testDir: "./e2e/pwa",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],

  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:4175",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
